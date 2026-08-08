'use strict';

/**
 * Adaptive Question Engine (P5)
 * ==============================
 * Decides what to ask next. Built entirely on top of the layers already
 * in place — it does not re-derive anything the earlier layers already
 * computed:
 *
 *   - intelligence/probingEngine        (P2) — ranks candidate topics by
 *     how much interview signal they carry (skipped/failed first, etc).
 *   - intelligence/candidateProfileEngine (P3) — recommendedDifficulty,
 *     recommendedStartingTopics.
 *   - core/sessionModel                 (P4) — phase state machine,
 *     coverage tracking, evaluation history.
 *
 * This module adds exactly one new thing: the WHICH-TOPIC / WHAT-TYPE /
 * WHAT-DIFFICULTY decision for the *next* turn, adapting to the running
 * evaluation history instead of following a fixed script.
 *
 * Two layers, deliberately separated:
 *   - decideNextQuestion(session)   — pure, synchronous, deterministic.
 *     No LLM call. Given the same session state it always returns the
 *     same decision. This is what makes the engine testable and
 *     debuggable without needing an API key.
 *   - generateNextQuestion(session) — async. Takes that decision, builds
 *     a grounded prompt (llm/prompts.js), and asks the LLM (llm/llmClient.js)
 *     to phrase it as one natural question. Returns the structured shape
 *     the interview engine/API will hand back to the frontend.
 *
 * Chain-of-thought is never exposed: decideNextQuestion's output is
 * server-side routing metadata (day/type/difficulty), not reasoning text,
 * and the system prompt explicitly forbids the LLM from explaining itself
 * (see llm/prompts.js). The public return shape is exactly:
 *   { question, curriculumDay, topic, questionType, difficulty }
 */

const {
  PHASES,
  isDayCovered,
  getUncoveredTopics,
  recommendNextPhase,
} = require('./sessionModel');
const { getTopicsForDeeperProbing } = require('../intelligence/probingEngine');
const { DIFFICULTY_LEVELS } = require('../intelligence/candidateProfileEngine');
const { getModuleForDay } = require('../models/curriculumModel');
const llmClient = require('../llm/llmClient');
const { buildQuestionMessages } = require('../llm/prompts');

/** Supported question types (spec). */
const QUESTION_TYPES = Object.freeze({
  BASELINE: 'baseline',
  CLARIFICATION: 'clarification',
  TECHNICAL_PROBE: 'technical_probe',
  SCENARIO: 'scenario',
  ARCHITECTURE_DESIGN: 'architecture_design',
  CROSS_TOPIC: 'cross_topic',
  CHALLENGE: 'challenge',
});

/** A shallow-answer score at or below this is treated as "weak," regardless of the `shallow` flag. */
const WEAK_SCORE_THRESHOLD = 2;
/** A strong-answer score at or above this can trigger a difficulty increase / DEPTH phase. */
const STRONG_SCORE_THRESHOLD = 4;

// ---------------------------------------------------------------------
// Difficulty ladder helpers
// ---------------------------------------------------------------------

function stepUp(difficulty) {
  const idx = DIFFICULTY_LEVELS.indexOf(difficulty);
  return DIFFICULTY_LEVELS[Math.min(DIFFICULTY_LEVELS.length - 1, idx + 1)];
}

function stepDown(difficulty) {
  const idx = DIFFICULTY_LEVELS.indexOf(difficulty);
  return DIFFICULTY_LEVELS[Math.max(0, idx - 1)];
}

/**
 * Walks the session's evaluation history in order, starting from the
 * candidate's P3-recommended difficulty, nudging up on strong answers and
 * down on weak/shallow ones. Deterministic and stateless (no extra field
 * needed on the session) — recomputed each turn from `session.evaluations`.
 *
 * @param {import('./sessionModel').SessionState} session
 * @returns {'foundational'|'intermediate'|'advanced'}
 */
function computeCurrentDifficulty(session) {
  let idx = DIFFICULTY_LEVELS.indexOf(session.profile.recommendedDifficulty.level);
  if (idx < 0) idx = 0;

  for (const evaluation of session.evaluations) {
    const weak = evaluation.shallow || (typeof evaluation.score === 'number' && evaluation.score <= WEAK_SCORE_THRESHOLD);
    const strong = !evaluation.shallow && typeof evaluation.score === 'number' && evaluation.score >= STRONG_SCORE_THRESHOLD;
    if (weak) idx = Math.max(0, idx - 1);
    else if (strong) idx = Math.min(DIFFICULTY_LEVELS.length - 1, idx + 1);
  }
  return DIFFICULTY_LEVELS[idx];
}

// ---------------------------------------------------------------------
// Topic selection helpers
// ---------------------------------------------------------------------

/**
 * Picks the highest-signal curriculum day this candidate hasn't been
 * asked about yet, using the existing probing ranking (P2) so
 * skipped/failed topics are prioritized over clean first-try passes —
 * then falls back to the session's own topic pool if the ranking is
 * somehow exhausted first.
 * @param {import('./sessionModel').SessionState} session
 * @returns {{ day:number, title:string, module:string|null, candidateStatus:string, attempts:number|null }|null}
 */
