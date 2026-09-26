// Central pricing config — the ONLY place rates live.
// Everything downstream reads from here: metering, the router chains, the
// calculator, admin margins and the plan quota rows.
//
// Two products:
//   theta     — 200k context, our own model, flat-lane heavy
//   glm-5.3   — 1M context, routed between the full model and flash
//
// Product model ids and upstream model ids are deliberately different things.
// `glm-5.3` is what a client asks for; `glm-5.3-flash` is what may end up
// serving it. The ledger keeps both.

export type RateCard = {
  input: number; // $ per 1M tokens
  output: number;
  cacheHit?: number; // $ per 1M cached tokens
  cacheWrite?: number;
};

export type ProviderId =
  | "hyper"
  | "agnes"
  | "stepfun"
  | "camel"
  | "llmgateway"
  | "electronhub"
  | "openference"
  | "pareto"
  | "teamorouter"
  // The DB fleet is open-ended: an admin can register any provider id. The
  // intersection keeps autocomplete without closing the union.
  | (string & {});

/** Product endpoints. These are the only model names a client may ask for. */
export type EndpointModel = "theta" | "glm-5.3";
export const ENDPOINT_MODELS: readonly EndpointModel[] = ["theta", "glm-5.3"];

// ═══════════════════════════════════════════════════════════════════════════
// USER-FACING (display) rates — what users see on the site and dashboard
// ═══════════════════════════════════════════════════════════════════════════

/** glm-5.3 list rates. Used for the equivalent-cost view and the calculator. */
export const FRONTIER_DISPLAY: RateCard = {
  input: 1.52432,
  output: 4.79072,
  cacheHit: 0.283088,
};

/** theta display rates. theta is metered per request in the plans; these exist
 *  so the dashboard and calculator can put a like-for-like value on it. */
export const THETA_DISPLAY: RateCard = {
  input: 0.2,
  cacheHit: 0.04,
  output: 0.4,
};

// ═══════════════════════════════════════════════════════════════════════════
// ACTUAL upstream rates (admin COGS only — never shown to users)
// ═══════════════════════════════════════════════════════════════════════════

/** Hyper [CORE] — the legitimate fallback for both products. */
export const HYPER: Record<string, RateCard> = {
  "glm-5.3": { input: 1.52432, output: 4.79072, cacheHit: 0.283088 },
  "glm-5.3-flash": { input: 0.16332, output: 0.5444, cacheHit: 0.0315752 },
  // Sits ahead of stepfun in the theta chain (added 2026-09-24): a cheaper
  // metered rung than step-5-preview for turns the flat lanes cannot absorb.
  "qwen3.8-flash": { input: 0.1, output: 0.4 },
};

/**
 * Reference rates for a tier, independent of which lane serves it.
 *
 * The cache-wipe penalty is a property of the model change (prefix re-priced at
 * the incoming model's input rate), not of the provider that happens to be
 * healthy, so it must not move when the ladder rotates. Hyper's catalogue is the
 * reference because it is the only lane guaranteed to exist on every ladder.
 */
export const TIER_RATES: Record<string, RateCard> = {
  "glm-5.3": HYPER["glm-5.3"],
  "glm-5.3-flash": HYPER["glm-5.3-flash"],
};

/** StepFun Step Plan — metered. step-5-preview is the server's stated price
 * ($1.00 miss / $0.05 hit / $2.70 out per 1M); the plan allows 8 concurrent
 * calls, mirrored at 6 in the provider module. */
export const STEPFUN: Record<string, RateCard> = {
  "step-3.7-flash": { input: 0.04, output: 0.1, cacheHit: 0.008 },
  "step-5-preview": { input: 1.0, output: 2.7, cacheHit: 0.05 },
};

/** Pareto Inference — bills at list inside a $20/day token allowance per
 *  account. Two accounts; rotation is the fleet's job, not the router's. */
