import { Avatar } from "@/components/ui/Avatar";
import { Panel, PanelHeader, PanelBody } from "@/components/ui/Panel";
import { MissionGrid, MissionGridLegend } from "@/components/candidates/MissionGrid";
import { SignalMeter } from "@/components/candidates/SignalMeter";
import { ReadinessBadge } from "@/components/candidates/ReadinessBadge";
import type { CandidateWithScore } from "@/hooks/useCandidates";

export function CandidateDossier({ candidate, scorecard }: CandidateWithScore) {
  const { member } = candidate;

  return (
    <div className="flex h-full w-80 shrink-0 flex-col gap-4 overflow-y-auto border-r border-line-hairline p-4">
      <Panel className="p-4">
        <div className="flex items-center gap-3">
          <Avatar name={member.name} size="lg" />
          <div className="min-w-0">
            <div className="truncate text-sm font-semibold text-ink-primary">{member.name}</div>
            <div className="truncate text-2xs text-ink-tertiary">{member.jobRole}</div>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2 text-2xs">
          <InfoField label="Experience" value={`${member.yearsExperience} yrs`} />
          <InfoField label="Education" value={member.education} />
        </div>
        <div className="mt-3 divider-hairline" />
        <div className="mt-3 flex items-center justify-between">
          <span className="label-overline">Readiness</span>
          <ReadinessBadge index={scorecard.readinessIndex} />
        </div>
      </Panel>

      <Panel>
        <PanelHeader eyebrow="Cohort Signals" title="Program Performance" />
        <PanelBody>
          <SignalMeter scorecard={scorecard} />
        </PanelBody>
      </Panel>

      <Panel className="flex-1">
        <PanelHeader eyebrow={`${scorecard.attemptedCount} attempted`} title="Mission History" />
        <PanelBody>
          <MissionGrid candidate={candidate} />
          <div className="mt-3">
            <MissionGridLegend />
          </div>
        </PanelBody>
      </Panel>
    </div>
  );
}

function InfoField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xs bg-white/[0.02] p-2">
      <div className="text-ink-disabled">{label}</div>
      <div className="mt-0.5 truncate text-ink-secondary">{value}</div>
    </div>
  );
}
