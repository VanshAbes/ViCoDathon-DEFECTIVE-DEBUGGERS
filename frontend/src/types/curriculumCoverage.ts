/**
 * Curriculum *coverage* — how much of the real 31-day curriculum a live
 * interview session has touched so far.
 *
 * This is deliberately separate from `CandidateMission` (`types/candidate.ts`),
 * which is cohort mission-history (pass/fail on prior program work). Coverage
 * only answers "has this been explored in the conversation yet?" — it must
 * never be read as, or rendered as, mastery, competency, or a score.
 *
 * Field names mirror what a future `POST /api/interview` response could
 * plausibly add on top of the contract in `technical-spec.md`. Until the
 * backend exposes them, values are produced locally — see
 * `hooks/useMockCurriculumCoverage.ts` — but every consumer should be able to
 * take a real `CurriculumCoverage` object without changes.
 */
export interface CurriculumCoverage {
  /** Curriculum day numbers already surfaced in this interview. */
  coveredDays: number[];
  /** The day currently being explored, if any. */
  currentDay: number | null;
  /** Specific topics/tools already surfaced, once the backend can supply them. */
  coveredTopics?: string[];
}

export type CurriculumDayState = "not-explored" | "current" | "explored";
