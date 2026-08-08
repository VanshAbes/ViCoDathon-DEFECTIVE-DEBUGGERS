import type { HTMLAttributes, ReactNode } from "react";
import { cn } from "@/lib/cn";

export function Panel({
  children,
  className,
  raised = false,
  ...props
}: HTMLAttributes<HTMLDivElement> & { children: ReactNode; raised?: boolean }) {
  return (
    <div className={cn(raised ? "panel-raised" : "panel", className)} {...props}>
      {children}
    </div>
  );
}

export function PanelHeader({
  title,
  eyebrow,
  action,
  className,
}: {
  title: ReactNode;
  eyebrow?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex items-center justify-between gap-3 px-4 py-3", className)}>
      <div className="min-w-0">
        {eyebrow && <div className="label-overline mb-1">{eyebrow}</div>}
        <div className="truncate text-sm font-semibold text-ink-primary">{title}</div>
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function PanelBody({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("px-4 pb-4", className)}>{children}</div>;
}