function pickNextTopic(session) {
  const ranked = getTopicsForDeeperProbing(session.candidate);
  for (const p of ranked) {
    if (!isDayCovered(session, p.day.day)) {
      return {
        day: p.day.day,
        title: p.day.title,
        module: p.day.module ? p.day.module.title : null,
        candidateStatus: p.day.candidateStatus,
        attempts: p.day.attempts,
      };
    }
  }
  const fallback = getUncoveredTopics(session)[0];
  return fallback
    ? {
        day: fallback.day,
        title: fallback.title,
        module: fallback.module,
        candidateStatus: fallback.candidateStatus ?? null,
        attempts: fallback.attempts ?? null,
      }
    : null;
}

/**
 * @param {import('./sessionModel').SessionState} session
 * @param {number|null} day
 * @returns {{ module:string|null, candidateStatus:string|null, attempts:number|null }}
 */
function lookupTopicContext(session, day) {
  if (day === null) return { module: null, candidateStatus: null, attempts: null };
  const fromPool = session.topicPool.find((t) => t.day === day);
  if (fromPool) return { module: fromPool.module, candidateStatus: fromPool.candidateStatus, attempts: fromPool.attempts };
  const mod = getModuleForDay(day);
  return { module: mod ? mod.title : null, candidateStatus: null, attempts: null };
}

// ---------------------------------------------------------------------
// Core decision logic
// ---------------------------------------------------------------------

/**
 * @typedef {Object} QuestionDecision
 * @property {string} phase
 * @property {number|null} day
 * @property {string|null} topic
 * @property {string|null} module
 * @property {string|null} candidateStatus
 * @property {number|null} attempts
 * @property {string} questionType  - one of QUESTION_TYPES
 * @property {string} difficulty    - one of DIFFICULTY_LEVELS
 * @property {boolean} isFollowUp
 */

/**
 * Pure decision function: given the current session state, decides the
 * next question's phase/topic/type/difficulty. No LLM call, no side
 * effects, fully deterministic — same session state in, same decision
 * out, which is what makes this testable without an API key.
 *
 * Behavior implemented (per spec):
 *   - weak/shallow answer          -> FOLLOW_UP, questionType 'clarification', difficulty eased down
 *   - repeated struggle (2+ shallow/weak answers on the same day) -> stop
 *     drilling with more clarifications, move to a fresh topic instead
 *   - strong answer                -> DEPTH on the same topic, difficulty stepped up,
 *     type escalates toward 'scenario' / 'architecture_design' / 'challenge'
 *   - otherwise                    -> PROBE or CROSS_TOPIC on the next
 *     highest-signal uncovered topic (never a topic already covered,
 *     except intentional DEPTH revisits)
 *
 * @param {import('./sessionModel').SessionState} session
 * @returns {QuestionDecision}
 */
