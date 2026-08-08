import type { CompletedInterviewSession } from "@/types/assessment";

const keyFor = (candidateId: string) => `nexus.completed-interview.${candidateId}`;

export function saveCompletedSession(session: CompletedInterviewSession) {
  window.sessionStorage.setItem(keyFor(session.candidateId), JSON.stringify(session));
}

export function getCompletedSession(candidateId: string): CompletedInterviewSession | undefined {
  try {
    const saved = window.sessionStorage.getItem(keyFor(candidateId));
    return saved ? (JSON.parse(saved) as CompletedInterviewSession) : undefined;
  } catch {
    return undefined;
  }
}

export function clearCompletedSession(candidateId: string) {
  window.sessionStorage.removeItem(keyFor(candidateId));
}
