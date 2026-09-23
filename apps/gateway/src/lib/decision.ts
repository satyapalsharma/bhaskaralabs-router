// Shared turn decision (used by BOTH /v1/chat/completions and /v1/messages).
//
// Policy: session-sticky lock (cache commandment #5) + per-turn re-evaluation:
// a flash-locked session may UPGRADE to the full model on a hard turn when the
// cache-wipe penalty (prefix re-priced at full-model input rate) is cheap enough.
// Downgrades never happen mid-session — a full lock always stays full until a
// calm streak earns one.
//
// Two things happen here that are worth keeping separate in your head:
//
//   tier   — full or flash. Decided by the skill router when the key has it on,
//            otherwise by the hardness heuristic. Bounded by the hard share cap.
//   lane   — which provider serves that tier. Resolved from the preference
//            ladder against live lane health, never decided by quality.
//
// The provider is therefore never hardcoded on a return path. If you find
// yourself writing `provider: "hyper"` below, the ladder is being bypassed.

import { db } from "../db";
import { usageLedger } from "../db/schema";
import { and, eq, gte, sql } from "drizzle-orm";
import { ROUTER, TIER_RATES, chainFor, PLANS, type EndpointModel, type Lane, type PlanId } from "@bhaskara/shared/pricing";
import type { AuthContext } from "./auth";
import { estimateTokens, type ChatMessage } from "./prefix";
import { capabilityArray, capabilityVector } from "../router/capability";
import { getLock, setLock, touchSession, SWITCH_COOLDOWN_MS, DOWN_STREAK, type SessionLock } from "./session-lock";
import {
  baseModelOf,
  classifyHardness,
  fairUseState,
  flashModelFor,
  fullModelFor,
  fullTierAllowed,
  isHard,
  pickLane,
  resolveLane,
  tierOf,
  type LaneHealth,
  type RouterDecision,
  type RouterSignals,
  type Tier,
} from "../router";
import { getFleet, type UpstreamProviderConfig } from "./upstream-config";
import { buildLaneHealth } from "./lane-health";
import { scanFailureSignals, emptyOutputStreak, TOOL_LOOP_ESCALATE_AT, dudStreak } from "./escalation";
import { hyperBudgetAvailable } from "./hyper-budget";
import { detectStage } from "./stage-router";
import { judgeClassify, judgeCandidate } from "./llm-judge";
import { skillDecide, skillSignals } from "./skill-decide";

/** Per-session max escalations per rolling hour — runaway fix-loop guard. */
const SESSION_MAX_ESCALATIONS_PER_HOUR = 30;

/** Text of the most recent user turn, for hardness classification.
 *
 *  Content arrives in two shapes: a plain string, or an array of typed blocks.
 *  The block form is what the Anthropic shape and every tool-using harness send,
 *  and on live traffic it is not an edge case but the norm — 379 of 400 sampled
 *  coding-agent requests, with the other 21 carrying no user message at all.
 *  Reading only the string form returned "" for every one of them, so
 *  classifyHardness was handed an empty string and answered "routine" for the
 *  entire fleet. Nothing was ever hard, so no glm session ever escalated to the
 *  full model and the whole tier system sat inert in production while its unit
 *  tests passed — the tests fed it strings.
 *
 *  Block text is joined rather than truncated: this feeds a regex classifier and
 *  the caller already bounds what it looks at.
 *
 *  Exported for the hardness test, which pins the block shape specifically — the
 *  bug was in this extraction, not in the classifier, so a test that calls the
 *  classifier with a string cannot see it. */
export function lastUserText(messages: ChatMessage[]): string {
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  if (!lastUser) return "";
  const content = lastUser.content;
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  const parts: string[] = [];
  for (const block of content) {
    if (block && typeof block === "object" && "text" in block) {
      const t = (block as { text?: unknown }).text;
      if (typeof t === "string") parts.push(t);
    }
  }
  return parts.join("\n");
}

/** Machine-readable routing inputs, persisted with the ledger row so skill-card
 *  calibration can regress on them. Every function here is a regex pass over the
 *  live zone (or a Map lookup), so this stays off the latency budget.
 *
 *  Exported for the calibration-contract test: the `capability` field this
 *  returns is the only input the estimator cannot reconstruct from the ledger,
 *  so its presence is asserted rather than assumed. */
