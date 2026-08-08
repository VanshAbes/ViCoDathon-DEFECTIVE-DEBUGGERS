import { Badge } from "@/components/ui/Badge";
import { readinessTier, READINESS_TIER_LABEL, type ReadinessTier } from "@/lib/curriculum";
import { cn } from "@/lib/cn";

const tierTone: Record<ReadinessTier, "cyan" | "pass" | "warn" | "fail"> = {
  elite: "cyan",
  strong: "pass",
  watch: "warn",
  "at-risk": "fail",
};

export function ReadinessBadge({ index, className }: { index: number; className?: string }) {
  const tier = readinessTier(index);
  return (
    <div className={cn("flex items-center gap-2", className)}>
      <span className="font-mono text-sm font-semibold tabular-nums text-ink-primary">{index}</span>
      <Badge tone={tierTone[tier]}>{READINESS_TIER_LABEL[tier]}</Badge>
    </div>
  );
}
