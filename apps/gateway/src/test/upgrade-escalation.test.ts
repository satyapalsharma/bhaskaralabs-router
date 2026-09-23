// The flash→full escalation must survive a cold skill matrix.
//
// The ledger said "session-sticky" for 59 consecutive glm turns, all classified
// `debugging`, all on a healthy flat full lane, all with share 0 against a 0.25
// cap. Every gate the arithmetic owns was open, so the traffic looked like a
// capacity problem. It was not: `considerUpgrade` tested `skillDecide`'s result
// with `if (!result || ...) return null`, and a cold matrix makes skillDecide
// return null *by design* (see the empty-matrix guard in skill-decide.ts). So
// `skill` was a disable switch — enabling it pinned every flash-locked session to
// flash, and the fresh-session path stayed healthy only because it happens to
// write `if (result)` and continue instead of returning.
//
// The invariant, stated once: **no opinion from the skill router means the
// heuristic decides, never that nobody decides.** Same contract the fresh path
// already honours.
//
// Needs a database: considerUpgrade reads the lane rate and writes the lock.

import { considerUpgrade, cacheSwitchPenaltyUsd, shareCapBinds } from "../lib/decision";
import { ROUTER, GLM_FULL_CHAIN } from "@bhaskara/shared/pricing";
import type { LaneHealth } from "../router";
import type { SessionLock } from "../lib/session-lock";
import type { AuthContext } from "../lib/auth";
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

const HARD = "## Problem\nVerification gate still reports: the build is failing with TS2345. Fix it.";

const auth: AuthContext = {
  userId: "test-upgrade-fallthrough",
  // "pro", not "super": the operator plan is exempt from the share cap, and
  // this file's cap assertions need a plan the cap actually binds.
  plan: "pro",
  apiKeyId: "test-key",
  sessionId: "test-upgrade-fallthrough",
  flags: "skill",
};

const health: LaneHealth = {};
for (const l of GLM_FULL_CHAIN) health[l.provider] = true;
health.pareto = true;
health.camel = true;
health.agnes = true;

/** A flash-locked session with every gate open. */
const lock: SessionLock = {
  lockedModel: "glm-5.3-flash",
  stale: false,
  switchCount: 0,
  routineStreak: 0,
  lastSwitchAt: null,
};

function inputs(skill: boolean, over: Partial<SessionLock> = {}) {
  return {
    auth,
    // Unique per case so setLock writes cannot leak between assertions.
    sessionId: `test-upgrade-${Math.random().toString(36).slice(2, 10)}`,
    endpointModel: "glm-5.3" as const,
    messages: [{ role: "user", content: HARD }] as ChatMessage[],
    options: { skill },
    health,
    exclude: new Set<string>(),
    lock: { ...lock, ...over },
    hardness: "debugging" as const,
    signals: { stage: "unknown", source: "glm" },
    share: 0,
    prefixTokens: 24_863,
    fullModel: "glm-5.3",
    flashModel: "glm-5.3-flash",
    failSignals: { testFailBlocks: 0, toolLoopRepeats: 0 },
  };
}

console.log("Test 1: the gates this depends on are actually open");
{
  check("share 0 is under the cap", 0 < ROUTER.fullModelShareCap);
  check("the prefix is under the switch gate", 24_863 <= ROUTER.reeval.maxPrefixTokensForSwitch);
  check("reeval is enabled", ROUTER.reeval.enabled);
  check("a fresh lock has switches left", lock.switchCount < ROUTER.reeval.maxSwitchesPerSession);
  const penalty = cacheSwitchPenaltyUsd(0.16, 0, 24_863);
  check("a flat full lane carries no penalty", penalty <= ROUTER.reeval.maxPenaltyUsd, String(penalty));
  // The operator account is contractually cap-free ("No caps of any kind") —
  // the share cap must not de-escalate its traffic to the cheap lane.
  check("the share cap binds a paying plan at the cap", shareCapBinds("pro", ROUTER.fullModelShareCap));
  check("the share cap does not bind the operator plan", !shareCapBinds("super", 1));
}

console.log("\nTest 2: skill ON must not veto escalation on a cold matrix");
{
  // The regression. With an empty skill_cards table skillDecide returns null, so
  // this call returned null before the fix and the session stayed on flash.
  const decision = await considerUpgrade({ ...inputs(true), sessionId: "test-upgrade-skill-on" });
  check("an upgrade is still granted", decision !== null, "got null — skill vetoed escalation");
  check(
    "and it lands on the full tier",
    decision?.tier === "full",
    `tier=${decision?.tier} model=${decision?.upstreamModel}`,
  );
  check(
    "resolved to a lane the full ladder actually offers",
    GLM_FULL_CHAIN.some((l) => l.provider === decision?.provider),
    String(decision?.provider),
  );
  check(
    "the reason does not read as a skill decision",
    !!decision && !String(decision.reason).includes("skill"),
    String(decision?.reason),
  );
}

console.log("\nTest 3: the same turn with skill OFF behaves identically");
{
  const off = await considerUpgrade({ ...inputs(false), sessionId: "test-upgrade-skill-off" });
  check("skill off still upgrades", off !== null);
  check("and reaches the full tier", off?.tier === "full", String(off?.tier));
}

console.log("\nTest 4: a hard cap still refuses, with skill on or off");
{
  for (const skill of [true, false]) {
    const d = await considerUpgrade({
      ...inputs(skill),
      sessionId: `test-upgrade-capped-${skill}`,
      share: ROUTER.fullModelShareCap + 0.1,
    });
    check(`share over the cap refuses (skill=${skill})`, d === null, `tier=${d?.tier}`);
  }
}

console.log("\nTest 5: a spent switch budget still refuses");
{
  const d = await considerUpgrade({
    ...inputs(true),
    sessionId: "test-upgrade-noswitch",
    lock: { ...lock, switchCount: ROUTER.reeval.maxSwitchesPerSession },
  });
  check("no switches left refuses", d === null, `tier=${d?.tier}`);
}

console.log("\nTest 6: an over-long prefix still refuses");
{
  const d = await considerUpgrade({
    ...inputs(false),
    sessionId: "test-upgrade-longprefix",
    prefixTokens: ROUTER.reeval.maxPrefixTokensForSwitch + 1,
  });
  check("prefix past the gate refuses", d === null, `tier=${d?.tier}`);
}

console.log(`\n${passed} passed, ${failed} failed`);
// Throws rather than exits — run-all.test.ts imports this file and reads a throw
// as the failure report. An exit would kill the sweep, which is how thirteen test
// files silently stopped running.
if (failed > 0) {
  throw new Error(`${failed} of ${passed + failed} upgrade-escalation assertions failed`);
}

// considerUpgrade writes locks, so the DB pool holds the event loop open past the
// last assertion. Only relevant when this file is the entry point: under the
// runner the process belongs to the runner. Exiting unconditionally here is the
// exact bug the throw above exists to avoid.
if (import.meta.main) process.exit(0);
