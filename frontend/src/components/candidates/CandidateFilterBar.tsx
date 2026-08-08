import { Input } from "@/components/ui/Input";
import { Tabs, type TabItem } from "@/components/ui/Tabs";
import type { ReadinessTier } from "@/lib/curriculum";

export type ReadinessFilter = ReadinessTier | "all";

const filterItems: TabItem[] = [
  { key: "all", label: "All" },
  { key: "elite", label: "Elite" },
  { key: "strong", label: "Strong" },
  { key: "watch", label: "Watch" },
  { key: "at-risk", label: "At risk" },
];

export function CandidateFilterBar({
  query,
  onQueryChange,
  filter,
  onFilterChange,
}: {
  query: string;
  onQueryChange: (v: string) => void;
  filter: ReadinessFilter;
  onFilterChange: (v: ReadinessFilter) => void;
}) {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <Input
        value={query}
        onChange={(e) => onQueryChange(e.target.value)}
        placeholder="Search by name or role…"
        className="sm:w-72"
        iconLeft={<SearchIcon />}
      />
      <Tabs items={filterItems} active={filter} onChange={(k) => onFilterChange(k as ReadinessFilter)} />
    </div>
  );
}

function SearchIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
      <circle cx="11" cy="11" r="7" stroke="currentColor" strokeWidth="1.8" />
      <path d="m21 21-3.5-3.5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}
