import { useNavigate } from "react-router-dom";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ReadinessBadge } from "./ReadinessBadge";
import { MissionGrid } from "./MissionGrid";
import type { CandidateWithScore } from "@/hooks/useCandidates";

export function CandidateRow({ candidate, scorecard }: CandidateWithScore) {
  const navigate = useNavigate();
  const { member } = candidate;
  return <div className="flex flex-col gap-3 border-b border-line-hairline px-4 py-4 transition-colors hover:bg-white/[0.015] md:grid md:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1.4fr)_auto_auto] md:items-center md:gap-4 md:py-3">
    <div className="flex min-w-0 items-center gap-3"><Avatar name={member.name} /><div className="min-w-0"><div className="truncate text-sm font-medium text-ink-primary">{member.name}</div><div className="truncate text-2xs text-ink-tertiary">{member.jobRole} · {member.yearsExperience}y · {member.education}</div></div></div>
    <div className="flex items-center justify-between md:block"><span className="label-overline md:hidden">Status</span><Badge tone={member.status === "COMPLETED" ? "pass" : "neutral"}>{member.status}</Badge></div>
    <div className="flex items-center justify-between gap-3 md:block"><span className="label-overline md:hidden">Mission History</span><div className="min-w-0"><MissionGrid candidate={candidate} size="xs" /></div></div>
    <div className="flex items-center justify-between md:block"><span className="label-overline md:hidden">Readiness</span><ReadinessBadge index={scorecard.readinessIndex} /></div>
    <div className="flex items-center justify-end gap-2"><Button size="sm" variant="ghost" onClick={() => navigate(`/review/${member.id}`)}>Report</Button><Button size="sm" variant="primary" onClick={() => navigate(`/interview/${member.id}`)}>Start Interview</Button></div>
  </div>;
}
