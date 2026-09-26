// Ladder resolution, concurrency, throttle and overflow.
//
// These four are the pieces that decide where a request goes and how fast it is
// served, and every one of them is pure enough to test without a database. The
// properties below are the ones that would cost real money if they broke:
// a ladder that reaches a metered lane when a flat one is healthy, a throttle
// that never fires, a concurrency cap that leaks slots, an overflow route to a
// model nobody measured.

import {
  pickLane,
  resolveLane,
  laneUsable,
  fitsLane,
  tierOf,
  baseModelOf,
  fairUseState,
  fullTierAllowed,
  flashModelFor,
  fullModelFor,
  classifyHardness,
  failoverDecision,
  type LaneHealth,
  type RouterDecision,
} from "../router";
import {
  THETA_CHAIN,
  GLM_FULL_CHAIN,
  GLM_FLASH_CHAIN,
  ROUTER,
  THROTTLE,
  CONCURRENCY,
  PLANS,
} from "@bhaskara/shared/pricing";
import { acquireConcurrency, concurrencyLimit, acquired, resetConcurrency } from "../lib/concurrency";
import { laneAcquire, laneFree, laneLoadOf, laneWeight, laneBudgetFor, wrapLaneRelease, resetLaneLoad, markLaneCooldown, laneCooling, resetLaneCooldowns, LANE_BUDGET, LANE_BUDGET_DEFAULT, LANE_COUNTS_REQUESTS } from "../lib/lane-slot";
import { applyThrottle, describeThrottle } from "../lib/throttle";
import { throttleDelayMs } from "../lib/quotas";
import { selectOverflowModel } from "../lib/overflow";
import { OVERFLOW_ALLOWLIST } from "@bhaskara/shared/overflow-models";

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

const allHealthy = (): LaneHealth => {
  const h: LaneHealth = {};
  for (const p of ["hyper", "agnes", "stepfun", "camel", "llmgateway", "electronhub", "openference", "pareto", "teamorouter", "opencode", "openrouter", "claudin", "agnes2"]) {
    h[p] = true;
  }
  return h;
};

console.log("Test 1: ladder resolution is preference-ordered");
{
  const h = allHealthy();
  check("theta starts at camel (the flat lane)", resolveLane("theta", "flash", h, 0)?.provider === "camel");
  check("glm flash starts at pareto", resolveLane("glm-5.3", "flash", h, 0)?.provider === "pareto");
  check("glm full starts at electronhub", resolveLane("glm-5.3", "full", h, 0)?.provider === "electronhub");

  // Flat lanes before metered ones: this ordering IS the cost model.
  const thetaOrder = THETA_CHAIN.map((l) => l.provider);
  check(
    "flat lanes precede the meter in the theta ladder",
    thetaOrder.indexOf("camel") < thetaOrder.indexOf("hyper") &&
      thetaOrder.indexOf("agnes") < thetaOrder.indexOf("hyper"),
  );

  // The full ladder leads with the flat lane: its plan allows two concurrent
  // requests, so that capacity is scarce and belongs where the metered
  // alternative costs most. The flash ladder deliberately does NOT — a two-slot
  // lane cannot carry ~99% of traffic, and at 2.4x Pareto's latency with 3-in-8
  // answering 429 it was measurably worse in production. Leading flash with it
  // was deployed and reverted; this assertion keeps it from coming back.
  const fullOrder = GLM_FULL_CHAIN.map((l) => l.provider);
  // Pareto's full rung is out while pareto has glm-5.3 full paused on their
  // side (2026-09-18); restore it here when the rung returns to the chain.
  const meteredFull = ["openference", "hyper", "llmgateway"];
  check("the full ladder leads with electronhub", fullOrder[0] === "electronhub");
  check(
    "every metered full lane sits behind the flat one",
    meteredFull.every((p) => fullOrder.indexOf("electronhub") < fullOrder.indexOf(p)),
  );
  check(
    "electronhub stays out of the flash ladder",
    !GLM_FLASH_CHAIN.some((l) => l.provider === "electronhub"),
  );

  // `:dev` ids resolve to the right tier. A variant that read as flash would be
  // served on the full model without consuming full-model budget, silently
  // un-binding the full-share cap for that lane only.
  check("the electronhub flash variant reads as flash", tierOf("glm-5.3-flash:dev") === "flash");
  check("the electronhub full variant reads as full", tierOf("glm-5.3:dev") === "full");
}

