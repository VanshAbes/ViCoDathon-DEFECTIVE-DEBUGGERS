import { readinessTier, READINESS_TIER_LABEL } from "@/lib/curriculum";

const toneColor: Record<string, string> = {
  elite: "#2FE6FF",
  strong: "#34D399",
  watch: "#F5B84B",
  "at-risk": "#F1596A",
};

export function ScoreRing({ value, size = 120 }: { value: number; size?: number }) {
  const radius = (size - 12) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - value / 100);
  const tier = readinessTier(value);
  const color = toneColor[tier];

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="rgba(148,163,184,0.12)"
          strokeWidth={8}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={8}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: "stroke-dashoffset 0.8s ease-out", filter: `drop-shadow(0 0 8px ${color}66)` }}
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className="font-mono text-3xl font-semibold tabular-nums text-ink-primary">{value}</span>
        <span className="font-mono text-2xs uppercase tracking-widest2" style={{ color }}>
          {READINESS_TIER_LABEL[tier]}
        </span>
      </div>
    </div>
  );
}
