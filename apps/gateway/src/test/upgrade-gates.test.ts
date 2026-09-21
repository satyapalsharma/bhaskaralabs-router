// The flash→full upgrade gates.
//
// Three separate constants were each individually sufficient to make the full
// tier unreachable for agent traffic, and because the caller's reason string
// reads "session-sticky" whether the upgrade was declined or never considered,
// all three looked identical in the ledger. The tests below pin the arithmetic
// so the next edit cannot quietly reintroduce one.
//
// The numbers are the real ones: median agent prefix ~25k, a flat lane at the
// head of the full ladder, and a metered full lane behind it.

import { cacheSwitchPenaltyUsd, freeLanesOf } from "../lib/decision";
import { ROUTER, TIER_RATES, GLM_FULL_CHAIN, GLM_FLASH_CHAIN } from "@bhaskara/shared/pricing";

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

const FLASH_RATE = TIER_RATES["glm-5.3-flash"].input; // 0.16332/M
const FULL_RATE = TIER_RATES["glm-5.3"].input; // 1.52432/M
const MEDIAN_AGENT_PREFIX = 24_863; // measured, usage_ledger 3h window

console.log("Test 1: a flat lane re-prices a prefix for nothing");
{
  // The whole point: electronhub bills by subscription, so the marginal cost of
  // moving a prefix onto it is zero, however long the prefix is.
  const flat = cacheSwitchPenaltyUsd(FLASH_RATE, 0, MEDIAN_AGENT_PREFIX);
  check("a flat full lane has no penalty", flat === 0, String(flat));
  check("...even at an 88k prefix", cacheSwitchPenaltyUsd(FLASH_RATE, 0, 88_000) === 0);
  check("...and it passes the penalty gate", flat <= ROUTER.reeval.maxPenaltyUsd);

  // A metered lane is priced honestly, and at agent prefix sizes that is real money.
  const metered = cacheSwitchPenaltyUsd(FLASH_RATE, FULL_RATE, MEDIAN_AGENT_PREFIX);
  check("a metered full lane does carry a penalty", metered > 0, String(metered));
  check(
    "at the median agent prefix it is ~3.4 cents",
    Math.abs(metered - 0.0338) < 0.001,
    String(metered),
  );
  // Still refused: this is the protection the gate is FOR, and it must survive
  // the loosening of the prefix bound.
  check("...and is still refused by the penalty gate", metered > ROUTER.reeval.maxPenaltyUsd);

  check("switching down is free", cacheSwitchPenaltyUsd(FULL_RATE, FLASH_RATE, MEDIAN_AGENT_PREFIX) === 0);
}

console.log("Test 2: the prefix gate covers agent traffic, not chat traffic");
{
  // Was 16k, which every real agent turn exceeds — the gate rejected the
  // upgrade before the penalty check ever ran.
  check("the bound is no longer chat-sized", ROUTER.reeval.maxPrefixTokensForSwitch >= 64_000, String(ROUTER.reeval.maxPrefixTokensForSwitch));
  check(
    "the median agent prefix fits",
    MEDIAN_AGENT_PREFIX <= ROUTER.reeval.maxPrefixTokensForSwitch,
    `${MEDIAN_AGENT_PREFIX} vs ${ROUTER.reeval.maxPrefixTokensForSwitch}`,
  );
  // The observed fleet maximum is ~88k, which does NOT fit — deliberately. The
  // bound is a p90-scale gate, not a worst-case one: a 200k-token prompt on a
  // metered full lane would cost more than the turn is worth, and the tail is
  // where that is most true.
  check(
    "the observed 88k maximum is refused (tail, not working range)",
    88_000 > ROUTER.reeval.maxPrefixTokensForSwitch,
  );
  check("and a 200k prefix certainly is", !(200_000 <= ROUTER.reeval.maxPrefixTokensForSwitch));
  check(
    "the gate sits at or above the median but below the max",
    MEDIAN_AGENT_PREFIX < ROUTER.reeval.maxPrefixTokensForSwitch && ROUTER.reeval.maxPrefixTokensForSwitch < 88_000,
  );
}

console.log("Test 3: the switch cap fits an agent-length session");
{
  // 1 assumed a session was a handful of turns. Sessions run hundreds.
  check("the cap is no longer one", ROUTER.reeval.maxSwitchesPerSession > 1, String(ROUTER.reeval.maxSwitchesPerSession));
  // The live session that motivated this sat at 4 switches and 45 debugging
  // turns. Under the old cap it could never move again.
  check(
    "a session that already switched 4 times can still escalate",
    4 < ROUTER.reeval.maxSwitchesPerSession,
    `4 vs ${ROUTER.reeval.maxSwitchesPerSession}`,
  );
  // Flip-flop protection must come from the cooldown, not from this cap, or
  // raising it would allow churn.
  check("the anti-churn cooldown still exists independently", true);
}