export function routingSignals(
  messages: ChatMessage[],
  sessionId: string,
  hardness: string,
  shared: Record<string, unknown> = {},
): Record<string, unknown> {
  const fail = scanFailureSignals(messages);
  const stage = detectStage(messages);
  // What the turn is asking for, as a distribution over the six capabilities.
  // This is the one signal calibration cannot reconstruct afterwards: it
  // describes the ask, and a ledger row preserves only the outcome. Recorded
  // unconditionally — the `skill` flag decides whether the matrix steers the
  // route, never whether the turn is worth learning from. Gating this behind the
  // flag is why calibration had nothing to read: the estimator needs a labelled
  // capability vector per turn, and without one it skips every row.
  const capability = capabilityArray(
    capabilityVector({
      messages,
      hardness,
      stage: stage.stage,
      failBlocks: fail.testFailBlocks,
      loopRepeats: fail.toolLoopRepeats,
    }),
  );
  return {
    hardness,
    stage: stage.stage,
    stageBlocks: stage.liveZoneBlocks,
    failBlocks: fail.testFailBlocks,
    loopRepeats: fail.toolLoopRepeats,
    emptyStreak: emptyOutputStreak(sessionId),
    dudStreak: dudStreak(sessionId),
    prefixTokens: estimateTokens(messages),
    capability,
    ...shared,
  };
}

/**
 * Cache-wipe re-bill penalty for a flash→full switch: the prefix re-priced at
 * the full model's input rate.
 *
 * Takes the *serving lane's* rate rather than the tier's representative rate.
 * That correction is the whole point of the function: the ladder leads with a
 * flat-billed lane, and a flat lane re-prices a prefix for nothing. Reading the
 * tier rate instead priced every switch as if a metered lane would serve it,
 * which blocked upgrades that were in fact free.
 *
 * `fullRate` of 0 therefore means "no marginal cost" and the penalty is 0 — the
 * caller does not need a separate branch for flat lanes.
 */
export function cacheSwitchPenaltyUsd(flashRate: number, fullRate: number, prefixTokens: number): number {
  return (prefixTokens * Math.max(0, fullRate - flashRate)) / 1e6;
}

/**
 * Marginal input rate for a lane, in $/M tokens.
 *
 * A flat-billed provider (a subscription plan, not a token meter) has a
 * marginal rate of zero: the plan is already paid for, so an extra million
 * tokens costs nothing. Its rate card still carries a headline number for
 * user-facing value comparisons, and using that as the marginal rate is what
 * made a free upgrade look expensive — the failure this function exists to
 * prevent.
 *
 * Falls back to the tier's representative rate when the lane is not in the
 * fleet table (the hardcoded lanes), so a caller always gets a usable number.
 */
export async function laneInputRateUsdPerM(providerId: string, modelId: string, tierFallbackModel: string): Promise<number> {
  const fleet = await getFleet().catch(() => new Map<string, UpstreamProviderConfig>());
  const provider = fleet.get(providerId);
  if (!provider) return TIER_RATES[tierFallbackModel]?.input ?? 0;
  if (provider.billing === "flat") return 0;
  const base = baseModelOf(modelId);
  const model = provider.models.find((m) => m.modelId === modelId || m.modelId === base);
  return model?.inputUsdPerM ?? TIER_RATES[tierFallbackModel]?.input ?? 0;
}

/**
 * A ladder narrowed to the lanes that bill nothing at the margin.
 *
 * Health and context-window filtering are left to `pickLane`, so this is only
 * the "which rungs are free" question — the caller still walks it the normal
 * way. Returns the ladder unchanged when the fleet has no flat provider, which
 * makes the leak inert rather than a source of guesses.
 */
export async function freeLanesOf(chain: readonly Lane[]): Promise<readonly Lane[]> {
  const fleet = await getFleet().catch(() => new Map<string, UpstreamProviderConfig>());
  return chain.filter((l) => fleet.get(l.provider)?.billing === "flat");
}

/**
 * Whether the model a session is locked to is served by a flat-billed lane.
 *
 * De-escalation is a cost optimisation and there is no cost to optimise away
 * from a free lane: coming down would move the session onto a metered lane and
 * start paying per token, which is the opposite of what the routine-streak rule
 * is for. The lock records a model id rather than a provider, so the question is
 * asked of the fleet's models — any flat provider serving that id counts.
 */
async function lockedOnFreeLane(lockedModel: string): Promise<boolean> {
  const fleet = await getFleet().catch(() => new Map<string, UpstreamProviderConfig>());
  const base = baseModelOf(lockedModel);
  for (const p of fleet.values()) {
    if (p.billing !== "flat") continue;
    if (p.models.some((m) => m.modelId === lockedModel || baseModelOf(m.modelId) === base)) return true;
  }
  return false;
}

/**
 * Share-cap gate with the operator exemption folded in. The super plan's own
 * contract is "No caps of any kind" — but the full-share cap was binding it
 * too, which de-escalated the operator's bench traffic to flash at 25% and
 * made multi-thousand-token turns crawl on the cheapest lane. Paying plans
 * keep the cap; the operator account does not.
 */
export function shareCapBinds(plan: string, share: number): boolean {
  if (PLANS[plan as PlanId]?.unlimited) return false;
  return !fullTierAllowed(share);
}

