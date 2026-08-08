'use strict';

/**
 * Interview Session Engine (P4)
 * ==============================
 * Owns the shape and mutation logic of a single interview session's
 * in-memory state. Built directly on top of the P1-P3 layers already in
 * place:
 *
 *   - models/candidateModel, models/curriculumModel     (raw lookups)
 *   - intelligence (candidateIntelligence, curriculumIntelligence,
 *     probingEngine, candidateProfileEngine)             (P2 + P3)
 *
 * This module does NOT call an LLM and does NOT decide question wording —
 * that's the interview engine / question planner's job (later step). This
 * module only tracks state: what's been asked, what's been answered, what
 * curriculum coverage exists, what phase the interview is in, and whether
 * the session is allowed to finish yet.
 *
 * Flow (per spec):
 *   BASELINE -> PROBE -> FOLLOW_UP -> CROSS_TOPIC -> DEPTH -> FINAL_ASSESSMENT -> COMPLETE
 *
 * The flow is not strictly linear — FOLLOW_UP / CROSS_TOPIC / DEPTH / PROBE
 * can recur multiple times as the interview adapts to answers — but COMPLETE
 * is only reachable from FINAL_ASSESSMENT, and FINAL_ASSESSMENT is only
 * reachable once the minimum question count AND minimum day coverage are
 * both satisfied.
 */

const { buildCandidateProfile } = require('../intelligence/candidateProfileEngine');
const { getRelevantCurriculumDays } = require('../intelligence/curriculumIntelligence');

/** @typedef {import('../models/types').RawCandidate} RawCandidate */

const PHASES = Object.freeze({
  BASELINE: 'BASELINE',
  PROBE: 'PROBE',
  FOLLOW_UP: 'FOLLOW_UP',
  CROSS_TOPIC: 'CROSS_TOPIC',
  DEPTH: 'DEPTH',
  FINAL_ASSESSMENT: 'FINAL_ASSESSMENT',
  COMPLETE: 'COMPLETE',
});

const PHASE_ORDER = [
  PHASES.BASELINE,
  PHASES.PROBE,
  PHASES.FOLLOW_UP,
  PHASES.CROSS_TOPIC,
  PHASES.DEPTH,
  PHASES.FINAL_ASSESSMENT,
  PHASES.COMPLETE,
];

/**
 * Which phases are legal to move TO from a given phase. Encodes the
 * spec's flow while allowing the adaptive loop (PROBE/FOLLOW_UP/
 * CROSS_TOPIC/DEPTH can all revisit each other) instead of forcing a
 * strictly linear walk through every phase exactly once.
 * @type {Record<string, string[]>}
 */
const ALLOWED_TRANSITIONS = {
  [PHASES.BASELINE]: [PHASES.PROBE],
  [PHASES.PROBE]: [PHASES.FOLLOW_UP, PHASES.CROSS_TOPIC, PHASES.DEPTH, PHASES.PROBE, PHASES.FINAL_ASSESSMENT],
  [PHASES.FOLLOW_UP]: [PHASES.PROBE, PHASES.CROSS_TOPIC, PHASES.DEPTH, PHASES.FOLLOW_UP, PHASES.FINAL_ASSESSMENT],
  [PHASES.CROSS_TOPIC]: [PHASES.PROBE, PHASES.FOLLOW_UP, PHASES.DEPTH, PHASES.CROSS_TOPIC, PHASES.FINAL_ASSESSMENT],
  [PHASES.DEPTH]: [PHASES.PROBE, PHASES.FOLLOW_UP, PHASES.CROSS_TOPIC, PHASES.FINAL_ASSESSMENT],
  [PHASES.FINAL_ASSESSMENT]: [PHASES.COMPLETE],
  [PHASES.COMPLETE]: [],
};

const DEFAULT_MIN_QUESTIONS = 8;
const DEFAULT_MIN_DAYS_COVERED = 4;

/**
 * @typedef {Object} SessionState
 * @property {string} sessionId
 * @property {RawCandidate} candidate
 * @property {object} profile              - output of buildCandidateProfile()
 * @property {string} phase                - one of PHASES
 * @property {{role:'assistant'|'user', content:string, ts:number}[]} history
 * @property {{id:string, day:number|null, title:string|null, phase:string, question:string, isFollowUp:boolean, askedAt:number}[]} questions
 * @property {{questionId:string, day:number|null, answer:string, answeredAt:number}[]} answers
 * @property {{questionId:string, day:number|null, score:number|null, shallow:boolean, notes:string, evaluatedAt:number}[]} evaluations
 * @property {Set<number>} daysCovered
 * @property {Set<string>} topicsCovered   - curriculum day titles touched
 * @property {Map<number, {attempts:number, avgScore:number, lastShallow:boolean}>} competencySignals - keyed by day
 * @property {{day:number, title:string, module:string|null, role:string, reason:string, asked:boolean}[]} plannedTopics
 * @property {{day:number, title:string, module:string|null, candidateStatus:string, attempts:number|null}[]} topicPool
 * @property {number} questionsAsked
 * @property {number} minQuestions
 * @property {number} minDaysCovered
 * @property {boolean} done
 * @property {number} createdAt
 * @property {number} updatedAt
 */

