// Skill-card calibration from real traffic.
//
// The routing objective needs one thing we never stored: whether a model
// actually handled a turn. We still don't have a judge, but the gateway has
// been generating a usable proxy all along — the escalation machinery. When a
// flash-locked turn is followed by a failure-escalation, the previous turn
// under-served, and the signal blob we now persist records exactly what the
// turn was asking for.
//
// Three label classes, in decreasing confidence:
//
//   strong negative  the turn's own live zone carried failure evidence
//                    (failBlocks > 0 or a repeated tool loop) and it was still
//                    served by a cheap lane → that lane could not carry it
//   weak negative    the next turn in the session escalated → the previous turn
//                    on that model under-served
//   weak positive    nothing escalated within the next few turns → weak evidence
//                    that the model was adequate
//
// Estimator (Brick §7.3, weighted): each turn contributes its capability
// distribution to every cell, weighted by the confidence of its label. Cells
// with thin support fall back to the cross-model prior rather than the clip
// floor (Brick §10.1's Beta-Binomial smoothing).
//
//   s[m,c] = (K[m,c] + k·µ_c) / (N[m,c] + k)
//
// Run: bun scripts/calibrate-skills.ts [--window 30d] [--min-support 20] [--dry-run]
//
// This is deliberately a script, not a request-path job: calibration reads
// thousands of ledger rows and writes a few dozen.

import postgres from "postgres";
import {
  CAPABILITIES,
  SKILL_CLIP,
  confidenceForSupport,
  type Capability,
} from "@bhaskara/shared/skill";

const sql = postgres(process.env.DATABASE_URL ?? "postgres://localhost:5432/bhaskara");

// ── Args ─────────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
const flag = (name: string, fallback: string): string => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const WINDOW = flag("window", "30d");
const MIN_SUPPORT = Number(flag("min-support", "20"));
const DRY_RUN = args.includes("--dry-run");
const SOURCE = flag("source", "escalation-derived");

/** Prior strength: how many pseudo-observations of the cross-model average to
 *  mix into a thin cell. Brick §10.1 uses 8. */
const PRIOR_STRENGTH = 8;

/** How many subsequent turns to look ahead when deciding "nothing escalated". */
const POSITIVE_LOOKAHEAD = 3;

/** Label weights. A turn's own failure evidence is worth more than an inferred
 *  escalation on the next turn, and absence of escalation is weaker still. */
const W_STRONG_NEGATIVE = 1.0;
const W_WEAK_NEGATIVE = 0.6;
const W_WEAK_POSITIVE = 0.3;

// ── Types ────────────────────────────────────────────────────────────────────

interface Row {
  id: string;
  session_id: string;
  endpoint_model: string;
  provider: string;
  upstream_model: string;
  routed_to: string;
  router_reason: string | null;
  router_signals: string | null;
  created_at: Date;
}

interface Signals {
  capability?: number[];
  failBlocks?: number;
  loopRepeats?: number;
}

interface Labelled {
  modelId: string;
  capability: number[]; // length 6, sums to 1
  label: number; // 1 = solved, 0 = not solved
  weight: number;
}

// ── Load ─────────────────────────────────────────────────────────────────────

const windowClause = `created_at >= NOW() - INTERVAL '${WINDOW.replace(/[^0-9a-z]/gi, "")}'`;

console.log(`calibrate-skills: window=${WINDOW} min-support=${MIN_SUPPORT} dry-run=${DRY_RUN}`);

const rows = await sql<Row[]>`
  SELECT id, session_id, endpoint_model, provider, upstream_model, routed_to,
         router_reason, router_signals, created_at
  FROM usage_ledger
  WHERE ${sql.unsafe(windowClause)}
    AND router_signals IS NOT NULL
    AND upstream_model <> 'theta'
  ORDER BY session_id, created_at`;

console.log(`  ${rows.length} frontier turns with signals`);