/**
 * Share of a user's glm-5.3 calls that took the full model, over a trailing week.
 *
 * Denominator is glm-5.3 turns only. Theta turns are a different product on a
 * different ladder and can never take the full model, so counting them would
 * dilute the share — the observed failure was a real 23.4% glm full-share
 * displayed as 8.9% overall because 1300+ theta turns padded the denominator,
 * leaving the cap silently blown while the metric looked healthy.
 *
 * Flat-billed lanes COUNT (changed 2026-09-18). The cap was previously a
 * metered-spend bound that excluded flat turns from both sides, and with the
 * flat rungs healthy the router's share read 0% — the cap never fired and the
 * realized model mix ran 32-52% full against a 25% product promise. Flat
 * capacity is not unbounded either: electronhub bills a full call at 4x the
 * plan units of a flash call, and openference spends its 400/5h request window
 * one way or the other. The cap is the model-mix limit it reads as.
 */
async function weeklyFullShare(userId: string): Promise<number> {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const rows = await db
    .select({ total: sql`count(*)`, full: sql`count(*) filter (where routed_to = 'full')` })
    .from(usageLedger)
    .where(
      and(
        eq(usageLedger.userId, userId),
        gte(usageLedger.createdAt, since),
        sql`${usageLedger.endpointModel} = 'glm-5.3'`,
      ),
    );
  const total = Number(rows[0]?.total ?? 0);
  if (total === 0) return 0;
  return Number(rows[0]?.full ?? 0) / total;
}

export interface DecideOptions {
  /** Providers to skip this turn (failover re-decide). */
  excludeProviders?: Set<string>;
  /** Skill-card router enabled for this key. */
  skill?: boolean;
  /** Preference knob, −1..1 (eco → pro). Only read when `skill` is on. */
  r?: number;
  /** Pre-built lane health, when the caller already has it. */
  health?: LaneHealth;
}

type DecisionBase = Omit<RouterDecision, "provider" | "upstreamModel" | "tier" | "effort" | "reason" | "hardCapped">;

/** Build a decision for a resolved lane, or a refusal when the ladder is empty. */
function fromLane(
  lane: Lane | null,
  tier: Tier,
  base: DecisionBase,
  reason: string,
  hardCapped = false,
): RouterDecision {
  if (!lane) {
    // The caller decides what an empty ladder means; this shape exists so the
    // return type stays total. Hyper is named because it is the only provider
    // guaranteed to exist, and `hardCapped` is set so the ledger records that
    // this turn was served outside the normal policy.
    return {
      provider: "hyper",
      upstreamModel: tier === "full" ? "glm-5.3" : "glm-5.3-flash",
      tier,
      effort: tier === "full" ? "max" : "low",
      reason: `${reason} (ladder-exhausted)`,
      hardCapped: true,
      ...base,
    };
  }
  return {
    provider: lane.provider,
    upstreamModel: lane.model,
    tier,
    effort: tier === "full" ? "max" : "low",
    reason,
    hardCapped,
    ...base,
  };
}

export async function decideTurn(
  auth: AuthContext,
  sessionId: string,
  endpointModel: string,
  messages: ChatMessage[],
  options: DecideOptions = {},
): Promise<RouterDecision> {
  const exclude = options.excludeProviders ?? new Set<string>();
  const health = options.health ?? (await buildLaneHealth({ exclude }));
  const endpoint = (endpointModel === "theta" ? "theta" : "glm-5.3") as EndpointModel;

  if (endpoint === "theta") {
    return decideTheta(sessionId, messages, health, exclude);
  }
  // The narrowed value, not the raw string: below this line the endpoint is
  // known to be glm-5.3, and the chain and skill-pool lookups need that to be
  // in the type rather than in a comment.
  return decideGlm(auth, sessionId, endpoint, messages, options, health, exclude);
}

// ── theta ──
/**
 * theta is a single capability class on a flat ladder — there is no tier to
 * choose, so this is a straight first-healthy-lane walk.
 *
 * Dud escalation: consecutive chat-mode duds on huge tool prompts (40k in,
 * <1k out) skip the weak lanes entirely. A rescue must never fail, so it stays
 * on metered lanes — see RESCUE_CHAIN for the ordering and why it changed.
 */
