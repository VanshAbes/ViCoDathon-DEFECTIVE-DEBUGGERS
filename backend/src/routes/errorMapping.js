'use strict';

/**
 * Maps interviewEngine.InterviewEngineError codes to HTTP status codes,
 * and formats every error (expected or unexpected) as the same
 * consistent JSON envelope: { error: { code, message } }.
 *
 * Deliberately framework-agnostic (no Express Request/Response types) —
 * takes an Error, returns a plain { status, body } pair. server.js is
 * the only place that knows how to write an HTTP response.
 */

const { InterviewEngineError, ERROR_CODES } = require('../core/interviewEngine');

/** @type {Record<string, number>} */
const STATUS_BY_CODE = {
  // 400 — malformed / missing request data
  [ERROR_CODES.MISSING_SESSION_ID]: 400,
  [ERROR_CODES.MISSING_ANSWER]: 400,
  [ERROR_CODES.INVALID_CANDIDATE]: 400,

  // 404 — referenced entity doesn't exist
  [ERROR_CODES.CANDIDATE_NOT_FOUND]: 404,
  [ERROR_CODES.SESSION_NOT_FOUND]: 404,

  // 409 — conflicts with current state (duplicate / already done / out of order)
  [ERROR_CODES.SESSION_ALREADY_EXISTS]: 409,
  [ERROR_CODES.SESSION_COMPLETED]: 409,
  [ERROR_CODES.QUESTION_ALREADY_ANSWERED]: 409,
  [ERROR_CODES.NO_QUESTION_PENDING]: 409,

  // 502 — the LLM / evaluation step upstream of us failed
  [ERROR_CODES.EVALUATION_FAILED]: 502,
  [ERROR_CODES.QUESTION_GENERATION_FAILED]: 502,

  // 500 — internal logic errors (planner/session invariants), not the client's fault
  [ERROR_CODES.PLANNER_ERROR]: 500,
  [ERROR_CODES.PHASE_TRANSITION_ERROR]: 500,
};

/**
 * @param {Error} err
 * @returns {{ status: number, body: { error: { code: string, message: string } } }}
 */
function mapErrorToResponse(err) {
  if (err instanceof InterviewEngineError) {
    const status = STATUS_BY_CODE[err.code] || 500;
    return { status, body: { error: { code: err.code, message: err.message } } };
  }

  // Unexpected/unhandled error — caller logs it server-side. Never leak
  // stack traces, config, or secrets to the client.
  return { status: 500, body: { error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred.' } } };
}

module.exports = { STATUS_BY_CODE, mapErrorToResponse };