if (rows.length === 0) {
  console.log(
    "  nothing to calibrate yet — signals are only persisted for turns served after the instrumentation shipped.",
  );
  await sql.end();
  process.exit(0);
}

// ── Label derivation ─────────────────────────────────────────────────────────

const bySession = new Map<string, Row[]>();
for (const r of rows) {
  const list = bySession.get(r.session_id) ?? [];
  list.push(r);
  bySession.set(r.session_id, list);
}

const labelled: Labelled[] = [];
let strongNeg = 0;
let weakNeg = 0;
let weakPos = 0;
let skipped = 0;

for (const session of bySession.values()) {
  for (let i = 0; i < session.length; i++) {
    const row = session[i];
    let signals: Signals;
    try {
      signals = row.router_signals ? (JSON.parse(row.router_signals) as Signals) : {};
    } catch {
      skipped++;
      continue;
    }
    const cap = signals.capability;
    // Without a capability vector there is nothing to attribute the label to.
    if (!Array.isArray(cap) || cap.length !== CAPABILITIES.length) {
      skipped++;
      continue;
    }
    const total = cap.reduce((s, v) => s + (Number.isFinite(v) ? v : 0), 0);
    if (total <= 0) {
      skipped++;
      continue;
    }
    const capability = cap.map((v) => (Number.isFinite(v) ? v : 0) / total);

    const ownFailure =
      Number(signals.failBlocks ?? 0) > 0 || Number(signals.loopRepeats ?? 0) >= 3;

    // "The model under-served this turn" is detected structurally rather than by
    // parsing a reason string: the session moved to a dearer tier shortly after
    // a cheaper one. That holds whichever router made the decision, and the
    // reason text changes shape when the skill router is enabled.
    const lookahead = session.slice(i + 1, i + 1 + POSITIVE_LOOKAHEAD);
    const tierEscalated =
      row.routed_to === "flash" && lookahead.some((n) => n.routed_to === "full");
    const reasonEscalated = lookahead.some((n) => {
      const reason = n.router_reason ?? "";
      return (
        reason.startsWith("failure-escalation") ||
        reason.startsWith("cache-reeval=") ||
        reason.includes("failure-escalation")
      );
    });
    const escalatedAfter = tierEscalated || reasonEscalated;

    let label: number;
    let weight: number;

    if (ownFailure) {
      label = 0;
      weight = W_STRONG_NEGATIVE;
      strongNeg++;
    } else if (escalatedAfter) {
      label = 0;
      weight = W_WEAK_NEGATIVE;
      weakNeg++;
    } else {
      label = 1;
      weight = W_WEAK_POSITIVE;
      weakPos++;
    }

    labelled.push({ modelId: row.upstream_model, capability, label, weight });
  }
}

console.log(
  `  labels: ${strongNeg} strong-negative, ${weakNeg} weak-negative, ${weakPos} weak-positive` +
    (skipped > 0 ? `, ${skipped} skipped (no capability vector)` : ""),
);

// ── Estimate ─────────────────────────────────────────────────────────────────

// Accumulators per (model, capability).
const acc = new Map<string, { num: number; den: number; support: number }>();
const modelCounts = new Map<string, number>();

for (const l of labelled) {
  modelCounts.set(l.modelId, (modelCounts.get(l.modelId) ?? 0) + 1);
  for (let c = 0; c < CAPABILITIES.length; c++) {
    const p = l.capability[c];
    if (p <= 0) continue;
    const cap = CAPABILITIES[c];
    const key = `${l.modelId}\u0000${cap}`;
    const a = acc.get(key) ?? { num: 0, den: 0, support: 0 };
    // Probability-weighted: a turn contributes to a capability in proportion to
    // how much it demanded it. Brick's soft-assignment estimator.
    a.den += p * l.weight;
    a.num += p * l.weight * l.label;
    a.support += 1;
    acc.set(key, a);
  }
}

