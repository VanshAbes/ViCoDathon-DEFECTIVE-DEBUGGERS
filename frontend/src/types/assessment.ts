import type { CurriculumCoverage } from "./curriculumCoverage";
import type { CompetencySignal } from "./competency";

/**
 * Presentation-facing assessment fields. These intentionally sit outside the
 * existing interview API wire contract: the backend has not published a final
 * assessment shape yet.
 */
export interface FinalAssessmentData {
  summary?: string;
  strengths?: string[];
  gaps?: string[];
  nextSteps?: string[];
  curriculumCoverage?: CurriculumCoverage;
  competencySignals?: CompetencySignal[];
  journey?: Partial<Record<InterviewJourneyPhase, "complete" | "unavailable">>;
}

export type InterviewJourneyPhase =
  | "BASELINE"
  | "PROBE"
  | "FOLLOW-UP"
  | "CROSS-TOPIC"
  | "DEPTH"
  | "FINAL ASSESSMENT"
  | "COMPLETE";

/** Local handoff record; created only after the real session state reaches complete. */
export interface CompletedInterviewSession {
  candidateId: string;
  sessionId: string;
  completedAt: string;
  messageCount: number;
  assessment?: FinalAssessmentData;
}
