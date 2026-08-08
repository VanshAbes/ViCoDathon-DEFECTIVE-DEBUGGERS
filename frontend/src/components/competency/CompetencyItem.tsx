import { CompetencyIndicator } from "./CompetencyIndicator";
import type { CompetencySignal } from "@/types/competency";

/**
 * One topic's competency read. `evidence`, when present, is always a real
 * excerpt of something the candidate actually said in this session — never
 * an invented quote or reasoning.
 */
export function CompetencyItem({ signal }: { signal: CompetencySignal }) {
  return (
    <div className="rounded-xs border border-line-hairline bg-white/[0.02] p-2.5">
      <div className="flex items-center justify-between gap-2">
        <span className="truncate text-xs font-medium text-ink-primary">{signal.topic}</span>
        <CompetencyIndicator status={signal.status} />
      </div>
      <div className="mt-0.5 font-mono text-[10px] text-ink-disabled">DAY {signal.day}</div>
      {signal.evidence && (
        <p className="mt-1.5 truncate text-2xs italic text-ink-tertiary" title={signal.evidence}>
          “{signal.evidence}”
        </p>
      )}
    </div>
  );
}
