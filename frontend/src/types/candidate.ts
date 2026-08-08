/**
 * Mirrors the shape of the provided `candidates.json`.
 * Do not diverge from this shape without updating the source data contract —
 * this file is the single source of truth for candidate typing across the app.
 */

export type CandidateStatus = "COMPLETED" | "IN_PROGRESS" | "NOT_STARTED";

export interface CandidateMission {
  day: number;
  title: string;
  /** Present when the mission was attempted (passed or failed). */
  passed?: boolean;
  attempts?: number;
  /** Present (true) when the candidate skipped this mission entirely. */
  skipped?: boolean;
}

export interface CandidateMember {
  id: string;
  name: string;
  jobRole: string;
  yearsExperience: number;
  education: string;
  status: CandidateStatus | string;
}

export interface CandidateSignals {
  commitDays: number;
  missionsCompleted: number;
  missionsFirstTry: number;
}

export interface Candidate {
  member: CandidateMember;
  missions: CandidateMission[];
  signals: CandidateSignals;
}

export interface CandidatesFile {
  candidates: Candidate[];
}
