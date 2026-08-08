import { useNavigate } from "react-router-dom";
import { AppShell } from "@/components/layout/AppShell";
import { Breadcrumb } from "@/components/layout/Topbar";
import { Panel, PanelHeader, PanelBody } from "@/components/ui/Panel";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { ReadinessBadge } from "@/components/candidates/ReadinessBadge";
import { useCandidates } from "@/hooks/useCandidates";

export function ReportsPage() {
  const roster = useCandidates();
  const navigate = useNavigate();

  const sorted = [...roster].sort((a, b) => b.scorecard.readinessIndex - a.scorecard.readinessIndex);

  return (
    <AppShell breadcrumb={<Breadcrumb items={["Reports"]} />}>
      <div className="mx-auto max-w-5xl space-y-6 p-6">
        <div>
          <h1 className="text-xl font-semibold text-ink-primary">Reports</h1>
          <p className="mt-1 text-sm text-ink-secondary">Ranked by composite readiness index.</p>
        </div>

        <Panel>
          <PanelHeader eyebrow={`${roster.length} candidates`} title="Assessment Reports" />
          <PanelBody className="space-y-2">
            {sorted.map(({ candidate, scorecard }) => (
              <div
                key={candidate.member.id}
                className="flex items-center justify-between gap-3 rounded-sm border border-line-subtle bg-graphite p-3"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <Avatar name={candidate.member.name} />
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium text-ink-primary">{candidate.member.name}</div>
                    <div className="truncate text-2xs text-ink-tertiary">{candidate.member.jobRole}</div>
                  </div>
                </div>
                <div className="flex items-center gap-4">
                  <ReadinessBadge index={scorecard.readinessIndex} />
                  <Button size="sm" variant="secondary" onClick={() => navigate(`/review/${candidate.member.id}`)}>
                    View Report
                  </Button>
                </div>
              </div>
            ))}
          </PanelBody>
        </Panel>
      </div>
    </AppShell>
  );
}
