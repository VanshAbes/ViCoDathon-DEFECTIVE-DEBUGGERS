import { DayNode } from "./DayNode";
import { cn } from "@/lib/cn";
import { curriculum } from "@/lib/curriculum";
import { getDayState, summarizeModuleCoverage } from "@/lib/curriculumCoverage";
import type { CurriculumModule } from "@/types/curriculum";
import type { CurriculumCoverage } from "@/types/curriculumCoverage";

/**
 * One curriculum module: title, day range, and its days rendered as a
 * compact strip of `DayNode`s. Highlights when the interview's current day
 * falls inside it, so "which module is the candidate in" is answerable at a
 * glance without opening anything.
 */
export function ModuleNode({ module, coverage }: { module: CurriculumModule; coverage: CurriculumCoverage }) {
  const days = curriculum.days.filter((d) => d.day >= module.days[0] && d.day <= module.days[1]);
  const summary = summarizeModuleCoverage(module, curriculum.days, coverage);

  return (
    <div
      className={cn(
        "rounded-xs border-l-2 py-1.5 pl-2.5 transition-colors",
        summary.isActive ? "border-cyan bg-cyan-dim/30" : "border-line-hairline"
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 truncate text-2xs font-medium text-ink-secondary">
          <span className="text-ink-disabled">M{module.n}</span> {module.title}
        </div>
        <span className="shrink-0 font-mono text-[10px] text-ink-disabled">
          {summary.exploredCount}/{summary.totalCount}
        </span>
      </div>
      <div className="mt-1.5 flex flex-wrap gap-1">
        {days.map((d) => (
          <DayNode key={d.day} day={d} state={getDayState(d.day, coverage)} />
        ))}
      </div>
    </div>
  );
}