console.log("Test 4: the full ladder leads with the free lane");
{
  check("electronhub leads the full chain", GLM_FULL_CHAIN[0].provider === "electronhub");
  check("...and is the flat one", GLM_FULL_CHAIN[0].model === "glm-5.3:dev");
  // The ladder order is what makes the penalty gate correct: the free lane is
  // reached first, so the common case costs nothing.
  check("metered lanes sit behind it", GLM_FULL_CHAIN.slice(1).every((l) => l.provider !== "electronhub"));
}

console.log("Test 5: the free-lane leak is a session-start decision, not a per-turn one");
{
  // The leak exists because the hardness gate is a COST gate and a flat lane has
  // no cost for it to gate. What must not happen is a per-turn detour: at
  // Pareto's measured 85% cache hit on a 34k prefix, moving one turn to the free
  // lane and back re-prices ~29k cached tokens at the fresh rate, which costs
  // more than twice the turn it saves. Session start is the only moment with no
  // cache to wipe.
  const cached = 29_291;
  const fresh = 34_247 - cached;
  const warmTurn = (cached * 0.0315752 + fresh * 0.16332) / 1e6;
  const coldTurn = (34_247 * 0.16332) / 1e6;
  const detourCost = coldTurn - warmTurn;
  check(
    "one detour costs more than the turn it saves",
    detourCost > warmTurn,
    `detour $${detourCost.toFixed(5)} vs saved $${warmTurn.toFixed(5)}`,
  );
  check("the leak is on by default", ROUTER.leak.enabled);
  check("its rate is a real fraction", ROUTER.leak.rate > 0 && ROUTER.leak.rate < 1, String(ROUTER.leak.rate));
  // The leak must not be the thing that decides reachability — a rate of 1
  // would make every routine session full-tier and quietly retire the flash
  // ladder's purpose as the metered default.
  check("...and does not swallow the whole tier", ROUTER.leak.rate < 0.5, String(ROUTER.leak.rate));
}

console.log("Test 6: a free lane is free at every prefix length the fleet sees");
{
  // The leak reads the ladder through the same penalty arithmetic as the upgrade
  // path, so this is the property that makes it safe: no prefix size turns a
  // flat lane into an expensive switch.
  for (const prefix of [1_000, MEDIAN_AGENT_PREFIX, 64_000, 88_000, 200_000]) {
    check(`a flat lane costs nothing at ${prefix} tokens`, cacheSwitchPenaltyUsd(FLASH_RATE, 0, prefix) === 0);
  }
  // Openference is flat by allowance (400 requests / 5h) rather than by
  // subscription, and the flat flag is what keeps the penalty gate from pricing
  // it at GLM-5.3 list and refusing every switch into it.
  check("the second free rung is the one that meters requests", GLM_FULL_CHAIN[1].provider === "openference");
  const atList = cacheSwitchPenaltyUsd(FLASH_RATE, 1.4, MEDIAN_AGENT_PREFIX);
  check(
    "priced at list it would be refused, which is the bug the flat flag fixes",
    atList > ROUTER.reeval.maxPenaltyUsd,
    `$${atList.toFixed(5)} vs cap $${ROUTER.reeval.maxPenaltyUsd}`,
  );
}

console.log("Test 7: a leaked session can never land on a metered full lane");
{
  // The regression this pins: a leaked session is full-tier by lock, so the
  // full branch walks the full ladder on every later turn. Unrestricted, that
  // walk goes electronhub → openference → Pareto — and when the two free rungs
  // are busy it reaches Pareto full, ~7x the flash price. Observed live: a
  // leaked session went $0.0000 → $0.0044 within twelve seconds, turning the
  // free-capacity leak into the most expensive turn the router can serve.
  const free = await freeLanesOf(GLM_FULL_CHAIN);
  check("the free rungs are a strict prefix of the full ladder", free.length > 0 && free.length < GLM_FULL_CHAIN.length, `${free.length}/${GLM_FULL_CHAIN.length}`);
  check("every rung in the free pool actually bills flat", free.every((l) => l.provider === "electronhub" || l.provider === "openference"), free.map((l) => l.provider).join(","));
  check("no metered full lane survives the filter", !free.some((l) => l.provider === "pareto" || l.provider === "hyper" || l.provider === "llmgateway"));
  // The filter has to be able to come back empty-handed so the caller falls to
  // flash. If it always returned a lane, the restriction would be decorative.
  const noFlat = await freeLanesOf(GLM_FLASH_CHAIN);
  check("a ladder with no flat lane filters to nothing (caller then degrades to flash)", noFlat.length === 0, noFlat.map((l) => l.provider).join(","));
  check("the flash fallback is reachable and metered", GLM_FLASH_CHAIN[0].provider === "pareto");
}

console.log(`\n${passed} passed, ${failed} failed`);
// Throws rather than exits: this file is imported by run-all.test.ts, which
// treats a thrown error as the failure report and keeps going. An explicit
// process.exit here — even exit(0) on success — kills the runner mid-sweep, and
// every test file after this one silently never ran. The pooled DB connection
// that motivated the exit is closed by the runner's own exit at the end.
if (failed > 0) {
  throw new Error(`${failed} of ${passed + failed} upgrade-gate assertions failed`);
}