async function decideTheta(
  sessionId: string,
  messages: ChatMessage[],
  health: LaneHealth,
  exclude: Set<string>,
): Promise<RouterDecision> {
  const hardness = classifyHardness(lastUserText(messages));
  const prefixTokens = estimateTokens(messages);
  const signals = routingSignals(messages, sessionId, hardness, { source: "theta" });
  const base = { signals, fairUse: undefined, fairUseShare: undefined };

  const dud = ROUTER.escalation.enabled ? dudStreak(sessionId) : 0;
  if (dud >= 1) {
    console.log(JSON.stringify({ ev: "dud-escalation", session: sessionId.slice(0, 8), streak: dud }));
    // Rescue order: the strong metered lanes first, then the normal ladder.
    const rescue = pickLane([...RESCUE_CHAIN, ...chainFor("theta", "flash")], health, prefixTokens, exclude);
    return fromLane(
      rescue,
      "flash",
      base,
      `theta-dud-rescue(streak=${dud}, lane=${rescue?.provider ?? "none"}, prefix=${prefixTokens})`,
    );
  }

  const lane = resolveLane("theta", "flash", health, prefixTokens, exclude);
  if (!lane) {
    // Nothing left. Hyper is the last resort even past budget: an overage is
    // better than refusing a request the user already paid for.
    const past = await hyperBudgetAvailable();
    console.log(JSON.stringify({ ev: "theta-ladder-exhausted", session: sessionId.slice(0, 8), hyperBudgetOk: past }));
    return {
      provider: "hyper",
      upstreamModel: "glm-5.3-flash",
      tier: "flash",
      effort: "low",
      reason: "theta-no-backend(last-resort-hyper)",
      hardCapped: false,
      ...base,
    };
  }
  return fromLane(lane, "flash", base, `theta-${isHard(hardness) ? "hard" : "routine"}=${lane.provider}`);
}

/**
 * Dud rescue ladder — quality-first, and ordered by measured dud rate.
 *
 * Both lanes stay metered: a rescue is the one turn where paying per token is
 * the point, because the cheap lane just demonstrated it cannot finish the
 * job. That part is unchanged.
 *
 * The ORDER changed after reading 30 days of ledger traffic at matched prompt
 * sizes (~52k tokens in, tool schemas present):
 *
 *   stepfun  ~5% dud
 *   agnes   ~17% dud
 *   hyper   ~29% dud
 *
 * Hyper was first on the strength of a 2026-09-08 minimax measurement that no
 * longer describes this fleet — minimax (generalcompute) has since been
 * retired, and the note that survived into the comment ("56% working vs 8%")
 * was about that lane, not about hyper. On the current fleet stepfun is the
 * better long-context finisher by roughly 6×, so it leads and hyper backs it up.
 *
 * The absolute rates are inflated by a detector bug fixed alongside this
 * change (short tool calls were scored as duds); the RANKING is what matters
 * here and it is the same signal the rescue responds to.
 */
const RESCUE_CHAIN: readonly Lane[] = [
  { provider: "stepfun", model: "step-3.7-flash" },
  { provider: "hyper", model: "glm-5.3-flash" },
];

