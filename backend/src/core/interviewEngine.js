'use strict';

/**
 * Interview Orchestration Engine (the "conductor")
 * ==============================
 * This is the ONLY module that wires together:
 *
 *   models/candidateModel        (load a candidate record)
 *   core/sessionModel            (session state shape + mutations, P4)
 *   core/sessionStore            (in-memory Map<sessionId, SessionState>)
 *   core/questionPlanner         (decide + phrase the next question, P5)
 *   core/answerEvaluator         (score an answer, P6)
 *
 * Every one of those modules is frozen/verified per the hackathon
 * handoff — this file does not change their behavior, it only calls
 * their existing public APIs in the right order and translates the
 * result into the two request/response shapes technical-spec.md's
 * `POST /api/interview` needs ("start" and "turn"). No HTTP, no routes,
 * no server here — that's a later step.
 *
 * Two entry points:
 *   - startInterview({ sessionId, candidateId?, candidate?, options? })
 *   - submitAnswer({ sessionId, answer }, options?)
 *
 * Both are async and both throw InterviewEngineError on any handled
 * failure (never a silent no-op, never an unhandled crash for expected
 * failure modes like a bad sessionId or a missing answer).
 */

const candidateModel = require('../models/candidateModel');
const sessionModel = require('./sessionModel');
const sessionStore = require('./sessionStore');
const questionPlanner = require('./questionPlanner');
const answerEvaluator = require('./answerEvaluator');

const { PHASES } = sessionModel;

// ---------------------------------------------------------------------
// Error type
// ---------------------------------------------------------------------

/**
 * A single error class for every handled failure mode in this module,
 * distinguished by `code` so a future HTTP layer can map it to a status
 * code (400 for bad input, 404 for not-found, 409 for already-done,
 * 502 for upstream LLM failures) without this module knowing about HTTP
 * at all.
 */
class InterviewEngineError extends Error {
  /**
   * @param {string} code
   * @param {string} message
   * @param {object} [details]
   */
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'InterviewEngineError';
    this.code = code;
    this.details = details;
  }
}

const ERROR_CODES = Object.freeze({
  MISSING_SESSION_ID: 'MISSING_SESSION_ID',
  SESSION_ALREADY_EXISTS: 'SESSION_ALREADY_EXISTS',
  SESSION_NOT_FOUND: 'SESSION_NOT_FOUND',
  SESSION_COMPLETED: 'SESSION_COMPLETED',
  INVALID_CANDIDATE: 'INVALID_CANDIDATE',
  CANDIDATE_NOT_FOUND: 'CANDIDATE_NOT_FOUND',
  MISSING_ANSWER: 'MISSING_ANSWER',
  NO_QUESTION_PENDING: 'NO_QUESTION_PENDING',
  QUESTION_ALREADY_ANSWERED: 'QUESTION_ALREADY_ANSWERED',
  EVALUATION_FAILED: 'EVALUATION_FAILED',
  QUESTION_GENERATION_FAILED: 'QUESTION_GENERATION_FAILED',
  PLANNER_ERROR: 'PLANNER_ERROR',
  PHASE_TRANSITION_ERROR: 'PHASE_TRANSITION_ERROR',
});

// ---------------------------------------------------------------------
// Small internal helpers
// ---------------------------------------------------------------------

function requireSessionId(sessionId) {
  if (!sessionId || typeof sessionId !== 'string' || !sessionId.trim()) {
    throw new InterviewEngineError(ERROR_CODES.MISSING_SESSION_ID, 'sessionId is required and must be a non-empty string.');
  }
}

/**
 * Loads/validates the candidate record for a new session.
 * Accepts EITHER a candidateId (looked up via candidateModel, the
 * "candidateId -> load candidate" flow the hackathon spec calls for)
 * OR a full inline candidate object (the shape technical-spec.md's
 * `POST /api/interview` start payload actually sends). Exactly one
 * must be provided.
 *
 * @param {{ candidateId?: string, candidate?: object }} input
 * @returns {object} RawCandidate
 */
function resolveCandidate({ candidateId, candidate }) {
  if (!candidateId && !candidate) {
    throw new InterviewEngineError(
      ERROR_CODES.INVALID_CANDIDATE,
      'startInterview requires either candidateId or a full candidate object.'
    );
  }

  let resolved = candidate;
  if (candidateId) {
    resolved = candidateModel.getCandidateById(candidateId);
    if (!resolved) {
      throw new InterviewEngineError(ERROR_CODES.CANDIDATE_NOT_FOUND, `No candidate found with id "${candidateId}".`, { candidateId });
    }
  }

  if (!resolved || !resolved.member || !resolved.member.id || !Array.isArray(resolved.missions)) {
    throw new InterviewEngineError(
      ERROR_CODES.INVALID_CANDIDATE,
      'Candidate record must include member.id and a missions array.'
    );
  }

  return resolved;
}

