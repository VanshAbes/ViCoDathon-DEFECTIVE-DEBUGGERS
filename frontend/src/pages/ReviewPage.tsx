import { useNavigate, useParams } from "react-router-dom";
import { AppShell } from "@/components/layout/AppShell";
import { Breadcrumb } from "@/components/layout/Topbar";
import { Button } from "@/components/ui/Button";
import { Panel } from "@/components/ui/Panel";
import { FeedbackSummaryPanel } from "@/components/review/FeedbackSummaryPanel";
import { FeedbackColumns } from "@/components/review/FeedbackColumns";
import { MissionGrid, MissionGridLegend } from "@/components/candidates/MissionGrid";
import { useCandidate } from "@/hooks/useCandidates";
import { buildMockFeedback } from "@/data/mockInterviewScript";

/**
 * NOTE: this page renders against mock feedback (`buildMockFeedback`) so it is
 * demoable in isolation. Once wired, this should read the `InterviewFeedback`
 * returned by the final `POST /api/interview` turn (`done: true`) for this
 * candidate's session, likely passed via route state or a session store.
 */
export function ReviewPage() {
  const { candidateId } = useParams();
  const navigate = useNavigate();
  const entry = useCandidate(candidateId);

  if (!entry) {
    return (
      <AppShell breadcrumb={<Breadcrumb items={["Reports", "Unknown Candidate"]} />}>
        <div className="flex h-[60vh] flex-col items-center justify-center gap-3 text-center">
          <p className="text-sm text-ink-secondary">No report found for this candidate.</p>
          <Button variant="secondary" onClick={() => navigate("/")}>
            Back to Command Center
          </Button>
        </div>
      </AppShell>
    );
  }

  const { candidate, scorecard } = entry;
  const feedback = buildMockFeedback(candidate.member.jobRole);

  return (
    <AppShell
      breadcrumb={<Breadcrumb items={["Reports", candidate.member.name]} />}
      actions={
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm">
            Copy Report
          </Button>
          <Button variant="secondary" size="sm">
            Export PDF
          </Button>
          <Button variant="primary" size="sm" onClick={() => navigate(`/interview/${candidate.member.id}`)}>
            Re-run Interview
          </Button>
        </div>
      }
    >
      <div className="mx-auto max-w-5xl space-y-6 p-6">
        <Panel>
          <FeedbackSummaryPanel candidate={candidate} feedback={feedback} readinessIndex={scorecard.readinessIndex} />
          <FeedbackColumns feedback={feedback} />
        </Panel>

        <Panel>
          <div className="flex items-center justify-between p-4">
            <div>
              <div className="label-overline mb-1">Program Record</div>
              <div className="text-sm font-semibold text-ink-primary">Full Mission History</div>
            </div>
            <MissionGridLegend />
          </div>
          <div className="px-4 pb-5">
            <MissionGrid candidate={candidate} />
          </div>
        </Panel>
      </div>
    </AppShell>
  );
}
