'use strict';

/**
 * POST /api/interview (routes layer, per ARCHITECTURE.md §3/§6)
 * ==============================
 * Thin controller only. All real orchestration logic already lives in
 * src/core/interviewEngine.js (frozen — not touched here). This module
 * exports a single async function that takes an already-JSON-parsed
 * request body and returns a plain `{ status, body }` pair — no
 * framework Request/Response objects — so server.js (plain Node `http`)
 * stays the only place that knows how to read/write an actual socket.
 *
 * Responsibilities:
 *   1. Tell a "start" request apart from a "turn" request.
 *   2. Call the matching interviewEngine function.
 *   3. Shape the JSON response to satisfy BOTH:
 *      - technical-spec.md's literal contract (`reply`, `done`,
 *        `feedback: { summary, strengths, gaps, next }`), and
 *      - the richer fields the hackathon brief also asked for
 *        (`sessionId`, `question`, `phase`, `questionNumber`,
 *        `completed`, `feedback.nextSteps`).
 *     Both sets of keys are included so either client shape works.
 *   4. Translate any InterviewEngineError into a consistent HTTP
 *      error response (see errorMapping.js).
 *
 * Per technical-spec.md:
 *   - Start:  { sessionId, candidate: {...candidate.json} }
 *   - Turn:   { sessionId, message: "..." }
 * interviewEngine.startInterview also accepts a bare `candidateId`
 * (the hackathon brief's "candidateId -> load candidate" flow), and
 * submitAnswer's text is accepted here under either `message` or
 * `answer` — both are honored for compatibility with whichever shape
 * the frontend actually sends.
 */

const interviewEngine = require('../core/interviewEngine');
const { mapErrorToResponse } = require('./errorMapping');

/** @param {any} body */
function isStartPayload(body) {
  return Boolean(body && (body.candidate || body.candidateId));
}

/** @param {any} body */
function isTurnPayload(body) {
  return Boolean(body && (typeof body.message === 'string' || typeof body.answer === 'string'));
}

/**
 * @param {Awaited<ReturnType<typeof interviewEngine.startInterview>>} result
 */
function formatStartResponse(result) {
  return {
    sessionId: result.sessionId,
    reply: result.question,
    done: false,
    completed: false,
    question: result.question,
    phase: result.phase,
    questionNumber: result.questionNumber,
  };
}

/**
 * @param {Awaited<ReturnType<typeof interviewEngine.submitAnswer>>} result
 */
function formatTurnResponse(result) {
  if (result.completed) {
    return {
      sessionId: result.sessionId,
      reply: 'Interview completed.',
      done: true,
      completed: true,
      phase: result.phase,
      questionNumber: result.questionNumber,
      feedback: {
        summary: result.feedback.summary,
        strengths: result.feedback.strengths,
        gaps: result.feedback.gaps,
        next: result.feedback.nextSteps, // technical-spec.md's field name
        nextSteps: result.feedback.nextSteps, // hackathon brief's field name
      },
    };
  }

  return {
    sessionId: result.sessionId,
    reply: result.question,
    done: false,
    completed: false,
    question: result.question,
    phase: result.phase,
    questionNumber: result.questionNumber,
  };
}

/**
 * @param {any} body - already-parsed JSON body, or null/undefined if parsing failed upstream
 * @returns {Promise<{ status: number, body: object }>}
 */
async function handleInterviewRequest(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    return { status: 400, body: { error: { code: 'MALFORMED_REQUEST', message: 'Request body must be a JSON object.' } } };
  }

  const { sessionId } = body;

  try {
    if (isStartPayload(body)) {
      const result = await interviewEngine.startInterview({
        sessionId,
        candidateId: body.candidateId,
        candidate: body.candidate,
      });
      return { status: 200, body: formatStartResponse(result) };
    }

    if (isTurnPayload(body)) {
      const answer = typeof body.message === 'string' ? body.message : body.answer;
      const result = await interviewEngine.submitAnswer({ sessionId, answer });
      return { status: 200, body: formatTurnResponse(result) };
    }

    return {
      status: 400,
      body: {
        error: {
          code: 'MALFORMED_REQUEST',
          message: 'Request must include either "candidate"/"candidateId" (start a new interview) or "message"/"answer" (submit a turn).',
        },
      },
    };
  } catch (err) {
    const mapped = mapErrorToResponse(err);
    if (mapped.status === 500 && !(err instanceof interviewEngine.InterviewEngineError)) {
      // eslint-disable-next-line no-console
      console.error('Unexpected error in POST /api/interview:', err);
    }
    return mapped;
  }
}

module.exports = { handleInterviewRequest, isStartPayload, isTurnPayload };
