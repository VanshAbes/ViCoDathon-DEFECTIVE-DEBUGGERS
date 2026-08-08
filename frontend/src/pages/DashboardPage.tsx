import { useMemo, useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { Breadcrumb } from "@/components/layout/Topbar";
import { MetricStat } from "@/components/ui/MetricStat";
import { Panel } from "@/components/ui/Panel";
import { CandidateFilterBar, type ReadinessFilter } from "@/components/candidates/CandidateFilterBar";
import { CandidateRow } from "@/components/candidates/CandidateRow";
import { useCandidates } from "@/hooks/useCandidates";
import { readinessTier } from "@/lib/curriculum";

export function DashboardPage() {
  const roster = useCandidates();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<ReadinessFilter>("all");

  const filtered = useMemo(() => {
    return roster.filter(({ candidate, scorecard }) => {
      const matchesQuery =
        !query.trim() ||
        candidate.member.name.toLowerCase().includes(query.toLowerCase()) ||
        candidate.member.jobRole.toLowerCase().includes(query.toLowerCase());
      const matchesFilter = filter === "all" || readinessTier(scorecard.readinessIndex) === filter;
      return matchesQuery && matchesFilter;
    });
  }, [roster, query, filter]);

  const avgReadiness = Math.round(
    roster.reduce((sum, r) => sum + r.scorecard.readinessIndex, 0) / (roster.length || 1)
  );
  const completedCount = roster.filter((r) => r.candidate.member.status === "COMPLETED").length;
  const atRiskCount = roster.filter((r) => readinessTier(r.scorecard.readinessIndex) === "at-risk").length;

  return (
    <AppShell breadcrumb={<Breadcrumb items={["Command Center"]} />}>
      <div className="mx-auto max-w-7xl space-y-6 p-6">
        <div>
          <h1 className="text-xl font-semibold text-ink-primary">Candidate Command Center</h1>
          <p className="mt-1 text-sm text-ink-secondary">
            Cohort roster, program signals, and interview readiness at a glance.
          </p>
        </div>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <MetricStat label="Total Candidates" value={roster.length} accent="neutral" />
          <MetricStat label="Program Complete" value={completedCount} suffix={`/ ${roster.length}`} accent="cyan" />
          <MetricStat label="Avg. Readiness" value={avgReadiness} suffix="/ 100" accent="violet" />
          <MetricStat label="At Risk" value={atRiskCount} accent="neutral" />
        </div>

        <Panel>
          <div className="p-4">
            <CandidateFilterBar query={query} onQueryChange={setQuery} filter={filter} onFilterChange={setFilter} />
          </div>

          <div className="divider-hairline" />

          <div className="hidden grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1.4fr)_auto_auto] gap-4 px-4 py-2.5 text-2xs uppercase tracking-wide text-ink-tertiary md:grid">
            <span>Candidate</span>
            <span>Status</span>
            <span>Mission History</span>
            <span>Readiness</span>
            <span className="text-right">Actions</span>
          </div>

          <div>
            {filtered.map((entry) => (
              <CandidateRow key={entry.candidate.member.id} {...entry} />
            ))}
            {filtered.length === 0 && (
              <div className="px-4 py-10 text-center text-sm text-ink-tertiary">
                No candidates match this filter.
              </div>
            )}
          </div>
        </Panel>
      </div>
    </AppShell>
  );
}
