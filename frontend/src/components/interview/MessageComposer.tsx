import { useState } from "react";
import type { KeyboardEvent } from "react";
import { Button } from "@/components/ui/Button";

export function MessageComposer({ onSend, disabled, activity = "idle" }: {
  onSend: (message: string) => void;
  disabled?: boolean;
  activity?: "idle" | "starting" | "waiting" | "generating";
}) {
  const [value, setValue] = useState("");
  const submit = () => {
    if (!value.trim() || disabled) return;
    onSend(value);
    setValue("");
  };
  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  };
  const placeholder = disabled
    ? activity === "generating" ? "Generating final assessment…" : "Waiting for the interviewer…"
    : "Compose your response…";

  return <div className="border-t border-line-hairline p-4">
    <div className="label-overline mb-2">Your Response</div>
    <div className="flex items-end gap-3 rounded-md border border-line-subtle bg-graphite p-2.5 transition-colors focus-within:border-cyan/60 focus-within:shadow-glow">
      <textarea value={value} onChange={(event) => setValue(event.target.value)} onKeyDown={handleKeyDown}
        disabled={disabled} rows={3} aria-label="Interview response" placeholder={placeholder}
        className="max-h-48 flex-1 resize-none bg-transparent px-2 py-1.5 text-sm leading-relaxed text-ink-primary placeholder:text-ink-tertiary outline-none disabled:opacity-40" />
      <Button variant="primary" size="md" onClick={submit} disabled={disabled || !value.trim()}>
        {activity === "waiting" ? "Sending…" : "Submit Answer"}
      </Button>
    </div>
    <div className="mt-1.5 px-1 font-mono text-2xs text-ink-disabled">Enter to submit · Shift + Enter for a new line</div>
  </div>;
}
