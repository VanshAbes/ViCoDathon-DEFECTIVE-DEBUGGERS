import { NavLink } from "react-router-dom";
import { Logo } from "@/components/ui/Logo";
import { cn } from "@/lib/cn";

const navItems = [
  { to: "/", label: "Command Center", icon: GridIcon },
  { to: "/interviews", label: "Interviews", icon: PulseIcon },
  { to: "/reports", label: "Reports", icon: DocIcon },
];

export function Sidebar() {
  return (
    <aside className="print-hidden hidden h-screen w-60 shrink-0 flex-col border-r border-line-hairline bg-obsidian-shell/60 px-3 py-4 md:flex">
      <div className="px-2 pb-6">
        <Logo />
      </div>

      <nav className="flex flex-1 flex-col gap-1">
        {navItems.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end={to === "/"}
            className={({ isActive }) =>
              cn(
                "group flex items-center gap-2.5 rounded-sm px-3 py-2 text-sm transition-colors",
                isActive
                  ? "bg-cyan-dim text-cyan"
                  : "text-ink-secondary hover:bg-white/[0.03] hover:text-ink-primary"
              )
            }
          >
            {({ isActive }) => (
              <>
                <Icon className={cn("h-4 w-4", isActive ? "text-cyan" : "text-ink-tertiary group-hover:text-ink-secondary")} />
                {label}
              </>
            )}
          </NavLink>
        ))}
      </nav>

      <div className="mt-auto space-y-3 px-2 pt-4">
        <div className="divider-hairline" />
        <div className="flex items-center gap-2 font-mono text-2xs text-ink-tertiary">
          <span className="inline-flex h-1.5 w-1.5 rounded-full bg-signal-pass" />
          ALL SYSTEMS NOMINAL
        </div>
        <div className="font-mono text-2xs text-ink-disabled">BUILD 0.1.0-ARCH</div>
      </div>
    </aside>
  );
}

function GridIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <rect x="3" y="3" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="1.6" />
      <rect x="14" y="3" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="1.6" />
      <rect x="3" y="14" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="1.6" />
      <rect x="14" y="14" width="7" height="7" rx="1" stroke="currentColor" strokeWidth="1.6" />
    </svg>
  );
}

function PulseIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <path
        d="M3 12h4l2 7 4-14 2 7h6"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function DocIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className}>
      <path
        d="M7 3h7l4 4v14a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path d="M9 12h6M9 16h6M9 8h3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