// Cross-model prior per capability: the pooled rate across every observation.
const prior = new Map<Capability, number>();
for (const c of CAPABILITIES) {
  let num = 0;
  let den = 0;
  for (const [key, a] of acc) {
    if (key.endsWith(`\u0000${c}`)) {
      num += a.num;
      den += a.den;
    }
  }
  prior.set(c, den > 0 ? num / den : 0.72);
}

const [clipLo, clipHi] = SKILL_CLIP;
const clip = (v: number) => Math.max(clipLo, Math.min(clipHi, v));

interface Cell {
  modelId: string;
  capability: Capability;
  successRate: number;
  support: number;
  confidence: "low" | "medium" | "high";
  raw: number;
}

const cells: Cell[] = [];
for (const [key, a] of acc) {
  const [modelId, capability] = key.split("\u0000") as [string, Capability];
  const mu = prior.get(capability) ?? 0.72;
  // Beta-Binomial smoothing: thin cells fall back to the pool average rather
  // than to the clip floor, which would otherwise read as "this model is
  // terrible at this" when we simply have no data.
  const smoothed = (a.num + PRIOR_STRENGTH * mu) / (a.den + PRIOR_STRENGTH);
  cells.push({
    modelId,
    capability,
    successRate: clip(smoothed),
    support: a.support,
    confidence: confidenceForSupport(a.support),
    raw: a.den > 0 ? a.num / a.den : mu,
  });
}

// ── Report ───────────────────────────────────────────────────────────────────

const models = [...modelCounts.entries()].sort((a, b) => b[1] - a[1]);

console.log("");
console.log("  model                          turns  " + CAPABILITIES.map((c) => c.slice(0, 6).padStart(7)).join(""));
for (const [modelId, count] of models) {
  const row = CAPABILITIES.map((c) => {
    const cell = cells.find((x) => x.modelId === modelId && x.capability === c);
    return (cell ? cell.successRate.toFixed(2) : "  —  ").padStart(7);
  }).join("");
  console.log(`  ${modelId.padEnd(30)} ${String(count).padStart(5)}  ${row}`);
}

const thin = cells.filter((c) => c.support < MIN_SUPPORT);
console.log("");
console.log(`  ${cells.length} cells, ${thin.length} below min-support ${MIN_SUPPORT}`);

// A cell sitting exactly on the clip floor means the label derivation is
// producing impossible results, not that a model is uniformly bad.
const floored = cells.filter((c) => c.successRate <= clipLo + 1e-9);
if (floored.length > 0) {
  console.warn(
    `  ⚠ ${floored.length} cell(s) pinned at the ${clipLo} floor — check label derivation before shipping these:`,
  );
  for (const c of floored.slice(0, 6)) {
    console.warn(`      ${c.modelId} / ${c.capability} (support ${c.support}, raw ${c.raw.toFixed(3)})`);
  }
}

if (DRY_RUN) {
  console.log("\n  --dry-run: no rows written");
  await sql.end();
  process.exit(0);
}

// ── Write ────────────────────────────────────────────────────────────────────

const writable = cells.filter((c) => c.support >= MIN_SUPPORT);
console.log(`\n  writing ${writable.length} cell(s) with support ≥ ${MIN_SUPPORT}...`);

for (const c of writable) {
  await sql`
    INSERT INTO skill_cards (id, model_id, capability, success_rate, support, source, confidence, updated_at)
    VALUES (${`${c.modelId}:${c.capability}`}, ${c.modelId}, ${c.capability},
            ${c.successRate.toFixed(4)}, ${c.support}, ${SOURCE}, ${c.confidence}, NOW())
    ON CONFLICT (model_id, capability) DO UPDATE SET
      success_rate = EXCLUDED.success_rate,
      support = EXCLUDED.support,
      source = EXCLUDED.source,
      confidence = EXCLUDED.confidence,
      updated_at = NOW()`;
}

console.log("  done. The gateway picks the new matrix up within its 15s cache TTL.");
await sql.end();
