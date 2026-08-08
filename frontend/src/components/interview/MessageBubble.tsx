import type { InterviewMessage } from "@/types/interview";
import { formatTimestamp } from "@/lib/format";
import { cn } from "@/lib/cn";

/**
 * Renders a single interview transcript entry. Deliberately styled as a
 * technical transcript (mono role label + accent rule) rather than a
 * chat-app bubble/avatar pair — both roles left-aligned, distinguished by
 * color and label only.
 */
export function MessageBubble({ message }: { message: InterviewMessage }) {
  const isAgent = message.role === "agent";

  return (
    <div className={cn("animate-fade-up border-l-2 py-0.5 pl-3.5", isAgent ? "border-cyan/40" : "border-violet/40")}>
      <div className="flex items-baseline gap-2.5">
        <span
          className={cn(
            "font-mono text-2xs font-semibold uppercase tracking-widest2",
            isAgent ? "text-cyan" : "text-violet-soft"
          )}
        >
          {isAgent ? "AI Interviewer" : "Your Response"}
        </span>
        <span className="font-mono text-2xs text-ink-disabled">{formatTimestamp(message.timestamp)}</span>
      </div>
      <p className="mt-1 max-w-2xl text-sm leading-relaxed text-ink-primary">{message.content}</p>
    </div>
  );
}

export function TypingIndicator() {
  return (
    <div className="animate-fade-up border-l-2 border-cyan/40 py-0.5 pl-3.5">
      <div className="flex items-baseline gap-2.5">
        <span className="font-mono text-2xs font-semibold uppercase tracking-widest2 text-cyan">AI Interviewer</span>
      </div>
      <div className="mt-1 flex items-center gap-2">
        <span className="font-mono text-sm text-ink-tertiary">Formulating question</span>
        <span className="h-3.5 w-[2px] animate-blink bg-cyan" />
      </div>
    </div>
  );
}
