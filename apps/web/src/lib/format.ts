/** Money, token counts and rates. One place, so every surface agrees. */

export function usd(n: number): string {
  if (n === 0) return "$0";
  if (Math.abs(n) >= 1000) return `$${n.toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  if (Math.abs(n) >= 1) return `$${n.toFixed(2)}`;
  if (Math.abs(n) >= 0.01) return `$${n.toFixed(4)}`;
  return `$${n.toFixed(6)}`;
}

/** Per-million-token rate, kept to the significant part. */
export function rate(n: number): string {
  if (n === 0) return "0";
  if (n < 0.01) return n.toFixed(4).replace(/0+$/, "").replace(/\.$/, "");
  if (n < 1) return n.toFixed(3).replace(/0+$/, "").replace(/\.$/, "");
  return n.toFixed(2);
}

export function tokens(n: number): string {
  return n.toLocaleString("en-US");
}

export function compactTokens(n: number): string {
  if (n >= 1e6) return `${(n / 1e6).toFixed(n % 1e6 === 0 ? 0 : 1)}M`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(n % 1e3 === 0 ? 0 : 1)}K`;
  return `${n}`;
}

export function percent(n: number, digits = 0): string {
  return `${n.toFixed(digits)}%`;
}
