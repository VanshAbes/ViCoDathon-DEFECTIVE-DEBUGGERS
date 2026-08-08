import { ProgressBar } from "@/components/ui/ProgressBar";
import { StatusDot } from "@/components/ui/StatusDot";
import { curriculum, getCurriculumDay } from "@/lib/curriculum";
import type { CurriculumCoverage } from "@/types/curriculumCoverage";

/**
 * Top-line coverage summary: days explored out of the real program length,
 * plus a readout of the currently-active day. Intentionally a plain
 * fraction/progress bar — no readiness index, no percentage framed as
 * competency.
 */
export function CoverageIndicator({ coverage }: { coverage: CurriculumCoverage }) {
  const total = curriculum.days.length;
  const explored = coverage.coveredDays.length;
  const currentDayMeta = coverage.currentDay !== null ? getCurriculumDay(coverage.currentDay) : undefined;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="label-overline">Days Explored</span>
        <span className="font-mono text-2xs text-ink-tertiary">
          {explored}/{total}
        </span>
      </div>
      <ProgressBar value={total ? explored / total : 0} tone="violet" />

      {currentDayMeta ? (
        <div className="flex items-center gap-1.5 pt-0.5">
          <StatusDot tone="cyan" pulse />
          <span className="truncate text-2xs text-ink-secondary">
            Day {currentDayMeta.day} · {currentDayMeta.title}
          </span>
        </div>
      ) : (
        <div className="flex items-center gap-1.5 pt-0.5">
          <StatusDot tone="idle" />
          <span className="text-2xs text-ink-tertiary">No active day</span>
        </div>
      )}
    </div>
  );
}
