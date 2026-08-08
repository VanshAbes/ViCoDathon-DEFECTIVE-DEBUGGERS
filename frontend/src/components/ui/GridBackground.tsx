import type { ReactNode } from "react";

/**
 * Full-bleed technical grid + vignette used behind the app shell.
 * Purely decorative — sits at z-0, content renders above it.
 */
export function GridBackground({ children }: { children?: ReactNode }) {
  return (
    <div className="relative min-h-screen bg-command-grid">
      <div className="pointer-events-none absolute inset-0 bg-grid-fade" />
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-b from-transparent via-transparent to-void/60" />
      <div className="relative z-10">{children}</div>
    </div>
  );
}
