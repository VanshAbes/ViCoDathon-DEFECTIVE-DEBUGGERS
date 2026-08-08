import { useMemo } from "react";
import { curriculum } from "@/lib/curriculum";
import type { CurriculumCoverage } from "@/types/curriculumCoverage";
import type { InterviewSessionStatus } from "@/types/interview";

/**
 * MOCK ONLY.
 *
 * Stands in for backend-provided coverage until `POST /api/interview`
 * responses include real `coveredDays` / `currentDay` / `coveredTopics`
 * (neither exists in `technical-spec.md` today). Derives a plausible "day
 * pointer" purely from local session progress (turnsCompleted/turnsTotal),
 * walking through the *real* curriculum day list from `curriculum.json` —
 * no fake days, titles, or topics are invented.
 *
 * TODO(api): once the interview endpoint returns real coverage, delete this
 * hook and source `CurriculumCoverage` from the session/API response
 * instead. Call sites (e.g. `InterviewStatusPanel`) only depend on the
 * `CurriculumCoverage` shape, not on how it was produced, so that swap
 * should not require touching any rendering component.
 */
export function useMockCurriculumCoverage(
  status: InterviewSessionStatus,
  turnsCompleted: number,
  turnsTotal: number
): CurriculumCoverage {
  return useMemo(() => {
    const days = curriculum.days.map((d) => d.day);

    if (status === "idle" || status === "error" || days.length === 0) {
      return { coveredDays: [], currentDay: null };
    }

    if (status === "complete") {
      return { coveredDays: days, currentDay: null };
    }

    const progress = turnsTotal > 0 ? turnsCompleted / turnsTotal : 0;
    const pointerIndex = Math.min(Math.floor(progress * days.length), days.length - 1);

    return {
      coveredDays: days.slice(0, pointerIndex),
      currentDay: days[pointerIndex] ?? null,
    };
  }, [status, turnsCompleted, turnsTotal]);
}
