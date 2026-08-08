import { useCallback, useRef, useState } from "react";
import type { Candidate } from "@/types/candidate";
import type { InterviewMessage, InterviewSessionStatus, InterviewFeedback } from "@/types/interview";
import { MOCK_AGENT_SCRIPT, MOCK_CLOSING_REPLY, buildMockFeedback } from "@/data/mockInterviewScript";
import { shortId } from "@/lib/format";

/**
 * Drives the interview console's conversation state.
 *
 * IMPORTANT — this is a local mock. It reproduces the request/response shape
 * of `POST /api/interview` from `technical-spec.md` so the eventual API
 * integration is a swap of `sendTurn` internals only:
 *
 *   start:  POST /api/interview { sessionId, candidate }        -> { reply, done }
 *   turn:   POST /api/interview { sessionId, message }          -> { reply, done, feedback? }
 *
 * No network calls happen here yet, per scope.
 */
export function useInterviewSession(candidate: Candidate) {
  const [sessionId] = useState(() => shortId("sess"));
  const [status, setStatus] = useState<InterviewSessionStatus>("idle");
  const [messages, setMessages] = useState<InterviewMessage[]>([]);
  const [feedback, setFeedback] = useState<InterviewFeedback | undefined>();
  const [isAgentTyping, setIsAgentTyping] = useState(false);
  const turnIndex = useRef(0);
  // Guards against React StrictMode's dev-only double-invoke of mount effects:
  // two synchronous calls to `start()` would otherwise both read the same
  // stale `status === "idle"` closure (before either state update flushes)
  // and each schedule a welcome message, producing a duplicate. A ref is
  // checked/set synchronously, unlike state, so it survives the double call.
  const hasStarted = useRef(false);

  const pushMessage = useCallback((role: InterviewMessage["role"], content: string) => {
    setMessages((prev) => [
      ...prev,
      { id: shortId("msg"), role, content, timestamp: new Date().toISOString() },
    ]);
  }, []);

  const start = useCallback(() => {
    if (hasStarted.current) return;
    hasStarted.current = true;
    setStatus("live");
    setIsAgentTyping(true);

    // TODO(api): replace with POST /api/interview { sessionId, candidate }
    window.setTimeout(() => {
      pushMessage(
        "agent",
        `Welcome, ${candidate.member.name.split(" ")[0]}. I'm your NEXUS interviewer for the ${candidate.member.jobRole} track. This will be a short, conversational session — answer as you would in a real technical discussion.`
      );
      setIsAgentTyping(false);
    }, 900);
  }, [candidate, pushMessage]);

  const sendTurn = useCallback(
    (message: string) => {
      if (status !== "live" || !message.trim()) return;
      pushMessage("candidate", message.trim());
      setIsAgentTyping(true);

      // TODO(api): replace with POST /api/interview { sessionId, message }
      window.setTimeout(() => {
        const nextIndex = turnIndex.current;
        const isLastTurn = nextIndex >= MOCK_AGENT_SCRIPT.length;

        if (isLastTurn) {
          pushMessage("agent", MOCK_CLOSING_REPLY);
          setFeedback(buildMockFeedback(candidate.member.jobRole));
          setStatus("complete");
        } else {
          pushMessage("agent", MOCK_AGENT_SCRIPT[nextIndex]!);
          turnIndex.current += 1;
        }
        setIsAgentTyping(false);
      }, 1100);
    },
    [candidate.member.jobRole, pushMessage, status]
  );

  const turnsTotal = MOCK_AGENT_SCRIPT.length + 1;
  const turnsCompleted = Math.min(turnIndex.current, MOCK_AGENT_SCRIPT.length);

  return {
    sessionId,
    status,
    messages,
    feedback,
    isAgentTyping,
    start,
    sendTurn,
    turnsCompleted,
    turnsTotal,
  };
}
