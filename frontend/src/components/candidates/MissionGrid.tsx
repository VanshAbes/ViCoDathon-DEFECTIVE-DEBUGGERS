import { useState } from "react";
import { buildMissionGrid, type DayCell, type DayCellStatus } from "@/lib/curriculum";
import type { Candidate } from "@/types/candidate";
import { cn } from "@/lib/cn";

const statusClasses: Record<DayCellStatus, string> = {
  passed: "bg-signal-pass/70 hover:bg-signal-pass",
  failed: "bg-signal-fail/70 hover:bg-signal-fail",
  skipped: "bg-signal-warn/40 hover:bg-signal-warn/70",
  "not-attempted": "bg-white/[0.05] hover:bg-white/[0.09]",
};

/**
 * Renders the full curriculum as a compact day-grid, colored by outcome.
 * This is the app's signature visual: it's the one place candidate performance
 * and the curriculum's own structure (modules/days) render as a single object,
 * in the spirit of a technical console readout rather than a decorative chart.
 */
export function MissionGrid({ candidate, size = "sm" }: { candidate: Candidate; size?: "xs" | "sm" }) {
  const cells = buildMissionGrid(candidate);
  const [hovered, setHovered] = useState<DayCell | null>(null);
  const cellSize = size === "xs" ? "h-2 w-2" : "h-2.5 w-2.5";

  return (
    <div className="relative">
      <div className="flex flex-wrap gap-[3px]">
        {cells.map((cell) => (
          <div
            key={cell.day}
            onMouseEnter={() => setHovered(cell)}
            onMouseLeave={() => setHovered(null)}
            className={cn("rounded-[2px] transition-colors", cellSize, statusClasses[cell.status])}
          />
        ))}
      </div>

      {hovered && (
        <div className="absolute -top-2 left-0 z-20 w-56 -translate-y-full rounded-sm border border-line-subtle bg-graphite-raised p-2.5 text-2xs shadow-panel">
          <div className="flex items-center justify-between">
            <span className="font-mono text-ink-tertiary">DAY {hovered.day}</span>
            <StatusLabel status={hovered.status} />
          </div>
          <div className="mt-1 text-xs font-medium text-ink-primary">{hovered.title}</div>
          <div className="mt-1 flex items-center justify-between text-ink-tertiary">
            <span>{hovered.type}</span>
            {hovered.attempts !== undefined && <span>{hovered.attempts} attempt{hovered.attempts === 1 ? "" : "s"}</span>}
          </div>
        </div>
      )}
    </div>
  );
}

function StatusLabel({ status }: { status: DayCellStatus }) {
  const map: Record<DayCellStatus, { label: string; className: string }> = {
    passed: { label: "PASSED", className: "text-signal-pass" },
    failed: { label: "FAILED", className: "text-signal-fail" },
    skipped: { label: "SKIPPED", className: "text-signal-warn" },
    "not-attempted": { label: "N/A", className: "text-ink-disabled" },
  };
  const { label, className } = map[status];
  return <span className={cn("font-mono", className)}>{label}</span>;
}

export function MissionGridLegend() {
  const items: { status: DayCellStatus; label: string }[] = [
    { status: "passed", label: "Passed" },
    { status: "failed", label: "Failed" },
    { status: "skipped", label: "Skipped" },
    { status: "not-attempted", label: "Not attempted" },
  ];
  return (
    <div className="flex flex-wrap items-center gap-3 text-2xs text-ink-tertiary">
      {items.map((item) => (
        <div key={item.status} className="flex items-center gap-1.5">
          <span className={cn("h-2 w-2 rounded-[2px]", statusClasses[item.status])} />
          {item.label}
        </div>
      ))}
    </div>
  );
}
