import { useNavigate } from "react-router-dom";
import { AppShell } from "@/components/layout/AppShell";
import { Breadcrumb } from "@/components/layout/Topbar";
import { Panel, PanelHeader, PanelBody } from "@/components/ui/Panel";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { StatusReadout } from "@/components/ui/StatusDot";
import { useCandidates } from "@/hooks/useCandidates";

export function InterviewsPage() {
  const roster = useCandidates();
  const navigate = useNavigate();

  return (
    <AppShell breadcrumb={<Breadcrumb items={["Interviews"]} />}>
      <div className="mx-auto max-w-5xl space-y-6 p-6">
        <div>
          <h1 className="text-xl font-semibold text-ink-primary">Interviews</h1>
          <p className="mt-1 text-sm text-ink-secondary">Launch a live AI-driven session for any candidate.</p>
        </div>

        <Panel>
          <PanelHeader eyebrow={`${roster.length} eligible`} title="Ready to Interview" action={<StatusReadout label="AGENT ONLINE" tone="pass" />} />
          <PanelBody className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {roster.map(({ candidate }) => (
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
                <Button size="sm" variant="primary" onClick={() => navigate(`/interview/${candidate.member.id}`)}>
                  Start
                </Button>
              </div>
            ))}
          </PanelBody>
        </Panel>
      </div>
    </AppShell>
  );
}
