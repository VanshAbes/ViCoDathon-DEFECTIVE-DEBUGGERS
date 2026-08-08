import type { ReactNode } from "react";
import { Panel, PanelBody, PanelHeader } from "@/components/ui/Panel";

export function AssessmentSection({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <Panel>
      <PanelHeader eyebrow={eyebrow} title={title} />
      <PanelBody>{children}</PanelBody>
    </Panel>
  );
}

export function PendingAssessmentContent({ label = "Assessment data" }: { label?: string }) {
  return (
    <div className="border-l border-cyan/35 bg-cyan-dim/30 px-3 py-3 text-xs leading-relaxed text-ink-secondary">
      <span className="font-mono uppercase tracking-widest text-2xs text-cyan">Pending backend data</span>
      <p className="mt-1">{label} will appear here when the final assessment is available.</p>
    </div>
  );
}