let _idCounter = 0;
/** Generates short, collision-safe-enough ids for questions within a session. */
function nextLocalId(prefix) {
  _idCounter += 1;
  return `${prefix}_${_idCounter}_${Date.now()}`;
}

/**
 * Creates a brand-new session's initial state for a candidate.
 * Computes the candidate's intelligence profile once (P3, deterministic)
 * and seeds `plannedTopics` from its `recommendedStartingTopics`, plus a
 * fuller `topicPool` (all curriculum days relevant to this candidate) so
 * later phases (CROSS_TOPIC especially) have somewhere to pull from once
 * the initial planned topics are exhausted.
 *
 * @param {string} sessionId
 * @param {RawCandidate} candidate
 * @param {{ minQuestions?: number, minDaysCovered?: number }} [options]
 * @returns {SessionState}
 */
function createInitialState(sessionId, candidate, options = {}) {
  if (!sessionId) throw new Error('createInitialState: sessionId is required');
  if (!candidate || !candidate.member) throw new Error('createInitialState: a full candidate record is required');

  const profile = buildCandidateProfile(candidate);
  const topicPool = getRelevantCurriculumDays(candidate).map((d) => ({
    day: d.day,
    title: d.title,
    module: d.module ? d.module.title : null,
    candidateStatus: d.candidateStatus,
    attempts: d.attempts,
  }));

  const now = Date.now();

  return {
    sessionId,
    candidate,
    profile,
    phase: PHASES.BASELINE,
    history: [],
    questions: [],
    answers: [],
    evaluations: [],
    daysCovered: new Set(),
    topicsCovered: new Set(),
    competencySignals: new Map(),
    plannedTopics: profile.recommendedStartingTopics.map((t) => ({ ...t, asked: false })),
    topicPool,
    questionsAsked: 0,
    minQuestions: options.minQuestions ?? DEFAULT_MIN_QUESTIONS,
    minDaysCovered: options.minDaysCovered ?? DEFAULT_MIN_DAYS_COVERED,
    done: false,
    createdAt: now,
    updatedAt: now,
  };
}

/**
 * Has this day already been asked about (baseline/probe/cross-topic —
 * i.e. a "new topic" question, not a follow-up on the same day)?
 * Used to prevent duplicate/redundant questions on a day already covered.
 * @param {SessionState} session
 * @param {number} day
 * @returns {boolean}
 */
function isDayCovered(session, day) {
  return session.daysCovered.has(day);
}

/**
 * Returns planned/pool topics not yet covered, in priority order
 * (plannedTopics first — they're already ranked by the P3 engine — then
 * the remaining topic pool, both filtered to exclude covered days).
 * @param {SessionState} session
 * @returns {{day:number, title:string, module:string|null}[]}
 */
function getUncoveredTopics(session) {
  const plannedUncovered = session.plannedTopics.filter((t) => !isDayCovered(session, t.day));
  const poolUncovered = session.topicPool.filter(
    (t) => !isDayCovered(session, t.day) && !plannedUncovered.some((p) => p.day === t.day)
  );
  return [...plannedUncovered, ...poolUncovered];
}

/**
 * Records a new question (baseline/probe/cross-topic/depth/follow-up) in
 * history + the questions log, and — unless it's a follow-up on a day
 * already covered — marks that day as covered.
 *
 * @param {SessionState} session
 * @param {{ day?: number|null, title?: string|null, question: string, phase: string, isFollowUp?: boolean }} input
 * @returns {{ session: SessionState, questionId: string }}
 */
function recordQuestion(session, input) {
  const questionId = nextLocalId('q');
  const now = Date.now();
  const isFollowUp = Boolean(input.isFollowUp);
  const day = typeof input.day === 'number' ? input.day : null;

  session.questions.push({
    id: questionId,
    day,
    title: input.title ?? null,
    phase: input.phase,
    question: input.question,
    isFollowUp,
    askedAt: now,
  });
  session.history.push({ role: 'assistant', content: input.question, ts: now });
  session.questionsAsked += 1;

  if (day !== null) {
    session.daysCovered.add(day);
    if (input.title) session.topicsCovered.add(input.title);
    const planned = session.plannedTopics.find((t) => t.day === day);
    if (planned) planned.asked = true;
  }

  session.updatedAt = now;
  return { session, questionId };
}

/**
 * Records the candidate's raw answer text for a given question.
 * @param {SessionState} session
 * @param {{ questionId: string, answer: string }} input
 * @returns {SessionState}
 */
