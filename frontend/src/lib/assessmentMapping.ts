import type { FinalAssessmentData } from "@/types/assessment";
import type { InterviewFeedback } from "@/types/interview";

/** Keeps the documented interview response shape separate from report presentation names. */
export function assessmentFromFeedback(feedback: InterviewFeedback): FinalAssessmentData {
  return {
    summary: feedback.summary,
    strengths: feedback.strengths,
    gaps: feedback.gaps,
    nextSteps: feedback.next,
  };
}
