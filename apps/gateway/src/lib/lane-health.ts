// Lane health — the single answer to "which providers may serve right now".
//
// Both the skill router and the chain walker read this. Keeping it in one place
// is what makes them agree: a lane the router scored as available and the walker
// skipped, or vice versa, would show up as a decision and a dispatch that
// disagree, which is the hardest class of routing bug to see in production.
//
// A provider absent from the returned map is unavailable. That default is
// deliberate — a ladder entry whose health check has not been wired up is inert
// rather than accidentally live.

import { getFleet, type UpstreamProviderConfig } from "./upstream-config";
import { accountSlotFreeFor } from "../providers/generic";
import { camelEnabled, camelSlotFree } from "../providers/camel";
import { agnesEnabled, agnesSlotFree } from "../providers/agnes";
import { stepfunEnabled, stepfunSlotFree } from "../providers/stepfun";
import { llmGatewayEnabled } from "../providers/llmgateway";
import { hyperBudgetAvailable, hyperAlive } from "./hyper-budget";
import type { LaneHealth } from "../router";

export interface LaneHealthOptions {
  /** Providers to mark unavailable (failover re-decide after a failure). */
  exclude?: Set<string>;
  /** Ignore the Hyper daily budget. Used only by the theta last-resort path,
   *  where an overage is preferable to refusing the request outright. */
  ignoreHyperBudget?: boolean;
}

/**
 * Evaluate every lane once per turn.
 *
 * The only async work is the Hyper budget read and the fleet read, both of which
 * are already in-process cached (the fleet has a 15s TTL), so this stays off the
 * latency path even though it touches the database.
 */
export async function buildLaneHealth(opts: LaneHealthOptions = {}): Promise<LaneHealth> {
  const exclude = opts.exclude ?? new Set<string>();
  const health: LaneHealth = {};
  const set = (id: string, ok: boolean) => {
    if (!exclude.has(id)) health[id] = ok;
  };

  set("camel", camelEnabled() && camelSlotFree());
  set("agnes", agnesEnabled() && agnesSlotFree());
  set("stepfun", stepfunEnabled() && stepfunSlotFree());
  set("llmgateway", llmGatewayEnabled());
  // The account-level dead-mark binds even on the ignoreHyperBudget path: an
  // empty account is not an overage, it is a guaranteed 402 round-trip.
  set("hyper", (opts.ignoreHyperBudget ? true : await hyperBudgetAvailable()) && hyperAlive());

  // DB-registered providers: healthy when at least one account is out of
  // cooldown, enabled, AND holding a free concurrency slot.
  //
  // It must be ANY account, not the rotation's pick: pickAccount's cursor
  // lands on one account per call, and when that one is slot-full the lane
  // read as unhealthy while a sibling account sat idle — a two-account
  // provider effectively got the concurrency of one (observed on pareto:
  // "full" at 4 in-flight with 3+3 configured).
  const fleet = await getFleet().catch(() => new Map<string, UpstreamProviderConfig>());
  const now = Date.now();
  for (const [id, cfg] of fleet) {
    if (exclude.has(id)) continue;
    health[id] = cfg.accounts.some(
      (a) => !a.disabled && (a.cooldownUntil ?? 0) <= now && accountSlotFreeFor(a),
    );
  }

  return health;
}

/** Single-lane check, for the failover path where only one provider matters. */
export async function providerHealthy(providerId: string): Promise<boolean> {
  const health = await buildLaneHealth();
  return health[providerId] === true;
}
