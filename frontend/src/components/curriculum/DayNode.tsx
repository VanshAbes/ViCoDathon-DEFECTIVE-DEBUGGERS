import { useState } from "react";
import { cn } from "@/lib/cn";
import type { CurriculumDay } from "@/types/curriculum";
import type { CurriculumDayState } from "@/types/curriculumCoverage";

const stateClasses: Record<CurriculumDayState, string> = {
  "not-explored": "border-line-subtle bg-white/[0.03] text-ink-disabled",
  current: "border-cyan/60 bg-cyan-dim text-cyan shadow-glow",
  explored: "border-violet/30 bg-violet-dim text-violet-soft",
};

const stateLabel: Record<CurriculumDayState, string> = {
  "not-explored": "NOT EXPLORED",
  current: "CURRENT",
  explored: "EXPLORED",
};

const stateLabelClasses: Record<CurriculumDayState, string> = {
  "not-explored": "text-ink-disabled",
  current: "text-cyan",
  explored: "text-violet-soft",
};

/**
 * A single curriculum day, colored by exploration state only. Never encodes
 * pass/fail, score, or mastery — that concept belongs to `MissionGrid`
 * (mission history), not this component.
 */
export function DayNode({ day, state }: { day: CurriculumDay; state: CurriculumDayState }) {
  const [hovered, setHovered] = useState(false);

  return (
    <div className="relative">
      <div
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        tabIndex={0}
        onFocus={() => setHovered(true)}
        onBlur={() => setHovered(false)}
        className={cn(
          "flex h-6 w-6 shrink-0 items-center justify-center rounded-xs border font-mono text-[10px] font-medium outline-none transition-colors",
          stateClasses[state]
        )}
      >
        {day.day}
      </div>

      {hovered && (
        <div className="absolute -top-2 left-1/2 z-30 w-48 -translate-x-1/2 -translate-y-full rounded-sm border border-line-subtle bg-graphite-raised p-2.5 text-2xs shadow-panel">
          <div className="flex items-center justify-between gap-2">
            <span className="font-mono text-ink-tertiary">DAY {day.day}</span>
            <span className={cn("font-mono", stateLabelClasses[state])}>{stateLabel[state]}</span>
          </div>
          <div className="mt-1 text-xs font-medium leading-snug text-ink-primary">{day.title}</div>
          <div className="mt-1 text-ink-tertiary">{day.type}</div>
        </div>
      )}
    </div>
  );
}
