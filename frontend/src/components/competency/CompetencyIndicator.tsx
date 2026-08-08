import { cn } from "@/lib/cn";
import type { CompetencyStatus } from "@/types/competency";

const dotClasses: Record<CompetencyStatus, string> = {
  STRONG: "bg-cyan",
  DEVELOPING: "bg-violet",
  NEEDS_PROBE: "bg-signal-warn",
  UNCLEAR: "bg-ink-tertiary",
};

const textClasses: Record<CompetencyStatus, string> = {
  STRONG: "text-cyan",
  DEVELOPING: "text-violet-soft",
  NEEDS_PROBE: "text-signal-warn",
  UNCLEAR: "text-ink-tertiary",
};

const statusLabel: Record<CompetencyStatus, string> = {
  STRONG: "Strong",
  DEVELOPING: "Developing",
  NEEDS_PROBE: "Needs Probe",
  UNCLEAR: "Unclear",
};

/**
 * Compact dot + label for a qualitative competency state. Deliberately reuses
 * the app's existing signal palette (cyan/violet/amber/gray) rather than
 * introducing new colors — amber here reads as "needs attention", not
 * "failing", consistent with the restrained-glow NEXUS language.
 */
export function CompetencyIndicator({ status, className }: { status: CompetencyStatus; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex shrink-0 items-center gap-1.5 font-mono text-2xs uppercase tracking-wide",
        textClasses[status],
        className
      )}
    >
      <span className={cn("h-1.5 w-1.5 rounded-full", dotClasses[status])} />
      {statusLabel[status]}
    </span>
  );
}