console.log("\nTest 2: unhealthy lanes are skipped, not retried");
{
  const h = allHealthy();
  const thetaFlash = THETA_CHAIN.map((l) => l.provider);
  h[thetaFlash[0]] = false;
  check("disabled first lane falls to the second", resolveLane("theta", "flash", h, 0)?.provider === thetaFlash[1]);

  // Asserted against the ladder rather than a hardcoded name. The property under
  // test is "skip past the unhealthy lane", not "the third lane is X" — naming X
  // made this fail the moment the chain was deliberately reordered (agnes moved
  // ahead of teamorouter, pareto inserted), reporting a broken ladder when only
  // the expectation was stale.
  h[thetaFlash[1]] = false;
  const third = thetaFlash[2];
  const got = resolveLane("theta", "flash", h, 0)?.provider;
  check(`two down falls to the third (${third})`, got === third, `expected ${third}, got ${got}`);

  // An absent provider is unavailable — a lane whose health check was never
  // wired up must be inert, not accidentally live.
  const partial: LaneHealth = { agnes: true };
  check("a provider absent from the health map is unavailable", !laneUsable(partial, "hyper"));
  check("a present-and-true provider is available", laneUsable(partial, "agnes"));

  const none: LaneHealth = {};
  check("an empty health map resolves nothing", resolveLane("theta", "flash", none, 0) === null);

  // The ordering promised by the plan restructure. Pinned because a reorder is
  // exactly what this file missed last time, and the customer-visible effect is
  // which lane serves them.
  check(
    "agnes precedes teamorouter in the theta ladder",
    thetaFlash.indexOf("agnes") < thetaFlash.indexOf("teamorouter"),
  );
  check("camel still leads the theta ladder", thetaFlash[0] === "camel");
}

console.log("\nTest 3: exclusions drive failover");
{
  const h = allHealthy();
  const thetaFlash = THETA_CHAIN.map((l) => l.provider);
  const exclude = new Set(["camel", "agnes"]);
  const expected = thetaFlash.find((p) => !exclude.has(p));
  const got = resolveLane("theta", "flash", h, 0, exclude)?.provider;
  check(
    `excluded lanes are skipped even when healthy (→ ${expected})`,
    got === expected,
    `expected ${expected}, got ${got}`,
  );
  const all = new Set(THETA_CHAIN.map((l) => l.provider));
  check("excluding the whole ladder yields null", resolveLane("theta", "flash", h, 0, all) === null);
  check(
    "an empty exclusion set changes nothing",
    resolveLane("theta", "flash", h, 0, new Set())?.provider === "camel",
  );

  // Lane-level exclusion (`provider:model`) blocks one model without locking
  // the provider's sibling lanes — the walk from a spent free rung must still
  // reach the paid rung on the same account.
  const freeLane = THETA_CHAIN.find((l) => l.model === "glm-5.3-flash-free");
  check("the theta ladder carries a teamorouter free rung", freeLane !== undefined);
  const laneExcl = new Set([`teamorouter:${freeLane?.model}`]);
  const afterFree = resolveLane("theta", "flash", h, 0, laneExcl);
  check(
    "excluding only the free lane still resolves a lane",
    afterFree !== null && afterFree.model !== freeLane?.model,
    afterFree ? `${afterFree.provider}:${afterFree.model}` : "null",
  );
}

