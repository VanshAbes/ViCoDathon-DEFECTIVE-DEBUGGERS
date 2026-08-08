import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { formatClockTime } from "@/lib/format";
import { StatusReadout } from "@/components/ui/StatusDot";

export function Topbar({
  breadcrumb,
  actions,
}: {
  breadcrumb: ReactNode;
  actions?: ReactNode;
}) {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(t);
  }, []);

  return (
    <header className="flex h-14 shrink-0 items-center justify-between border-b border-line-hairline bg-obsidian/80 px-6 backdrop-blur">
      <div className="flex items-center gap-2 text-sm">{breadcrumb}</div>

      <div className="flex items-center gap-5">
        {actions}
        <div className="hidden items-center gap-4 border-l border-line-hairline pl-5 sm:flex">
          <StatusReadout label="LIVE" tone="cyan" pulse />
          <span className="font-mono text-2xs tabular-nums text-ink-tertiary">
            {formatClockTime(now)}
          </span>
        </div>
      </div>
    </header>
  );
}

export function Breadcrumb({ items }: { items: string[] }) {
  return (
    <div className="flex items-center gap-2 font-mono text-xs">
      {items.map((item, i) => (
        <span key={item} className="flex items-center gap-2">
          {i > 0 && <span className="text-ink-disabled">/</span>}
          <span className={i === items.length - 1 ? "text-ink-primary" : "text-ink-tertiary"}>
            {item}
          </span>
        </span>
      ))}
    </div>
  );
}
