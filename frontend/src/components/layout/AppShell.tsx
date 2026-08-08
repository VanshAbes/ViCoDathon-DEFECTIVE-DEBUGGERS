import type { ReactNode } from "react";
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
      <div className="flex">
        <Sidebar />
        <div className="flex min-h-screen flex-1 flex-col">
          <Topbar breadcrumb={breadcrumb} actions={actions} />
          <main className="flex-1 overflow-y-auto">{children}</main>
        </div>
      </div>
    </GridBackground>
  );
}
