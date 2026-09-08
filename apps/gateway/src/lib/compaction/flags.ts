// Context-engine flags — compression pipeline controls.
// Resolution order (first explicit wins): request header → per-key flags column → env.
//   x-bhaskara-compress: 1|0     → live-zone compression (deterministic transforms)
//   x-bhaskara-compact: 1|debug  → 200K threshold compact (summarize first 100K)
//   x-bhaskara-shadow: 1|0       → shadow mode: run pipeline on a copy, forward
//                                  ORIGINAL upstream, ledger-tag would-be savings
//                                  + keep-audit (measure-before-enable, zero risk)
// Per-key flags live in api_keys.flags (CSV): "compress", "compact", "compress,compact", "shadow", "docs".

export type CompactionFlags = { compress: boolean; compact: boolean; compactDebug: boolean; shadow: boolean; docs: boolean };

function parseTriValue(v: string | null | undefined): boolean | null {
  if (v === undefined || v === null || v === "") return null;
  const s = v.trim().toLowerCase();
  if (s === "1" || s === "true" || s === "on" || s === "debug") return true;
  if (s === "0" || s === "false" || s === "off") return false;
  return null;
}

export function resolveFlags(
  headers: Headers,
  keyFlags: string | null,
): CompactionFlags {
  const set = new Set((keyFlags ?? "").split(",").map((s) => s.trim().toLowerCase()).filter(Boolean));
  const compress = parseTriValue(headers.get("x-bhaskara-compress"))
    ?? parseTriValue(process.env.BHASKARA_COMPRESS === "1" ? "1" : undefined)
    ?? set.has("compress");
  const compactHdr = parseTriValue(headers.get("x-bhaskara-compact"))
    ?? parseTriValue(process.env.BHASKARA_COMPACT === "1" ? "1" : undefined)
    ?? set.has("compact");
  const shadow = parseTriValue(headers.get("x-bhaskara-shadow"))
    ?? parseTriValue(process.env.BHASKARA_SHADOW === "1" ? "1" : undefined)
    ?? set.has("shadow");
  const docs = parseTriValue(headers.get("x-bhaskara-docs"))
    ?? parseTriValue(process.env.BHASKARA_DOCS === "1" ? "1" : undefined)
    ?? set.has("docs");
  return {
    compress,
    compact: compactHdr,
    compactDebug: (headers.get("x-bhaskara-compact") ?? "").trim().toLowerCase() === "debug",
    shadow,
    docs,
  };
}
