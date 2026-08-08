import { cn } from "@/lib/cn";

type Tone = "cyan" | "violet" | "pass" | "warn" | "fail";

const toneBg: Record<Tone, string> = {
  cyan: "bg-cyan",
  violet: "bg-violet",
  pass: "bg-signal-pass",
  warn: "bg-signal-warn",
  fail: "bg-signal-fail",
};

export function ProgressBar({
  value,
  tone = "cyan",
  className,
  trackClassName,
}: {
  /** 0-1 */
  value: number;
  tone?: Tone;
  className?: string;
  trackClassName?: string;
}) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  return (
    <div className={cn("h-1 w-full overflow-hidden rounded-full bg-white/[0.06]", trackClassName)}>
      <div
        className={cn("h-full rounded-full transition-[width] duration-500", toneBg[tone], className)}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