export const PARETO: Record<string, RateCard> = {
  // Pareto advertises the namespaced ids (`z-ai/glm-5.3-flash`,
  // `deepseek/deepseek-v4-flash`) but accepts the bare form for GLM too; the
  // DeepSeek lane is written namespaced because that is the only spelling its
  // catalogue offers.
  "glm-5.3": { input: 1.52432, output: 4.79072, cacheHit: 0.283088 },
  "glm-5.3-flash": { input: 0.16332, output: 0.5444, cacheHit: 0.0315752 },
  /** DeepSeek V4.1 Flash at list (0.15 / 0.60), matching the same model's card
   *  on TeamoRouter — it is the same weights, so a routing change between the
   *  two lanes must not move the ledger's notion of what a turn cost. */
  "deepseek/deepseek-v4-flash": { input: 0.15, output: 0.6, cacheHit: 0.003 },
};

/** OpenCode zen — the authenticated key lifts the anonymous IP throttle. */
export const OPENCODE: Record<string, RateCard> = {
  "space-bunny-free": { input: 0, output: 0 },
};

/** OpenRouter free tier — :free models are $0 (20 RPM, daily cap per key). */
export const OPENROUTER: Record<string, RateCard> = {
  "nvidia/nemotron-3-ultra-550b-a55b:free": { input: 0, output: 0 },
};

/** OpenRouter #2 — same key under a second provider id (agnes2 pattern) so
 *  the chain can hold a second OpenRouter rung. */
export const OPENROUTER2: Record<string, RateCard> = {
  "qwen/qwen3.8-27b:free": { input: 0, output: 0 },
};

/** Claudin.io — user plan key (flat); claudinio is their coding model. */
export const CLAUDIN: Record<string, RateCard> = {
  claudinio: { input: 0, output: 0 },
};

/** OrcaRouter — free lane. The 402 free_quota_exhausted is an availability
 *  refusal (cool + retry), not a permanent state. */
export const ORCA: Record<string, RateCard> = {
  "orcarouter/free": { input: 0, output: 0 },
};

/** OrcaRouter #2 — the paid "auto" router under wallet billing. Per-token burn
 *  is metered on orca's side (their dashboard); the ledger card is 0/0. */
export const ORCA2: Record<string, RateCard> = {
  "orcarouter/auto": { input: 0, output: 0 },
};

/** LLMGateway — 3× allowance on the dev plan, so the effective rate is 1/3. */
export const LLMGATEWAY: Record<string, RateCard> = {
  "glm-5.3": {
    input: 1.52432 / 3,
    output: 4.79072 / 3,
    cacheHit: 0.283088 / 3,
  },
  "glm-5.3-flash": {
    input: 0.16332 / 3,
    output: 0.5444 / 3,
    cacheHit: 0.0315752 / 3,
  },
};

/** TeamoRouter — discounts move hourly; free variants are genuinely $0.
 *  Paid GLM rates observed at list (no GLM discount), DeepSeek and the GPT
 *  family heavily discounted. Re-verify before trusting margin numbers. */
export const TEAMOROUTER: Record<string, RateCard> = {
  "glm-5.3-flash-free": { input: 0, output: 0 },
  "deepseek-v4-flash-free": { input: 0, output: 0 },
  "glm-5.3-flash": { input: 0.16332, output: 0.5444, cacheHit: 0.0315752 },
  "deepseek-flash": { input: 0.15, output: 0.6, cacheHit: 0.003 },
  /** Overflow candidates (see overflow-models.ts for the quality gate).
   *  Rates are TeamoRouter's live discounted prices, observed 2026-09-12. */
  "gpt-5.6-luna": { input: 0.11, output: 0.64, cacheHit: 0.011 },
  "gpt-5.6-sol": { input: 0.53, output: 3.18, cacheHit: 0.053 },
  "gemini-3.8-flash": { input: 0.29, output: 1.73 },
};

/**
 * Providers whose marginal cost per request is zero because the plan fee is
 * flat. Their real cost is the monthly invoice, amortized at margin level —
 * the ledger still records the request count, which is what amortization
 * divides by.
 *
 * This is not "free": it is prepaid. Keeping the list explicit stops a new
 * provider from silently being treated as zero-cost.
 */
export const FLAT_PROVIDERS: readonly string[] = [
  "agnes",
  "agnes2",
  "agnes3",
  "camel",
  "electronhub",
  "openference",
];

/** Agnes 2.5 Flash — flat plan, tokens included. Concurrency 8 (lowered from
 * the plan's 10 on 2026-09-23 to stretch quota under heavy parallel load;
 * overridable via BHASKARA_AGNES_MAX_CONCURRENCY without a rebuild). */
