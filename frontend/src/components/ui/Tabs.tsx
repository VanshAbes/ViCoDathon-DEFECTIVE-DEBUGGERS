import { cn } from "@/lib/cn";

export interface TabItem {
  key: string;
  label: string;
  count?: number;
}

export function Tabs({
  items,
  active,
  onChange,
  className,
}: {
  items: TabItem[];
  active: string;
  onChange: (key: string) => void;
  className?: string;
}) {
  return (
    <div className={cn("inline-flex items-center gap-1 rounded-sm border border-line-subtle bg-graphite p-1", className)}>
      {items.map((item) => {
        const isActive = item.key === active;
        return (
          <button
            key={item.key}
            onClick={() => onChange(item.key)}
            className={cn(
              "flex items-center gap-1.5 rounded-xs px-3 py-1.5 text-xs font-medium transition-colors",
              isActive
                ? "bg-cyan-dim text-cyan"
                : "text-ink-secondary hover:text-ink-primary"
            )}
          >
            {item.label}
            {item.count !== undefined && (
              <span
                className={cn(
                  "rounded-full px-1.5 font-mono text-2xs",
                  isActive ? "bg-cyan/20 text-cyan" : "bg-white/[0.06] text-ink-tertiary"
                )}
              >
                {item.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
