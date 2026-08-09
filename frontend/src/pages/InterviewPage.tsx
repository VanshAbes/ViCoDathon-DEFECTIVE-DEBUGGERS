import { useEffect, useRef } from "react";
import type { RefObject } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AppShell } from "@/components/layout/AppShell";
import { Breadcrumb } from "@/components/layout/Topbar";
import { Button } from "@/components/ui/Button";
import { CandidateDossier } from "@/components/interview/CandidateDossier";
import { InterviewStatusPanel } from "@/components/interview/InterviewStatusPanel";
import { MessageBubble, TypingIndicator } from "@/components/interview/MessageBubble";
import { MessageComposer } from "@/components/interview/MessageComposer";
import { useCandidate } from "@/hooks/useCandidates";
import { useInterviewSession } from "@/hooks/useInterviewSession";
import { useMockCurriculumCoverage } from "@/hooks/useMockCurriculumCoverage";
import { useMockCompetencySignals } from "@/hooks/useMockCompetencySignals";
import { saveCompletedSession } from "@/lib/completedSession";
import { assessmentFromFeedback } from "@/lib/assessmentMapping";
import type { InterviewSessionStatus } from "@/types/interview";

export function InterviewPage() {
  const { candidateId } = useParams();
  const entry = useCandidate(candidateId);
  const scrollRef = useRef<HTMLDivElement>(null);
  if (!entry) return <MissingCandidate />;
  return <InterviewConsole key={entry.candidate.member.id} entry={entry} scrollRef={scrollRef} />;
}

function InterviewConsole({ entry, scrollRef }: { entry: NonNullable<ReturnType<typeof useCandidate>>; scrollRef: RefObject<HTMLDivElement> }) {
  const { candidate, scorecard } = entry;
  const navigate = useNavigate();
  const session = useInterviewSession(candidate, "api");
  const { status, messages, isAgentTyping, sessionId, turnsCompleted, turnsTotal, activity, error, feedback, source, start, sendTurn } = session;
  const curriculumCoverage = useMockCurriculumCoverage(status, turnsCompleted, turnsTotal);
  const competencySignals = useMockCompetencySignals(messages, curriculumCoverage);

  useEffect(() => { if (status === "idle") start(); }, [start, status]);
  useEffect(() => { scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" }); }, [messages, isAgentTyping, scrollRef]);
  useEffect(() => {
    if (status !== "complete") return;
    const backendAssessment = source === "api" && feedback ? assessmentFromFeedback(feedback) : undefined;
    saveCompletedSession({ candidateId: candidate.member.id, sessionId, completedAt: new Date().toISOString(), messageCount: messages.length, assessment: { ...backendAssessment, curriculumCoverage, competencySignals } });
    const timer = window.setTimeout(() => navigate(`/review/${candidate.member.id}`), 1600);
    return () => window.clearTimeout(timer);
  }, [candidate.member.id, competencySignals, curriculumCoverage, feedback, messages.length, navigate, sessionId, source, status]);

  const composerDisabled = status !== "live" || isAgentTyping;
  return <AppShell breadcrumb={<Breadcrumb items={["Command Center", candidate.member.name, "Live Interview"]} />} actions={<Button variant="ghost" size="sm" onClick={() => navigate("/")}>Exit Session</Button>}>
    <div className="flex min-h-[calc(100vh-3.5rem)] lg:h-[calc(100vh-3.5rem)]">
      <div className="hidden lg:flex"><InterviewStatusPanel candidateName={candidate.member.name} jobRole={candidate.member.jobRole} sessionId={sessionId} status={status} isAgentTyping={isAgentTyping} turnsCompleted={turnsCompleted} turnsTotal={turnsTotal} curriculumCoverage={curriculumCoverage} /></div>
      <div className="flex min-w-0 flex-1 flex-col">
        <MobileInterviewOverview candidateName={candidate.member.name} jobRole={candidate.member.jobRole} status={status} turnsCompleted={turnsCompleted} turnsTotal={turnsTotal} />
        <div ref={scrollRef} className="flex-1 space-y-5 overflow-y-auto px-4 py-5 sm:px-6 sm:py-6" aria-live="polite">
          {messages.map((message) => <MessageBubble key={message.id} message={message} />)}
          {isAgentTyping && <TypingIndicator />}
          {error && <SessionErrorNotice message={error.message} onRestart={() => navigate(`/interview/${candidate.member.id}`)} />}
          {status === "complete" && <div className="flex flex-col items-center gap-3 pt-4 text-center"><span className="font-mono text-2xs uppercase tracking-widest2 text-signal-pass">Interview complete — preparing report…</span><Button variant="secondary" size="sm" onClick={() => navigate(`/review/${candidate.member.id}`)}>View Report Now</Button></div>}
        </div>
        <MessageComposer onSend={sendTurn} disabled={composerDisabled} activity={activity} />
      </div>
      <div className="hidden xl:flex"><CandidateDossier candidate={candidate} scorecard={scorecard} competencySignals={competencySignals} /></div>
    </div>
  </AppShell>;
}

function MobileInterviewOverview({ candidateName, jobRole, status, turnsCompleted, turnsTotal }: { candidateName: string; jobRole: string; status: InterviewSessionStatus; turnsCompleted: number; turnsTotal: number }) {
  const question = status === "complete" ? turnsTotal : Math.min(turnsCompleted + 1, turnsTotal);
  return <div className="border-b border-line-hairline px-4 py-3 lg:hidden"><div className="flex items-center justify-between gap-3"><div className="min-w-0"><div className="truncate text-sm font-semibold text-ink-primary">{candidateName}</div><div className="truncate text-2xs text-ink-tertiary">{jobRole}</div></div><span className="font-mono text-2xs uppercase tracking-wide text-cyan">{status}</span></div><div className="mt-2 font-mono text-2xs text-ink-tertiary">Question {question} of {turnsTotal}</div></div>;
}

function SessionErrorNotice({ message, onRestart }: { message: string; onRestart: () => void }) {
  return <div role="alert" className="flex flex-wrap items-center justify-between gap-3 border-l-2 border-signal-fail bg-signal-fail-dim px-4 py-3"><p className="text-sm text-ink-secondary">{message}</p><Button variant="secondary" size="sm" onClick={onRestart}>Restart session</Button></div>;
}

function MissingCandidate() {
  const navigate = useNavigate();
  return <AppShell breadcrumb={<Breadcrumb items={["Command Center", "Unknown Candidate"]} />}><div className="flex h-[60vh] flex-col items-center justify-center gap-3 text-center"><p className="text-sm text-ink-secondary">No candidate found for this session.</p><Button variant="secondary" onClick={() => navigate("/")}>Back to Command Center</Button></div></AppShell>;
}
