/**
 * Live competency signal — a qualitative, per-topic read derived from the
 * current interview conversation.
 *
 * This is intentionally NOT a score: no percentages, ratings, or numbers
 * belong here, ever. Question count is not competency, and turn count is
 * not competency — states are qualitative on purpose.
 *
 * Shape is written to be a plausible (but not binding) target for a future
 * backend competency payload, roughly:
 *
 *   competencies: [{ topic, status, evidence }]
 *
 * Until the backend provides this, signals are derived locally — see
 * `lib/competency.ts` and `hooks/useMockCompetencySignals.ts`. Consumers
 * (`CompetencyPanel` etc.) only depend on this shape, not on how it was
 * produced, so swapping in real backend data later shouldn't require
 * touching any rendering component.
 */
export type CompetencyStatus = "STRONG" | "DEVELOPING" | "NEEDS_PROBE" | "UNCLEAR";

export interface CompetencySignal {
  /** A real curriculum topic (tool or day title from `curriculum.json`) — never invented. */
  topic: string;
  /** The curriculum day this topic is drawn from, for traceability back to the F4 map. */
  day: number;
  status: CompetencyStatus;
  /** A real excerpt from the candidate's own message, when one exists. Never fabricated. */
  evidence?: string;
}