export const AGNES = {
  planUsd: 10.0,
  requestsPer5h: 7_500,
  requestsPerWeek: 75_000,
  maxConcurrent: 8,
};

/** CamelAI — billed per stream (one concurrent request slot), not per call. */
export const CAMEL = {
  usdPerStreamPerMonth: 5.0,
  /** Config, not a hard limit: raise when load justifies another stream. */
  streams: 1,
  maxStreams: 4,
};

/** Runtime upstream rates, keyed by the provider id the ledger records. */
export const UPSTREAM_RATES: Record<string, Record<string, RateCard>> = {
  hyper: HYPER,
  stepfun: STEPFUN,
  pareto: PARETO,
  llmgateway: LLMGATEWAY,
  teamorouter: TEAMOROUTER,
  opencode: OPENCODE,
  openrouter: OPENROUTER,
  openrouter2: OPENROUTER2,
  claudin: CLAUDIN,
  orca: ORCA,
  orca2: ORCA2,
};

// ═══════════════════════════════════════════════════════════════════════════
// Plans
// ═══════════════════════════════════════════════════════════════════════════

export type PlanId = "trial" | "starter" | "pro" | "super";

export type Plan = {
  id: PlanId;
  priceUsd: number;
  priceInr: number;
  /** theta calls per rolling 5h. null = unlimited (throttled — see THROTTLE). */
  thetaPer5h: number | null;
  /** Extra theta calls per calendar month, usable above 1 concurrent. */
  thetaExtraMonthly: number;
  /** glm-5.3 calls per rolling 5h. */
  glmPer5h: number;
  /** glm-5.3 total tokens per rolling 5h — the cost bound the call cap cannot
   *  provide, because one call may carry a 1M-token context. */
  glmTokensPer5h: number;
  /**
   * No caps of any kind: quota, throttle and concurrency all step aside.
   *
   * Exists for operator keys — the account that runs load tests and drives the
   * product by hand. Encoding it as a flag rather than as very large numbers
   * keeps the headers honest ("unlimited", not "1000000000") and keeps the
   * rejection paths from ever firing with a nonsensical reason.
   */
  unlimited?: boolean;
  /** Shown on the pricing page. The trial is issued but never listed. */
  listed: boolean;
  trialDays?: number;
};

export const PLANS: Record<PlanId, Plan> = {
  trial: {
    id: "trial",
    priceUsd: 0,
    priceInr: 0,
    thetaPer5h: 100,
    thetaExtraMonthly: 0,
    glmPer5h: 20,
    glmTokensPer5h: 1_000_000,
    listed: false,
    trialDays: 1,
  },
  starter: {
    id: "starter",
    priceUsd: 10,
    priceInr: 1000,
    thetaPer5h: 300,
    thetaExtraMonthly: 0,
    glmPer5h: 20,
    glmTokensPer5h: 2_000_000,
    listed: true,
  },
  pro: {
    id: "pro",
    priceUsd: 25,
    priceInr: 2500,
    // Unlimited at one concurrent request; the throttle (THROTTLE) is what
    // keeps a runaway agent from turning "unlimited" into a cost event.
    thetaPer5h: null,
    thetaExtraMonthly: 5_000,
    glmPer5h: 50,
    glmTokensPer5h: 5_000_000,
    listed: true,
  },
  // Operator account. Never sold, never listed, never granted by any signup or
  // billing path — it is assigned by hand for testing and load generation.
  super: {
    id: "super",
    priceUsd: 0,
    priceInr: 0,
    thetaPer5h: null,
    thetaExtraMonthly: 0,
    glmPer5h: 0,
    glmTokensPer5h: 0,
    unlimited: true,
    listed: false,
  },
};

// ═══════════════════════════════════════════════════════════════════════════
// Router policy
// ═══════════════════════════════════════════════════════════════════════════