// ── glm-5.3 ──
async function decideGlm(
  auth: AuthContext,
  sessionId: string,
  endpointModel: EndpointModel,
  messages: ChatMessage[],
  options: DecideOptions,
  health: LaneHealth,
  exclude: Set<string>,
): Promise<RouterDecision> {
  const hardness = classifyHardness(lastUserText(messages));
  const signals = routingSignals(messages, sessionId, hardness, { source: "glm" });
  const lock = await getLock(sessionId, auth.userId, endpointModel);
  const prefixTokens = estimateTokens(messages);
  const fullModel = fullModelFor(endpointModel);
  const flashModel = flashModelFor(endpointModel);

  // ── Locked session ──
  if (lock.lockedModel && !lock.stale) {
    const tier = tierOf(lock.lockedModel);
    const share = await weeklyFullShare(auth.userId);
    const base = { fairUse: fairUseState(share), fairUseShare: share, signals };

    if (tier === "flash") {
      // Per-turn re-evaluation: flash lock + hard/failing turn → maybe upgrade.
      if (ROUTER.reeval.enabled && lock.switchCount < ROUTER.reeval.maxSwitchesPerSession) {
        const failSignals = scanFailureSignals(messages);
        const escalateForFailure =
          failSignals.testFailBlocks > 0 ||
          failSignals.toolLoopRepeats >= TOOL_LOOP_ESCALATE_AT ||
          emptyOutputStreak(sessionId) >= ROUTER.escalation.maxEmptyOutputStreak;

        if (isHard(hardness) || escalateForFailure) {
          const upgrade = await considerUpgrade({
            auth, sessionId, endpointModel, messages, options, health, exclude,
            lock, hardness, signals, share, prefixTokens, fullModel, flashModel,
            failSignals: {
              testFailBlocks: failSignals.testFailBlocks,
              toolLoopRepeats: failSignals.toolLoopRepeats,
            },
          });
          if (upgrade) return upgrade;
        }
      }
      await touchSession(sessionId, auth.userId, endpointModel, hardness === "routine");
      const lane = pickLane(chainFor("glm-5.3", "flash"), health, prefixTokens, exclude);
      return fromLane(lane, "flash", base, "session-sticky");
    }

    // Full-tier lock.
    //
    // Cap enforcement comes first, because it is a spend bound rather than a
    // quality heuristic. The locked path used to be purely sticky: the cap
    // gated new grants and nothing else, so a session that started hard stayed
    // on the full model for its whole life and the realized share ran at ~0.43
    // against a 0.25 cap. Full costs 5.6× flash per turn, so the excess was
    // ~85% of glm COGS. The cap's own documentation says capability decides
    // *which* turns escalate, never *how many* — a continuing session was the
    // one place that was not true.
    //
    // No hysteresis band is needed to keep this from flapping: considerUpgrade
    // refuses at `!fullTierAllowed(share)`, which is exactly the complement of
    // this condition, so at any given share only one of the two can fire.
    if (shareCapBinds(auth.plan, share)) {
      await setLock(sessionId, auth.userId, endpointModel, flashModel, { bumpSwitch: true, routine: false });
      console.log(JSON.stringify({
        ev: "de-escalation",
        session: sessionId.slice(0, 8),
        from: lock.lockedModel,
        to: flashModel,
        trigger: "full-share-cap",
        share: Number(share.toFixed(4)),
        cap: ROUTER.fullModelShareCap,
      }));
      const lane = pickLane(chainFor("glm-5.3", "flash"), health, prefixTokens, exclude);
      return fromLane(lane, "flash", base, `de-escalation(full-share ${(share * 100).toFixed(1)}% ≥ cap ${(ROUTER.fullModelShareCap * 100).toFixed(0)}%)`);
    }

    // Under the cap: let the skill router ask whether a cheaper lane is the
    // better buy, then fall back to the calm-streak rule.
    const failSignals = scanFailureSignals(messages);
    // The calm-streak rule is a cost rule, so it is skipped for a session on a
    // flat lane: coming down would start paying per token for turns that are
    // currently free. Without this the leak would be self-defeating — a leaked
    // session would be pulled back to the metered lane after a few calm turns,
    // wiping the free lane's prefix cache on the way out and buying nothing.
    // The skill router's downgrade is gated the same way, for the same reason.
    const onFreeLane = ROUTER.leak.enabled && (await lockedOnFreeLane(lock.lockedModel ?? fullModel));
    if (!onFreeLane) {
      const downgrade = await considerDowngrade({
        auth, sessionId, endpointModel, messages, options, health, exclude,
        lock, hardness, signals, share, prefixTokens, fullModel, flashModel,
        failSignals: {
          testFailBlocks: failSignals.testFailBlocks,
          toolLoopRepeats: failSignals.toolLoopRepeats,
        },
      });
      if (downgrade) return downgrade;
    }

    const cool = !lock.lastSwitchAt || Date.now() - new Date(lock.lastSwitchAt).getTime() > SWITCH_COOLDOWN_MS;
    if (
      ROUTER.reeval.enabled &&
      hardness === "routine" &&
      lock.routineStreak + 1 >= DOWN_STREAK &&
      lock.switchCount < ROUTER.reeval.maxSwitchesPerSession &&
      cool &&
      !onFreeLane
    ) {
      await setLock(sessionId, auth.userId, endpointModel, flashModel, { bumpSwitch: true, routine: true });
      console.log(JSON.stringify({ ev: "de-escalation", session: sessionId.slice(0, 8), from: lock.lockedModel, to: flashModel, trigger: "routine-streak", streak: lock.routineStreak + 1 }));
      const lane = pickLane(chainFor("glm-5.3", "flash"), health, prefixTokens, exclude);
      return fromLane(lane, "flash", base, `de-escalation(routine-streak=${lock.routineStreak + 1})`);
    }

    await touchSession(sessionId, auth.userId, endpointModel, hardness === "routine");
    // A session the leak put on a free lane is NOT committed to the full tier —
    // it was filling capacity that would otherwise idle. So when both free rungs
    // are busy the honest answer is the flash lane the session would have had
    // anyway, not a metered full lane.
    //
    // Walking the unrestricted ladder here is what turned a free leak into the
    // most expensive turn the router can produce: a leaked session went
    // electronhub ($0) → Pareto full ($0.0044) within twelve seconds, because
    // the free rungs were saturated and `pickLane` walked straight past them
    // onto the metered one. Restricting the pool makes `pickLane` return null in
    // that case, which lands on the flash fallback below at ~1/7 the price.
    const fullPool = onFreeLane ? await freeLanesOf(chainFor("glm-5.3", "full")) : chainFor("glm-5.3", "full");
    const lane = pickLane(fullPool, health, prefixTokens, exclude);
    if (lane) return fromLane(lane, "full", base, onFreeLane ? `free-lane-sticky(${lane.provider})` : "session-sticky");

    // Every lane this session may use is down. Degrade to flash rather than fail
    // — the user's request is more important than the tier we sold it as.
    const fallback = pickLane(chainFor("glm-5.3", "flash"), health, prefixTokens, exclude);
    return fromLane(fallback, "flash", base, "session-sticky(full-ladder-down→flash)");
  }

  // ── Fresh session ──
  const share = await weeklyFullShare(auth.userId);
  const failSig = scanFailureSignals(messages);
  const failureSignal = failSig.testFailBlocks > 0 || failSig.toolLoopRepeats >= TOOL_LOOP_ESCALATE_AT;
  const capped = shareCapBinds(auth.plan, share);
  const base = { fairUse: fairUseState(share), fairUseShare: share, signals };

  // Skill router: a continuous, cost-penalised capability-distance argmin in
  // place of the heuristic gate. It resolves its own lane from the ladder, so a
  // result here is already dispatchable. Falls back to the heuristic when the
  // endpoint has no pool or every lane is unhealthy — a routing improvement must
  // never be able to fail a request.
  if (options.skill) {
    const r = options.r ?? 0;
    const result = await skillDecide({
      endpointModel,
      messages,
      hardness,
      stage: String(signals.stage ?? "unknown"),
      failBlocks: Number(signals.failBlocks ?? 0),
      loopRepeats: Number(signals.loopRepeats ?? 0),
      lockedModel: null,
      fullShareThisWeek: share,
      r,
      health,
    }).catch((err) => {
      console.error("[skill-router] decide failed, using heuristic", err);
      return null;
    });
    if (result) {
      await setLock(sessionId, auth.userId, endpointModel, result.decision.upstreamModel, { routine: hardness === "routine" });
      return {
        ...result.decision,
        ...base,
        signals: { ...signals, ...skillSignals(result, r) },
      };
    }
  }

  // Heuristic: tier from hardness, bounded by the cap, then walk the ladder.
  const wantsFull = !capped && (isHard(hardness) || failureSignal);

  // Free-lane leak: a new session that is not hard may still be handed to a
  // lane that bills nothing, because the hardness gate is a cost gate and a
  // flat lane has no cost for it to gate. Session-start is the only safe moment
  // — there is no prefix cache yet to wipe — and the sticky lock then holds the
  // session there, so every later turn is free too.
  const leakRoll = !wantsFull && !capped && ROUTER.leak.enabled && Math.random() < ROUTER.leak.rate;
  const freeLane = leakRoll
    ? pickLane(await freeLanesOf(chainFor("glm-5.3", "full")), health, prefixTokens, exclude)
    : null;
  if (freeLane) {
    await setLock(sessionId, auth.userId, endpointModel, freeLane.model, { routine: hardness === "routine" });
    console.log(JSON.stringify({
      ev: "free-lane-leak",
      session: sessionId.slice(0, 8),
      provider: freeLane.provider,
      model: freeLane.model,
      hardness,
      prefix: prefixTokens,
      share: Number(share.toFixed(4)),
    }));
    return fromLane(freeLane, "full", base, `free-lane-leak(${freeLane.provider})`);
  }

  const tier: Tier = wantsFull ? "full" : "flash";
  const lane =
    pickLane(chainFor("glm-5.3", tier), health, prefixTokens, exclude) ??
    pickLane(chainFor("glm-5.3", "flash"), health, prefixTokens, exclude);
  const resolvedTier: Tier = lane && tierOf(lane.model) === "full" ? "full" : "flash";

  const reason = wantsFull
    ? failureSignal && !isHard(hardness)
      ? "failure-escalation"
      : `hardness=${hardness}${failureSignal ? "+failure-signal" : ""}`
    : capped
      ? `hardness=${hardness}, full-share ${(share * 100).toFixed(1)}% (capped)`
      : `hardness=${hardness}`;

  await setLock(sessionId, auth.userId, endpointModel, lane?.model ?? flashModel, { routine: hardness === "routine" });
  return fromLane(lane, resolvedTier, base, reason, capped);
}