console.log("\nTest 3b: a model-level cooldown skips one rung, not the account");
{
  resetLaneCooldowns();
  const h = allHealthy();
  // TeamoRouter's free model answers 402 free_request_quota_exhausted; the lane
  // cools while the paid sibling on the same account keeps serving.
  markLaneCooldown("teamorouter", "glm-5.3-flash-free", 60_000);
  check("the cooled lane reports cooling", laneCooling("teamorouter", "glm-5.3-flash-free"));
  check("a sibling model on the same account is not cooling", !laneCooling("teamorouter", "glm-5.3-flash"));

  // Force the walk onto the teamorouter rungs by excluding everything ahead of
  // them; the free rung is cooled, so the paid one must be the one that lands.
  const ahead = THETA_CHAIN
    .map((l) => l.provider)
    .filter((p) => p !== "teamorouter");
  const got = resolveLane("theta", "flash", h, 0, new Set(ahead));
  check(
    "a cooled free rung falls through to the paid rung",
    got !== null && got.provider === "teamorouter" && got.model === "glm-5.3-flash",
    got ? `${got.provider}:${got.model}` : "null",
  );

  // The paid rung cooling too leaves only the later rungs.
  markLaneCooldown("teamorouter", "glm-5.3-flash", 60_000);
  const got2 = resolveLane("theta", "flash", h, 0, new Set(ahead));
  check(
    "both teamorouter flash rungs cooled move the walk past them",
    got2 === null || got2.provider !== "teamorouter" || (got2.model !== "glm-5.3-flash" && got2.model !== "glm-5.3-flash-free"),
    got2 ? `${got2.provider}:${got2.model}` : "null",
  );
  resetLaneCooldowns();
}

console.log("\nTest 4: tier classification");
{
  check("glm-5.3 is full", tierOf("glm-5.3") === "full");
  check("glm-5.3-flash is flash", tierOf("glm-5.3-flash") === "flash");
  // An unknown model must never be treated as full — that would let an
  // unrecognised lane spend full-model budget.
  check("an unknown model defaults to flash", tierOf("something-new") === "flash");
  check("fullModelFor maps the endpoint", fullModelFor("glm-5.3") === "glm-5.3");
  check("flashModelFor maps the endpoint", flashModelFor("glm-5.3") === "glm-5.3-flash");

  // Plan variants are the same weights under a different allowance. Reading
  // `glm-5.3:dev` as flash would serve the full model without consuming
  // full-model budget: the cap stops binding, and a session locked to it takes
  // the flash branch of the reeval logic.
  check("a plan variant of the full model is still full", tierOf("glm-5.3:dev") === "full");
  check("baseModelOf strips the plan suffix", baseModelOf("glm-5.3:dev") === "glm-5.3");
  check("baseModelOf leaves a plain id alone", baseModelOf("glm-5.3-flash") === "glm-5.3-flash");
  check("a plan variant of flash stays flash", tierOf("glm-5.3-flash:dev") === "flash");
  check("an unknown variant still defaults to flash", tierOf("mystery:dev") === "flash");
  check("a ':free' style variant of flash is flash", tierOf("glm-5.3-flash-free") === "flash");

  // Every lane in every ladder resolves to the tier its chain exists for — the
  // invariant that would have caught the `:dev` divergence.
  const fullWired = GLM_FULL_CHAIN.every((l) => tierOf(l.model) === "full");
  const flashWired = GLM_FLASH_CHAIN.every((l) => tierOf(l.model) === "flash");
  const thetaWired = THETA_CHAIN.every((l) => tierOf(l.model) === "flash");
  check("every full-chain lane reads as full", fullWired);
  check("every flash-chain lane reads as flash", flashWired);
  check("every theta-chain lane reads as flash", thetaWired);
}

