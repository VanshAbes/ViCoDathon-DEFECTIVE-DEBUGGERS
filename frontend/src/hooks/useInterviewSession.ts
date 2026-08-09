import { useCallback, useRef, useState } from "react";
import type { Candidate } from "@/types/candidate";
import type { InterviewActivity, InterviewMessage, InterviewSessionError, InterviewSessionStatus, InterviewFeedback } from "@/types/interview";
import { MOCK_AGENT_SCRIPT, MOCK_CLOSING_REPLY, buildMockFeedback } from "@/data/mockInterviewScript";
import { shortId } from "@/lib/format";
import { InterviewApiError, postInterview } from "@/lib/interviewApi";

const DEFAULT_MIN_API_TURNS = 8;

/**
 * Drives the interview console's conversation state.
 *
 * Supports two transports:
 *   - source="api":  calls the real backend via `postInterview()`.
 *        start:  POST /api/interview { sessionId, candidate }  -> { reply, done, questionNumber? }
 *        turn:   POST /api/interview { sessionId, message }    -> { reply, done, questionNumber?, feedback? }
 *   - source="mock": local, deterministic script (kept as a fallback).
 *
 * The single `sessionId` is generated once and reused for every request so
 * the backend's in-memory store keeps this session's continuity.
 */
export function useInterviewSession(candidate: Candidate, source: "mock" | "api" = "mock") {
  const [sessionId] = useState(() => shortId("sess"));
  const [status, setStatus] = useState<InterviewSessionStatus>("idle");
  const [messages, setMessages] = useState<InterviewMessage[]>([]);
  const [feedback, setFeedback] = useState<InterviewFeedback | undefined>();
  const [isAgentTyping, setIsAgentTyping] = useState(false);
  const [activity, setActivity] = useState<InterviewActivity>("idle");
  const [error, setError] = useState<InterviewSessionError | undefined>();
  const [questionNumber, setQuestionNumber] = useState(0);
  const turnIndex = useRef(0);
  const timers = useRef<number[]>([]);
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

  const schedule = useCallback((callback: () => void, delay: number) => {
    const timer = window.setTimeout(() => {
      timers.current = timers.current.filter((id) => id !== timer);
      callback();
    }, delay);
    timers.current.push(timer);
  }, []);

  const fail = useCallback((reason: unknown) => {
    const message = reason instanceof InterviewApiError ? reason.message : "The interview session could not continue.";
    setError({ message, retryable: true });
    setStatus("error");
    setIsAgentTyping(false);
    setActivity("idle");
  }, []);

  const applyApiResponse = useCallback(
    (response: { reply: string; done: boolean; questionNumber?: number; feedback?: InterviewFeedback }) => {
      pushMessage("agent", response.reply);
      if (typeof response.questionNumber === "number") setQuestionNumber(response.questionNumber);
      if (response.feedback) setFeedback(response.feedback);
      setIsAgentTyping(false);
      if (response.done) {
        setActivity("generating");
        setStatus("complete");
      } else {
        setActivity("waiting");
      }
    },
    [pushMessage]
  );

  const start = useCallback(() => {
    if (hasStarted.current) return;
    hasStarted.current = true;
    setStatus("live");
    setError(undefined);
    setActivity("starting");
    setIsAgentTyping(true);

    if (source === "api") {
      void postInterview({ sessionId, candidate }).then(applyApiResponse).catch(fail);
      return;
    }

    // Mock path: seeded welcome message.
    schedule(() => {
      pushMessage(
        "agent",
        `Welcome, ${candidate.member.name.split(" ")[0]}. I'm your NEXUS interviewer for the ${candidate.member.jobRole} track. This will be a short, conversational session — answer as you would in a real technical discussion.`
      );
      setIsAgentTyping(false);
      setActivity("waiting");
    }, 900);
  }, [applyApiResponse, candidate, fail, pushMessage, schedule, sessionId, source]);

  const sendTurn = useCallback(
    (message: string) => {
      if (status !== "live" || !message.trim()) return;
      pushMessage("candidate", message.trim());
      setIsAgentTyping(true);
      setActivity("submitting");

      if (source === "api") {
        void postInterview({ sessionId, message: message.trim() }).then(applyApiResponse).catch(fail);
        return;
      }

      // Mock path: step through the deterministic script.
      schedule(() => {
        const nextIndex = turnIndex.current;
        const isLastTurn = nextIndex >= MOCK_AGENT_SCRIPT.length;

        if (isLastTurn) {
          setActivity("generating");
          pushMessage("agent", MOCK_CLOSING_REPLY);
          setFeedback(buildMockFeedback(candidate.member.jobRole));
          setStatus("complete");
        } else {
          pushMessage("agent", MOCK_AGENT_SCRIPT[nextIndex]!);
          turnIndex.current += 1;
          setActivity("waiting");
        }
        setIsAgentTyping(false);
      }, 1100);
    },
    [applyApiResponse, candidate.member.jobRole, fail, pushMessage, schedule, sessionId, source, status]
  );

  // Progress counters. In API mode the backend drives the count via its
  // `questionNumber`; in mock mode we use the fixed mock script length.
  const turnsTotal = source === "api" ? Math.max(DEFAULT_MIN_API_TURNS, questionNumber) : MOCK_AGENT_SCRIPT.length + 1;
  const turnsCompleted = source === "api" ? questionNumber : Math.min(turnIndex.current, MOCK_AGENT_SCRIPT.length);

  return {
    sessionId,
    status,
    messages,
    feedback,
    activity,
    error,
    source,
    isAgentTyping,
    start,
    sendTurn,
    turnsCompleted,
    turnsTotal,
  };
}
