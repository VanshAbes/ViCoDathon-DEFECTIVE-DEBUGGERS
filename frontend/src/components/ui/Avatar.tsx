import { initials } from "@/lib/format";
import { cn } from "@/lib/cn";

const palette = [
  "bg-cyan-dim text-cyan border-cyan/25",
  "bg-violet-dim text-violet-soft border-violet/25",
];

function paletteFor(seed: string) {
  const sum = seed.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
  return palette[sum % palette.length];
}

export function Avatar({
  name,
  size = "md",
  className,
}: {
  name: string;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const dims = { sm: "h-7 w-7 text-2xs", md: "h-9 w-9 text-xs", lg: "h-12 w-12 text-sm" }[size];
  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center rounded-full border font-mono font-semibold",
        dims,
        paletteFor(name),
        className
      )}
    >
      {initials(name)}
    </div>
  );
}
