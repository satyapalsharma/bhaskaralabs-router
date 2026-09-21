// Context-engine flags — compression pipeline controls.
// Resolution order (first explicit wins): request header → per-key flags column → env.
//   x-bhaskara-compress: 1|0     → live-zone compression (deterministic transforms)
//   x-bhaskara-compact: 1|debug  → 200K threshold compact (summarize first 100K)
//   x-bhaskara-shadow: 1|0       → shadow mode: run pipeline on a copy, forward
//                                  ORIGINAL upstream, ledger-tag would-be savings
//                                  + keep-audit (measure-before-enable, zero risk)
//   x-bhaskara-r: -1..1          → routing preference knob (float); overrides the
//                                  per-key profile. See packages/shared/src/skill.ts
// Per-key flags live in api_keys.flags (CSV):
//   "compress", "compact", "shadow", "docs", "skill", and one of "eco"|"balanced"|"pro".

import { PROFILE_R, type RoutingProfileName } from "@bhaskara/shared/skill";

export type CompactionFlags = {
  compress: boolean;
  compact: boolean;
  compactDebug: boolean;
  shadow: boolean;
  docs: boolean;
  /** Skill-card router on for this key. Off by default — it is opt-in until
   *  its decisions have been reviewed against real traffic. */
  skill: boolean;
  /** Named preference profile from the key flags, or null when unset. */
  routingProfile: RoutingProfileName | null;
  /** The knob actually used by the router: header float if present, else the
   *  profile's r, else 0 (balanced). */
  r: number;
  /** True when r came from the request header rather than the stored profile. */
  rFromHeader: boolean;
};

function parseTriValue(v: string | null | undefined): boolean | null {
  if (v === undefined || v === null || v === "") return null;
  const s = v.trim().toLowerCase();
  if (s === "1" || s === "true" || s === "on" || s === "debug") return true;
  if (s === "0" || s === "false" || s === "off") return false;
  return null;
}

/** Parse the knob header. Returns null for absent or unparseable values so a
 *  typo cannot silently move the routing policy to an extreme. */
function parseRHeader(v: string | null): number | null {
  if (v === null || v.trim() === "") return null;
  const n = Number(v);
  if (!Number.isFinite(n)) return null;
  return Math.max(-1, Math.min(1, n));
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
  const skill = parseTriValue(headers.get("x-bhaskara-skill"))
    ?? parseTriValue(process.env.BHASKARA_SKILL === "1" ? "1" : undefined)
    ?? set.has("skill");

  // At most one profile token is meant to be set; the write path enforces that,
  // but a hand-edited row could still hold several. Prefer the most specific:
  // the last one in canonical order wins, deterministically.
  const profiles = (["eco", "balanced", "pro"] as const).filter((p) => set.has(p));
  const routingProfile: RoutingProfileName | null =
    profiles.length > 0 ? profiles[profiles.length - 1] : null;

  const headerR = parseRHeader(headers.get("x-bhaskara-r"));
  const r = headerR ?? (routingProfile ? PROFILE_R[routingProfile] : 0);

  return {
    compress,
    compact: compactHdr,
    compactDebug: (headers.get("x-bhaskara-compact") ?? "").trim().toLowerCase() === "debug",
    shadow,
    docs,
    skill,
    routingProfile,
    r,
    rFromHeader: headerR !== null,
  };
}
