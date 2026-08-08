import { useMemo } from "react";
import { deriveCompetencySignals } from "@/lib/competency";
import type { CompetencySignal } from "@/types/competency";
import type { CurriculumCoverage } from "@/types/curriculumCoverage";
import type { InterviewMessage } from "@/types/interview";

/**
 * MOCK ONLY.
 *
 * Stands in for a backend-provided competency feed until `/api/interview`
 * returns real competency data (no such field exists in `technical-spec.md`
 * today). Derives signals locally, using only real inputs already present in
 * the frontend: actual curriculum topics (via `coverage`, produced by F4's
 * `useMockCurriculumCoverage`) and the candidate's own message text (via
 * `messages`, from `useInterviewSession`). See `lib/competency.ts` for the
 * derivation itself — no fake topics, quotes, or scores are introduced
 * anywhere in this path.
 *
 * TODO(api): once the backend returns real competency data, delete this
 * hook and source `CompetencySignal[]` from the API/session response
 * instead. `CompetencyPanel` and friends only depend on the
 * `CompetencySignal[]` shape, not on how it was produced, so that swap
 * shouldn't require touching any rendering component.
 */
export function useMockCompetencySignals(
  messages: InterviewMessage[],
  coverage: CurriculumCoverage
): CompetencySignal[] {
  return useMemo(() => deriveCompetencySignals(messages, coverage), [messages, coverage]);
}
