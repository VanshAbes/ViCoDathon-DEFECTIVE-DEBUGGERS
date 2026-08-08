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

export function InterviewPage() {
  const { candidateId } = useParams();
  const entry = useCandidate(candidateId);
  const scrollRef = useRef<HTMLDivElement>(null);

  if (!entry) {
    return <MissingCandidate />;
  }

  // `key` forces a full remount (fresh useInterviewSession instance) whenever
  // the route moves between two different candidates. Without this, React
  // Router re-renders the same component instance on param changes alone,
  // and session state (sessionId, messages, turn index) from the previous
  // candidate would leak into the new session.
  return <InterviewConsole key={entry.candidate.member.id} entry={entry} scrollRef={scrollRef} />;
}

function InterviewConsole({
  entry,
  scrollRef,
}: {
  entry: NonNullable<ReturnType<typeof useCandidate>>;
  scrollRef: RefObject<HTMLDivElement>;
}) {
  const { candidate, scorecard } = entry;
  const navigate = useNavigate();
  const session = useInterviewSession(candidate);
  const { status, messages, isAgentTyping, sessionId, turnsCompleted, turnsTotal, start, sendTurn } = session;
  // F4 — curriculum coverage. Mocked locally from session progress until the
  // interview API returns real coveredDays/currentDay; see the hook docstring.
  const curriculumCoverage = useMockCurriculumCoverage(status, turnsCompleted, turnsTotal);

  useEffect(() => {
    if (status === "idle") start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, isAgentTyping, scrollRef]);

  useEffect(() => {
    if (status === "complete") {
      const t = window.setTimeout(() => navigate(`/review/${candidate.member.id}`), 1600);
      return () => window.clearTimeout(t);
    }
  }, [status, navigate, candidate.member.id]);

  // Composer must be locked while the agent is mid-response, not just when
  // the session is off ("live"): status stays "live" for the entire
  // thinking window, so gating on status alone let a candidate fire a
  // second answer before the first one's reply arrived.
  const composerDisabled = status !== "live" || isAgentTyping;

  return (
    <AppShell
      breadcrumb={<Breadcrumb items={["Command Center", candidate.member.name, "Live Interview"]} />}
      actions={
        <Button variant="ghost" size="sm" onClick={() => navigate("/")}>
          Exit Session
        </Button>
      }
    >
      <div className="flex h-[calc(100vh-3.5rem)]">
        <div className="hidden lg:flex">
          <InterviewStatusPanel
            candidateName={candidate.member.name}
            jobRole={candidate.member.jobRole}
            sessionId={sessionId}
            status={status}
            isAgentTyping={isAgentTyping}
            turnsCompleted={turnsCompleted}
            turnsTotal={turnsTotal}
            curriculumCoverage={curriculumCoverage}
          />
        </div>

        <div className="flex min-w-0 flex-1 flex-col">
          <div ref={scrollRef} className="flex-1 space-y-5 overflow-y-auto px-6 py-6">
            {messages.map((m) => (
              <MessageBubble key={m.id} message={m} />
            ))}
            {isAgentTyping && <TypingIndicator />}
            {status === "complete" && (
              <div className="flex flex-col items-center gap-3 pt-4 text-center">
                <span className="font-mono text-2xs uppercase tracking-widest2 text-signal-pass">
                  Interview complete — routing to report…
                </span>
                <Button variant="secondary" size="sm" onClick={() => navigate(`/review/${candidate.member.id}`)}>
                  View Report Now
                </Button>
              </div>
            )}
          </div>

          <MessageComposer onSend={sendTurn} disabled={composerDisabled} />
        </div>

        <div className="hidden xl:flex">
          <CandidateDossier candidate={candidate} scorecard={scorecard} />
        </div>
      </div>
    </AppShell>
  );
}

function MissingCandidate() {
  const navigate = useNavigate();
  return (
    <AppShell breadcrumb={<Breadcrumb items={["Command Center", "Unknown Candidate"]} />}>
      <div className="flex h-[60vh] flex-col items-center justify-center gap-3 text-center">
        <p className="text-sm text-ink-secondary">No candidate found for this session.</p>
        <Button variant="secondary" onClick={() => navigate("/")}>
          Back to Command Center
        </Button>
      </div>
    </AppShell>
  );
}
