import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { ScoreRing } from "./ScoreRing";
import type { Candidate } from "@/types/candidate";
import type { InterviewFeedback } from "@/types/interview";

export function FeedbackSummaryPanel({
  candidate,
  feedback,
  readinessIndex,
}: {
  candidate: Candidate;
  feedback: InterviewFeedback;
  readinessIndex: number;
}) {
  const { member } = candidate;

  return (
    <div className="flex flex-col gap-6 border-b border-line-hairline p-6 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex items-start gap-4">
        <Avatar name={member.name} size="lg" />
        <div>
          <div className="label-overline mb-1">Interview Report</div>
          <h1 className="text-lg font-semibold text-ink-primary">{member.name}</h1>
          <div className="mt-0.5 text-sm text-ink-secondary">
            {member.jobRole} · {member.yearsExperience} yrs · {member.education}
          </div>
          <div className="mt-3 max-w-xl text-sm leading-relaxed text-ink-secondary">{feedback.summary}</div>
          <div className="mt-3">
            <Badge tone="pass">Assessment Complete</Badge>
          </div>
        </div>
      </div>

      <ScoreRing value={readinessIndex} />
    </div>
  );
}
