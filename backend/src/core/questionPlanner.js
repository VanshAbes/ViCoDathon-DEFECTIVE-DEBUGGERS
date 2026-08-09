'use strict';

/**
 * Adaptive Question Planner (P5) — rewritten to target the REAL session
 * architecture (src/core/sessionModel.js + sessionStore.js), the REAL
 * answer evaluator (src/core/answerEvaluator.js), and the REAL prompt
 * builder (src/llm/prompts.js).
 *
 * The previous version of this file was built against a `../session`
 * module and a `../intelligence` (mis-spelled path) that never matched
 * what actually got built. It has been replaced outright rather than
 * patched — see the integration audit for details.
 *
 * Two responsibilities only:
 *
 *   1. decideNextQuestion(session)   — PURE, READ-ONLY. Given a session's
 *      current state, decides what the next question should be about:
 *      phase, curriculum day, topic, question type, difficulty, and
 *      whether it's a follow-up. Never mutates session state and never
 *      calls setPhase/recordQuestion itself — the orchestrator (the
 *      future interviewEngine.js) is responsible for actually applying
 *      the transition and recording the question, exactly like the
 *      original design's philosophy.
 *
 *   2. generateNextQuestion(session, options) — calls decideNextQuestion(),
 *      builds the LLM messages via prompts.buildQuestionMessages(), and
 *      calls llmClient.complete() (or an injectable options.completeFn,
 *      matching the pattern answerEvaluator.js already uses) to actually
 *      phrase the question. Falls back to a deterministic, content-
 *      agnostic question if the LLM call fails or returns nothing.
 *
 * Also exports computeCurrentDifficulty(session) since it's useful on
 * its own (tests / future callers) and generateNextQuestion relies on it.
 *
 * P6 -> P5 wiring: answerEvaluator.js's evaluations are read here via
 * session.evaluations (the last recorded evaluation's `recommendedAction`)
 * and used to steer the next decision — this takes priority over the
 * plain coverage/phase heuristics, mirroring the intent already
 * documented in sessionModel.js's recordEvaluation() JSDoc.
 */

const sessionModel = require('./sessionModel');
const { getAllDays, getDayByNumber, getModuleForDay } = require('../models/curriculumModel');
const { DIFFICULTY_LEVELS } = require('../intellegence/candidateProfileEngine');
const { buildQuestionMessages } = require('../llm/prompts');
const llmClient = require('../llm/llmClient');

const { PHASES } = sessionModel;

/**
 * Maps a phase (or evaluator-driven intent) to the questionType key that
 * prompts.js's QUESTION_TYPE_GUIDANCE understands. Kept as plain data so
 * it's obvious at a glance and doesn't duplicate any prompt-building logic.
 */
const QUESTION_TYPE_BY_INTENT = {
  BASELINE: 'baseline',
  PROBE: 'technical_probe',
  FOLLOW_UP: 'technical_probe',
  CLARIFY: 'clarification',
  DEPTH: 'challenge',
  CROSS_TOPIC: 'cross_topic',
  CROSS_CONNECT: 'cross_topic',
  FINAL_ASSESSMENT: 'baseline',
};

// ---------------------------------------------------------------------
// Difficulty helpers
// ---------------------------------------------------------------------

function difficultyIndex(level) {
  const idx = DIFFICULTY_LEVELS.indexOf(level);
  return idx === -1 ? 0 : idx;
}

function stepDifficulty(level, delta) {
  const idx = Math.max(0, Math.min(DIFFICULTY_LEVELS.length - 1, difficultyIndex(level) + delta));
  return DIFFICULTY_LEVELS[idx];
}

/**
 * Current difficulty = the candidate's deterministic P3 baseline
 * (session.profile.recommendedDifficulty.level), nudged by the single
 * most recent evaluation's recommendedAction:
 *   - INCREASE_DIFFICULTY steps up one level (capped at 'advanced')
 *   - a CHANGE_TOPIC triggered by a genuinely weak answer (score <= 1)
 *     steps down one level (capped at 'foundational')
 *   - anything else keeps the baseline level
 * Deliberately simple (one-step, not cumulative across the whole
 * transcript) — a content-agnostic, explainable rule, matching the same
 * "no opaque weighted score" philosophy candidateProfileEngine.js uses.
 *
 * @param {import('./sessionModel').SessionState} session
 * @returns {'foundational'|'intermediate'|'advanced'}
 */
