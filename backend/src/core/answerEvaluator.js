'use strict';

/**
 * Answer Evaluator (P6)
 * ==============================
 * Scores exactly one candidate answer and returns a structured evaluation
 * that feeds straight back into the session (P4) and, through it, into
 * the next question decision (P5) — see questionPlanner.js's handling of
 * `evaluation.recommendedAction`.
 *
 * Inputs used, all pulled from state already built by earlier layers —
 * nothing here is re-derived from scratch or hardcoded per-answer:
 *   - the question actually asked        (session.questions, from P5)
 *   - the candidate's raw answer text    (passed in by the caller)
 *   - the relevant curriculum objective  (models/curriculumModel, P1)
 *   - candidate intelligence             (session.profile, P3; session.topicPool, P2)
 *   - previous interview state           (session.history, session.competencySignals, P4)
 *
 * LLM-ready, not LLM-hardcoded: the evaluator asks the model for a
 * strict JSON object (see llm/prompts.js) and only falls back to a
 * deterministic score/action when that JSON is missing or malformed —
 * that fallback is a structural safety net (keeps the interview moving
 * if a provider hiccups), not a lookup table of expected answers. There
 * is no hardcoded list of "correct" answers anywhere in this module.
 *
 * Chain-of-thought is never exposed: the LLM is instructed to return
 * only the JSON object, and this module never surfaces raw model text —
 * only the parsed, sanitized structured fields.
 */

const { getDayByNumber } = require('../models/curriculumModel');
const { buildEvaluationMessages } = require('../llm/prompts');
const llmClient = require('../llm/llmClient');
const sessionModel = require('./sessionModel');

/** The only six values recommendedAction is allowed to take. */
const RECOMMENDED_ACTIONS = Object.freeze({
  FOLLOW_UP: 'FOLLOW_UP',
  CLARIFY: 'CLARIFY',
  INCREASE_DIFFICULTY: 'INCREASE_DIFFICULTY',
  CHANGE_TOPIC: 'CHANGE_TOPIC',
  CROSS_CONNECT: 'CROSS_CONNECT',
  COMPLETE: 'COMPLETE',
});
const VALID_ACTIONS = new Set(Object.values(RECOMMENDED_ACTIONS));

const MIN_SCORE = 0;
const MAX_SCORE = 5;
const MAX_LIST_ITEMS = 6;
const MAX_ITEM_LENGTH = 200;

// ---------------------------------------------------------------------
// Parsing / sanitizing the model's JSON response
// ---------------------------------------------------------------------

/**
 * Strips common wrapping (markdown code fences, stray prose around the
 * JSON) and parses. Throws on genuinely unparsable input — callers treat
 * that as "use the structural fallback."
 * @param {string} raw
 * @returns {any}
 */
function safeParseJson(raw) {
  let text = (raw || '').trim();
  text = text.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '');
  const firstBrace = text.indexOf('{');
  const lastBrace = text.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    text = text.slice(firstBrace, lastBrace + 1);
  }
  return JSON.parse(text);
}

/**
 * @param {any} value
 * @returns {number} an integer in [MIN_SCORE, MAX_SCORE]
 */
function clampScore(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return MIN_SCORE;
  return Math.max(MIN_SCORE, Math.min(MAX_SCORE, Math.round(n)));
}

/**
 * Coerces arbitrary input into a clean array of short strings.
 * @param {any} value
 * @returns {string[]}
 */
function coerceStringArray(value) {
  if (!Array.isArray(value)) return [];
  return value
    .filter((v) => typeof v === 'string' && v.trim().length > 0)
    .map((v) => v.trim().slice(0, MAX_ITEM_LENGTH))
    .slice(0, MAX_LIST_ITEMS);
}

/**
 * @param {any} value
 * @returns {string}
 */
const VALID_SIGNALS = new Set(['strong', 'weak', 'mixed', 'unclear']);
function coerceCompetencyUpdates(value, question, fallbackScore) {
  if (Array.isArray(value) && value.length > 0) {
    const cleaned = value
      .filter((v) => v && typeof v === 'object')
      .map((v) => ({
        day: typeof v.day === 'number' ? v.day : question.day,
        competency: typeof v.competency === 'string' && v.competency.trim() ? v.competency.trim().slice(0, 80) : (question.title || 'General'),
        signal: VALID_SIGNALS.has(v.signal) ? v.signal : (fallbackScore >= 4 ? 'strong' : fallbackScore <= 1 ? 'weak' : 'mixed'),
        note: typeof v.note === 'string' ? v.note.trim().slice(0, MAX_ITEM_LENGTH) : '',
      }))
      .slice(0, MAX_LIST_ITEMS);
    if (cleaned.length > 0) return cleaned;
  }
  // Structural fallback: at minimum, log one signal tied to the topic
  // actually asked about, derived only from the numeric score — never
  // from a hardcoded per-question answer key.
  return [
    {
      day: question.day,
      competency: question.title || 'General',
      signal: fallbackScore >= 4 ? 'strong' : fallbackScore <= 1 ? 'weak' : 'mixed',
      note: 'Derived from overall score (model did not return competencyUpdates).',
    },
  ];
}

/**
 * Deterministic, content-agnostic fallback for recommendedAction — only
 * used when the model's JSON is missing/malformed/invalid. Based purely
 * on score + session-structural signals (repeated struggle, completion
 * minimums), never on the text of any particular answer.
 * @param {{ score:number, repeatedStruggle:boolean, meetsMinimums:boolean }} ctx
 * @returns {string}
 */