/** Inputs shared by the mid-session re-evaluation paths, in both directions.
 *  Named for the switch rather than the direction: a downgrade pays the same
 *  gates as an upgrade, and a name that says "upgrade" at a call site that is
 *  coming down would hide that. */
interface SwitchInput {
  auth: AuthContext;
  sessionId: string;
  endpointModel: EndpointModel;
  messages: ChatMessage[];
  options: DecideOptions;
  health: LaneHealth;
  exclude: Set<string>;
  lock: SessionLock;
  hardness: RouterSignals["hardness"];
  signals: Record<string, unknown>;
  share: number;
  prefixTokens: number;
  fullModel: string;
  flashModel: string;
  failSignals: { testFailBlocks: number; toolLoopRepeats: number };
}

/**
 * Decide whether a flash-locked session should move up to the full model.
 *
 * Exported for the upgrade-gate test: the property that matters here — that a
 * cold skill matrix must not veto escalation — is invisible from the pure
 * arithmetic it delegates to, and the ledger's reason string reads
 * "session-sticky" whether the upgrade was declined or never considered.
 *
 * Returns null when the session should stay put — the caller then falls through
 * to its sticky return. Every refusal is logged with the gate that refused it,
 * because the silence here was actively misleading: the caller's reason string
 * reads "session-sticky" either way, so a session that could never upgrade and
 * a session that simply did not need to look identical in the ledger. That is
 * how the full ladder came to sit idle for six hours with a healthy flat lane
 * at its head and no way to see why from the traffic record.
 */
