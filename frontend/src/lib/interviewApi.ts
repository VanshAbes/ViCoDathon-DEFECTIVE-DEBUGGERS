import type { InterviewRequest, InterviewResponse } from "@/types/interview";

export type InterviewApiErrorKind = "unavailable" | "timeout" | "request" | "malformed";

export class InterviewApiError extends Error {
  constructor(public readonly kind: InterviewApiErrorKind, message: string) {
    super(message);
    this.name = "InterviewApiError";
  }
}

const baseUrl = (import.meta.env.VITE_API_BASE_URL ?? "").replace(/\/$/, "");

function isInterviewResponse(value: unknown): value is InterviewResponse {
  if (!value || typeof value !== "object") return false;
  const response = value as Partial<InterviewResponse>;
  return typeof response.reply === "string" && typeof response.done === "boolean";
}

/** Future transport for the documented endpoint. The app remains mock-driven until integration is enabled. */
export async function postInterview(request: InterviewRequest, timeoutMs = 15_000): Promise<InterviewResponse> {
  if (!baseUrl) throw new InterviewApiError("unavailable", "Interview service is not configured.");

  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(`${baseUrl}/api/interview`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
      signal: controller.signal,
    });
    if (!response.ok) throw new InterviewApiError("request", "The interview service could not process this request.");
    const body: unknown = await response.json();
    if (!isInterviewResponse(body)) throw new InterviewApiError("malformed", "The interview service returned an invalid response.");
    return body;
  } catch (error) {
    if (error instanceof InterviewApiError) throw error;
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new InterviewApiError("timeout", "The interview service took too long to respond.");
    }
    throw new InterviewApiError("unavailable", "The interview service is unavailable. Please try again.");
  } finally {
    window.clearTimeout(timeout);
  }
}
