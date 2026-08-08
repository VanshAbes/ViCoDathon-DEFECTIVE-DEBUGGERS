import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { GridBackground } from "@/components/ui/GridBackground";

export function AppShell({
  breadcrumb,
  actions,
  children,
}: {
  breadcrumb: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <GridBackground>
      <div className="flex min-w-0">
        <Sidebar />
        <div className="flex min-h-screen min-w-0 flex-1 flex-col">
          <Topbar breadcrumb={breadcrumb} actions={actions} />
          <nav aria-label="Primary" className="flex gap-1 overflow-x-auto border-b border-line-hairline px-3 py-2 md:hidden">
            <MobileNavLink to="/" label="Command Center" />
            <MobileNavLink to="/interviews" label="Interviews" />
            <MobileNavLink to="/reports" label="Reports" />
          </nav>
          <main className="flex-1 overflow-y-auto">{children}</main>
        </div>
      </div>
    </GridBackground>
  );
}

function MobileNavLink({ to, label }: { to: string; label: string }) {
  return <NavLink to={to} end={to === "/"} className={({ isActive }) => `shrink-0 rounded-sm px-3 py-1.5 font-mono text-2xs ${isActive ? "bg-cyan-dim text-cyan" : "text-ink-tertiary"}`}>{label}</NavLink>;
}
