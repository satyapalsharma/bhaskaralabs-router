// Context-engine flags — compression pipeline controls.
// Both features are opt-in (default OFF) via header or env:
//   x-bhaskara-compress: 1        → live-zone compression (deterministic transforms)
//   x-bhaskara-compact: 1         → 200K threshold compact (summarize first 100K)
// Headers win over env; env sets the account-wide default.

export function compressEnabled(headerValue: string | undefined | null): boolean {
  const v = (headerValue ?? "").trim().toLowerCase();
  if (v === "1" || v === "true" || v === "on") return true;
  if (v === "0" || v === "false" || v === "off") return false;
  return process.env.BHASKARA_COMPRESS === "1";
}

export function compactEnabled(headerValue: string | undefined | null): boolean {
  const v = (headerValue ?? "").trim().toLowerCase();
  if (v === "1" || v === "true" || v === "on") return true;
  if (v === "0" || v === "false" || v === "off") return false;
  return process.env.BHASKARA_COMPACT === "1";
}