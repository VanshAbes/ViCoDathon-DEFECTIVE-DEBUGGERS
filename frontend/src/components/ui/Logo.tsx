import { cn } from "@/lib/cn";

export function Logo({ className, compact = false }: { className?: string; compact?: boolean }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <svg width="20" height="20" viewBox="0 0 32 32" fill="none" className="shrink-0">
        <rect width="32" height="32" rx="6" className="fill-graphite-raised" />
        <path
          d="M9 22V10l14 12V10"
          stroke="#2FE6FF"
          strokeWidth="2.4"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {!compact && (
        <div className="flex items-baseline gap-1.5 leading-none">
          <span className="text-[13px] font-bold tracking-tight text-ink-primary">NEXUS</span>
          <span className="font-mono text-[10px] uppercase tracking-widest2 text-ink-tertiary">
            // Interview Command
          </span>
        </div>
      )}
    </div>
  );
}
