import { cn } from "@/lib/cn";

type Tone = "cyan" | "pass" | "warn" | "fail" | "idle";

const toneBg: Record<Tone, string> = {
  cyan: "bg-cyan",
  pass: "bg-signal-pass",
  warn: "bg-signal-warn",
  fail: "bg-signal-fail",
  idle: "bg-ink-tertiary",
};

export function StatusDot({
  tone = "cyan",
  pulse = false,
  className,
}: {
  tone?: Tone;
  pulse?: boolean;
  className?: string;
}) {
  return (
    <span className={cn("relative inline-flex h-2 w-2", className)}>
      {pulse && (
        <span
          className={cn("absolute inline-flex h-full w-full animate-ping rounded-full opacity-40", toneBg[tone])}
        />
      )}
      <span className={cn("relative inline-flex h-2 w-2 rounded-full", toneBg[tone])} />
    </span>
  );
}

/** Text + dot status readout, e.g. "LIVE", "IDLE", "COMPLETE". */
export function StatusReadout({
  label,
  tone = "cyan",
  pulse = false,
  className,
}: {
  label: string;
  tone?: Tone;
  pulse?: boolean;
  className?: string;
}) {
  return (
    <div className={cn("inline-flex items-center gap-2 font-mono text-2xs uppercase tracking-widest2", className)}>
      <StatusDot tone={tone} pulse={pulse} />
      <span className={tone === "idle" ? "text-ink-tertiary" : "text-ink-secondary"}>{label}</span>
    </div>
  );
}
