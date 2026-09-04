// Shared frontier-turn decision (used by BOTH /v1/chat/completions and /v1/messages).
// Policy: session-sticky lock (cache commandment #5) + per-turn re-evaluation:
// a flash-locked session may UPGRADE to the full model on a hard turn when the
// cache-wipe penalty (prefix re-priced at full-model input rate) is cheap enough.
// Downgrades never happen mid-session — a full lock always stays full.

import { db } from "../db";
import { usageLedger } from "../db/schema";
import { and, eq, gte, sql } from "drizzle-orm";
import { ROUTER, HYPER } from "@bhaskara/shared/pricing";
import type { AuthContext } from "./auth";
import { estimateTokens, type ChatMessage } from "./prefix";
import { getLock, setLock, touchSession } from "./session-lock";
import { route, routeTheta, routeQwenSmart, classifyHardness, type RouterDecision, type BackchannelLane } from "../router";
import { agnesEnabled, agnesSlotFree } from "../providers/agnes";
import { stepfunEnabled, stepfunSlotFree } from "../providers/stepfun";
import { devpassEnabled } from "../providers/devpass";
import { llmGatewayEnabled } from "../providers/llmgateway";
import { feihoaEnabled, FEIHOA_MODEL, FEIHOA_INPUT_BUDGET, feihoaSlotFree } from "../providers/feihoa";
import { yoloEnabled, YOLO_MODEL, YOLO_INPUT_BUDGET, yoloSlotFree } from "../providers/yolo";
import { scanFailureSignals, emptyOutputStreak } from "./escalation";
import { yoloWouldOverflow, recordYoloTurn, yoloPressureState } from "./yolo-pressure";
import { hyperBudgetAvailable } from "./hyper-budget";
import { detectStage } from "./stage-router";
import { judgeClassify, judgeCandidate } from "./llm-judge";

export const FULL_OF: Record<string, string> = {
  "glm-5.3": "glm-5.3",
  "qwen-3.8": "qwen3.8-max",
};

/** Per-session max escalations (sticky-escalate turns) per rolling hour —
 *  runaway fix-loop guard. Hard turns beyond this serve on the free lane. */
const SESSION_MAX_ESCALATIONS_PER_HOUR = 30;

function lastUserText(messages: ChatMessage[]): string {
  const lastUser = [...messages].reverse().find((m) => m.role === "user");
  return typeof lastUser?.content === "string" ? lastUser.content : "";
}

/** Cache-wipe re-bill penalty for flash→full switch: prefix at (full − flash) input rate. */
export function cacheSwitchPenaltyUsd(flashModel: string, fullModel: string, prefixTokens: number): number {
  const flashRate = HYPER[flashModel]?.input ?? 0;
  const fullRate = HYPER[fullModel]?.input ?? 0;
  return (prefixTokens * Math.max(0, fullRate - flashRate)) / 1e6;
}

async function weeklyFullShare(userId: string): Promise<number> {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  // Denominator: FRONTIER turns only (glm-5.3 + qwen-3.8 endpoints).
  // Theta turns are flash-tier by design and never upgrade to full, so
  // counting them dilutes the share (observed live: 23.4% real qwen full-share
  // displayed as 8.9% overall because 1300+ theta turns padded the denominator
  // — the 10% cap was silently blown while the metric looked healthy).
  const rows = await db
    .select({ total: sql`count(*)`, full: sql`count(*) filter (where routed_to = 'full')` })
    .from(usageLedger)
    .where(
      and(
        eq(usageLedger.userId, userId),
        gte(usageLedger.createdAt, since),
        sql`${usageLedger.endpointModel} in ('glm-5.3', 'qwen-3.8')`,
      ),
    );
  const total = Number(rows[0]?.total ?? 0);
  if (total === 0) return 0;
  return Number(rows[0]?.full ?? 0) / total;
}

