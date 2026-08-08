import { useState } from "react";
import type { KeyboardEvent } from "react";
import { Button } from "@/components/ui/Button";

export function MessageComposer({
  onSend,
  disabled,
}: {
  onSend: (message: string) => void;
  disabled?: boolean;
}) {
  const [value, setValue] = useState("");

  function submit() {
    if (!value.trim() || disabled) return;
    onSend(value);
    setValue("");
  }

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  }

  return (
    <div className="border-t border-line-hairline p-4">
      <div className="flex items-end gap-3 rounded-md border border-line-subtle bg-graphite p-2 focus-within:border-cyan/50">
        <textarea
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          rows={1}
          placeholder={disabled ? "Interview complete." : "Type your response…"}
          className="max-h-32 flex-1 resize-none bg-transparent px-2 py-1.5 text-sm text-ink-primary placeholder:text-ink-tertiary outline-none disabled:opacity-40"
        />
        <Button variant="primary" size="md" onClick={submit} disabled={disabled || !value.trim()}>
          Send
        </Button>
      </div>
      <div className="mt-1.5 px-1 font-mono text-2xs text-ink-disabled">
        Enter to send · Shift + Enter for a new line
      </div>
    </div>
  );
}
