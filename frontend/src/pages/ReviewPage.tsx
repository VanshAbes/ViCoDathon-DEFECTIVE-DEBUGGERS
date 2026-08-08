import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AppShell } from "@/components/layout/AppShell";
import { Breadcrumb } from "@/components/layout/Topbar";
import { Button } from "@/components/ui/Button";
import { Badge } from "@/components/ui/Badge";
import { CurriculumMap } from "@/components/curriculum/CurriculumMap";
import { AssessmentSection, PendingAssessmentContent } from "@/components/review/AssessmentSection";
import { useCandidate } from "@/hooks/useCandidates";
import { clearCompletedSession, getCompletedSession } from "@/lib/completedSession";
import type { InterviewJourneyPhase } from "@/types/assessment";

const phases: InterviewJourneyPhase[] = [
  "BASELINE",
  "PROBE",
  "FOLLOW-UP",
  "CROSS-TOPIC",
  "DEPTH",
  "FINAL ASSESSMENT",
  "COMPLETE",
];

/** F6 final report. It deliberately reads a real completed-session handoff, never a route-only candidate ID. */
export function ReviewPage() {
  const { candidateId } = useParams();
  const navigate = useNavigate();
  const entry = useCandidate(candidateId);
  const completed = candidateId ? getCompletedSession(candidateId) : undefined;
  const [copyState, setCopyState] = useState<"idle" | "copied" | "unavailable">("idle");

  if (!entry) return <MissingReport />;

  const { candidate } = entry;
  if (!completed) {
    return (
      <AppShell breadcrumb={<Breadcrumb items={["Reports", candidate.member.name]} />}>
        <div className="flex h-[60vh] flex-col items-center justify-center gap-3 px-6 text-center">
          <p className="label-overline">Final assessment unavailable</p>
          <p className="max-w-md text-sm text-ink-secondary">
            A final report becomes available only after this interview session completes.
          </p>
          <Button variant="primary" onClick={() => navigate(`/interview/${candidate.member.id}`)}>Start Interview</Button>
        </div>
      </AppShell>
    );
  }

  const assessment = completed.assessment;
  const copySummary = async () => {
    if (!assessment?.summary) {
      setCopyState("unavailable");
      return;
    }
    try {
      await navigator.clipboard.writeText(assessment.summary);
      setCopyState("copied");
    } catch {
      setCopyState("unavailable");
    }
  };

  const restart = () => {
    clearCompletedSession(candidate.member.id);
    navigate(`/interview/${candidate.member.id}`);
  };

  return (
    <AppShell
      breadcrumb={<Breadcrumb items={["Reports", candidate.member.name, "Final Assessment"]} />}
      actions={
        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={copySummary}>Copy Summary</Button>
          <Button variant="secondary" size="sm" onClick={() => window.print()}>Print Report</Button>
          <Button variant="primary" size="sm" onClick={restart}>Restart Interview</Button>
        </div>
      }
    >
      <article className="assessment-report mx-auto max-w-5xl space-y-6 p-6">
        <section className="border-b border-line-hairline pb-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="label-overline mb-2 text-cyan">Interview Complete</div>
              <h1 className="text-2xl font-semibold tracking-tight text-ink-primary">Final Assessment Report</h1>
              <p className="mt-2 text-sm text-ink-secondary">{candidate.member.name} · {candidate.member.jobRole}</p>
            </div>
            <Badge tone="pass">Session complete</Badge>
          </div>
          <dl className="mt-5 grid gap-3 sm:grid-cols-3">
            <Readout label="Session ID" value={completed.sessionId} />
            <Readout label="Completed" value={new Date(completed.completedAt).toLocaleString()} />
            <Readout label="Conversation turns" value={String(completed.messageCount)} />
          </dl>
        </section>

        <AssessmentSection eyebrow="Executive Summary" title="Assessment Overview">
          {assessment?.summary ? <p className="text-sm leading-7 text-ink-secondary">{assessment.summary}</p> : <PendingAssessmentContent label="A backend-generated executive summary" />}
          {copyState !== "idle" && <p className="mt-3 text-2xs text-ink-tertiary">{copyState === "copied" ? "Summary copied to clipboard." : "No summary is available to copy yet."}</p>}
        </AssessmentSection>

        <div className="grid gap-6 lg:grid-cols-2">
          <ListSection eyebrow="Strengths" title="Confirmed Strengths" items={assessment?.strengths} label="Backend-provided strengths" />
          <ListSection eyebrow="Gaps" title="Areas for Follow-up" items={assessment?.gaps} label="Backend-provided gaps" />
        </div>
        <ListSection eyebrow="Recommended Next Steps" title="Suggested Actions" items={assessment?.nextSteps} label="Backend-provided recommendations" />

        <AssessmentSection eyebrow="Curriculum Coverage" title="Interview Exposure">
          <p className="mb-4 text-xs leading-relaxed text-ink-tertiary">
            Exposure reflects subjects surfaced during the interview. <span className="font-semibold text-ink-secondary">Exposure ≠ mastery.</span>
          </p>
          {assessment?.curriculumCoverage ? <CurriculumMap coverage={assessment.curriculumCoverage} /> : <PendingAssessmentContent label="Curriculum exposure data" />}
        </AssessmentSection>

        <AssessmentSection eyebrow="Interview Journey" title="Session Progression">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-3">
            {phases.map((phase, index) => {
              const state = phase === "COMPLETE" ? "complete" : assessment?.journey?.[phase] ?? "unavailable";
              return (
                <div key={phase} className="flex items-center gap-2">
                  {index > 0 && <span className="text-ink-disabled">→</span>}
                  <span className={state === "complete" ? "border border-cyan/40 bg-cyan-dim px-2 py-1 font-mono text-2xs text-cyan" : "border border-line-subtle px-2 py-1 font-mono text-2xs text-ink-tertiary"}>{phase}</span>
                </div>
              );
            })}
          </div>
          <p className="mt-4 text-2xs leading-relaxed text-ink-disabled">
            Exact phase history is not available from the current interview session contract. Only session completion is confirmed.
          </p>
        </AssessmentSection>
      </article>
    </AppShell>
  );
}

function ListSection({ eyebrow, title, items, label }: { eyebrow: string; title: string; items?: string[]; label: string }) {
  return <AssessmentSection eyebrow={eyebrow} title={title}>{items?.length ? <ul className="space-y-2 text-sm text-ink-secondary">{items.map((item) => <li key={item} className="border-l border-violet/40 pl-3">{item}</li>)}</ul> : <PendingAssessmentContent label={label} />}</AssessmentSection>;
}

function Readout({ label, value }: { label: string; value: string }) {
  return <div className="border-l border-line-subtle pl-3"><dt className="label-overline">{label}</dt><dd className="mt-1 break-all font-mono text-xs text-ink-secondary">{value}</dd></div>;
}

function MissingReport() {
  const navigate = useNavigate();
  return <AppShell breadcrumb={<Breadcrumb items={["Reports", "Unknown Candidate"]} />}><div className="flex h-[60vh] flex-col items-center justify-center gap-3 text-center"><p className="text-sm text-ink-secondary">No report found for this candidate.</p><Button variant="secondary" onClick={() => navigate("/")}>Back to Command Center</Button></div></AppShell>;
}