export async function decideTurn(
  auth: AuthContext,
  sessionId: string,
  endpointModel: string,
  messages: ChatMessage[],
  lane?: BackchannelLane,
): Promise<RouterDecision> {
  // Backchannel mode: env switch routes ALL frontier turns to a Qwen
  // backchannel lane (context engine must fit upstream).
  // CACHE-STICKY: feihoa/yolo reward high cache-hit (faster + more quota),
  // and Hyper cache-hits are cheap — so a session stays on its locked lane
  // as long as the context still fits that lane's budget. We only hop when
  // the context outgrows the lane (unavoidable miss) or on failure. This
  // maximizes prefix-cache reuse across turns.
  if (process.env.BHASKARA_BACKCHANNEL === "feihoa" && (feihoaEnabled() || yoloEnabled())) {
    const lock = await getLock(sessionId, auth.userId);
    const ctx = estimateTokens(messages);
    if (lock.lockedModel && !lock.stale) {
      const lockedLane: BackchannelLane | null =
        lock.lockedModel === FEIHOA_MODEL ? "feihoa" : lock.lockedModel === YOLO_MODEL ? "yolo" : null;
      const fits =
        lockedLane === "feihoa" ? ctx <= FEIHOA_INPUT_BUDGET : lockedLane === "yolo" ? ctx <= YOLO_INPUT_BUDGET : false;
      const free = lockedLane === "feihoa" ? feihoaSlotFree() : lockedLane === "yolo" ? yoloSlotFree() : true;
      if (lockedLane && fits && free) {
        await touchSession(sessionId, auth.userId);
        return {
          provider: lockedLane,
          upstreamModel: lock.lockedModel,
          tier: "flash",
          effort: "low",
          reason: "backchannel-sticky",
          hardCapped: false,
        };
      }
      // feihoa-locked but busy → temporary hop to yolo (lock preserved).
      if (lockedLane === "feihoa" && yoloEnabled() && yoloSlotFree() && ctx <= YOLO_INPUT_BUDGET) {
        await touchSession(sessionId, auth.userId);
        return { provider: "yolo", upstreamModel: YOLO_MODEL, tier: "flash", effort: "low", reason: "backchannel-sticky-hop(feihoa-busy)", hardCapped: false };
      }
      // yolo-locked but all 4 slots busy → temporary hop to hyper flash.
      if (lockedLane === "yolo" && !yoloSlotFree()) {
        await touchSession(sessionId, auth.userId);
        return { provider: "hyper", upstreamModel: "qwen3.8-flash", tier: "flash", effort: "low", reason: "backchannel-sticky-hop(yolo-busy)", hardCapped: false };
      }
    }
    // No usable lock (or context outgrew lane / lane busy) → pick a free lane.
    const chosen: BackchannelLane =
      lane ?? (feihoaSlotFree() ? "feihoa" : yoloEnabled() && yoloSlotFree() ? "yolo" : "feihoa");
    const model = chosen === "yolo" ? YOLO_MODEL : FEIHOA_MODEL;
    await setLock(sessionId, auth.userId, model);
    return {
      provider: chosen,
      upstreamModel: model,
      tier: "flash",
      effort: "low",
      reason: `backchannel=${chosen}`,
      hardCapped: false,
    };
  }

  if (endpointModel === "theta") {
    const prefixTokens = estimateTokens(messages);
    return routeTheta(lastUserText(messages), {
      agnes: agnesEnabled(),
      agnesFree: agnesSlotFree(),
      stepfun: stepfunEnabled(),
      stepfunFree: stepfunSlotFree(),
      yolo: yoloEnabled(),
      yoloFree: yoloSlotFree(),
      yoloPressureOk: yoloEnabled() && !yoloWouldOverflow(prefixTokens),
      hyperBudgetOk: await hyperBudgetAvailable(),
      llmGatewayOn: llmGatewayEnabled(),
    });
  }
  if (endpointModel === "qwen-3.8" && process.env.BHASKARA_QWEN_SMART === "1") {
    const lock = await getLock(sessionId, auth.userId);
    if (lock.lockedModel && !lock.stale) {
      // Hard/fix turn on a 27B-locked session → escalate this turn to the
      // frontier model (qwen3.8-max) — 27B models are weak at precise TS
      // type-repair (observed: union-narrowing errors survived 8 rounds).
      // Lock preserved for cache; next routine turn returns to the free lane.
      const hardness = classifyHardness(lastUserText(messages));
      if (hardness !== "routine" && lock.lockedModel !== "qwen3.8-max" && lock.lockedModel !== "qwen3.8-flash") {
        const share = await weeklyFullShare(auth.userId);
        // SESSION THROTTLE: a fix-looping agent re-triggers sticky-escalate
        // every turn (observed: 22 max turns in a single minute, 189 in 2h —
        // 23.4% qwen full-share vs the 10% cap). Cap a session's escalated
        // (non-sticky) turns at a fixed count per hour; further hard turns
        // serve on the locked free lane instead of burning max budget.
        const escRows = await db
          .select({ n: sql`count(*)` })
          .from(usageLedger)
          .where(
            and(
              eq(usageLedger.sessionId, sessionId),
              eq(usageLedger.upstreamModel, "qwen3.8-max"),
              gte(usageLedger.createdAt, new Date(Date.now() - 60 * 60 * 1000)),
            ),
          );
        const sessionEscHour = Number(escRows[0]?.n ?? 0);
        if (share < ROUTER.fullShareCapPerUserPerWeek && sessionEscHour < SESSION_MAX_ESCALATIONS_PER_HOUR) {
          await touchSession(sessionId, auth.userId);
          return { provider: "hyper", upstreamModel: "qwen3.8-max", tier: "full", effort: "max", reason: sessionEscHour >= SESSION_MAX_ESCALATIONS_PER_HOUR - 5 ? `sticky-escalate(${hardness}) near-session-limit` : `sticky-escalate(${hardness})`, hardCapped: false };
        }
      }
      // feihoa-locked but its single slot is busy → temporary hop to yolo for
      // this turn only (lock preserved; next free turn returns to feihoa).
      if (lock.lockedModel === FEIHOA_MODEL && !feihoaSlotFree() && yoloEnabled() && yoloSlotFree() && estimateTokens(messages) <= YOLO_INPUT_BUDGET) {
        await touchSession(sessionId, auth.userId);
        return { provider: "yolo", upstreamModel: YOLO_MODEL, tier: "flash", effort: "low", reason: "session-sticky-hop(feihoa-busy)", hardCapped: false };
      }
      // yolo-locked but all 4 slots busy OR the pressure tracker says the
      // lane is wedged/pressured → hop for this turn (lock preserved).
      // Pressure check is CRITICAL for sticky locks: a wedged yolo serves
      // nothing but every sticky turn still burned 25s on the TTFT ceiling
      // before failing over (observed live 2026-09-04/05).
      const yoloUsable = yoloSlotFree() && !yoloWouldOverflow(estimateTokens(messages));
      if (lock.lockedModel === YOLO_MODEL && !yoloUsable) {
        await touchSession(sessionId, auth.userId);
        if (feihoaEnabled() && feihoaSlotFree() && estimateTokens(messages) <= FEIHOA_INPUT_BUDGET) {
          return { provider: "feihoa", upstreamModel: FEIHOA_MODEL, tier: "flash", effort: "low", reason: "session-sticky-hop(yolo-busy)", hardCapped: false };
        }
        if (await hyperBudgetAvailable()) {
          return { provider: "hyper", upstreamModel: "qwen3.8-flash", tier: "flash", effort: "low", reason: "session-sticky-hop(yolo-busy)", hardCapped: false };
        }
        if (llmGatewayEnabled()) {
          return { provider: "llmgateway", upstreamModel: "qwen3.8-flash", tier: "flash", effort: "low", reason: "session-sticky-hop(yolo-busy,hyper-budget-out)", hardCapped: false };
        }
      }
      await touchSession(sessionId, auth.userId);
      const tier = lock.lockedModel.includes("flash") || lock.lockedModel.includes("feihoa") || lock.lockedModel.includes("yolo") || lock.lockedModel.includes("27b") || lock.lockedModel.includes("27B") ? "flash" : "full";
      const provider = lock.lockedModel === FEIHOA_MODEL ? "feihoa" : lock.lockedModel === YOLO_MODEL ? "yolo" : "hyper";
      return { provider, upstreamModel: lock.lockedModel, tier, effort: tier === "full" ? "max" : "low", reason: "session-sticky", hardCapped: false };
    }
    const share = await weeklyFullShare(auth.userId);
    // Stage Router (Switchyard): tool activity modulates hardness —
    // explore (errors/failures in fresh tool results) escalates to the
    // capable model even when the prompt text looks routine; mechanical
    // (tests green, builds clean) keeps the cheap lane.
    const stageSig = detectStage(messages);
    const textHardness = classifyHardness(lastUserText(messages));
    let hardness =
      stageSig.stage === "explore" && textHardness === "routine" ? "debugging" : textHardness;
    // LLM Judge (Switchyard): inconclusive routine turns matching subtle-
    // intent patterns ("make it robust", "edge cases") get one cheap feihoa
    // classification before settling on the free lane.
    if (hardness === "routine" && stageSig.stage !== "mechanical" && judgeCandidate(lastUserText(messages))) {
      const verdict = await judgeClassify(lastUserText(messages));
      if (verdict === true) hardness = "debugging";
      console.log(JSON.stringify({ ev: "judge", session: sessionId.slice(0, 8), verdict }));
    }
    const prefixTokens = estimateTokens(messages);
    const d = routeQwenSmart({
      hardness,
      prefixTokens,
      fullShareThisWeek: share,
      yoloOn: yoloEnabled(),
      yoloFree: yoloSlotFree(),
      yoloPressureOk: yoloEnabled() && !yoloWouldOverflow(prefixTokens),
      hyperBudgetOk: await hyperBudgetAvailable(),
      llmGatewayOn: llmGatewayEnabled(),
    });
    await setLock(sessionId, auth.userId, d.upstreamModel);
    return d;
  }
  const lock = await getLock(sessionId, auth.userId);

  if (lock.lockedModel && !lock.stale) {
    const tier = lock.lockedModel.includes("flash") ? "flash" : "full";

    if (tier === "flash") {
      // One share computation per flash turn serves both the reeval gates
      // and the fair-use nudge fields on every sticky return.
      const share = await weeklyFullShare(auth.userId);
      const fairUse = fairUseState(share);

      // ── Per-turn re-evaluation: flash lock + hard/failing turn → maybe upgrade ──
      if (ROUTER.reeval.enabled && lock.switchCount < ROUTER.reeval.maxSwitchesPerSession) {
        const hardness = classifyHardness(lastUserText(messages));
        // Escalation-on-failure: concrete failure signals in the live zone
        // (failing tests / compile errors / non-zero exits) or an empty-output
        // streak escalate even a routine turn. Same gates apply afterwards.
        const failSignals = scanFailureSignals(messages);
        const escalateForFailure =
          failSignals.testFailBlocks > 0 ||
          emptyOutputStreak(sessionId) >= ROUTER.escalation.maxEmptyOutputStreak;
        if (hardness !== "routine" || escalateForFailure) {
          const prefixTokens = estimateTokens(messages);
          const fullModel = FULL_OF[endpointModel] ?? "glm-5.3";
          const penalty = cacheSwitchPenaltyUsd(lock.lockedModel, fullModel, prefixTokens);
          const withinPrefix = prefixTokens <= ROUTER.reeval.maxPrefixTokensForSwitch;
          const withinPenalty = penalty <= ROUTER.reeval.maxPenaltyUsd;
          const withinCap = share < ROUTER.fullShareCapPerUserPerWeek;

          if (withinPrefix && withinPenalty && withinCap) {
            await setLock(sessionId, auth.userId, fullModel, { bumpSwitch: true });
            console.log(
              JSON.stringify({
                ev: "reeval-upgrade",
                session: sessionId.slice(0, 8),
                from: lock.lockedModel,
                to: fullModel,
                hardness,
                failBlocks: failSignals.testFailBlocks,
                emptyStreak: emptyOutputStreak(sessionId),
                prefix: prefixTokens,
                penaltyUsd: Number(penalty.toFixed(5)),
              }),
            );
            return {
              provider: "hyper",
              upstreamModel: fullModel,
              tier: "full",
              effort: "max",
              reason: hardness !== "routine"
                ? `cache-reeval=${hardness} penalty$${penalty.toFixed(4)}`
                : `failure-escalation(failBlocks=${failSignals.testFailBlocks},empty=${emptyOutputStreak(sessionId)}) penalty$${penalty.toFixed(4)}`,
              hardCapped: false,
              fairUse,
              fairUseShare: share,
            };
          }
          // Blocked: report why in the decision reason (visible in access log).
          const why = !withinPrefix ? "prefix-too-large" : !withinPenalty ? "penalty-too-high" : "full-share-cap";
          await touchSession(sessionId, auth.userId);
          return {
            provider: "hyper",
            upstreamModel: lock.lockedModel,
            tier,
            effort: "low",
            reason: `session-sticky (reeval-blocked: ${why})`,
            hardCapped: false,
            fairUse,
            fairUseShare: share,
          };
        }
      }

      await touchSession(sessionId, auth.userId);
      return {
        provider: "hyper",
        upstreamModel: lock.lockedModel,
        tier,
        effort: "low",
        reason: "session-sticky",
        hardCapped: false,
        fairUse,
        fairUseShare: share,
      };
    }

    // Full-tier lock: sticky (downgrades never happen mid-session).
    await touchSession(sessionId, auth.userId);
    return { provider: "hyper", upstreamModel: lock.lockedModel, tier, effort: "low", reason: "session-sticky", hardCapped: false };
  }

  // Fresh (or stale) session: decide from signals, then LOCK the result
  const share = await weeklyFullShare(auth.userId);
  const decision = route({
    endpointModel: endpointModel as "glm-5.3" | "qwen-3.8",
    prefixTokens: estimateTokens(messages),
    isNewSession: true,
    fullShareThisWeek: share,
    hardness: classifyHardness(lastUserText(messages)),
    failureSignal: scanFailureSignals(messages).testFailBlocks > 0,
  });
  // $12.5/day hyper budget gate: budget out → same-model hop to llmgateway.
  if (decision.provider === "hyper" && !(await hyperBudgetAvailable()) && llmGatewayEnabled()) {
    return { ...decision, provider: "llmgateway", reason: `${decision.reason} → hyper-budget-out` };
  }
  await setLock(sessionId, auth.userId, decision.upstreamModel);
  return decision;
}

/** Fair-use nudge state from a user's weekly full-model share (0..1). */
function fairUseState(share: number): RouterDecision["fairUse"] {
  if (share >= ROUTER.fullShareCapPerUserPerWeek) return "capped";
  if (share >= ROUTER.fullShareAlertAt) return "alert";
  return undefined;
}