import type { Curriculum, CurriculumDay, CurriculumModule } from "@/types/curriculum";
import type { Candidate, CandidateMission } from "@/types/candidate";
import curriculumData from "@/data/curriculum.json";

export const curriculum = curriculumData as Curriculum;

const dayIndex = new Map<number, CurriculumDay>(curriculum.days.map((d) => [d.day, d]));

export function getCurriculumDay(day: number): CurriculumDay | undefined {
  return dayIndex.get(day);
}

export function getModuleForDay(day: number): CurriculumModule | undefined {
  return curriculum.modules.find((m) => day >= m.days[0] && day <= m.days[1]);
}

export const TOTAL_PROGRAM_DAYS = curriculum.days.length;

export type DayCellStatus = "passed" | "failed" | "skipped" | "not-attempted";

export interface DayCell {
  day: number;
  status: DayCellStatus;
  title: string;
  type: string;
  attempts?: number;
  moduleN?: number;
}

/** Builds a full-length (curriculum-wide) day-by-day grid for a candidate — the roster "mission grid". */
export function buildMissionGrid(candidate: Candidate): DayCell[] {
  const byDay = new Map<number, CandidateMission>(candidate.missions.map((m) => [m.day, m]));

  return curriculum.days.map((d) => {
    const mission = byDay.get(d.day);
    let status: DayCellStatus = "not-attempted";
    if (mission?.skipped) status = "skipped";
    else if (mission?.passed === true) status = "passed";
    else if (mission?.passed === false) status = "failed";

    return {
      day: d.day,
      status,
      title: d.title,
      type: d.type,
      attempts: mission?.attempts,
      moduleN: getModuleForDay(d.day)?.n,
    };
  });
}

export interface CandidateScorecard {
  passRate: number; // 0-1, of attempted (non-skipped) missions
  firstTryRate: number; // 0-1, of missions completed
  commitRate: number; // 0-1, of total program days
  attemptedCount: number;
  passedCount: number;
  failedCount: number;
  skippedCount: number;
  /** Composite 0-100 readiness index — weighted blend of pass rate, first-try rate, and commitment. */
  readinessIndex: number;
}

export function scoreCandidate(candidate: Candidate): CandidateScorecard {
  const { missions, signals } = candidate;

  const attempted = missions.filter((m) => !m.skipped);
  const passed = attempted.filter((m) => m.passed === true);
  const failed = attempted.filter((m) => m.passed === false);
  const skipped = missions.filter((m) => m.skipped);

  const passRate = attempted.length ? passed.length / attempted.length : 0;
  const firstTryRate = signals.missionsCompleted
    ? signals.missionsFirstTry / signals.missionsCompleted
    : 0;
  const commitRate = Math.min(signals.commitDays / TOTAL_PROGRAM_DAYS, 1);

  const readinessIndex = Math.round(
    (passRate * 0.5 + firstTryRate * 0.3 + commitRate * 0.2) * 100
  );

  return {
    passRate,
    firstTryRate,
    commitRate,
    attemptedCount: attempted.length,
    passedCount: passed.length,
    failedCount: failed.length,
    skippedCount: skipped.length,
    readinessIndex,
  };
}

export type ReadinessTier = "elite" | "strong" | "watch" | "at-risk";

export function readinessTier(index: number): ReadinessTier {
  if (index >= 85) return "elite";
  if (index >= 65) return "strong";
  if (index >= 45) return "watch";
  return "at-risk";
}

export const READINESS_TIER_LABEL: Record<ReadinessTier, string> = {
  elite: "ELITE",
  strong: "STRONG",
  watch: "WATCH",
  "at-risk": "AT RISK",
};