function computeCurrentDifficulty(session) {
  const base = session.profile.recommendedDifficulty.level;
  const lastEval = session.evaluations[session.evaluations.length - 1];
  if (!lastEval) return base;
  if (lastEval.recommendedAction === 'INCREASE_DIFFICULTY') return stepDifficulty(base, 1);
  if (lastEval.recommendedAction === 'CHANGE_TOPIC' && typeof lastEval.score === 'number' && lastEval.score <= 1) {
    return stepDifficulty(base, -1);
  }
  return base;
}

// ---------------------------------------------------------------------
// Small read-only helpers over the REAL SessionState
// ---------------------------------------------------------------------

function countQuestionsInPhase(session, phase) {
  return session.questions.filter((q) => q.phase === phase).length;
}

/**
 * Looks up display info (title/module/candidateStatus/attempts) for a
 * curriculum day, preferring the candidate-enriched session.topicPool
 * (has candidateStatus/attempts) and falling back to raw curriculum data
 * for days outside the candidate's own mission history (the same
 * "fallback" concept the original planner had for sparse candidates).
 * @param {import('./sessionModel').SessionState} session
 * @param {number|null} day
 */
function getDayInfo(session, day) {
  if (day === null || day === undefined) {
    return { title: null, module: null, candidateStatus: null, attempts: null };
  }
  const fromPool = session.topicPool.find((t) => t.day === day);
  if (fromPool) {
    return { title: fromPool.title, module: fromPool.module, candidateStatus: fromPool.candidateStatus, attempts: fromPool.attempts };
  }
  const curriculumDay = getDayByNumber(day);
  const mod = getModuleForDay(day);
  return {
    title: curriculumDay ? curriculumDay.title : null,
    module: mod ? mod.title : null,
    candidateStatus: null,
    attempts: null,
  };
}

/**
 * Picks the next best not-yet-covered curriculum day, reusing
 * sessionModel.getUncoveredTopics() (already prioritized: plannedTopics
 * first — themselves ranked by P3's weak/failed/skipped-first logic —
 * then the rest of the candidate-relevant topicPool). Falls back to any
 * curriculum day at all if the candidate-relevant pool is exhausted, so
 * the interview can still legally reach the minimum day coverage (same
 * fallback concept the original planner had for sparse candidates).
 * @param {import('./sessionModel').SessionState} session
 * @param {number[]} [excludeDays]
 */
function pickUncoveredDay(session, excludeDays = []) {
  const uncovered = sessionModel.getUncoveredTopics(session).filter((t) => !excludeDays.includes(t.day));
  if (uncovered.length > 0) return { day: uncovered[0].day, title: uncovered[0].title, module: uncovered[0].module };

  const covered = session.daysCovered;
  const fallback = getAllDays().find((d) => !covered.has(d.day) && !excludeDays.includes(d.day));
  if (!fallback) return null; // curriculum genuinely exhausted — edge case
  const mod = getModuleForDay(fallback.day);
  return { day: fallback.day, title: fallback.title, module: mod ? mod.title : null };
}

/**
 * Picks an already-covered day in a DIFFERENT curriculum module than
 * `sourceDay`, for a genuine cross-topic connection (CROSS_CONNECT).
 * Falls back to any other covered day if no module diversity exists yet.
 * @param {import('./sessionModel').SessionState} session
 * @param {number} sourceDay
 * @returns {number|null}
 */
function pickCrossConnectPartner(session, sourceDay) {
  const sourceModule = getModuleForDay(sourceDay);
  const others = Array.from(session.daysCovered).filter((d) => d !== sourceDay);
  const diverseModule = others.find((d) => {
    const mod = getModuleForDay(d);
    return mod && sourceModule && mod.n !== sourceModule.n;
  });
  if (diverseModule !== undefined) return diverseModule;
  return others.length > 0 ? others[0] : null;
}

// ---------------------------------------------------------------------
// Decision builders — each returns a full decision object compatible
// with prompts.buildQuestionMessages(), or null if it couldn't find a
// valid day to ask about (caller falls back to coverage-driven logic).
// ---------------------------------------------------------------------

