import type { InterviewMessage } from "@/types/interview";
import { formatTimestamp } from "@/lib/format";
import { cn } from "@/lib/cn";

export function MessageBubble({ message }: { message: InterviewMessage }) {
  const isAgent = message.role === "agent";

  return (
    <div className={cn("flex animate-fade-up gap-3", isAgent ? "flex-row" : "flex-row-reverse")}>
      <div
        className={cn(
          "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border font-mono text-[10px] font-semibold",
          isAgent ? "border-cyan/30 bg-cyan-dim text-cyan" : "border-violet/30 bg-violet-dim text-violet-soft"
        )}
      >
        {isAgent ? "AI" : "YOU"}
      </div>

      <div className={cn("max-w-[70%] space-y-1", isAgent ? "items-start" : "items-end")}>
        <div
          className={cn(
            "rounded-md border px-3.5 py-2.5 text-sm leading-relaxed",
            isAgent
              ? "border-line-subtle bg-graphite text-ink-primary"
              : "border-cyan/20 bg-cyan-dim text-ink-primary"
          )}
        >
          {message.content}
        </div>
        <div className={cn("font-mono text-2xs text-ink-disabled", isAgent ? "text-left" : "text-right")}>
          {formatTimestamp(message.timestamp)}
        </div>
      </div>
    </div>
  );
}

export function TypingIndicator() {
  return (
    <div className="flex animate-fade-up items-center gap-3">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-cyan/30 bg-cyan-dim font-mono text-[10px] font-semibold text-cyan">
        AI
      </div>
      <div className="flex items-center gap-1 rounded-md border border-line-subtle bg-graphite px-3.5 py-3">
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-ink-tertiary [animation-delay:-0.2s]" />
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-ink-tertiary [animation-delay:-0.1s]" />
        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-ink-tertiary" />
      </div>
    </div>
  );
}