export const ROUTER = {
  /**
   * HARD CAP on the share of glm-5.3 calls that may take the full model,
   * measured over a trailing week. Enforced as a pre-filter: once the budget
   * is spent the full tier leaves the candidate pool, so capability decides
   * *which* turns escalate but never *how many*.
   *
   * 25% rather than 40%: the full model costs ~9× flash per call, so the
   * difference between the two splits is 28% of glm-5.3 COGS.
   */
  fullModelShareCap: 0.25,
  fullModelShareAlertAt: 0.2,
  /** Share of input tokens expected to be served from cache. Used only for
   *  projections and the calculator default. */
  cacheHitAssumption: 0.8,
  /** Per-turn re-evaluation inside a locked session: a flash-locked session may
   *  upgrade to the full model on a hard turn, paying the cache-wipe re-bill
   *  penalty. All gates must hold. */
  reeval: {
    enabled: true,
    // Sized for agent traffic, not chat. The gate was 16k, which a coding
    // harness passes on essentially every turn — median prefix across the
    // agent fleet is ~25k and the observed max is ~88k — so the prefix check
    // rejected every upgrade before the penalty check ever ran, and the flat
    // lane at the head of the full ladder never saw a request. 64k covers
    // roughly the p90 of real prefixes and still refuses the pathological
    // ones; the penalty bound below does the actual cost work.
    maxPrefixTokensForSwitch: 64_000,
    // Now compared against the *serving* lane's marginal rate, so a flat lane
    // re-prices for nothing and passes, while a metered full lane over a 64k
    // prefix (~$0.09) is still refused.
    maxPenaltyUsd: 0.03,
    // Was 1, which is a chat-sized number: it assumes a session is a handful of
    // turns. Agent sessions run for hundreds — the live fleet had sessions at
    // 170+ turns — so a cap of one meant a session spent its single switch
    // early and then could never escalate again, however hard the work became.
    // The session that was 45 debugging turns deep had already used four and
    // was pinned to flash by the cap, which is why the full ladder stayed empty
    // while hard turns kept arriving.
    //
    // Flip-flop protection does not live here: SWITCH_COOLDOWN_MS enforces a
    // 10-minute floor between switches in either direction, so the churn this
    // cap was guarding against is already bounded. This number only needs to
    // be large enough not to be the binding constraint on a long session.
    maxSwitchesPerSession: 8,
  },
  /** Escalation-on-failure signals that justify an upgrade on the NEXT turn. */
  escalation: {
    enabled: true,
    maxEmptyOutputStreak: 2,
  },
  /**
   * Free-lane leak: how often a NEW session is given to a lane that bills
   * nothing at the margin, rather than being held for hard turns only.
   *
   * The hardness gate is a cost gate — it exists because the full model is ~9x
   * the metered flash price. A flat-billed lane has no such price, so the gate
   * is answering a question that does not apply to it, and the free rung of the
   * full ladder sat underused (6% of glm turns) while metered lanes carried the
   * rest. This lets routine sessions fill flat capacity that would otherwise
   * idle.
   *
   * Session-start, not per-turn, and that distinction is the whole design. A
   * turn-level detour from Pareto to Electron and back would WIPE Pareto's
   * prefix cache: at an 85% hit rate on a 34k prefix the cold re-price costs
   * ~$0.0039, against ~$0.0018 saved on the free turn — a detour costs more than
   * twice what it saves. At session start there is no cache to lose, and the
   * sticky lock then holds the session on the free lane for its whole life,
   * where every subsequent turn is free and the prefix caches there.
   *
   * `rate` only decides how often we TRY. Concurrency is the real bound: a flat
   * lane allows two requests, so the leak fills idle slots and stops. The hard
   * share cap still applies, and the upgrade path still refuses any lane whose
   * marginal rate makes the switch expensive — so a leak that would land on a
   * metered lane is rejected by the existing penalty gate rather than by a
   * rule written here.
   */
  leak: {
    enabled: true,
    rate: 0.25,
  },
};

/**
 * The Pro plan's hidden throughput curve.
 *
 * Never surfaced as a limit, only as felt latency: below `fullSpeedUntil` calls
 * in the rolling window every request is served immediately; between it and
 * `rejectAfter` a delay ramps linearly from `minDelayMs` to `maxDelayMs`; above
 * `rejectAfter` the request is rejected. The intent is to make a runaway agent
 * self-limit rather than to punish a busy hour.
 */
export const THROTTLE = {
  windowHours: 5,
  fullSpeedUntil: 500,
  rejectAfter: 1000,
  minDelayMs: 5_000,
  maxDelayMs: 60_000,
};