function baseDecision(session, overrides) {
  return {
    phase: null,
    day: null,
    topic: null,
    module: null,
    candidateStatus: null,
    attempts: null,
    relatedDays: [],
    crossConnectDay: null,
    crossConnectTopic: null,
    questionType: null,
    difficulty: computeCurrentDifficulty(session),
    isFollowUp: false,
    rationale: '',
    readyToComplete: false,
    ...overrides,
  };
}

function buildBaselineDecision(session) {
  const warmUp = session.plannedTopics.find((t) => t.role === 'warm-up') || session.plannedTopics[0];
  const topic = warmUp || pickUncoveredDay(session, []);
  if (!topic) return null;
  const info = getDayInfo(session, topic.day);
  return baseDecision(session, {
    phase: PHASES.BASELINE,
    day: topic.day,
    topic: info.title || topic.title,
    module: info.module || topic.module || null,
    candidateStatus: info.candidateStatus,
    attempts: info.attempts,
    questionType: QUESTION_TYPE_BY_INTENT.BASELINE,
    isFollowUp: false,
    rationale: warmUp
      ? `Opening warm-up on Day ${topic.day} (${warmUp.reason || 'a topic they handled well'}).`
      : `Opening warm-up on Day ${topic.day} — no clean first-try pass on record, using the next available topic.`,
  });
}

function buildProbeDecision(session, excludeDays = []) {
  const next = pickUncoveredDay(session, excludeDays);
  if (!next) return null;
  const info = getDayInfo(session, next.day);
  return baseDecision(session, {
    phase: PHASES.PROBE,
    day: next.day,
    topic: info.title || next.title,
    module: info.module || next.module || null,
    candidateStatus: info.candidateStatus,
    attempts: info.attempts,
    questionType: QUESTION_TYPE_BY_INTENT.PROBE,
    isFollowUp: false,
    rationale: `Grounding a new question in Day ${next.day} to build curriculum coverage.`,
  });
}

function buildFollowUpDecision(session, day, { clarify = false } = {}) {
  if (day === null || day === undefined) return null;
  const info = getDayInfo(session, day);
  return baseDecision(session, {
    phase: PHASES.FOLLOW_UP,
    day,
    topic: info.title,
    module: info.module,
    candidateStatus: info.candidateStatus,
    attempts: info.attempts,
    questionType: clarify ? QUESTION_TYPE_BY_INTENT.CLARIFY : QUESTION_TYPE_BY_INTENT.FOLLOW_UP,
    isFollowUp: true,
    rationale: clarify
      ? `Last answer on Day ${day} was ambiguous/off-target — asking them to clarify or restate.`
      : `Last answer on Day ${day} was weak or shallow — digging deeper on the same topic.`,
  });
}

function buildDepthDecision(session, day) {
  if (day === null || day === undefined) return null;
  const info = getDayInfo(session, day);
  return baseDecision(session, {
    phase: PHASES.DEPTH,
    day,
    topic: info.title,
    module: info.module,
    candidateStatus: info.candidateStatus,
    attempts: info.attempts,
    questionType: QUESTION_TYPE_BY_INTENT.DEPTH,
    isFollowUp: true,
    rationale: `Strong answer on Day ${day} — increasing difficulty to confirm real depth.`,
  });
}

function buildChangeTopicDecision(session, sourceDay) {
  const next = pickUncoveredDay(session, sourceDay !== null && sourceDay !== undefined ? [sourceDay] : []);
  if (!next) return null;
  const info = getDayInfo(session, next.day);
  return baseDecision(session, {
    phase: PHASES.CROSS_TOPIC,
    day: next.day,
    topic: info.title || next.title,
    module: info.module || next.module || null,
    candidateStatus: info.candidateStatus,
    attempts: info.attempts,
    relatedDays: sourceDay !== null && sourceDay !== undefined ? [sourceDay] : [],
    questionType: QUESTION_TYPE_BY_INTENT.CROSS_TOPIC,
    isFollowUp: false,
    rationale: sourceDay !== null && sourceDay !== undefined
      ? `Candidate struggled repeatedly on Day ${sourceDay} — moving on to a new topic (Day ${next.day}).`
      : `Moving on to a new topic (Day ${next.day}).`,
  });
}

