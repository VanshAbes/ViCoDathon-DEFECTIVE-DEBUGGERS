import type { CurriculumDay, CurriculumModule } from "@/types/curriculum";
import type { CurriculumCoverage, CurriculumDayState } from "@/types/curriculumCoverage";

/** Derives a single day's exploration state from a coverage snapshot. */
export function getDayState(day: number, coverage: CurriculumCoverage): CurriculumDayState {
  if (coverage.currentDay === day) return "current";
  if (coverage.coveredDays.includes(day)) return "explored";
  return "not-explored";
}

export interface ModuleCoverageSummary {
  exploredCount: number;
  totalCount: number;
  /** True when the currently-active interview day falls inside this module. */
  isActive: boolean;
  isFullyExplored: boolean;
}

/** Summarizes coverage for a single curriculum module (used for module headers/highlighting). */
export function summarizeModuleCoverage(
  module: CurriculumModule,
  allDays: CurriculumDay[],
  coverage: CurriculumCoverage
): ModuleCoverageSummary {
  const [start, end] = module.days;
  const moduleDays = allDays.filter((d) => d.day >= start && d.day <= end);
  const exploredCount = moduleDays.filter((d) => coverage.coveredDays.includes(d.day)).length;
  const isActive = coverage.currentDay !== null && coverage.currentDay >= start && coverage.currentDay <= end;

  return {
    exploredCount,
    totalCount: moduleDays.length,
    isActive,
    isFullyExplored: moduleDays.length > 0 && exploredCount === moduleDays.length,
  };
}