console.log("\nTest 5: the full-model cap is a hard pre-filter");
{
  check("an unused budget allows full", fullTierAllowed(0));
  check("just under the cap allows full", fullTierAllowed(ROUTER.fullModelShareCap - 0.001));
  check("exactly at the cap refuses full", !fullTierAllowed(ROUTER.fullModelShareCap));
  check("over the cap refuses full", !fullTierAllowed(1));
  check("no budget still reports 'capped'", fairUseState(ROUTER.fullModelShareCap) === "capped");
  check("near the cap reports 'alert'", fairUseState(ROUTER.fullModelShareAlertAt) === "alert");
  check("low usage reports nothing", fairUseState(0.01) === undefined);
}

console.log("\nTest 6: concurrency");
{
  resetConcurrency();
  const limit = concurrencyLimit("pro", false);
  check("the unlimited tier is single-stream", limit === CONCURRENCY.unlimitedTier);

  const first = acquireConcurrency("key-a", limit);
  check("the first request is admitted", first !== null);
  check("the counter reflects it", acquired("key-a") === 1);

  const second = acquireConcurrency("key-a", limit);
  check("the second concurrent request is refused", second === null);

  first!.release();
  check("release frees the slot", acquired("key-a") === 0);
  const third = acquireConcurrency("key-a", limit);
  check("a request is admitted again after release", third !== null);
  third!.release();

  // Double-release must not drive the counter negative — a negative count would
  // silently widen the concurrency limit.
  const a = acquireConcurrency("key-b", 2);
  a!.release();
  a!.release();
  check("double release does not go negative", acquired("key-b") === 0);
  const b = acquireConcurrency("key-b", 2);
  const c = acquireConcurrency("key-b", 2);
  check("two slots are available at limit 2", b !== null && c !== null);
  check("a third is refused at limit 2", acquireConcurrency("key-b", 2) === null);
  b!.release();
  c!.release();

  // Keys are isolated from each other.
  const k1 = acquireConcurrency("key-c", 1);
  const k2 = acquireConcurrency("key-d", 1);
  check("separate keys have separate budgets", k1 !== null && k2 !== null);
  k1!.release();
  k2!.release();

  check("the extra pool raises the ceiling", concurrencyLimit("pro", true) === CONCURRENCY.extraTierMax);
  check("metered tiers are capped generously", concurrencyLimit("starter", false) === CONCURRENCY.extraTierMax);
  check("an unknown plan falls back to the trial ceiling", concurrencyLimit("nonsense", false) === CONCURRENCY.extraTierMax);
  resetConcurrency();
}

console.log("\nTest 7: the throttle ramps and stops");
{
  const pro = PLANS.pro;
  const starter = PLANS.starter;
  check("pro is the unlimited tier", pro.thetaPer5h === null);
  check("below the soft edge there is no delay", throttleDelayMs(0, pro) === 0);
  check("at the soft edge there is still no delay", throttleDelayMs(THROTTLE.fullSpeedUntil, pro) === 0);
  const mid = throttleDelayMs((THROTTLE.fullSpeedUntil + THROTTLE.rejectAfter) / 2, pro);
  check("halfway through the ramp the delay is in range", mid > THROTTLE.minDelayMs && mid < THROTTLE.maxDelayMs, `${mid}ms`);
  check("the ramp is monotone", throttleDelayMs(600, pro) < throttleDelayMs(900, pro));
  check("the delay is bounded at the top", throttleDelayMs(THROTTLE.rejectAfter, pro) === THROTTLE.maxDelayMs);
  check("past the hard edge it stays bounded", throttleDelayMs(99_999, pro) === THROTTLE.maxDelayMs);
  // A metered tier is bounded by its window, so the throttle must not apply.
  check("metered tiers are never throttled", throttleDelayMs(99_999, starter) === 0);
}

console.log("\nTest 8: throttle delay actually waits");
{
  const t0 = Date.now();
  await applyThrottle(0);
  check("a zero delay returns immediately", Date.now() - t0 < 20);

  const t1 = Date.now();
  await applyThrottle(60);
  const elapsed = Date.now() - t1;
  check("a real delay is observed", elapsed >= 50, `${elapsed}ms`);

  // An aborted client must not hold a timer open.
  const ac = new AbortController();
  const t2 = Date.now();
  const p = applyThrottle(5_000, ac.signal);
  ac.abort();
  await p;
  check("abort cancels the wait", Date.now() - t2 < 200, `${Date.now() - t2}ms`);

  check("describeThrottle names the ramp", describeThrottle(0) === "none" && describeThrottle(5_000).includes("5.0s"));
}