function decideNextQuestion(session) {
  if (session.phase === PHASES.COMPLETE) {
    throw new Error('decideNextQuestion: session is already COMPLETE, nothing left to ask');
  }

  const lastQuestion = session.questions[session.questions.length - 1] || null;
  const lastEvaluation = session.evaluations[session.evaluations.length - 1] || null;
  const currentDifficulty = computeCurrentDifficulty(session);

  // --- Very first turn: always a low-pressure baseline warm-up. ---
  if (session.questionsAsked === 0) {
    const warmUp =
      session.plannedTopics.find((t) => t.role === 'warm-up') ||
      session.plannedTopics[0] ||
      pickNextTopic(session);
    const ctx = warmUp ? lookupTopicContext(session, warmUp.day) : { module: null, candidateStatus: null, attempts: null };
    return {
      phase: PHASES.BASELINE,
      day: warmUp ? warmUp.day : null,
      topic: warmUp ? warmUp.title : null,
      module: warmUp ? (warmUp.module ?? ctx.module) : null,
      candidateStatus: warmUp ? (warmUp.candidateStatus ?? ctx.candidateStatus ?? 'completed') : null,
      attempts: ctx.attempts,
      questionType: QUESTION_TYPES.BASELINE,
      difficulty: 'foundational',
      isFollowUp: false,
    };
  }

  // Has the day just asked about already been clarified once and is STILL
  // shallow? That's a repeated struggle — stop clarifying, move on instead
  // of looping unproductively on the same topic.
  const signalForLastDay = lastQuestion && lastQuestion.day !== null ? session.competencySignals.get(lastQuestion.day) : null;
  const repeatedStruggle = Boolean(signalForLastDay && signalForLastDay.attempts >= 2 && signalForLastDay.lastShallow);

  const lastAnswerWeak =
    Boolean(lastEvaluation) &&
    (lastEvaluation.shallow || (typeof lastEvaluation.score === 'number' && lastEvaluation.score <= WEAK_SCORE_THRESHOLD)) &&
    !repeatedStruggle;
  const lastAnswerStrong =
    Boolean(lastEvaluation) &&
    !lastEvaluation.shallow &&
    typeof lastEvaluation.score === 'number' &&
    lastEvaluation.score >= STRONG_SCORE_THRESHOLD;

  const nextPhase = recommendNextPhase(session, {
    lastAnswerShallow: lastAnswerWeak,
    wantDepthProbe: lastAnswerStrong,
  });

  switch (nextPhase) {
    case PHASES.FOLLOW_UP: {
      const ctx = lookupTopicContext(session, lastQuestion.day);
      return {
        phase: PHASES.FOLLOW_UP,
        day: lastQuestion.day,
        topic: lastQuestion.title,
        module: ctx.module,
        candidateStatus: ctx.candidateStatus,
        attempts: ctx.attempts,
        questionType: QUESTION_TYPES.CLARIFICATION,
        difficulty: stepDown(currentDifficulty),
        isFollowUp: true,
      };
    }

    case PHASES.CROSS_TOPIC: {
      const next = pickNextTopic(session);
      return {
        phase: PHASES.CROSS_TOPIC,
        day: next ? next.day : null,
        topic: next ? next.title : null,
        module: next ? next.module : null,
        candidateStatus: next ? next.candidateStatus : null,
        attempts: next ? next.attempts : null,
        questionType: QUESTION_TYPES.CROSS_TOPIC,
        // if we're moving on BECAUSE of a repeated struggle, ease off the
        // difficulty a notch so the fresh topic isn't stacked on top of
        // an already-rough patch of the interview.
        difficulty: repeatedStruggle ? stepDown(currentDifficulty) : currentDifficulty,
        isFollowUp: false,
      };
    }

    case PHASES.DEPTH: {
      const harder = stepUp(currentDifficulty);
      const ctx = lookupTopicContext(session, lastQuestion.day);
      const questionType =
        harder === 'advanced'
          ? QUESTION_TYPES.CHALLENGE
          : harder === 'intermediate'
            ? QUESTION_TYPES.SCENARIO
            : QUESTION_TYPES.ARCHITECTURE_DESIGN;
      return {
        phase: PHASES.DEPTH,
        day: lastQuestion.day,
        topic: lastQuestion.title,
        module: ctx.module,
        candidateStatus: ctx.candidateStatus,
        attempts: ctx.attempts,
        questionType,
        difficulty: harder,
        isFollowUp: false,
      };
    }

    case PHASES.FINAL_ASSESSMENT: {
      return {
        phase: PHASES.FINAL_ASSESSMENT,
        day: null,
        topic: 'Overall reflection',
        module: null,
        candidateStatus: null,
        attempts: null,
        questionType: QUESTION_TYPES.SCENARIO,
        difficulty: currentDifficulty,
        isFollowUp: false,
      };
    }

    case PHASES.PROBE:
    default: {
      const next = pickNextTopic(session);
      return {
        phase: PHASES.PROBE,
        day: next ? next.day : null,
        topic: next ? next.title : null,
        module: next ? next.module : null,
        candidateStatus: next ? next.candidateStatus : null,
        attempts: next ? next.attempts : null,
        questionType: QUESTION_TYPES.TECHNICAL_PROBE,
        difficulty: currentDifficulty,
        isFollowUp: false,
      };
    }
  }
}

// ---------------------------------------------------------------------
// LLM-backed phrasing
// ---------------------------------------------------------------------

/**
 * Defensive cleanup in case the model doesn't perfectly follow the
 * "output only the question" instruction — strips common preambles/
 * quote-wrapping without altering the substance of the question.
 * @param {string} raw
 * @returns {string}
 */
function sanitizeQuestionText(raw) {
  let text = (raw || '').trim();
  text = text.replace(/^(question|interviewer)\s*:\s*/i, '');
  text = text.replace(/^here'?s (a|the) (next )?question[:.]?\s*/i, '');
  if ((text.startsWith('"') && text.endsWith('"')) || (text.startsWith('“') && text.endsWith('”'))) {
    text = text.slice(1, -1).trim();
  }
  return text;
}

/**
 * Full turn: decide what to ask (sync, deterministic), then ask the LLM
 * to phrase it (async), then return the exact structured shape required
 * by the spec.
 *
 * @param {import('./sessionModel').SessionState} session
 * @param {{ completeFn?: typeof llmClient.complete }} [options] - `completeFn`
 *   is injectable so callers (and tests) can stub the LLM without a live
 *   API key; defaults to the real llmClient.
 * @returns {Promise<{ question: string, curriculumDay: number|null, topic: string|null, questionType: string, difficulty: string }>}
 */
async function generateNextQuestion(session, options = {}) {
  const decision = decideNextQuestion(session);
  const messages = buildQuestionMessages(session, decision);
  const completeFn = options.completeFn || llmClient.complete;

  const raw = await completeFn(messages, { maxTokens: 300, temperature: 0.7 });
  const question = sanitizeQuestionText(raw);

  return {
    question,
    curriculumDay: decision.day,
    topic: decision.topic,
    questionType: decision.questionType,
    difficulty: decision.difficulty,
  };
}

module.exports = {
  QUESTION_TYPES,
  WEAK_SCORE_THRESHOLD,
  STRONG_SCORE_THRESHOLD,
  computeCurrentDifficulty,
  pickNextTopic,
  decideNextQuestion,
  generateNextQuestion,
  sanitizeQuestionText,
};
