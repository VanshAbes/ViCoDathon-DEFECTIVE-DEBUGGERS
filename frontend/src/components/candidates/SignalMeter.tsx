import { ProgressBar } from "@/components/ui/ProgressBar";
import { formatPercent } from "@/lib/format";
import type { CandidateScorecard } from "@/lib/curriculum";

export function SignalMeter({ scorecard }: { scorecard: CandidateScorecard }) {
  const rows: { label: string; value: number; tone: "cyan" | "violet" | "pass" }[] = [
    { label: "Pass rate", value: scorecard.passRate, tone: "pass" },
    { label: "First-try rate", value: scorecard.firstTryRate, tone: "cyan" },
    { label: "Commitment", value: scorecard.commitRate, tone: "violet" },
  ];

  return (
    <div className="space-y-2">
      {rows.map((row) => (
        <div key={row.label} className="flex items-center gap-2.5">
          <span className="w-24 shrink-0 text-2xs text-ink-tertiary">{row.label}</span>
          <ProgressBar value={row.value} tone={row.tone} className="opacity-90" />
          <span className="w-9 shrink-0 text-right font-mono text-2xs text-ink-secondary">
            {formatPercent(row.value)}
          </span>
        </div>
      ))}
    </div>
  );
}