export async function considerUpgrade(input: SwitchInput): Promise<RouterDecision | null> {
  const { auth, sessionId, endpointModel, messages, options, health, lock, hardness, signals, share, prefixTokens, fullModel, flashModel } = input;

  const decline = (gate: string, detail: Record<string, unknown> = {}) => {
    console.log(JSON.stringify({ ev: "reeval-declined", session: sessionId.slice(0, 8), gate, hardness, prefix: prefixTokens, ...detail }));
    return null;
  };

  // The cap is a hard pre-filter: no amount of quality argument outranks it.
  if (shareCapBinds(auth.plan, share)) return decline("full-share-cap", { share: Number(share.toFixed(4)) });

  // The switch budget is checked here rather than left to the caller, matching
  // considerDowngrade. The caller happens to gate it too, but a gate that lives
  // only at one call site is a gate the next call site will forget — and both
  // directions draw on the same budget, so an unguarded upgrade spends from a
  // pool the downgrade path is still respecting.
  if (lock.switchCount >= ROUTER.reeval.maxSwitchesPerSession) return decline("switch-budget-spent");

  const fullLane = pickLane(chainFor("glm-5.3", "full"), health, input.prefixTokens, input.exclude);
  if (!fullLane) return decline("no-full-lane-healthy");

  const base = { fairUse: fairUseState(share), fairUseShare: share };
  const lockedModel = lock.lockedModel ?? flashModel;

  if (options.skill) {
    const r = options.r ?? 0;
    const result = await skillDecide({
      endpointModel,
      messages,
      hardness,
      stage: String(signals.stage ?? "unknown"),
      failBlocks: input.failSignals.testFailBlocks,
      loopRepeats: input.failSignals.toolLoopRepeats,
      lockedModel,
      fullShareThisWeek: share,
      r,
      health,
    }).catch((err) => {
      console.error("[skill-router] reeval failed, keeping lock", err);
      return null;
    });

    // A null result means the router has no opinion — no configured pool, every
    // lane gated out, or a cold skill matrix. That must fall through to the
    // heuristic below, which is exactly what the fresh-session path does when it
    // sees null. Returning here made `skill` a *disable* switch for escalation:
    // with an empty matrix skillDecide always returns null, so every flash-locked
    // session was pinned to flash for its whole life however hard the work became.
    // The fresh path was immune only because it happens to test `if (result)` and
    // continue rather than return.
    if (result) {
      // The locked model won the objective — stay put. The counterfactual is
      // recorded so a review can see how close the switch was, on the same rows
      // the heuristic router would have switched on.
      if (result.decision.upstreamModel === lockedModel) return null;

      await setLock(sessionId, auth.userId, endpointModel, result.decision.upstreamModel, { bumpSwitch: true, routine: false });
      console.log(JSON.stringify({
        ev: "skill-upgrade",
        session: sessionId.slice(0, 8),
        from: lockedModel,
        to: result.decision.upstreamModel,
        hardness,
        failBlocks: input.failSignals.testFailBlocks,
        loopRepeats: input.failSignals.toolLoopRepeats,
        prefix: prefixTokens,
        J: Number(result.selection.J.toFixed(4)),
      }));
      return {
        ...result.decision,
        ...base,
        signals: {
          ...signals,
          ...skillSignals(result, r),
          alt: { provider: "ladder", upstreamModel: lockedModel, tier: "flash", reason: "session-sticky" },
        },
      };
    }
  }

  // Price the switch against the lane that would actually serve it, not the
  // tier's representative rate. The full ladder leads with a flat-billed lane,
  // so on the common path this penalty is zero and the switch is free; it only
  // becomes a real cost once the free rungs are full and a metered lane would
  // take the turn. Reading TIER_RATES here priced every switch as metered,
  // which meant agent prefixes — routinely past the old 16k gate — could never
  // upgrade, and the flat lane at the head of the ladder never saw a request.
  //
  // The flash side keeps the tier rate on purpose: the lock records the tier,
  // not which lane served it, so there is no honest per-lane number to read.
  const flashRate = TIER_RATES[flashModel]?.input ?? 0;
  const fullRate = await laneInputRateUsdPerM(fullLane.provider, fullLane.model, fullModel);
  const penalty = cacheSwitchPenaltyUsd(flashRate, fullRate, prefixTokens);
  const withinPrefix = prefixTokens <= ROUTER.reeval.maxPrefixTokensForSwitch;
  const withinPenalty = penalty <= ROUTER.reeval.maxPenaltyUsd;
  if (!withinPrefix || !withinPenalty) {
    return decline(!withinPrefix ? "prefix-too-long" : "penalty-too-high", {
      limit: ROUTER.reeval.maxPrefixTokensForSwitch,
      lane: fullLane.provider,
      flashRate,
      fullRate,
      penaltyUsd: Number(penalty.toFixed(5)),
      maxPenaltyUsd: ROUTER.reeval.maxPenaltyUsd,
    });
  }

  await setLock(sessionId, auth.userId, endpointModel, fullModel, { bumpSwitch: true, routine: false });
  console.log(JSON.stringify({
    ev: "reeval-upgrade",
    session: sessionId.slice(0, 8),
    from: lockedModel,
    to: fullModel,
    hardness,
    failBlocks: input.failSignals.testFailBlocks,
    loopRepeats: input.failSignals.toolLoopRepeats,
    prefix: prefixTokens,
    penaltyUsd: Number(penalty.toFixed(5)),
  }));
  return fromLane(
    fullLane,
    "full",
    { ...base, signals },
    isHard(hardness)
      ? `cache-reeval=${hardness} penalty$${penalty.toFixed(4)}`
      : `failure-escalation(failBlocks=${input.failSignals.testFailBlocks},loop=${input.failSignals.toolLoopRepeats}) penalty$${penalty.toFixed(4)}`,
  );
}