function buildCrossConnectDecision(session, sourceDay) {
  if (sourceDay === null || sourceDay === undefined) return null;
  const targetDay = pickCrossConnectPartner(session, sourceDay);
  if (targetDay === null || targetDay === undefined) return null;
  const sourceInfo = getDayInfo(session, sourceDay);
  const targetInfo = getDayInfo(session, targetDay);
  return baseDecision(session, {
    phase: PHASES.CROSS_TOPIC,
    day: targetDay,
    topic: targetInfo.title,
    module: targetInfo.module,
    candidateStatus: targetInfo.candidateStatus,
    attempts: targetInfo.attempts,
    relatedDays: [sourceDay],
    crossConnectDay: sourceDay,
    crossConnectTopic: sourceInfo.title,
    questionType: QUESTION_TYPE_BY_INTENT.CROSS_CONNECT,
    isFollowUp: false,
    rationale: `Candidate's answer on Day ${sourceDay} ("${sourceInfo.title}") opened a natural bridge to Day ${targetDay} ("${targetInfo.title}").`,
  });
}

function buildFinalAssessmentDecision(session) {
  return baseDecision(session, {
    phase: PHASES.FINAL_ASSESSMENT,
    day: null,
    topic: null,
    module: null,
    questionType: QUESTION_TYPE_BY_INTENT.FINAL_ASSESSMENT,
    isFollowUp: false,
    rationale: 'Closing reflective question to wrap up the interview.',
  });
}

function buildReadyToCompleteDecision(session) {
  return baseDecision(session, {
    phase: PHASES.COMPLETE,
    readyToComplete: true,
    rationale: 'Final assessment question already asked and answered — interview ready to complete.',
  });
}

// ---------------------------------------------------------------------
// Public entry point #1: decideNextQuestion (pure, read-only)
// ---------------------------------------------------------------------

/**
 * Decides what the next interview question should be about, given the
 * session's CURRENT real state. Never mutates the session. The caller
 * (eventually interviewEngine.js) is responsible for calling
 * sessionModel.setPhase()/recordQuestion() to actually apply this.
 *
 * Priority order:
 *   1. If a FINAL_ASSESSMENT question has already been asked, signal
 *      readyToComplete instead of proposing another question.
 *   2. If no questions have been asked yet, open with BASELINE.
 *   3. Otherwise, let the most recent answer evaluation's
 *      `recommendedAction` (P6 -> P5 wiring) steer the decision:
 *        FOLLOW_UP / CLARIFY   -> stay on the same day
 *        INCREASE_DIFFICULTY   -> DEPTH on the same day
 *        CHANGE_TOPIC          -> a fresh, uncovered day
 *        CROSS_CONNECT         -> bridge to another covered day
 *        COMPLETE              -> FINAL_ASSESSMENT, if minimums are met
 *   4. If no evaluation exists yet, or the steer above couldn't find a
 *      valid day (e.g. curriculum pool exhausted), fall back to
 *      coverage-driven default: FINAL_ASSESSMENT once minimums are met,
 *      otherwise probe the next uncovered topic.
 *
 * @param {import('./sessionModel').SessionState} session
 * @returns {object} decision — compatible with prompts.buildQuestionMessages()
 */
function decideNextQuestion(session) {
  if (!session) throw new Error('decideNextQuestion: session is required');

  // 1. Already asked the closing question — nothing left to decide.
  if (countQuestionsInPhase(session, PHASES.FINAL_ASSESSMENT) >= 1) {
    return buildReadyToCompleteDecision(session);
  }

  // 2. Very first question of the interview.
  if (session.questions.length === 0) {
    const baseline = buildBaselineDecision(session);
    if (baseline) return baseline;
    // Degenerate edge case (no candidate topics at all) — fall through
    // to the generic probe fallback below.
  }

  // 3. Let the most recent evaluation steer the decision.
  const lastEvaluation = session.evaluations[session.evaluations.length - 1];
  if (lastEvaluation) {
    const lastQuestion = session.questions.find((q) => q.id === lastEvaluation.questionId);
    const day = lastQuestion ? lastQuestion.day : null;
    const action = lastEvaluation.recommendedAction;

    let steered = null;
    switch (action) {
      case 'FOLLOW_UP':
        steered = buildFollowUpDecision(session, day, { clarify: false });
        break;
      case 'CLARIFY':
        steered = buildFollowUpDecision(session, day, { clarify: true });
        break;
      case 'INCREASE_DIFFICULTY':
        steered = buildDepthDecision(session, day);
        break;
      case 'CHANGE_TOPIC':
        // Once the interview has already cleared its minimums, opening yet
        // another brand-new topic just prolongs things unnecessarily —
        // wrap up instead. Below the minimums, honor the request to move on.
        steered = sessionModel.meetsCompletionCriteria(session)
          ? buildFinalAssessmentDecision(session)
          : buildChangeTopicDecision(session, day);
        break;
      case 'CROSS_CONNECT':
        steered = buildCrossConnectDecision(session, day) || buildChangeTopicDecision(session, day);
        break;
      case 'COMPLETE':
        if (sessionModel.meetsCompletionCriteria(session)) {
          steered = buildFinalAssessmentDecision(session);
        }
        break;
      default:
        steered = null;
    }
    if (steered) return steered;
  }

  // 4. Coverage-driven default.
  if (sessionModel.meetsCompletionCriteria(session)) {
    return buildFinalAssessmentDecision(session);
  }
  const probe = buildProbeDecision(session);
  if (probe) return probe;

  // Curriculum pool is fully exhausted but minimums still aren't met —
  // nothing left to ground a new question in. Signal readiness to wrap
  // up anyway rather than looping forever; sessionModel's own guard will
  // still refuse an illegal FINAL_ASSESSMENT transition if minimums
  // truly aren't met, so this can't silently produce a too-short interview.
  return buildFinalAssessmentDecision(session);
}

