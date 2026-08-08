import { Panel, PanelHeader, PanelBody } from "@/components/ui/Panel";
import { Badge } from "@/components/ui/Badge";
import { CompetencyItem } from "./CompetencyItem";
import { CompetencyIndicator } from "./CompetencyIndicator";
import type { CompetencySignal, CompetencyStatus } from "@/types/competency";

/**
 * F5 — live competency read, integrated into F3's right-side candidate
 * dossier. Purely qualitative: STRONG / DEVELOPING / NEEDS PROBE / UNCLEAR,
 * never a score or percentage.
 *
 * `signals` is currently produced locally by `useMockCompetencySignals` (see
 * the "Mock Signal" badge below). Once the interview API returns real
 * competency data, pass that through instead — this component's props and
 * rendering are already shaped for it.
 */
export function CompetencyPanel({
  signals,
  isMock = false,
}: {
  signals: CompetencySignal[];
  isMock?: boolean;
}) {
  return (
    <Panel>
      <PanelHeader
        eyebrow="Live Signal"
        title="Competency Read"
        action={
          isMock ? (
            <span title="Derived locally from this conversation until the interview API returns real competency data">
              <Badge tone="idle">Mock Signal</Badge>
            </span>
          ) : undefined
        }
      />
      <PanelBody className="space-y-3">
        {signals.length === 0 ? (
          <p className="py-1 text-2xs leading-relaxed text-ink-tertiary">
            No topics surfaced yet — signal appears here as the interview progresses.
          </p>
        ) : (
          <div className="space-y-1.5">
            {signals.map((s) => (
              <CompetencyItem key={`${s.day}-${s.topic}`} signal={s} />
            ))}
          </div>
        )}

        <div className="divider-hairline" />

        <CompetencyLegend />
      </PanelBody>
    </Panel>
  );
}

const legendOrder: CompetencyStatus[] = ["STRONG", "DEVELOPING", "NEEDS_PROBE", "UNCLEAR"];

function CompetencyLegend() {
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        {legendOrder.map((status) => (
          <CompetencyIndicator key={status} status={status} />
        ))}
      </div>
      <p className="text-2xs leading-relaxed text-ink-disabled">
        A qualitative read from this conversation only — not a score.
      </p>
    </div>
  );
}