console.log("\nTest 9: overflow refuses anything unmeasured");
{
  const h = allHealthy();
  const picked = selectOverflowModel(h);
  check("a healthy fleet yields an allowlisted model", picked !== null && OVERFLOW_ALLOWLIST.some((m) => m.modelId === picked!.modelId));

  check("an empty health map yields nothing", selectOverflowModel({}) === null);

  const triedAll = new Set(OVERFLOW_ALLOWLIST.map((m) => m.provider));
  check("tried providers are excluded", selectOverflowModel(h, triedAll) === null);

  // The safety property: a model with no recorded score is unreachable, and the
  // allowlist itself is what refuses it — not the caller's diligence.
  check(
    "every allowlisted model clears the published bar",
    OVERFLOW_ALLOWLIST.every((m) => (m.terminalBench21 ?? 0) >= 70 || (m.aaIntelligenceIndex ?? 0) >= 50),
  );
  check(
    "the overflow set is small — it is a last resort, not a pool",
    OVERFLOW_ALLOWLIST.length <= 4,
    `${OVERFLOW_ALLOWLIST.length} models`,
  );
}

console.log("\nTest 10: hardness classification");
{
  check("an architecture question is hard", classifyHardness("design a system for payments") === "debugging");
  check("a TS error is hard", classifyHardness("TS2345 in the union narrowing") === "debugging");
  check("a trade-off question is planning", classifyHardness("should we use a queue here, what's the trade-off") === "planning");
  check("a greeting is routine", classifyHardness("hi") === "routine");
  check("an empty prompt is routine", classifyHardness("") === "routine");
}

console.log("\nTest 11: failover preserves the decision and renames the lane");
{
  const d: RouterDecision = {
    provider: "pareto",
    upstreamModel: "glm-5.3-flash",
    tier: "flash",
    effort: "low",
    reason: "session-sticky",
    hardCapped: false,
    fairUseShare: 0.3,
  };
  const f = failoverDecision(d, "hyper", "ttft");
  check("the model is unchanged", f.upstreamModel === "glm-5.3-flash");
  check("the provider moves", f.provider === "hyper");
  check("the reason records the hop", f.reason.includes("failover-hyper") && f.reason.includes("ttft"));
  check("the cap flag is cleared for the new lane", f.hardCapped === false);
  check("the original decision is untouched", d.provider === "pareto");

  const withModel = failoverDecision(d, "superprovider", "404", "gpt-5.6-luna");
  check("an explicit model overrides the default", withModel.upstreamModel === "gpt-5.6-luna");
}

console.log("\nTest 12: pickLane works on an ad-hoc ladder");
{
  const h: LaneHealth = { hyper: true };
  const custom = [{ provider: "agnes", model: "a" }, { provider: "hyper", model: "b" }];
  check("it walks past an unhealthy lane", pickLane(custom, h, 0)?.provider === "hyper");
  check("it returns null when nothing is healthy", pickLane(GLM_FULL_CHAIN, {}, 0) === null);
  check("it honours exclusions", pickLane(custom, { agnes: true, hyper: true }, 0, new Set(["agnes"]))?.provider === "hyper");
}

