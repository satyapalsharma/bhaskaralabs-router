// Skill-router math invariants. Pure functions, no network, no DB.
//
// These are the properties the routing decision depends on. If one of these
// breaks, the router can silently pick the wrong tier on live traffic — which
// is a margin incident, not a cosmetic bug.

import {
  CAPABILITIES,
  PROFILE_R,
  SKILL_TIE_EPSILON,
  blendTau,
  clipSkill,
  confidenceForSupport,
  mathForR,
  type Capability,
  type PoolModel,
} from "@bhaskara/shared/skill";
import {
  cachePenalty,
  normalizeCosts,
  resolveMath,
  selectModel,
  skillDistance,
  type Candidate,
} from "../router/skill-router";
import { capabilityArray, capabilityVector, difficultyOf } from "../router/capability";
import type { ChatMessage } from "../lib/prefix";

let passed = 0;
let failed = 0;

function check(name: string, cond: boolean, detail = "") {
  if (cond) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    console.error(`  ✗ ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function near(a: number, b: number, tol = 1e-9): boolean {
  return Math.abs(a - b) <= tol;
}

// ── Shared fixtures ──────────────────────────────────────────────────────────

const POOL: PoolModel[] = [
  { providers: ["hyper"], modelId: "cheap", tier: "flash", inputUsdPerM: 0.15, blendedUsdPerM: 0.22 },
  { providers: ["hyper"], modelId: "mid", tier: "flash", inputUsdPerM: 1.5, blendedUsdPerM: 2.18 },
  { providers: ["hyper"], modelId: "dear", tier: "full", inputUsdPerM: 2.83, blendedUsdPerM: 3.96 },
];

/** A monotone quality ladder: the dearer the model, the better it is. */
function ladder(skillOf: (m: string) => number) {
  const mk = (modelId: string, blendedUsdPerM: number) => ({
    model: { providers: ["hyper"], modelId, blendedUsdPerM, inputUsdPerM: 0, tier: "flash" as const },
    skills: Object.fromEntries(CAPABILITIES.map((c) => [c, skillOf(modelId)])) as Record<Capability, number>,
    cachePenalty: 0,
  });
  return [mk("cheap", 0.22), mk("mid", 2.18), mk("dear", 3.96)];
}

const flat = (v: number) =>
  Object.fromEntries(CAPABILITIES.map((c) => [c, v])) as Record<Capability, number>;
const focused = (cap: Capability) =>
  Object.fromEntries(CAPABILITIES.map((c) => [c, c === cap ? 1 : 0])) as Record<Capability, number>;

function msg(text: string, role: "user" | "assistant" = "user"): ChatMessage {
  return { role, content: text } as ChatMessage;
}

// ── 1. Capability vector is a valid simplex ──────────────────────────────────

console.log("Test 1: capabilityVector is a valid distribution");
{
  const cases: ChatMessage[][] = [
    [msg("fix the TS2345 error in the union narrowing")],
    [msg("refactor the whole repo across every call site")],
    [msg("hi")],
    [msg("implement the login form")],
    [msg("x".repeat(200_000))],
    [],
  ];
  let allValid = true;
  for (const messages of cases) {
    const p = capabilityVector({ messages, hardness: "routine", stage: "unknown", failBlocks: 0, loopRepeats: 0 });
    const arr = capabilityArray(p);
    const sum = arr.reduce((s, v) => s + v, 0);
    const nonNeg = arr.every((v) => v >= 0 && Number.isFinite(v));
    if (!nonNeg || !near(sum, 1, 1e-6)) {
      allValid = false;
      console.error(`    bad vector: sum=${sum} nonNeg=${nonNeg}`);
    }
  }
  check("every input yields non-negative entries summing to 1", allValid);

  const degenerate = capabilityVector({ messages: [], hardness: "routine", stage: "unknown", failBlocks: 0, loopRepeats: 0 });
  check(
    "no signal → uniform",
    near(capabilityArray(degenerate)[0], 1 / CAPABILITIES.length, 1e-9),
  );

  const typed = capabilityVector({
    messages: [msg("TS2339: Property does not exist")],
    hardness: "routine",
    stage: "unknown",
    failBlocks: 0,
    loopRepeats: 0,
  });
  check("a TS error loads type_repair", typed.type_repair > typed.planning);

  const failing = capabilityVector({
    messages: [msg("2 failing")],
    hardness: "routine",
    stage: "explore",
    failBlocks: 2,
    loopRepeats: 0,
  });
  check("failure evidence loads debug", failing.debug > failing.planning);
}

// ── 2. Difficulty blending ──────────────────────────────────────────────────

console.log("\nTest 2: difficulty blending");
{
  check("zero confidence collapses to medium", near(blendTau("hard", 0), 0.72));
  check("full confidence keeps the anchor", near(blendTau("hard", 1), 0.88));
  check("mid confidence interpolates", near(blendTau("hard", 0.5), (0.88 + 0.72) / 2));

  const easy = difficultyOf({ messages: [msg("add a button")], hardness: "routine", stage: "mechanical", failBlocks: 0, loopRepeats: 0 });
  const hard = difficultyOf({ messages: [msg("2 failed")], hardness: "debugging", stage: "explore", failBlocks: 2, loopRepeats: 0 });
  check("mechanical turn reads easy", easy.label === "easy");
  check("debugging turn reads hard", hard.label === "hard");
}

// ── 3. The objective responds to the knob ───────────────────────────────────

console.log("\nTest 3: the r knob moves cost monotonically");
{
  const cands = ladder((m) => (m === "cheap" ? 0.6 : m === "mid" ? 0.85 : 0.95));
  const p = flat(1 / CAPABILITIES.length);

  const pick = (r: number) => {
    const math = resolveMath(r, "medium", 0.5);
    return selectModel(p, cands, math);
  };
  const eco = pick(PROFILE_R.eco);
  const balanced = pick(PROFILE_R.balanced);
  const pro = pick(PROFILE_R.pro);

  const costOf = (id: string) => POOL.find((m) => m.modelId === id)!.blendedUsdPerM;
  check(
    `eco picks no dearer than balanced (${eco.model.modelId} vs ${balanced.model.modelId})`,
    costOf(eco.model.modelId) <= costOf(balanced.model.modelId),
  );
  check(
    `balanced picks no dearer than pro (${balanced.model.modelId} vs ${pro.model.modelId})`,
    costOf(balanced.model.modelId) <= costOf(pro.model.modelId),
  );
  check("pro picks the strongest model", pro.model.modelId === "dear");

  // A model that is worse on every dimension must never win at any r.
  const dominated = ladder((m) => (m === "cheap" ? 0.5 : m === "mid" ? 0.9 : 0.95));
  dominated[0].model.modelId = "dominated";
  dominated[0].model.blendedUsdPerM = 99; // worse skills AND dearer
  let neverWins = true;
  for (const r of [-1, -0.5, 0, 0.5, 1]) {
    const sel = selectModel(p, dominated, resolveMath(r, "medium", 0.5));
    if (sel.model.modelId === "dominated") neverWins = false;
  }
  check("a strictly dominated model never wins at any r", neverWins);
}

// ── 4. Cost term limits ─────────────────────────────────────────────────────

console.log("\nTest 4: cost term degenerates correctly");
{
  const cands = ladder((m) => (m === "cheap" ? 0.9 : m === "mid" ? 0.9 : 0.9));
  const p = flat(1 / CAPABILITIES.length);

  // Identical skills: cost alone decides, and the cheapest must win.
  const equal = selectModel(p, cands, resolveMath(0, "medium", 0.5));
  check("identical skills → cheapest wins", equal.model.modelId === "cheap");

  // All-free pool: no cost spread, so normalizeCosts must zero out rather than divide by ~0.
  const freePool: PoolModel[] = [
    { providers: ["agnes"], modelId: "free-a", tier: "flash", inputUsdPerM: 0, blendedUsdPerM: 0 },
    { providers: ["camel"], modelId: "free-b", tier: "flash", inputUsdPerM: 0, blendedUsdPerM: 0 },
  ];
  const norm = normalizeCosts(freePool);
  check(
    "a free pool normalises to zero cost",
    [...norm.values()].every((v) => v === 0),
  );

  // Quality decides when cost is absent: the better free model must win.
  const freeCands: Candidate[] = [
    { model: freePool[0], skills: flat(0.6), cachePenalty: 0 },
    { model: freePool[1], skills: flat(0.9), cachePenalty: 0 },
  ];
  const freeSel = selectModel(p, freeCands, resolveMath(0, "medium", 0.5));
  check("free pool: quality decides", freeSel.model.modelId === "free-b");
}

// ── 5. Cache penalty ────────────────────────────────────────────────────────

console.log("\nTest 5: lock dominance");
{
  // Downswitch is free; upswitch is not.
  check(
    "no locked model → no penalty",
    cachePenalty(50_000, 2.83, null, POOL) === 0,
  );
  check(
    "switching down is free",
    cachePenalty(50_000, 0.15, 2.83, POOL) === 0,
  );
  check(
    "switching up costs",
    cachePenalty(50_000, 2.83, 0.15, POOL) > 0,
  );
  check(
    "a bigger prefix costs more",
    cachePenalty(200_000, 2.83, 0.15, POOL) > cachePenalty(20_000, 2.83, 0.15, POOL),
  );

  // Lock dominance: when the wipe penalty exceeds the whole quality spread, the
  // locked model must win even though it is the weaker one.
  const cands = ladder((m) => (m === "cheap" ? 0.55 : m === "mid" ? 0.8 : 0.97));
  const p = flat(1 / CAPABILITIES.length);
  const spread = cands
    .map((c) => skillDistance(p, c.skills, resolveMath(0, "medium", 0.5).z, 0.05))
    .reduce((a, b) => Math.max(a, b), 0);

  const locked: Candidate[] = cands.map((c) => ({
    ...c,
    cachePenalty: c.model.modelId === "cheap" ? 0 : spread, // penalty dwarfing the spread
  }));
  const held = selectModel(p, locked, resolveMath(0, "medium", 0.5));
  check("a penalty larger than the quality spread pins the locked model", held.model.modelId === "cheap");

  // And with no penalty the upgrade should happen.
  const free = cands.map((c) => ({ ...c, cachePenalty: 0 }));
  const moved = selectModel(p, free, resolveMath(0, "medium", 0.5));
  check("with no penalty a better model wins", moved.model.modelId !== "cheap");
}

// ── 6. Determinism ──────────────────────────────────────────────────────────

console.log("\nTest 6: determinism");
{
  const cands = ladder((m) => (m === "cheap" ? 0.6 : m === "mid" ? 0.9 : 0.9));
  const p = flat(1 / CAPABILITIES.length);
  const math = resolveMath(-0.3, "medium", 0.5);

  const baseline = selectModel(p, cands, math).model.modelId;
  let stable = true;
  for (let i = 0; i < 200; i++) {
    const shuffled = [...cands].sort(() => Math.random() - 0.5);
    if (selectModel(p, shuffled, math).model.modelId !== baseline) stable = false;
  }
  check("selection is independent of candidate order", stable);

  // Near-ties must not flip on float noise.
  const nearTie: Candidate[] = [
    { model: { providers: ["hyper"], modelId: "a", tier: "flash", inputUsdPerM: 0, blendedUsdPerM: 1 }, skills: flat(0.8), cachePenalty: 0 },
    { model: { providers: ["hyper"], modelId: "b", tier: "flash", inputUsdPerM: 0, blendedUsdPerM: 1 }, skills: flat(0.8), cachePenalty: 0 },
  ];
  const t1 = selectModel(p, nearTie, math).model.modelId;
  const t2 = selectModel(p, [...nearTie].reverse(), math).model.modelId;
  check("exact tie breaks on model id, not order", t1 === t2 && t1 === "a");
}

// ── 7. Degenerate input ─────────────────────────────────────────────────────

console.log("\nTest 7: degenerate input");
{
  const p = flat(1 / CAPABILITIES.length);
  const math = resolveMath(0, "medium", 0.5);

  let threw = false;
  try {
    selectModel(p, [], math);
  } catch {
    threw = true;
  }
  check("empty pool throws rather than picking nothing", threw);

  const single: Candidate[] = [
    { model: POOL[0], skills: flat(0.5), cachePenalty: 0 },
  ];
  check("single-model pool returns that model", selectModel(p, single, math).model.modelId === "cheap");

  // Out-of-range skill values must not produce NaN/Infinity.
  const extreme: Candidate[] = [
    { model: POOL[0], skills: flat(-5), cachePenalty: 0 },
    { model: POOL[1], skills: flat(7), cachePenalty: 0 },
  ];
  const sel = selectModel(p, extreme, math);
  check(
    "skills outside (0,1) are clipped, not propagated",
    Number.isFinite(sel.J) && Number.isFinite(sel.distance),
  );

  // A vector concentrated entirely on one dimension.
  const single_dim = selectModel(focused("type_repair"), [
    { model: POOL[0], skills: { ...flat(0.9), type_repair: 0.2 }, cachePenalty: 0 },
    { model: POOL[2], skills: { ...flat(0.9), type_repair: 0.95 }, cachePenalty: 0 },
  ], resolveMath(1, "hard", 1));
  check(
    "a focused hard query escalates past a weak dimension",
    single_dim.model.modelId === "dear",
  );

  check("clipSkill bounds to [0.02, 0.98]", clipSkill(-1) === 0.02 && clipSkill(9) === 0.98);
  check("non-finite skill falls back to medium", clipSkill(NaN) === 0.72);
  check(
    "confidence tiers: 200/50 boundaries",
    confidenceForSupport(200) === "high" &&
      confidenceForSupport(199) === "medium" &&
      confidenceForSupport(50) === "medium" &&
      confidenceForSupport(49) === "low",
  );
  check(
    "tie epsilon is small but non-zero",
    SKILL_TIE_EPSILON > 0 && SKILL_TIE_EPSILON < 0.1,
  );
}

// ── 8. The knob itself ──────────────────────────────────────────────────────

console.log("\nTest 8: knob shape");
{
  const base = mathForR(0);
  check("r = 0 is the identity", near(base.beta, 0.35) && near(base.mu, 1) && near(base.b, 0));
  check("out-of-range r clamps", near(mathForR(9).beta, mathForR(1).beta));
  check("NaN r falls back to neutral", near(mathForR(NaN).beta, base.beta));

  const eco = mathForR(-1);
  const pro = mathForR(1);
  check("pro lowers the cost coefficient", pro.beta < base.beta);
  check("eco raises the cost coefficient", eco.beta > base.beta);
  check("pro raises difficulty sensitivity", pro.mu > base.mu);
  check("eco lowers difficulty sensitivity", eco.mu < base.mu);
  check(
    "all scalars stay finite and positive",
    [eco, base, pro].every(
      (m) => Number.isFinite(m.beta) && Number.isFinite(m.mu) && m.beta > 0 && m.mu > 0 && Number.isFinite(m.lambda),
    ),
  );
}

console.log(`\n${passed} passed, ${failed} failed`);
// Throws rather than exits — see upgrade-gates.test.ts. An exit here kills
// run-all.test.ts mid-sweep and the files after this one never run.
if (failed > 0) {
  throw new Error(`${failed} of ${passed + failed} skill-router assertions failed`);
}