// ---------------------------------------------------------------------
// Public entry point #2: generateNextQuestion (decision -> LLM phrasing)
// ---------------------------------------------------------------------

/**
 * Deterministic fallback question text — used only when the LLM call fails
 * or returns empty, so the interview keeps moving instead of crashing
 * (same "structural safety net" philosophy as answerEvaluator.js's
 * fallback path).
 *
 * Unlike the LLM path (which receives full history via
 * prompts.buildQuestionMessages), this fallback must generate a sensible
 * question with NO external model. To avoid the previous bug where it
 * merely rephrased the current question verbatim, it:
 *   - varies by `decision.questionType` (challenge vs clarification vs
 *     cross_topic vs baseline/probe), so different intents ask different
 *     things;
 *   - inspects the real previous question from `session.questions` and
 *     refuses to return the same text or near-verbatim rephrase;
 *   - if the first-chosen wording overlaps too heavily with the previous
 *     question, pivots to a different information demand.
 *
 * @param {object} decision - planner decision (see generateNextQuestion)
 * @param {import('./sessionModel').SessionState} session - for history/novelty
 * @returns {string}
 */
function buildFallbackQuestionText(decision, session) {
  const topic = decision.topic || 'that topic';
  const dayLabel = decision.day === null || decision.day === undefined ? '' : `Day ${decision.day}`;

  // The most recent question actually asked, for novelty protection.
  const history = session ? session.questions : [];
  const lastAsked = history.length ? history[history.length - 1].question : null;

  // Simple token set for overlap detection (avoid near-verbatim rephrase).
  const tokens = (text) => {
    const set = new Set();
    for (const t of (text || '').toLowerCase().match(/[a-z0-9']+/g) || []) {
      if (t.length >= 4) set.add(t);
    }
    return set;
  };
  const overlapRatio = (a, b) => {
    const sa = tokens(a);
    const sb = tokens(b);
    if (sa.size === 0 || sb.size === 0) return 0;
    let shared = 0;
    for (const t of sa) if (sb.has(t)) shared += 1;
    return shared / Math.min(sa.size, sb.size);
  };

  // Candidate fallback phrasings, keyed by information demand. Each is a
  // function(dayLabel, topic) -> question. The richer, more specific ones
  // are tried first for follow-ups so a DEPTH question genuinely pushes
  // for new information rather than re-asking the opener.
  const demands = {
    challenge: [
      (d, t) => `On ${d} (${t}), what's the most common edge case or failure mode, and how would you mitigate it in practice?`,
      (d, t) => `Thinking about ${d} (${t}) — walk me through a real trade-off or limitation you'd hit, and how you'd decide.`,
      (d, t) => `For ${d} (${t}), consider a tricky boundary condition. How would you diagnose it and what would you change first?`,
    ],
    clarification: [
      (d, t) => `You mentioned ${d} (${t}) — could you go deeper and show the concrete step you'd take, and what you'd check to know it worked?`,
      (d, t) => `Let's tighten up ${d} (${t}): describe the key mechanism in a way that shows you can apply it, not just name it.`,
    ],
    cross_topic: [
      (d, t) => `Let's move on to ${d} (${t}). Can you walk me through how you'd approach it?`,
      (d, t) => `Shifting to a new area — ${d} (${t}). How would you get started on it in practice?`,
    ],
    baseline: [
      (d, t) => `Let's talk about ${d} (${t}). Can you walk me through how you'd approach it?`,
      (d, t) => `Starting with ${d} (${t}) — how would you go about it in a real project?`,
    ],
    probe: [
      (d, t) => `On ${d} (${t}), what's your practical approach?`,
      (d, t) => `Let's look at ${d} (${t}). Walk me through how you'd handle it end to end.`,
    ],
  };

  // Closing / non-day questions.
  const closing = () => "Looking back at the cohort, what part are you proudest of, and why?";

  const pickDemand = () => {
    const type = decision.questionType;
    let list = demands[type] || (decision.isFollowUp ? demands.challenge : demands.baseline);
    // For a follow-up without an explicit challenge/clarification type,
    // fall back to a challenge-style demand to force new information.
    if (decision.isFollowUp && !['challenge', 'clarification', 'cross_topic'].includes(type)) {
      list = demands.challenge;
    }
    return list;
  };

  const candidates = pickDemand();

  // Try each candidate; accept the first that is not identical to and does
  // not heavily overlap the previous question. If none pass, fall back to
  // the last candidate (best effort — still distinct by construction from
  // the opener for follow-ups).
  for (let i = 0; i < candidates.length; i += 1) {
    const text = candidates[i](dayLabel, topic);
    if (!lastAsked) return text; // no history -> safe to use the first
    if (text.trim().toLowerCase() === lastAsked.trim().toLowerCase()) continue;
    if (overlapRatio(text, lastAsked) > 0.75) continue;
    return text;
  }

  // Last resort: a generic-but-distinct closing/probing question.
  return decision.day === null || decision.day === undefined
    ? closing()
    : `Outside of the basics, what about Day ${decision.day} (${topic}) do you think is hardest to get right?`;
}

/**
 * Decides the next question (via decideNextQuestion) and phrases it
 * through the LLM, using prompts.buildQuestionMessages() — never
 * duplicating that prompt-building logic here.
 *
 * @param {import('./sessionModel').SessionState} session
 * @param {{ completeFn?: typeof llmClient.complete }} [options] - injectable,
 *   matching the same pattern answerEvaluator.js uses for tests/dev.
 * @returns {Promise<{
 *   question: string|null,
 *   phase: string,
 *   curriculumDay: number|null,
 *   topic: string|null,
 *   module: string|null,
 *   questionType: string|null,
 *   difficulty: string,
 *   isFollowUp: boolean,
 *   relatedDays: number[],
 *   rationale: string,
 *   readyToComplete: boolean,
 * }>}
 */
async function generateNextQuestion(session, options = {}) {
  const decision = decideNextQuestion(session);

  if (decision.readyToComplete) {
    return {
      question: null,
      phase: decision.phase,
      curriculumDay: decision.day,
      topic: decision.topic,
      module: decision.module,
      questionType: decision.questionType,
      difficulty: decision.difficulty,
      isFollowUp: decision.isFollowUp,
      relatedDays: decision.relatedDays,
      rationale: decision.rationale,
      readyToComplete: true,
    };
  }

  const messages = buildQuestionMessages(session, decision);
  const completeFn = options.completeFn || llmClient.complete;

  let questionText = '';
  try {
    questionText = await completeFn(messages, { maxTokens: 300, temperature: 0.7 });
  } catch (_err) {
    questionText = ''; // LLM failure -> fall through to the deterministic fallback below
  }

  questionText = (questionText || '').trim();
  if (!questionText) questionText = buildFallbackQuestionText(decision, session);

  return {
    question: questionText,
    phase: decision.phase,
    curriculumDay: decision.day,
    topic: decision.topic,
    module: decision.module,
    questionType: decision.questionType,
    difficulty: decision.difficulty,
    isFollowUp: decision.isFollowUp,
    relatedDays: decision.relatedDays,
    rationale: decision.rationale,
    readyToComplete: false,
  };
}

module.exports = {
  decideNextQuestion,
  computeCurrentDifficulty,
  generateNextQuestion,
  // exported for tests / transparency
  QUESTION_TYPE_BY_INTENT,
  buildFallbackQuestionText,
};