/** Concurrency rules. The unlimited theta tier is single-stream; parallelism
 *  is what the extra monthly pool exists to fund. */
export const CONCURRENCY = {
  unlimitedTier: 1,
  extraTierMax: 5,
  /**
   * Operator keys only. High enough to generate real load.
   *
   * Per KEY, and deliberately not a bound on what a provider sees: fan-out
   * from this tier is shaped by the per-provider lane budgets in the gateway's
   * lib/lane-slot, which is where a saturated lane gets skipped rather than
   * queued. Setting this number without those budgets is what let one operator
   * key hand a single lane more concurrent long generations than it could
   * drain — see the tuning history on LANE_BUDGET.
   */
  superTier: 32,
};

// ═══════════════════════════════════════════════════════════════════════════
// Provider ladders — descending preference. First available lane wins.
// ═══════════════════════════════════════════════════════════════════════════

/**
 * One rung of a ladder.
 *
 * `maxInputTokens` is the lane's declared input window. It is not decoration:
 * an oversized request is *rejected* upstream rather than truncated, so a lane
 * that cannot hold the prefix must not be selected — the ladder walks past it
 * and the turn is served by the next lane that fits. Omitted means the provider
 * declares no limit, which is different from unlimited in principle but the
 * same in effect.
 */
export type Lane = {
  provider: ProviderId;
  model: string;
  maxInputTokens?: number;
};

/**
 * theta. Flat lanes first (their marginal cost is zero), then metered lanes
 * ordered by effective rate, then the overflow allowlist — which is appended at
 * runtime from `overflow-models.ts` rather than hardcoded here, so an
 * unverified model can never be reached by accident.
 *
 * Two orderings here are load-bearing and should not be read as arbitrary:
 *
 * StepFun sits above TeamoRouter's free tier even though free is cheaper than
 * $0.04/$0.10. The free tier is a DAILY allowance that resets at 09:00 PT and
 * returns 402 once spent, so it is a limited resource that should absorb the
 * turns the lane above it could not, not the first turns of every session. A
 * free lane used first is a free lane exhausted by mid-afternoon, after which
 * the ladder pays StepFun's metered rate for traffic the allowance would have
 * covered.
 *
 * Pareto's lane was switched from deepseek/deepseek-v4-flash to glm-5.3-flash
 * (operator decision, 2026-09-23): the theta product speaks the GLM family, and
 * at $0.163/$0.544 the flash card sits within a rounding error of the DeepSeek
 * rung it replaced ($0.15/$0.60) — same 1M window, no ordering consequence.
 */
