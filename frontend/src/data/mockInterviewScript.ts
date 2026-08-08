/**
 * Local fixture data for the interview console.
 *
 * This exists purely so the frontend is demoable before `POST /api/interview`
 * is wired up. It intentionally mirrors the response shape defined in
 * `technical-spec.md` (`{ reply, done, feedback? }`) so swapping this for a
 * real network call later is a drop-in change — see `useInterviewSession`.
 */
import type { InterviewFeedback } from "@/types/interview";

export const MOCK_AGENT_SCRIPT: string[] = [
  "Walk me through a project where you had to take a system from prototype to something reliable enough to ship. What broke first?",
  "You mentioned trade-offs under time pressure — how did you decide what not to do?",
  "Suppose the retrieval layer starts returning confidently wrong answers. How would you find out, and how would you contain it before users notice?",
  "Good. Last one — tell me about a time you disagreed with a technical decision on your team. What did you do?",
];

export const MOCK_CLOSING_REPLY =
  "That's everything I need. Compiling your assessment now — you'll see the full report on the next screen.";

export function buildMockFeedback(jobRole: string): InterviewFeedback {
  return {
    summary: `Demonstrated solid end-to-end reasoning for a ${jobRole} profile, with clear communication under follow-up pressure. Responses were structured and grounded in concrete examples rather than abstractions.`,
    strengths: [
      "Explains technical trade-offs in plain, structured language",
      "Grounds answers in specific, verifiable examples",
      "Stays composed when pushed on edge cases",
    ],
    gaps: [
      "Limited depth on failure-mode containment strategy",
      "Did not proactively quantify impact or trade-offs with metrics",
    ],
    next: [
      "Probe deeper on incident response and observability practices",
      "Validate hands-on depth with a scoped take-home or pairing session",
      "Confirm collaboration style with a reference check",
    ],
  };
}
