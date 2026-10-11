// In-memory stand-ins for the three places the upgrade path touches Postgres.
//
// `considerUpgrade`, `laneInputRateUsdPerM` and `freeLanesOf` read the fleet
// table (which lanes bill flat, and at what rate), read the skill matrix, and
// write the session lock on a grant. The tests that pin that path used to take
// all three from whatever DATABASE_URL happened to name, which made their
// verdict a property of the machine rather than of the code:
//
//  - With no database in reach, decision.ts swallows the fleet error
//    (`getFleet().catch(() => new Map())`) and carries on with an empty fleet.
//    Electronhub then reads as metered, is priced at the tier rate, and every
//    upgrade is refused on the penalty gate — so the suite reported "skill
//    vetoed escalation" and "0 free rungs" for what was a refused connection.
//    Two files, seven assertions, and none of them about the code under test.
//  - With a database in reach they passed or failed on its seed. "A ladder with
//    no flat lane" was being demonstrated on the flash ladder, which has led
//    with a flat lane since 2026-09-28; it kept passing only where the fleet
//    table had no flat agnes4 row.
//  - And every run that did reach one upserted `test-upgrade-*` rows into its
//    `session_locks` and left them there.
//
// So the fleet here is a fixture, the matrix is pinned cold, and lock writes are
// recorded instead of persisted. What this cannot tell you is whether the
// production fleet table agrees with the fixture — that is a property of the
// deployment, and `select id, billing, active from upstream_providers` on the
// box is the check for it, not a unit test.
//
// Not a `.test.ts`, so run-all does not pick it up.

import { mock } from "bun:test";
import { FLAT_PROVIDERS } from "@bhaskara/shared/pricing";
import type { UpstreamModel, UpstreamProviderConfig } from "../lib/upstream-config";

function model(
  modelId: string,
  tier: UpstreamModel["tier"],
  contextWindow: number,
  inputUsdPerM: number,
  outputUsdPerM: number,
  cacheReadUsdPerM = 0,
): UpstreamModel {
  return { modelId, alias: null, visibility: "private", tier, contextWindow, maxOutput: 32_768, inputUsdPerM, outputUsdPerM, cacheReadUsdPerM };
}

/** Billing comes from FLAT_PROVIDERS rather than being restated per provider.
 *  The fleet column and that list have to agree in production — the ledger
 *  reads one and the router the other — so the fixture is the fleet a correct
 *  seed produces, and dropping a provider from the list shows up in the tests
 *  that depend on its lane being free. */
function provider(id: string, models: UpstreamModel[]): UpstreamProviderConfig {
  return {
    id,
    baseUrl: `https://${id}.invalid/v1`,
    protocol: "openai",
    authStyle: "bearer",
    billing: FLAT_PROVIDERS.includes(id) ? "flat" : "metered",
    accounts: [],
    models,
  };
}

/**
 * The DB-registered providers that appear in the glm ladders.
 *
 * Hyper and LLMGateway are deliberately absent: they are env-configured lanes
 * with no fleet row, which is the case `laneInputRateUsdPerM` answers from
 * TIER_RATES. Electronhub's card carries list rates (1.4 / 4.4) exactly as the
 * seed does, so "flat" has to come from the billing flag and cannot be faked by
 * a zero on the rate card.
 */
export const FIXTURE_FLEET: ReadonlyMap<string, UpstreamProviderConfig> = new Map(
  [
    provider("electronhub", [model("glm-5.3:dev", "full", 262_000, 1.4, 4.4, 0.26)]),
    provider("agnes4", [model("agnes-3.0-flash", "flash", 200_000, 0, 0)]),
    provider("teamorouter", [model("glm-5.3-flash", "flash", 200_000, 0.16332, 0.5444, 0.0315752)]),
  ].map((p) => [p.id, p]),
);

export interface LockWrite {
  sessionId: string;
  userId: string;
  endpoint: string;
  model: string;
  opts?: { bumpSwitch?: boolean; routine?: boolean };
}

export interface RouterFixtures {
  /** Every `setLock` the code under test issued, in order. */
  lockWrites: LockWrite[];
  /** Put the real modules back. run-all imports every test file into one
   *  process and module mocks outlive the file that installed them, so a file
   *  that does not undo its own would hand the fixture fleet to every file
   *  after it. */
  restore(): void;
}

const FLEET = "../lib/upstream-config";
const LOCKS = "../lib/session-lock";
const CARDS = "../lib/skill-cards";

// Captured once per process, on first install. A file that threw before its
// restore leaves the mocks in place, and capturing again from there would save
// the fixture as "the original".
let originals: Record<typeof FLEET | typeof LOCKS | typeof CARDS, Record<string, unknown>> | null = null;

/**
 * Swap the fleet, skill-matrix and lock modules for fixtures.
 *
 * Each mock is the real module with one export replaced, never a bare object.
 * A module that has not been loaded yet is replaced wholesale by its mock, so a
 * partial one makes every later importer fail to link on the exports it left
 * out — which export is missing then depends on the order the runner happened
 * to read the directory in.
 */
export async function installRouterFixtures(): Promise<RouterFixtures> {
  originals ??= {
    [FLEET]: { ...(await import(FLEET)) },
    [LOCKS]: { ...(await import(LOCKS)) },
    [CARDS]: { ...(await import(CARDS)) },
  };
  const real = originals;
  const lockWrites: LockWrite[] = [];

  mock.module(FLEET, () => ({ ...real[FLEET], getFleet: async () => FIXTURE_FLEET }));
  mock.module(LOCKS, () => ({
    ...real[LOCKS],
    setLock: async (sessionId: string, userId: string, endpoint: string, model: string, opts?: LockWrite["opts"]) => {
      lockWrites.push({ sessionId, userId, endpoint, model, opts });
    },
  }));
  // An empty matrix is what `skillDecide` treats as "no opinion". Pinned rather
  // than read, because a calibrated table makes it answer and the cold-matrix
  // contract would then go untested on exactly the deployments that have one.
  mock.module(CARDS, () => ({ ...real[CARDS], getSkillMap: async () => ({}) }));

  return {
    lockWrites,
    restore() {
      mock.module(FLEET, () => real[FLEET]);
      mock.module(LOCKS, () => real[LOCKS]);
      mock.module(CARDS, () => real[CARDS]);
    },
  };
}