/**
 * Applies a planner decision's target phase to the session, but ONLY if
 * it actually differs from the session's current phase — per the
 * hackathon spec's explicit rule: "If planner recommends the SAME phase
 * as the current phase, DO NOT call setPhase()." Skipping the no-op call
 * also means we never trip sessionModel's illegal-self-transition guard
 * (COMPLETE -> COMPLETE isn't in ALLOWED_TRANSITIONS, for instance).
 *
 * @param {import('./sessionModel').SessionState} session
 * @param {string|null|undefined} targetPhase
 */
function applyPhaseIfChanged(session, targetPhase) {
  if (!targetPhase || targetPhase === session.phase) return;
  try {
    sessionModel.setPhase(session, targetPhase);
  } catch (err) {
    throw new InterviewEngineError(
      ERROR_CODES.PHASE_TRANSITION_ERROR,
      `Could not transition session from ${session.phase} to ${targetPhase}: ${err.message}`,
      { from: session.phase, to: targetPhase }
    );
  }
}

/**
 * Records a freshly-generated question onto the session via the existing
 * sessionModel API, translating questionPlanner's `generateNextQuestion`
 * output shape into `recordQuestion`'s input shape.
 *
 * @param {import('./sessionModel').SessionState} session
 * @param {Awaited<ReturnType<typeof questionPlanner.generateNextQuestion>>} generated
 * @returns {{ session: import('./sessionModel').SessionState, questionId: string }}
 */
function recordGeneratedQuestion(session, generated) {
  return sessionModel.recordQuestion(session, {
    day: generated.curriculumDay,
    title: generated.topic,
    question: generated.question,
    phase: generated.phase,
    isFollowUp: generated.isFollowUp,
  });
}

/**
 * Runs decideNextQuestion -> (phase transition) -> generateNextQuestion
 * -> recordQuestion, the shared "ask one more question" sequence used by
 * both startInterview (first question) and submitAnswer (every question
 * after). Returns null if the planner signals readyToComplete instead
 * (caller is responsible for the completion path in that case).
 *
 * @param {import('./sessionModel').SessionState} session
 * @param {{ completeFn?: Function }} [options]
 * @returns {Promise<{ questionId: string, question: string } | null>}
 */
async function askNextQuestion(session, options = {}) {
  let decision;
  try {
    decision = questionPlanner.decideNextQuestion(session);
  } catch (err) {
    throw new InterviewEngineError(ERROR_CODES.PLANNER_ERROR, `questionPlanner.decideNextQuestion failed: ${err.message}`);
  }

  if (decision.readyToComplete) {
    applyPhaseIfChanged(session, PHASES.COMPLETE);
    return null;
  }

  applyPhaseIfChanged(session, decision.phase);

  let generated;
  try {
    generated = await questionPlanner.generateNextQuestion(session, options);
  } catch (err) {
    throw new InterviewEngineError(ERROR_CODES.QUESTION_GENERATION_FAILED, `questionPlanner.generateNextQuestion failed: ${err.message}`);
  }

  if (generated.readyToComplete) {
    applyPhaseIfChanged(session, PHASES.COMPLETE);
    return null;
  }
  if (!generated.question) {
    throw new InterviewEngineError(ERROR_CODES.QUESTION_GENERATION_FAILED, 'Planner returned no question text and did not signal readyToComplete.');
  }

  const { questionId } = recordGeneratedQuestion(session, generated);
  return { questionId, question: generated.question };
}

// ---------------------------------------------------------------------
// Deterministic feedback generator (MVP — no extra LLM call)
// ---------------------------------------------------------------------

/**
 * Builds the four required feedback fields straight from real session
 * data already recorded by sessionModel/answerEvaluator — the same
 * "content-agnostic, grounded in what actually happened" philosophy the
 * rest of this codebase uses. No LLM call, no invented scores.
 *
 * @param {import('./sessionModel').SessionState} session
 * @returns {{ summary: string, strengths: string[], gaps: string[], nextSteps: string[] }}
 */