function recordAnswer(session, input) {
  const question = session.questions.find((q) => q.id === input.questionId);
  if (!question) throw new Error(`recordAnswer: no question found with id ${input.questionId}`);
  const now = Date.now();

  session.answers.push({
    questionId: input.questionId,
    day: question.day,
    answer: input.answer,
    answeredAt: now,
  });
  session.history.push({ role: 'user', content: input.answer, ts: now });
  session.updatedAt = now;
  return session;
}

/**
 * Records an evaluation of a given answer (produced by the LLM turn, in
 * the interview engine — this module just stores the result and rolls it
 * into a per-day competency signal so later phase decisions and the final
 * feedback generator can use it without recomputing from scratch).
 *
 * @param {SessionState} session
 * @param {{ questionId: string, score?: number|null, shallow?: boolean, notes?: string }} input
 * @returns {SessionState}
 */
function recordEvaluation(session, input) {
  const question = session.questions.find((q) => q.id === input.questionId);
  if (!question) throw new Error(`recordEvaluation: no question found with id ${input.questionId}`);
  const now = Date.now();
  const shallow = Boolean(input.shallow);

  session.evaluations.push({
    questionId: input.questionId,
    day: question.day,
    score: typeof input.score === 'number' ? input.score : null,
    shallow,
    notes: input.notes ?? '',
    evaluatedAt: now,
  });

  if (question.day !== null) {
    const existing = session.competencySignals.get(question.day) || { attempts: 0, avgScore: 0, lastShallow: false };
    const attempts = existing.attempts + 1;
    const avgScore =
      typeof input.score === 'number'
        ? (existing.avgScore * existing.attempts + input.score) / attempts
        : existing.avgScore;
    session.competencySignals.set(question.day, { attempts, avgScore, lastShallow: shallow });
  }

  session.updatedAt = now;
  return session;
}

/**
 * @param {SessionState} session
 * @returns {boolean} whether the minimum bar to move toward wrap-up is met
 */
function meetsCompletionCriteria(session) {
  return session.questionsAsked >= session.minQuestions && session.daysCovered.size >= session.minDaysCovered;
}

/**
 * Validates and applies a phase transition. Throws on an illegal jump
 * (e.g. BASELINE -> COMPLETE, or -> FINAL_ASSESSMENT before minimums are
 * met) so bugs in the calling engine fail loudly instead of silently
 * producing a too-short interview.
 *
 * @param {SessionState} session
 * @param {string} nextPhase
 * @returns {SessionState}
 */
function setPhase(session, nextPhase) {
  if (!PHASE_ORDER.includes(nextPhase)) {
    throw new Error(`setPhase: unknown phase "${nextPhase}"`);
  }
  const allowed = ALLOWED_TRANSITIONS[session.phase] || [];
  if (!allowed.includes(nextPhase)) {
    throw new Error(`setPhase: illegal transition ${session.phase} -> ${nextPhase}`);
  }
  if (nextPhase === PHASES.FINAL_ASSESSMENT && !meetsCompletionCriteria(session)) {
    throw new Error(
      `setPhase: cannot move to FINAL_ASSESSMENT yet — ${session.questionsAsked}/${session.minQuestions} questions asked, ` +
      `${session.daysCovered.size}/${session.minDaysCovered} days covered`
    );
  }
  session.phase = nextPhase;
  if (nextPhase === PHASES.COMPLETE) session.done = true;
  session.updatedAt = Date.now();
  return session;
}

/**
 * Heuristic recommendation for what phase to move to next, given the
 * session's current state and a hint about the last answer's quality.
 * This is deliberately simple/deterministic — the interview engine (LLM
 * turn) can always override it, but it gives a sane default so the
 * engine doesn't need to reimplement the coverage/minimums bookkeeping.
 *
 * @param {SessionState} session
 * @param {{ lastAnswerShallow?: boolean, wantDepthProbe?: boolean }} [hints]
 * @returns {string} one of PHASES
 */
function recommendNextPhase(session, hints = {}) {
  if (session.phase === PHASES.BASELINE) return PHASES.PROBE;
  if (session.phase === PHASES.COMPLETE) return PHASES.COMPLETE;

  if (session.phase === PHASES.FINAL_ASSESSMENT) {
    return PHASES.COMPLETE;
  }

  if (meetsCompletionCriteria(session)) {
    return PHASES.FINAL_ASSESSMENT;
  }

  if (hints.lastAnswerShallow) return PHASES.FOLLOW_UP;
  if (session.daysCovered.size < session.minDaysCovered) return PHASES.CROSS_TOPIC;
  if (hints.wantDepthProbe) return PHASES.DEPTH;
  return PHASES.PROBE;
}

module.exports = {
  PHASES,
  PHASE_ORDER,
  ALLOWED_TRANSITIONS,
  DEFAULT_MIN_QUESTIONS,
  DEFAULT_MIN_DAYS_COVERED,
  createInitialState,
  isDayCovered,
  getUncoveredTopics,
  recordQuestion,
  recordAnswer,
  recordEvaluation,
  meetsCompletionCriteria,
  setPhase,
  recommendNextPhase,
};
