// SmartCrusher — statistical JSON array compression (headroom-inspired, our port).
// Apache-2.0 concepts from headroomlabs/headroom; this is an independent implementation.
//
// Keeps: error items, statistical outliers, first/last boundaries.
// All decisions come from field statistics — no keyword lists for what to keep
// (only for what counts as an "error", which is semantic).
//
// INVARIANTS (make it safe for the model):
// 1. Kept items are byte-identical originals (re-serialized via JSON.parse/stringify round-trip only).
// 2. Self-check: if compressed output isn't smaller, return original unchanged.
// 3. Deterministic: same input bytes → same output bytes.

export interface CrushResult {
  text: string;
  originalTokens: number; // rough estimate for telemetry
  kept: number;
  total: number;
}

export function looksLikeJsonArray(text: string): boolean {
  const t = text.trimStart();
  return (t.startsWith("[") && t.endsWith("]")) || (t.startsWith("{") && t.endsWith("}"));
}

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

interface FieldStats {
  numeric: number[];
  uniqueCount: number;
  count: number;
}

function analyzeFields(items: Array<Record<string, unknown>>): Map<string, FieldStats> {
  const stats = new Map<string, FieldStats>();
  for (const item of items) {
    for (const [k, v] of Object.entries(item)) {
      let s = stats.get(k);
      if (!s) {
        s = { numeric: [], uniqueCount: 0, count: 0 };
        stats.set(k, s);
      }
      s.count++;
      if (typeof v === "number" && Number.isFinite(v)) s.numeric.push(v);
    }
  }
  // distinct pass (bounded sample for cost)
  const sample = items.slice(0, 200);
  for (const [k, s] of stats) {
    const distinct = new Set<string>();
    for (const item of sample) {
      const v = item[k];
      if (v === undefined) continue;
      distinct.add(typeof v === "object" ? JSON.stringify(v) : String(v));
    }
    s.uniqueCount = distinct.size;
  }
  return stats;
}

function isErrItem(item: Record<string, unknown>): boolean {
  const ERROR_KEYS = ["error", "err", "level", "severity", "status", "ok"];
  for (const k of ERROR_KEYS) {
    const v = item[k];
    if (typeof v === "string") {
      const lv = v.toLowerCase();
      if (lv === "error" || lv === "fatal" || lv === "critical" || lv.startsWith("err") || lv === "5xx" || lv === "failed") return true;
    }
    if (v === false && k === "ok") return true;
    if (typeof v === "number" && k === "status" && v >= 500) return true;
  }
  return false;
}

function numericOutliers(values: number[]): Set<number> {
  if (values.length < 8) return new Set();
  const sorted = [...values].sort((a, b) => a - b);
  const q1 = sorted[Math.floor(sorted.length * 0.25)];
  const q3 = sorted[Math.floor(sorted.length * 0.75)];
  const iqr = q3 - q1;
  if (iqr === 0) return new Set();
  const lo = q1 - 3 * iqr;
  const hi = q3 + 3 * iqr;
  return new Set(values.filter((v) => v < lo || v > hi));
}

function crushArray(items: Array<Record<string, unknown>>, maxKeep: number): { kept: number[]; note: string } {
  const fieldStats = analyzeFields(items);
  const keepIdx = new Set<number>();

  // 1. semantic errors always survive
  for (let i = 0; i < items.length; i++) if (isErrItem(items[i])) keepIdx.add(i);

  // 2. numeric outliers per field
  for (const [k, s] of fieldStats) {
    if (s.numeric.length < 8) continue;
    const outliers = numericOutliers(s.numeric);
    if (!outliers.size) continue;
    for (let i = 0; i < items.length; i++) {
      const v = items[i][k];
      if (typeof v === "number" && outliers.has(v)) keepIdx.add(i);
    }
  }

  // 3. boundaries
  keepIdx.add(0);
  keepIdx.add(items.length - 1);

  // 4. fill by even spread
  if (keepIdx.size < maxKeep) {
    const step = Math.max(1, Math.floor(items.length / Math.max(1, maxKeep - keepIdx.size)));
    for (let i = 0; i < items.length && keepIdx.size < maxKeep; i += step) keepIdx.add(i);
  }

  const kept = [...keepIdx].sort((a, b) => a - b);
  const note = `[… ${items.length - kept.length} of ${items.length} JSON items crushed (kept: errors, outliers, boundaries + even sampling)]`;
  return { kept, note };
}

export function smartCrush(text: string, maxKeep = 25): CrushResult {
  const original = text;
  const fallback = { text: original, originalTokens: estimateTokens(original), kept: -1, total: -1 };
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return fallback;
  }

  // single object: crush its biggest array field
  if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
    const obj = parsed as Record<string, unknown>;
    let bestKey = "";
    let bestLen = 0;
    for (const [k, v] of Object.entries(obj)) {
      if (Array.isArray(v) && v.length > bestLen) {
        bestKey = k;
        bestLen = v.length;
      }
    }
    if (!bestKey || bestLen < 8) return fallback;
    const innerItems = obj[bestKey] as unknown[];
    if (!innerItems.every((i) => typeof i === "object" && i !== null && !Array.isArray(i))) return fallback;
    const { kept, note } = crushArray(innerItems as Array<Record<string, unknown>>, maxKeep);
    const rebuilt = { ...obj, [bestKey]: kept.map((i) => innerItems[i]) };
    const out = JSON.stringify(rebuilt) + "\n" + note;
    if (out.length >= original.length) return fallback;
    return { text: out, originalTokens: estimateTokens(original), kept: kept.length, total: innerItems.length };
  }

  if (!Array.isArray(parsed) || parsed.length < 8) return fallback;
  if (!parsed.every((i) => typeof i === "object" && i !== null && !Array.isArray(i))) return fallback;

  const { kept, note } = crushArray(parsed as Array<Record<string, unknown>>, maxKeep);
  const out = JSON.stringify(kept.map((i) => parsed[i])) + "\n" + note;
  if (out.length >= original.length) return fallback;
  return { text: out, originalTokens: estimateTokens(original), kept: kept.length, total: parsed.length };
}