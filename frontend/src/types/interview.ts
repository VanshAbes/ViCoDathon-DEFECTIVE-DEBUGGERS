/**
 * Mirrors the API contract defined in `technical-spec.md`.
 *
 *   POST /api/interview
 *
 * This file defines the wire shapes only — no client is implemented here.
 * See `src/hooks/useInterviewSession.ts` for the (currently mocked) session
 * state machine that will eventually call this endpoint.
 */

import type { Candidate } from "./candidate";

/** First request in a session — initializes interview state. */
export interface InterviewStartRequest {
  sessionId: string;
  candidate: Candidate;
}

/** Every subsequent request in a session. */
export interface InterviewTurnRequest {
  sessionId: string;
  message: string;
}

export type InterviewRequest = InterviewStartRequest | InterviewTurnRequest;

export interface InterviewFeedback {
  summary: string;
  strengths: string[];
  gaps: string[];
  next: string[];
}

/** Shape returned for every turn. `feedback` is only present when `done` is true. */
export interface InterviewResponse {
  reply: string;
  done: boolean;
  feedback?: InterviewFeedback;
}

/** Local, UI-side representation of a single chat turn (not part of the wire contract). */
export interface InterviewMessage {
  id: string;
  role: "agent" | "candidate";
  content: string;
  timestamp: string;
}

export type InterviewSessionStatus = "idle" | "live" | "complete" | "error";
