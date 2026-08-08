import { Panel, PanelBody } from "@/components/ui/Panel";
import { StatusReadout } from "@/components/ui/StatusDot";
import { ProgressBar } from "@/components/ui/ProgressBar";
import { CurriculumMap } from "@/components/curriculum/CurriculumMap";
import type { InterviewSessionStatus } from "@/types/interview";
import type { CurriculumCoverage } from "@/types/curriculumCoverage";

const statusMap: Record<InterviewSessionStatus, { label: string; tone: "cyan" | "pass" | "idle" | "fail" }> = {
  idle: { label: "STANDBY", tone: "idle" },
  live: { label: "LIVE", tone: "cyan" },
  complete: { label: "COMPLETE", tone: "pass" },
  error: { label: "ERROR", tone: "fail" },
};

/**
 * Derives a human-readable interview phase purely from existing session
 * state (status + typing flag + turn counters). This is a presentation-only
 * label — it introduces no new data, metric, or backend concept.
 */
function describePhase(status: InterviewSessionStatus, isAgentTyping: boolean, turnsCompleted: number): string {
  if (status === "idle") return "Initializing Session";
  if (status === "error") return "Session Error";
  if (status === "complete") return "Assessment Complete";
  if (isAgentTyping) return turnsCompleted === 0 ? "Interviewer Opening" : "Interviewer Responding";
  return "Awaiting Your Response";
}

export function InterviewStatusPanel({
  candidateName,
  jobRole,
  sessionId,
  status,
  isAgentTyping,
  turnsCompleted,
  turnsTotal,
  curriculumCoverage,
}: {
  candidateName: string;
  jobRole: string;
  sessionId: string;
  status: InterviewSessionStatus;
  isAgentTyping: boolean;
  turnsCompleted: number;
  turnsTotal: number;
  curriculumCoverage: CurriculumCoverage;
}) {
  const { label, tone } = statusMap[status];
  const phase = describePhase(status, isAgentTyping, turnsCompleted);
  const currentQuestion = status === "complete" ? turnsTotal : Math.min(turnsCompleted + 1, turnsTotal);
  const progress = turnsTotal ? turnsCompleted / turnsTotal : 0;

  return (
    <div className="flex h-full w-64 shrink-0 flex-col gap-4 overflow-y-auto border-r border-line-hairline p-4">
      <Panel className="p-4">
        <div className="label-overline">Candidate</div>
        <div className="mt-1.5 truncate text-sm font-semibold text-ink-primary">{candidateName}</div>
        <div className="truncate text-2xs text-ink-tertiary">{jobRole}</div>
      </Panel>

      <Panel>
        <PanelBody className="space-y-4 pt-4">
          <div>
            <div className="label-overline mb-2">Interview Status</div>
            <StatusReadout label={label} tone={tone} pulse={status === "live"} />
          </div>

          <div>
            <div className="label-overline mb-1.5">Current Phase</div>
            <div className="text-xs text-ink-secondary">{phase}</div>
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <span className="label-overline">Progress</span>
              <span className="font-mono text-2xs text-ink-tertiary">
                {status === "idle" ? `0/${turnsTotal}` : `${currentQuestion}/${turnsTotal}`}
              </span>
            </div>
            <ProgressBar value={progress} tone="cyan" />
          </div>
        </PanelBody>
      </Panel>

      <CurriculumMap coverage={curriculumCoverage} isMock={false} />

      <Panel className="mt-auto p-4">
        <div className="label-overline">Session</div>
        <div className="mt-1.5 truncate font-mono text-2xs text-ink-secondary">{sessionId.toUpperCase()}</div>
      </Panel>
    </div>
  );
}
