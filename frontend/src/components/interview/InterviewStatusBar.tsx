import { StatusReadout } from "@/components/ui/StatusDot";
import { ProgressBar } from "@/components/ui/ProgressBar";
import type { InterviewSessionStatus } from "@/types/interview";

const statusMap: Record<InterviewSessionStatus, { label: string; tone: "cyan" | "pass" | "idle" | "fail" }> = {
  idle: { label: "STANDBY", tone: "idle" },
  live: { label: "LIVE", tone: "cyan" },
  complete: { label: "COMPLETE", tone: "pass" },
  error: { label: "ERROR", tone: "fail" },
};

export function InterviewStatusBar({
  sessionId,
  status,
  turnsCompleted,
  turnsTotal,
}: {
  sessionId: string;
  status: InterviewSessionStatus;
  turnsCompleted: number;
  turnsTotal: number;
}) {
  const { label, tone } = statusMap[status];

  return (
    <div className="flex items-center justify-between gap-4 border-b border-line-hairline px-5 py-3">
      <div className="flex items-center gap-4">
        <StatusReadout label={label} tone={tone} pulse={status === "live"} />
        <span className="font-mono text-2xs text-ink-tertiary">SESSION {sessionId.toUpperCase()}</span>
      </div>

      <div className="flex w-40 items-center gap-2.5">
        <span className="font-mono text-2xs text-ink-tertiary">
          {turnsCompleted}/{turnsTotal}
        </span>
        <ProgressBar value={turnsTotal ? turnsCompleted / turnsTotal : 0} tone="cyan" />
      </div>
    </div>
  );
}