console.log("\nTest 13: a lane whose window cannot hold the prefix is skipped");
{
  const h = allHealthy();

  // Electron's DevPass window is 262k — the narrowest lane in the ladder by a
  // wide margin, and the one this exists for. A request that fits must still
  // reach it, because walking past it on every turn would trade the flat-rate
  // lane away for nothing.
  check(
    "a prefix inside the window resolves to electronhub",
    resolveLane("glm-5.3", "full", h, 100_000)?.provider === "electronhub",
  );
  check(
    "a prefix over the window skips electronhub",
    resolveLane("glm-5.3", "full", h, 300_000)?.provider === "openference",
  );
  check(
    "exactly the window still fits",
    resolveLane("glm-5.3", "full", h, 262_000)?.provider === "electronhub",
  );
  check(
    "one token past it does not",
    resolveLane("glm-5.3", "full", h, 262_001)?.provider === "openference",
  );

  // The ladder degrades, it does not fail. Openference declares an 899k window
  // and Hyper and LLMGateway declare none, so a prefix past even that still
  // resolves somewhere instead of turning into an outage. (While pareto's full
  // rung is paused, hyper is the first windowless lane.)
  const huge = resolveLane("glm-5.3", "full", h, 2_000_000);
  check("an enormous prefix still resolves a lane", huge !== null);
  check("...and lands on a lane with no declared window", huge?.provider === "hyper");

  // Windows are per lane, not per provider or endpoint.
  check("fitsLane treats an absent window as unlimited", fitsLane({ provider: "hyper", model: "m" }, 5_000_000));
  check("fitsLane rejects past a declared window", !fitsLane({ provider: "x", model: "m", maxInputTokens: 10 }, 11));

  // Resolution must not change for the tiers that declare nothing.
  check(
    "theta is unaffected — no theta lane declares a window",
    resolveLane("theta", "flash", h, 5_000_000)?.provider === "camel",
  );
  check(
    "glm flash is unaffected — no flash lane declares a window",
    resolveLane("glm-5.3", "flash", h, 5_000_000)?.provider === "pareto",
  );
}

// Lane admission. The property that matters is not "a counter goes up" but
// that a long generation and a short one are charged differently — the whole
// reason the budget is weighted is that eight short turns and eight long turns
// against the same lane produce 0% and 79% failure respectively, and treating
// both as one slot is what produced the 79%.
console.log("Test 8: lane admission is weighted by expected generation length");
{
  resetLaneLoad();
  check("a short request costs one unit", laneWeight(256) === 1 && laneWeight(512) === 1);
  check("a mid request costs more", laneWeight(1000) === 2);
  check("a long request costs the most", laneWeight(4000) >= 4 && laneWeight(16_000) === 5);
  check("an absent max_tokens is treated as a mid request", laneWeight(undefined) === 2);

  // Pareto's budget is 6, so two long requests fill it and a third must be
  // refused — this is the exact shape that was failing at 8 concurrent.
  const paretoBudget = LANE_BUDGET.pareto;
  check("pareto has a measured budget", typeof paretoBudget === "number" && paretoBudget > 0);
  const longWeight = laneWeight(4000);
  let admitted = 0;
  const held: (() => void)[] = [];
  while (laneFree("pareto", longWeight)) {
    held.push(laneAcquire("pareto", longWeight));
    admitted++;
    if (admitted > 20) break; // guard against a budget that never fills
  }
  check(
    "long generations are admitted only up to the budget",
    admitted === Math.floor(paretoBudget / longWeight),
    `admitted ${admitted} of a ${paretoBudget}-unit budget at ${longWeight} units each`,
  );
  check("a saturated lane refuses further requests", !laneFree("pareto", longWeight));
  // Not `load >= budget`: admission stops at the last weight that still fits,
  // so a budget of 6 charged in 4s sits at 4 and still has no room for another.
  // The property worth asserting is that no further request of this size fits,
  // which is exactly what saturation means.
  check(
    "...and its load leaves no room for another request of that size",
    laneLoadOf("pareto") + longWeight > paretoBudget,
    `load ${laneLoadOf("pareto")} + weight ${longWeight} vs budget ${paretoBudget}`,
  );

  // Release must be exact: a leak here means the lane goes permanently "busy",
  // which is a silent outage rather than an error anyone can see.
  for (const release of held) release();
  check("releasing every slot frees the lane", laneFree("pareto", longWeight));
  check("...and zeroes the load", laneLoadOf("pareto") === 0);

  // Idempotent release: a double-release must not hand back a slot twice, or
  // admission would drift above the budget over a long run.
  const once = laneAcquire("pareto", 2);
  once();
  once();
  check("a double release does not free a slot it did not take", laneLoadOf("pareto") === 0);

  check("an unmeasured lane falls back to the default budget", laneBudgetFor("teamorouter") === LANE_BUDGET_DEFAULT);
  // One, not the two the plan advertises: the advertised count includes the
  // request already in flight, so admitting two guarantees the second one 429s.
  check("electronhub admits exactly one request at a time", LANE_BUDGET.electronhub === 1, String(LANE_BUDGET.electronhub));
  check("...which is a request count, not a weight", LANE_COUNTS_REQUESTS.has("electronhub"));
  resetLaneLoad();
}