function generateFeedback(session) {
  const candidateSummary = session.profile.candidateSummary;
  const scored = session.evaluations.filter((e) => typeof e.score === 'number');
  const avgScore = scored.length ? scored.reduce((sum, e) => sum + e.score, 0) / scored.length : null;

  const dayTitle = (day) => {
    const q = session.questions.find((qq) => qq.day === day && qq.title);
    if (q) return q.title;
    const pooled = session.topicPool.find((t) => t.day === day);
    return pooled ? pooled.title : `Day ${day}`;
  };

  const strongDays = [];
  const weakDays = [];
  for (const [day, signal] of session.competencySignals.entries()) {
    if (signal.avgScore >= 4) strongDays.push(day);
    else if (signal.avgScore <= 2) weakDays.push(day);
  }

  const strengths = strongDays
    .sort((a, b) => a - b)
    .map((day) => `Day ${day} (${dayTitle(day)}): consistently solid answers.`);

  const gapsFromScores = weakDays
    .sort((a, b) => a - b)
    .map((day) => `Day ${day} (${dayTitle(day)}): answers were shallow or incorrect.`);

  const uniqueGapNotes = Array.from(
    new Set(
      session.evaluations
        .filter((e) => e.notes && e.notes.startsWith('Gaps:'))
        .map((e) => e.notes)
    )
  ).slice(0, 5);

  const gaps = gapsFromScores.length ? gapsFromScores : uniqueGapNotes;

  const weakRiskyFromProfile = (session.profile.weakRiskyAreas || [])
    .filter((a) => !session.daysCovered.has(a.day))
    .map((a) => `Revisit Day ${a.day} ("${a.title}") — not covered in this interview but flagged in the cohort record: ${a.reason}`);

  const nextSteps = [
    ...gapsFromScores.map((_, i) => null).filter(Boolean), // placeholder kept intentionally empty
  ];
  if (gaps.length) {
    nextSteps.push('Revisit and reinforce the topics noted under gaps above.');
  }
  nextSteps.push(...weakRiskyFromProfile.slice(0, 3));
  if (!nextSteps.length) {
    nextSteps.push('Continue practicing at the current difficulty level and take on a stretch project.');
  }

  const summary = [
    `${candidateSummary.name} (${candidateSummary.jobRole}, ${candidateSummary.yearsExperience}y experience) completed a ${session.questionsAsked}-question interview covering ${session.daysCovered.size} curriculum day(s).`,
    avgScore !== null ? `Average answer score: ${avgScore.toFixed(1)}/5.` : 'No scored answers were recorded.',
    strengths.length ? `Strongest on: ${strongDays.map((d) => `Day ${d}`).join(', ')}.` : '',
    gapsFromScores.length ? `Weakest on: ${weakDays.map((d) => `Day ${d}`).join(', ')}.` : '',
  ]
    .filter(Boolean)
    .join(' ');

  return {
    summary,
    strengths: strengths.length ? strengths : ['No single topic stood out as a clear strength across this interview.'],
    gaps: gaps.length ? gaps : ['No significant gaps surfaced across this interview.'],
    nextSteps,
  };
}

// ---------------------------------------------------------------------
// Public entry point #1: startInterview
// ---------------------------------------------------------------------

/**
 * Starts a brand-new interview session and generates its first question.
 *
 * @param {{ sessionId: string, candidateId?: string, candidate?: object, sessionOptions?: { minQuestions?: number, minDaysCovered?: number } }} input
 * @param {{ completeFn?: Function }} [options] - injectable LLM transport, for tests.
 * @returns {Promise<{ sessionId: string, question: string, phase: string, questionNumber: number }>}
 */
async function startInterview(input = {}, options = {}) {
  const { sessionId, candidateId, candidate, sessionOptions = {} } = input;

  requireSessionId(sessionId);
  if (sessionStore.hasSession(sessionId)) {
    throw new InterviewEngineError(ERROR_CODES.SESSION_ALREADY_EXISTS, `A session already exists for sessionId "${sessionId}".`, { sessionId });
  }

  const resolvedCandidate = resolveCandidate({ candidateId, candidate });

  let session;
  try {
    session = sessionModel.createInitialState(sessionId, resolvedCandidate, sessionOptions);
  } catch (err) {
    throw new InterviewEngineError(ERROR_CODES.INVALID_CANDIDATE, `Could not initialize session: ${err.message}`);
  }
  sessionStore.saveSession(session);

  const asked = await askNextQuestion(session, options);
  sessionStore.saveSession(session);

  if (!asked) {
    // Degenerate edge case: a candidate with no usable curriculum topics
    // at all. Extremely unlikely with real data, but fail clearly rather
    // than returning a response with no question.
    throw new InterviewEngineError(
      ERROR_CODES.QUESTION_GENERATION_FAILED,
      'Could not generate an opening question for this candidate (no usable curriculum topics found).'
    );
  }

  return {
    sessionId: session.sessionId,
    question: asked.question,
    phase: session.phase,
    questionNumber: session.questionsAsked,
  };
}

