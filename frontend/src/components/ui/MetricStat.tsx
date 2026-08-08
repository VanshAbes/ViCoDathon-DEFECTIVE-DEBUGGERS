import type { ReactNode } from "react";
import { Panel } from "./Panel";
import { cn } from "@/lib/cn";

export function MetricStat({
  label,
  value,
  suffix,
  trend,
  accent = "cyan",
  icon,
}: {
  label: string;
  value: ReactNode;
  suffix?: string;
  trend?: string;
  accent?: "cyan" | "violet" | "neutral";
  icon?: ReactNode;
}) {
  const accentText = accent === "cyan" ? "text-cyan" : accent === "violet" ? "text-violet-soft" : "text-ink-primary";

  return (
    <Panel className="p-4">
      <div className="flex items-start justify-between">
        <div className="label-overline">{label}</div>
        {icon && <div className={cn("opacity-70", accentText)}>{icon}</div>}
      </div>
      <div className="mt-2 flex items-baseline gap-1.5">
        <span className={cn("font-mono text-2xl font-semibold tracking-tight", accentText)}>{value}</span>
        {suffix && <span className="text-xs text-ink-tertiary">{suffix}</span>}
      </div>
      {trend && <div className="mt-1 text-2xs text-ink-tertiary">{trend}</div>}
    </Panel>
  );
}