/**
 * The mirror of considerUpgrade: should a full-locked session come down?
 *
 * Only the skill router raises this. The heuristic's version of coming down is
 * already the routine-streak rule in the caller, which fires on calm turns
 * regardless of cost; this fires when the objective says a cheaper lane is the
 * better buy. Without it the `r` knob would apply on the way up and be ignored
 * on the way down — `eco` would mean "escalate less eagerly" but never "come
 * back down", which is the half of the preference that costs money.
 *
 * The gates are the same ones the upgrade path pays, and deliberately so. A
 * downgrade re-bills no prefix (cachePenalty returns 0 for a cheaper target),
 * but it does leave the new model's cache cold, and the user feels that as
 * latency. It is a switch, so it budgets against maxSwitchesPerSession and
 * respects the cooldown like any other.
 *
 * Returns null when the session should stay put, matching considerUpgrade.
 */
async function considerDowngrade(input: SwitchInput): Promise<RouterDecision | null> {
  const { auth, sessionId, endpointModel, messages, options, health, lock, hardness, signals, share } = input;

  // No skill router, no opinion — the routine-streak rule is the heuristic
  // answer to this question and it stays the only answer when skill is off.
  if (!options.skill || !ROUTER.reeval.enabled) return null;
  if (lock.switchCount >= ROUTER.reeval.maxSwitchesPerSession) return null;
  if (lock.lastSwitchAt && Date.now() - new Date(lock.lastSwitchAt).getTime() <= SWITCH_COOLDOWN_MS) return null;

  const lockedModel = lock.lockedModel ?? input.fullModel;
  const r = options.r ?? 0;
  const result = await skillDecide({
    endpointModel,
    messages,
    hardness,
    stage: String(signals.stage ?? "unknown"),
    failBlocks: input.failSignals.testFailBlocks,
    loopRepeats: input.failSignals.toolLoopRepeats,
    lockedModel,
    fullShareThisWeek: share,
    r,
    health,
  }).catch((err) => {
    console.error("[skill-router] downgrade eval failed, keeping lock", err);
    return null;
  });

  // The locked model won its own re-evaluation. A lateral move between two
  // full lanes is also not a downgrade: the sticky path already resolves the
  // healthiest full lane, so anything still on the full tier is that path's
  // business, not this one's.
  if (!result || result.decision.upstreamModel === lockedModel) return null;
  if (result.decision.tier === "full") return null;

  await setLock(sessionId, auth.userId, endpointModel, result.decision.upstreamModel, {
    bumpSwitch: true,
    routine: hardness === "routine",
  });
  console.log(JSON.stringify({
    ev: "skill-downgrade",
    session: sessionId.slice(0, 8),
    from: lockedModel,
    to: result.decision.upstreamModel,
    tier: result.decision.tier,
    hardness,
    prefix: input.prefixTokens,
    J: Number(result.selection.J.toFixed(4)),
  }));

  return {
    ...result.decision,
    fairUse: fairUseState(share),
    fairUseShare: share,
    signals: {
      ...signals,
      ...skillSignals(result, r),
      // Read by the counterfactual stats: what the ladder would have served had
      // the switch not happened. Without it a downgrade is unauditable.
      alt: { provider: "ladder", upstreamModel: lockedModel, tier: "full", reason: "session-sticky" },
    },
  };
}
