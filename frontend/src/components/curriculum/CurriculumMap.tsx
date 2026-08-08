import { Panel, PanelHeader, PanelBody } from "@/components/ui/Panel";
import { Badge } from "@/components/ui/Badge";
import { ModuleNode } from "./ModuleNode";
import { CoverageIndicator } from "./CoverageIndicator";
import { curriculum } from "@/lib/curriculum";
import type { CurriculumCoverage, CurriculumDayState } from "@/types/curriculumCoverage";

/**
 * F4 — compact curriculum visualization for the F3 interview console.
 *
 * Renders the real 31-day / 8-module program from `curriculum.json` as an
 * "assessment map": every day is colored by exploration state — NOT
 * EXPLORED / CURRENT / EXPLORED — never by mastery, score, or pass/fail.
 *
 * `coverage` is currently produced locally by `useMockCurriculumCoverage`
 * (see the `isMock` badge below). Once the interview endpoint returns real
 * `coveredDays` / `currentDay` / `coveredTopics`, pass that through instead —
 * this component's props and rendering are already shaped for it.
 */
export function CurriculumMap({
  coverage,
  isMock = false,
}: {
  coverage: CurriculumCoverage;
  isMock?: boolean;
}) {
  return (
    <Panel>
      <PanelHeader
        eyebrow={curriculum.cohort}
        title="Curriculum Map"
        action={
          isMock ? (
            <span title="Coverage is simulated locally until the interview API returns real data">
              <Badge tone="idle">Mock Coverage</Badge>
            </span>
          ) : undefined
        }
      />
      <PanelBody className="space-y-3">
        <CoverageIndicator coverage={coverage} />

        <div className="divider-hairline" />

        <div className="space-y-1.5">
          {curriculum.modules.map((m) => (
            <ModuleNode key={m.n} module={m} coverage={coverage} />
          ))}
        </div>

        <div className="divider-hairline" />

        <CurriculumMapLegend />
      </PanelBody>
    </Panel>
  );
}

const legendItems: { state: CurriculumDayState; label: string; swatchClassName: string }[] = [
  { state: "not-explored", label: "Not explored", swatchClassName: "border border-line-subtle bg-white/[0.04]" },
  { state: "current", label: "Current", swatchClassName: "border border-cyan/60 bg-cyan-dim" },
  { state: "explored", label: "Explored", swatchClassName: "border border-violet/30 bg-violet-dim" },
];

function CurriculumMapLegend() {
  return (
    <div className="space-y-1.5">
      <div className="flex flex-wrap items-center gap-3 text-2xs text-ink-tertiary">
        {legendItems.map((item) => (
          <div key={item.state} className="flex items-center gap-1.5">
            <span className={`h-2.5 w-2.5 rounded-[2px] ${item.swatchClassName}`} />
            {item.label}
          </div>
        ))}
      </div>
      <p className="text-2xs leading-relaxed text-ink-disabled">
        Reflects what this interview has covered so far — not mastery or score.
      </p>
    </div>
  );
}