// ---------------------------------------------------------------------
// Public entry point #2: submitAnswer
// ---------------------------------------------------------------------

/**
 * Records the candidate's answer to the most recently asked question,
 * evaluates it, lets the planner react, and either asks the next
 * question or — once completion criteria are met and the closing
 * question has been answered — wraps up with structured feedback.
 *
 * @param {{ sessionId: string, answer: string }} input
 * @param {{ completeFn?: Function }} [options] - injectable LLM transport, for tests.
 * @returns {Promise<
 *   { sessionId: string, question: string, phase: string, questionNumber: number, completed: false } |
 *   { sessionId: string, completed: true, phase: string, questionNumber: number, feedback: { summary: string, strengths: string[], gaps: string[], nextSteps: string[] } }
 * >}
 */
async function submitAnswer(input = {}, options = {}) {
  const { sessionId, answer } = input;

  requireSessionId(sessionId);
  if (typeof answer !== 'string' || !answer.trim()) {
    throw new InterviewEngineError(ERROR_CODES.MISSING_ANSWER, 'answer is required and must be a non-empty string.');
  }

  const session = sessionStore.getSession(sessionId);
  if (!session) {
    throw new InterviewEngineError(ERROR_CODES.SESSION_NOT_FOUND, `No session found for sessionId "${sessionId}".`, { sessionId });
  }
  if (session.done) {
    throw new InterviewEngineError(ERROR_CODES.SESSION_COMPLETED, `Session "${sessionId}" has already completed.`, { sessionId });
  }

  const pendingQuestion = session.questions[session.questions.length - 1];
  if (!pendingQuestion) {
    throw new InterviewEngineError(ERROR_CODES.NO_QUESTION_PENDING, `Session "${sessionId}" has no question awaiting an answer yet.`, { sessionId });
  }
  const alreadyAnswered = session.answers.some((a) => a.questionId === pendingQuestion.id);
  if (alreadyAnswered) {
    throw new InterviewEngineError(
      ERROR_CODES.QUESTION_ALREADY_ANSWERED,
      `The most recent question on session "${sessionId}" has already been answered.`,
      { sessionId, questionId: pendingQuestion.id }
    );
  }

  sessionModel.recordAnswer(session, { questionId: pendingQuestion.id, answer });

  try {
    await answerEvaluator.evaluateAndRecord(session, { questionId: pendingQuestion.id, answer }, options);
  } catch (err) {
    sessionStore.saveSession(session); // keep the recorded answer even though evaluation failed
    throw new InterviewEngineError(ERROR_CODES.EVALUATION_FAILED, `answerEvaluator failed: ${err.message}`, { sessionId, questionId: pendingQuestion.id });
  }

  const asked = await askNextQuestion(session, options);

  if (!asked) {
    // Planner signaled readiness to complete (closing question already
    // asked & answered, or curriculum genuinely exhausted). Only produce
    // the final response once the REAL completion bar is met — reuse
    // sessionModel.meetsCompletionCriteria exactly as instructed, no
    // separate minimum system invented here.
    if (!sessionModel.meetsCompletionCriteria(session)) {
      // Structural fallback: minimums aren't met yet but the planner ran
      // out of topics. Keep the interview technically open rather than
      // silently ending it short — surface a controlled error so the
      // caller/dev notices instead of getting a too-short interview.
      sessionStore.saveSession(session);
      throw new InterviewEngineError(
        ERROR_CODES.PLANNER_ERROR,
        'Planner signaled completion before minimum questions/day-coverage were met.',
        { questionsAsked: session.questionsAsked, minQuestions: session.minQuestions, daysCovered: session.daysCovered.size, minDaysCovered: session.minDaysCovered }
      );
    }

    applyPhaseIfChanged(session, PHASES.COMPLETE);
    const feedback = generateFeedback(session);
    sessionStore.saveSession(session);

    return {
      sessionId: session.sessionId,
      completed: true,
      phase: session.phase,
      questionNumber: session.questionsAsked,
      feedback,
    };
  }

  sessionStore.saveSession(session);
  return {
    sessionId: session.sessionId,
    question: asked.question,
    phase: session.phase,
    questionNumber: session.questionsAsked,
    completed: false,
  };
}

module.exports = {
  startInterview,
  submitAnswer,
  InterviewEngineError,
  ERROR_CODES,
  // exported for tests / transparency
  generateFeedback,
};