function fallbackRecommendedAction(ctx) {
  if (ctx.repeatedStruggle) return RECOMMENDED_ACTIONS.CHANGE_TOPIC;
  if (ctx.score <= 2) return RECOMMENDED_ACTIONS.FOLLOW_UP;
  if (ctx.score >= 4) return ctx.meetsMinimums ? RECOMMENDED_ACTIONS.INCREASE_DIFFICULTY : RECOMMENDED_ACTIONS.INCREASE_DIFFICULTY;
  return RECOMMENDED_ACTIONS.CLARIFY;
}

// ---------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------

/**
 * @typedef {Object} AnswerEvaluation
 * @property {number} score                 - 0-5
 * @property {string[]} strengths
 * @property {string[]} gaps
 * @property {string[]} evidence             - short paraphrases, never raw transcript dumps
 * @property {{day:number|null, competency:string, signal:string, note:string}[]} competencyUpdates
 * @property {string} recommendedAction      - one of RECOMMENDED_ACTIONS
 */

/**
 * Evaluates one candidate answer in the context of its session.
 *
 * @param {import('./sessionModel').SessionState} session
 * @param {{ questionId: string, answer: string }} input
 * @param {{ completeFn?: typeof llmClient.complete }} [options] - `completeFn` is
 *   injectable (tests/dev can stub it); defaults to the real llmClient, matching
 *   the same pattern questionPlanner.js uses so this stays "easy to connect to
 *   the model provider later" without any code change, just wiring.
 * @returns {Promise<AnswerEvaluation>}
 */
async function evaluateAnswer(session, input, options = {}) {
  const question = session.questions.find((q) => q.id === input.questionId);
  if (!question) throw new Error(`evaluateAnswer: no question found with id ${input.questionId}`);

  const curriculumDay = typeof question.day === 'number' ? getDayByNumber(question.day) : null;
  const objectives = curriculumDay ? curriculumDay.objectives : [];

  const priorSignal = question.day !== null ? session.competencySignals.get(question.day) : null;
  const repeatedStruggle = Boolean(priorSignal && priorSignal.attempts >= 1 && priorSignal.lastShallow);
  const meetsMinimums = sessionModel.meetsCompletionCriteria(session);

  const messages = buildEvaluationMessages(session, question, input.answer, objectives);
  const completeFn = options.completeFn || llmClient.complete;
  const raw = await completeFn(messages, { maxTokens: 700, temperature: 0.3 });

  let parsed = null;
  try {
    parsed = safeParseJson(raw);
  } catch (_err) {
    parsed = null; // malformed output -> fall through to the structural fallback below
  }

  const score = clampScore(parsed?.score);
  const strengths = coerceStringArray(parsed?.strengths);
  const gaps = coerceStringArray(parsed?.gaps);
  const evidence = coerceStringArray(parsed?.evidence);
  const competencyUpdates = coerceCompetencyUpdates(parsed?.competencyUpdates, question, score);

  let recommendedAction = typeof parsed?.recommendedAction === 'string' ? parsed.recommendedAction.trim().toUpperCase() : null;
  if (!VALID_ACTIONS.has(recommendedAction)) {
    recommendedAction = fallbackRecommendedAction({ score, repeatedStruggle, meetsMinimums });
  }
  // A repeated struggle overrides even a valid-but-stubborn FOLLOW_UP/CLARIFY
  // from the model — don't let the interview loop a third time on one day.
  if (repeatedStruggle && (recommendedAction === RECOMMENDED_ACTIONS.FOLLOW_UP || recommendedAction === RECOMMENDED_ACTIONS.CLARIFY)) {
    recommendedAction = RECOMMENDED_ACTIONS.CHANGE_TOPIC;
  }

  return { score, strengths, gaps, evidence, competencyUpdates, recommendedAction };
}

/**
 * Convenience wrapper: evaluates the answer AND records it onto the
 * session in one call (via sessionModel.recordEvaluation, P4), so the
 * evaluation immediately becomes visible to questionPlanner.js's next
 * decideNextQuestion() call — this is the concrete mechanism by which
 * "the evaluation influences the next question selected by P5."
 *
 * @param {import('./sessionModel').SessionState} session
 * @param {{ questionId: string, answer: string }} input
 * @param {{ completeFn?: typeof llmClient.complete }} [options]
 * @returns {Promise<AnswerEvaluation>}
 */
async function evaluateAndRecord(session, input, options = {}) {
  const evaluation = await evaluateAnswer(session, input, options);

  const shallow =
    evaluation.recommendedAction === RECOMMENDED_ACTIONS.FOLLOW_UP ||
    evaluation.recommendedAction === RECOMMENDED_ACTIONS.CLARIFY ||
    evaluation.score <= 1;

  const notes = evaluation.gaps.length
    ? `Gaps: ${evaluation.gaps.join('; ')}`
    : evaluation.strengths.length
      ? `Strengths: ${evaluation.strengths.join('; ')}`
      : 'Evaluated.';

  sessionModel.recordEvaluation(session, {
    questionId: input.questionId,
    score: evaluation.score,
    shallow,
    notes,
    recommendedAction: evaluation.recommendedAction,
  });

  return evaluation;
}

module.exports = {
  RECOMMENDED_ACTIONS,
  evaluateAnswer,
  evaluateAndRecord,
  // exported for unit testing of the sanitizers in isolation
  safeParseJson,
  clampScore,
  coerceStringArray,
  coerceCompetencyUpdates,
  fallbackRecommendedAction,
};