export const THETA_CHAIN: readonly Lane[] = [
  { provider: "camel", model: "auto" },
  // Staged-agnes TEST (2026-09-23): agnes serves at concurrency 4 first; when
  // those slots are full the walk reaches pareto, and only when pareto is also
  // saturated does it return to agnes — as the DB-fleet provider "agnes2", the
  // SAME subscription under a second lane with its own 8-slot semaphore (the
  // plan's real cap is 16, so 4+8 never overbooks the account). "Same provider
  // twice" is otherwise impossible: health is a single provider-keyed boolean,
  // and both entries would share one predicate.
  { provider: "agnes", model: "agnes-2.5-flash" },
  // Pareto at slot 3 (2026-09-26, final): user wants the $40/day allowance
  // actually spent — camel+agnes absorb ~10/min first, then pareto takes the
  // bulk until its 6 slots fill; overflow continues to the free lanes. The
  // per-account dailyCostUsd window is the hard stop: once the $20/account
  // burns, the walk skips pareto on its own. (Slot 2 earlier caused 429
  // storms; slot 6 left the budget unspent. Slot 3 is the middle.)
  { provider: "pareto", model: "glm-5.3-flash" },
  // OrcaRouter free allowance (added 2026-09-26). 402 free_quota_exhausted is
  // treated like teamorouter's free rung: cool briefly, retry later — when the
  // allowance resets this is a full free rung between pareto and claudin.
  { provider: "orca", model: "orcarouter/free" },
  // Claudin.io plan lane (added 2026-09-26): fast (~2.3s TTFT), tool-capable,
  // 6/6 parallel verified. Sits right after agnes as an early flat rung.
  { provider: "claudin", model: "claudinio" },
  // OpenCode zen lane: authenticated key (2026-09-26) lifts the anonymous IP
  // throttle that FreeUsageLimitError'd the lane at ~47% theta share. Only
  // space-bunny-free serves outside the OpenCode client (the rest are
  // client-gated, and we do not spoof). Tool-capable, 8/8 parallel.
  { provider: "opencode", model: "space-bunny-free" },
  // OpenRouter free tier (2026-09-26): nemotron-3-ULTRA 550b-a55b — 55B active
  // (lightning's 3B was too light for agent turns), 1M ctx, 1.3s with tools
  // verified. Rate limits bind per key (~20 RPM), so the account cap keeps
  // this lane a supplement, not a primary absorber.
  { provider: "openrouter", model: "nvidia/nemotron-3-ultra-550b-a55b:free" },
  // Qwen3.8-27b on the same OpenRouter key under a SECOND provider id — the
  // chain can only hold one rung per provider (health is provider-keyed),
  // so openrouter2 mirrors the agnes2 pattern. 256k ctx, tools verified;
  // shares the key's ~20 RPM with the ultra rung above.
  { provider: "openrouter2", model: "qwen/qwen3.8-27b:free" },
  { provider: "agnes2", model: "agnes-2.5-flash" },
  // Agnes on a SECOND subscription (2026-09-26): its own key, its own 16
  // concurrent (capped 15). Flat lanes end here — everything below is paid.
  { provider: "agnes3", model: "agnes-2.5-flash" },
  // qwen3.8-flash on hyper: a cheaper metered rung than step-5-preview, so the
  // walk stops here before paying stepfun's rate (added 2026-09-24). Hyper's
  // own health gate still applies; the last-resort glm-5.3-flash rung on hyper
  // below is untouched and remains the exhaustion fallback.
  { provider: "hyper", model: "qwen3.8-flash" },
  { provider: "stepfun", model: "step-5-preview" },
  { provider: "teamorouter", model: "glm-5.3-flash-free" },
  // OrcaRouter "auto" — their paid router under wallet billing (added
  // 2026-09-26). Sits between the free and paid teamorouter rungs: when the
  // free tier 402s, the walk pays the wallet before paying teamorouter's
  // topped-up balance.
  { provider: "orca2", model: "orcarouter/auto" },
  // Paid sibling directly behind the free rung: when the free tier is
  // unavailable (402 free_request_quota_exhausted — an availability refusal,
  // not a daily quota) the lane cools briefly and the walk lands here, on the
  // balance the account was topped up with — before paying hyper.
  { provider: "teamorouter", model: "glm-5.3-flash" },
  { provider: "hyper", model: "glm-5.3-flash" },
  { provider: "teamorouter", model: "deepseek-flash" },
];

/**
 * glm-5.3 full model.
 *
 * Openference appears only here: it meters requests rather than tokens, so
 * spending one on a flash call wastes a request that a full call needs. Electron
 * appears only here for a different reason — see GLM_FLASH_CHAIN. Its plan allows
 * two concurrent requests, and scarce flat capacity is worth most where the
 * metered alternative is dearest, which is this ladder.
 *
 * TeamoRouter is absent on purpose — it carries the flash variant and DeepSeek,
 * not the full GLM model. When every lane here is unhealthy the turn is served
 * on flash rather than failing, which is the correct degradation.
 *
 * Electron addresses the DevPass variant (`glm-5.3:dev`), not the plain
 * `glm-5.3`: the plain id is a premium model the account 402s on, while the
 * `:dev` ids are the flat-rate Coding Plan ones (`devpass_only: true` in
 * Electron's own catalogue, priced at input 0 / output 0 with a plan
 * multiplier). Both are gated, so with a key that has no Coding Plan this lane
 * fails fast and the ladder walks past — which is what it did before this
 * change too.
 *
 * The 262k window is Electron's declared input size for `glm-5.3:dev`, and it
 * is less than a third of what the other lanes accept. A long-context turn
 * therefore has to skip Electron rather than discover the ceiling as a 400 —
 * which is exactly what `maxInputTokens` is for. The flash ladder's Electron
 * entry declares 1M and so carries no cap.
 *
 * Note that a full call also burns four times the plan units of a flash call
 * (multiplier 2 against 0.5), so the 25% full-share cap prices out nearer 57%
 * of plan burn than 25% of calls.
 */
