type ClassValue = string | number | null | false | undefined | ClassValue[];

function flatten(input: ClassValue, out: string[]) {
  if (!input && input !== 0) return;
  if (Array.isArray(input)) {
    input.forEach((v) => flatten(v, out));
    return;
  }
  out.push(String(input));
}

/** Minimal `clsx`-style class name combinator — no dependency needed for this scope. */
export function cn(...inputs: ClassValue[]): string {
  const out: string[] = [];
  inputs.forEach((i) => flatten(i, out));
  return out.join(" ");
}
