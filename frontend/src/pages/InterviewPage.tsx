import { useEffect, useRef } from "react";
import type { RefObject } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { AppShell } from "@/components/layout/AppShell";
import { Breadcrumb } from "@/components/layout/Topbar";
import { Button } from "@/components/ui/Button";
import { CandidateDossier } from "@/components/interview/CandidateDossier";
import { InterviewStatusBar } from "@/components/interview/InterviewStatusBar";
import { MessageBubble, TypingIndicator } from "@/components/interview/MessageBubble";
import { MessageComposer } from "@/components/interview/MessageComposer";
import { useCandidate } from "@/hooks/useCandidates";
import { useInterviewSession } from "@/hooks/useInterviewSession";

export function InterviewPage() {
  const { candidateId } = useParams();
  const entry = useCandidate(candidateId);
  const scrollRef = useRef<HTMLDivElement>(null);

  if (!entry) {
    return <MissingCandidate />;
  }

  return <InterviewConsole entry={entry} scrollRef={scrollRef} />;
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
        <CandidateDossier candidate={candidate} scorecard={scorecard} />

        <div className="flex min-w-0 flex-1 flex-col">
          <InterviewStatusBar
            sessionId={sessionId}
            status={status}
            turnsCompleted={turnsCompleted}
            turnsTotal={turnsTotal}
          />

          <div ref={scrollRef} className="flex-1 space-y-5 overflow-y-auto px-6 py-6">
            {messages.map((m) => (
              <MessageBubble key={m.id} message={m} />
            ))}
            {isAgentTyping && <TypingIndicator />}
            {status === "complete" && (
              <div className="pt-2 text-center font-mono text-2xs uppercase tracking-widest2 text-signal-pass">
                Session complete — routing to report…
              </div>
            )}
          </div>

          <MessageComposer onSend={sendTurn} disabled={status !== "live"} />
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