export const GLM_FULL_CHAIN: readonly Lane[] = [
  { provider: "electronhub", model: "glm-5.3:dev", maxInputTokens: 262_000 },
  { provider: "openference", model: "glm-5.3", maxInputTokens: 899_153 },
  // Pareto's glm-5.3 FULL rung removed 2026-09-18: pareto has paused the full
  // model on their side (only glm-5.3-flash is running right now). Restore
  // `{ provider: "pareto", model: "glm-5.3" }` here when they bring it back.
  { provider: "hyper", model: "glm-5.3" },
  { provider: "llmgateway", model: "glm-5.3" },
];

/**
 * glm-5.3 flash.
 *
 * Electron is deliberately ABSENT, and this was measured rather than assumed.
 * Its Coding Plan is flat, so the obvious move is to lead flash with it: this
 * ladder carries the overwhelming majority of turns (240 flash against 2 full in
 * a sample window) and three days of ledger traffic put flash at $9.27, of which
 * Pareto alone was $6.82. Leading with the flat lane was tried, deployed, and
 * reverted the same day for two reasons.
 *
 * 1. The plan allows TWO concurrent requests. Its own 429 says so: "Concurrency
 *    limit exceeded: your plan currently allows 2 concurrent request(s) (service
 *    mode: interactive)". That is a hard cap on the whole subscription, and it
 *    is far too tight to carry the tier that sees ~99% of traffic.
 *
 * 2. It is the slower lane by a wide margin. Eight matched runs at a 12k-token
 *    prefix: Pareto 1,756ms median with no failures; Electron 4,211ms median
 *    with 3 of 8 answering 429. Even the successful responses were ~2.4x slower.
 *
 * A saturated flat lane is worse than useless at the head of a ladder. Each 429
 * is a wasted round trip before the walk moves on, and nothing cools the lane
 * down afterwards — only StepFun has 429 handling — so the tax is paid on every
 * subsequent turn too.
 *
 * Flat capacity is also SCARCE, and scarce capacity belongs where the metered
 * alternative is most expensive. A full call is roughly 9x the metered price of
 * a flash call, so the plan's two slots are worth far more to the full ladder.
 * See GLM_FULL_CHAIN, where Electron does lead.
 *
 * The rest is descending preference as before: Pareto, Hyper, LLMGateway,
 * TeamoRouter.
 */
export const GLM_FLASH_CHAIN: readonly Lane[] = [
  { provider: "pareto", model: "glm-5.3-flash" },
  { provider: "hyper", model: "glm-5.3-flash" },
  { provider: "llmgateway", model: "glm-5.3-flash" },
  { provider: "teamorouter", model: "glm-5.3-flash" },
];

export function chainFor(endpoint: EndpointModel, tier: "full" | "flash"): readonly Lane[] {
  if (endpoint === "theta") return THETA_CHAIN;
  return tier === "full" ? GLM_FULL_CHAIN : GLM_FLASH_CHAIN;
}

// ═══════════════════════════════════════════════════════════════════════════
// Provider classification (admin display + shadow accounting)
// ═══════════════════════════════════════════════════════════════════════════

/** `core` is the margin proof: everything else is a temporary cost-cutter and
 *  must be kill-switchable. `flat` means the provider is prepaid rather than
 *  per-token, so its ledger cost is 0 and its real cost is a monthly fee. */
export const PROVIDER_CLASS: Record<string, "core" | "flat" | "bootstrap"> = {
  hyper: "core",
  camel: "flat",
  agnes: "flat",
  agnes2: "flat",
  agnes3: "flat",
  electronhub: "flat",
  openference: "flat",
  stepfun: "bootstrap",
  pareto: "bootstrap",
  opencode: "bootstrap",
  openrouter: "bootstrap",
  openrouter2: "bootstrap",
  claudin: "bootstrap",
  orca: "bootstrap",
  orca2: "bootstrap",
  llmgateway: "bootstrap",
  teamorouter: "bootstrap",
};