// The slot has to outlive the fetch. Releasing at fetch-return would make the
// mirror read free while the upstream is still generating — precisely the
// undercount that produces the provider's own "current: 9, limit: 8".
console.log("Test 9: a lane slot is held until the body finishes, not the fetch");
{
  resetLaneLoad();
  let released = 0;
  const res = new Response(
    new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("data: {}\n\n"));
        controller.close();
      },
    }),
  );
  const wrapped = wrapLaneRelease(res, () => released++, () => released++);
  check("the slot is still held while the body is unread", released === 0);

  const text = await new Response(wrapped.body).text();
  check("the body passes through unchanged", text === "data: {}\n\n");
  check("the slot is released once the body ends", released === 1);

  // A bodyless response (an error the caller still wants to inspect) must
  // release immediately, or a lane would leak a slot per failed request.
  resetLaneLoad();
  let bodyless = 0;
  const noBody = new Response(null, { status: 204 });
  wrapLaneRelease(noBody, () => bodyless++, () => bodyless++);
  check("a bodyless response releases at once", bodyless === 1);

  // Abort takes the shadow path, which is a different release and must not be
  // counted as a normal one — that distinction is what keeps a zombie's slot
  // accounted for after the client has gone.
  resetLaneLoad();
  let normal = 0;
  let shadow = 0;
  const stream = new ReadableStream<Uint8Array>({
    pull() {
      // Never produces: forces the consumer to cancel instead of completing.
      return new Promise(() => {});
    },
  });
  const abortable = wrapLaneRelease(new Response(stream), () => normal++, () => shadow++);
  await abortable.body!.cancel();
  check("cancelling takes the shadow path, not the normal release", shadow === 1 && normal === 0);
  resetLaneLoad();
}

// The failover walk discards non-ok hop responses. Release is wired to the
// body, so a discarded body must be cancelled by the discarding caller —
// skipping the cancel is precisely how pareto sat "saturated" at 8/8 for two
// and a half days having served zero turns (observed 2026-09-14 → 16).
console.log("Test 10: a discarded error body leaks its lane weight; cancelling returns it");
{
  resetLaneLoad();
  const weight = laneWeight(1000);
  const wedged = () =>
    new Response(
      new ReadableStream<Uint8Array>({
        pull() {
          return new Promise(() => {});
        },
      }),
      { status: 503 },
    );

  const releaseLeaked = laneAcquire("pareto", weight);
  const dropped = wrapLaneRelease(wedged(), releaseLeaked, releaseLeaked);
  check("a dropped error response still carries a real status", dropped.status === 503);
  check("an unread, uncancelled body keeps the lane weight forever", laneLoadOf("pareto") === weight);

  const releaseReturned = laneAcquire("pareto", weight);
  const discarded = wrapLaneRelease(wedged(), releaseReturned, releaseReturned);
  await discarded.body!.cancel();
  check("cancelling the discarded body returns its weight", laneLoadOf("pareto") === weight);
  resetLaneLoad();
}

console.log(`\n${passed} passed, ${failed} failed`);
if (failed > 0) throw new Error(`${failed} assertion(s) failed`);
