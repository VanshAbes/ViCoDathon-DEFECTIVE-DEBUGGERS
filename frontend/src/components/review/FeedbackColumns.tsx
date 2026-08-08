import type { ReactNode } from "react";
import { Panel, PanelHeader, PanelBody } from "@/components/ui/Panel";
import type { InterviewFeedback } from "@/types/interview";

export function FeedbackColumns({ feedback }: { feedback: InterviewFeedback }) {
  return (
    <div className="grid grid-cols-1 gap-4 p-6 lg:grid-cols-3">
      <FeedbackColumn
        title="Strengths"
        eyebrow="Observed"
        tone="pass"
        icon={<CheckIcon />}
        items={feedback.strengths}
      />
      <FeedbackColumn
        title="Gaps"
        eyebrow="Watch items"
        tone="warn"
        icon={<AlertIcon />}
        items={feedback.gaps}
      />
      <FeedbackColumn
        title="Next Steps"
        eyebrow="Recommended"
        tone="cyan"
        icon={<ArrowIcon />}
        items={feedback.next}
      />
    </div>
  );
}

function FeedbackColumn({
  title,
  eyebrow,
  tone,
  icon,
  items,
}: {
  title: string;
  eyebrow: string;
  tone: "pass" | "warn" | "cyan";
  icon: ReactNode;
  items: string[];
}) {
  const dotClass = { pass: "bg-signal-pass", warn: "bg-signal-warn", cyan: "bg-cyan" }[tone];
  const iconClass = { pass: "text-signal-pass", warn: "text-signal-warn", cyan: "text-cyan" }[tone];

  return (
    <Panel>
      <PanelHeader eyebrow={eyebrow} title={title} action={<span className={iconClass}>{icon}</span>} />
      <PanelBody>
        <ul className="space-y-2.5">
          {items.map((item, i) => (
            <li key={i} className="flex items-start gap-2.5 text-sm leading-relaxed text-ink-secondary">
              <span className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${dotClass}`} />
              {item}
            </li>
          ))}
        </ul>
      </PanelBody>
    </Panel>
  );
}

function CheckIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
      <path d="M20 6 9 17l-5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function AlertIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
      <path
        d="M12 9v4m0 4h.01M10.3 3.9 1.8 18a1.5 1.5 0 0 0 1.3 2.2h17.8a1.5 1.5 0 0 0 1.3-2.2L13.7 3.9a1.5 1.5 0 0 0-2.6 0Z"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
function ArrowIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
      <path d="M5 12h14m0 0-6-6m6 6-6 6" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
