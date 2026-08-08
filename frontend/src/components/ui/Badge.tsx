import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

type Tone = "cyan" | "violet" | "pass" | "warn" | "fail" | "idle" | "neutral";

const toneClasses: Record<Tone, string> = {
  cyan: "text-cyan border-cyan/30 bg-cyan-dim",
  violet: "text-violet-soft border-violet/30 bg-violet-dim",
  pass: "text-signal-pass border-signal-pass/30 bg-signal-pass-dim",
  warn: "text-signal-warn border-signal-warn/30 bg-signal-warn-dim",
  fail: "text-signal-fail border-signal-fail/30 bg-signal-fail-dim",
  idle: "text-ink-tertiary border-line-subtle bg-white/[0.02]",
  neutral: "text-ink-secondary border-line-subtle bg-white/[0.02]",
};

export function Badge({
  tone = "neutral",
  children,
  className,
  dot = false,
}: {
  tone?: Tone;
  children: ReactNode;
  className?: string;
  dot?: boolean;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-xs border px-2 py-0.5 font-mono text-2xs font-medium uppercase tracking-wide",
        toneClasses[tone],
        className
      )}
    >
      {dot && <span className={cn("h-1.5 w-1.5 rounded-full", dotColor(tone))} />}
      {children}
    </span>
  );
}

function dotColor(tone: Tone) {
  switch (tone) {
    case "cyan":
      return "bg-cyan";
    case "violet":
      return "bg-violet";
    case "pass":
      return "bg-signal-pass";
    case "warn":
      return "bg-signal-warn";
    case "fail":
      return "bg-signal-fail";
    default:
      return "bg-ink-tertiary";
  }
}
