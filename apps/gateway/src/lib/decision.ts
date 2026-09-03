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
import { route, routeTheta, classifyHardness, type RouterDecision } from "../router";
import { scanFailureSignals, emptyOutputStreak } from "./escalation";
import { agnesEnabled } from "../providers/agnes";
import { stepfunEnabled } from "../providers/stepfun";
import { devpassEnabled } from "../providers/devpass";

export const FULL_OF: Record<string, string> = {
  "glm-5.3": "glm-5.3",
  "qwen-3.8": "qwen3.8-max",
};

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
  const rows = await db
    .select({ total: sql`count(*)`, full: sql`count(*) filter (where routed_to = 'full')` })
    .from(usageLedger)
    .where(and(eq(usageLedger.userId, userId), gte(usageLedger.createdAt, since)));
  const total = Number(rows[0]?.total ?? 0);
  if (total === 0) return 0;
  return Number(rows[0]?.full ?? 0) / total;
}

export async function decideTurn(
  auth: AuthContext,
  sessionId: string,
  endpointModel: string,
  messages: ChatMessage[],
): Promise<RouterDecision> {
  if (endpointModel === "theta") {
    return routeTheta(lastUserText(messages), {
      agnes: agnesEnabled(),
      stepfun: stepfunEnabled(),
      devpass: devpassEnabled(),
    });
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
  await setLock(sessionId, auth.userId, decision.upstreamModel);
  return decision;
}

/** Fair-use nudge state from a user's weekly full-model share (0..1). */
function fairUseState(share: number): RouterDecision["fairUse"] {
  if (share >= ROUTER.fullShareCapPerUserPerWeek) return "capped";
  if (share >= ROUTER.fullShareAlertAt) return "alert";
  return undefined;
}