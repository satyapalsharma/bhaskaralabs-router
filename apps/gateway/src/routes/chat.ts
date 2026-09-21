// Gateway entry: OpenAI-completions + Anthropic-messages proxies.
// Flow: auth → assemble+lint → route → provider dispatch → stream pass-through (usage tapped) → ledger.
// Identity/disclosure middleware injects the system line (disclosed routing variant).

import { Hono } from "hono";
import { randomUUID } from "node:crypto";
import { streamText } from "hono/streaming";
import { db } from "../db";
import { usageLedger } from "../db/schema";
import { and, eq, gte, sql } from "drizzle-orm";
import { authenticate, type AuthContext } from "../lib/auth";
import { assemble, estimateTokens, deriveSessionId, type ChatMessage } from "../lib/prefix";
import { resolveFlags, compressLiveZone, maybeCompact, compactThreshold, compactSpan, auditPairs } from "../lib/compaction";
import { getPacks, selectPacks, extractTerms, renderPacks, withDocPacks, historyTextOf } from "../lib/docs";
import { persistEnabled, applyPersistToSystem } from "../lib/persist";
import { parseEffortRequested, expandEnabled, applyEffortToBody, type EffortRequest } from "../lib/dials";
import { EXPAND_MIN_BLOCK, expandCompletion, firstContent, setExpandedContent } from "../lib/expand";
import { archiveTurn } from "../lib/archive";
import { recordContentChars, contentCharsOf, hasToolCallsOf, recordDudTurn } from "../lib/escalation";
import { getQuotaState, quotaRejection, checkTrialVelocity } from "../lib/quotas";
import { setQuotaHeaders, setRetryHeaders } from "../lib/quota-headers";
import { writeLedger } from "../lib/ledger";
import { pickKeyForSession, hyperChat, parseUsageNonStream, SseUsageAccumulator, type HyperUsage } from "../providers/hyper";
import { camelChat, camelEnabled, markCamelCool } from "../providers/camel";
import { agnesChat, agnesEnabled, markAgnesDead } from "../providers/agnes";
import { stepfunChat, stepfunEnabled, markStepfunThrottled } from "../providers/stepfun";
import { llmGatewayChat } from "../providers/llmgateway";
import { hyperBudgetAvailable, reserveHyperBudget, releaseHyperBudget, markHyperDead, hyperAccountAlive } from "../lib/hyper-budget";
import { classifyUpstreamError, describeUpstreamError, retryAfterFrom } from "../lib/upstream-error";
import { type RouterDecision, FLASH_OF } from "../router";
import { decideTurn, type DecideOptions } from "../lib/decision";
import { getFleet, pickAccount, getPublicModels, type UpstreamProviderConfig } from "../lib/upstream-config";
import { checkPlanLimits } from "../lib/plan-limits";
import { checkAccountWindows } from "../lib/account-windows";
import { meterFleetResponse, meterRouterFleetTurn } from "../lib/fleet-meter";
import { genericChat, accountSlotFreeFor, candidatesFor } from "../providers/generic";
import messagesApp from "./messages";

// ── DB-fleet (admin-panel) provider dispatch ──
// Providers registered via the admin panel are dispatchable through the generic
// module. The hardcoded providers below keep their specialized modules (they
// have bespoke failure handling); everything else — which includes the glm-5.3
// ladder's flat lanes — flows through the fleet.
const FLEET_DISPATCHABLE = new Set<string>();
export async function refreshFleetDispatchable(): Promise<void> {
  const fleet = await getFleet().catch(() => new Map());
  const hardcoded = new Set(["hyper", "agnes", "stepfun", "camel", "llmgateway"]);
  FLEET_DISPATCHABLE.clear();
  for (const id of fleet.keys()) if (!hardcoded.has(id)) FLEET_DISPATCHABLE.add(id);
}
import { buildLaneHealth } from "../lib/lane-health";
import {
  classifyClient,
  describeClient,
  isServable,
  uaGateMode,
  UNIDENTIFIED_CLIENT_MESSAGE,
  type ClientIdentity,
} from "../lib/client-identity";
import { acquireConcurrency, concurrencyLimit, type ConcurrencyLease } from "../lib/concurrency";
import { SATURATED_HEADER, costOnLane, laneBudgetFor, laneFree, laneLoadOf, laneCooling } from "../lib/lane-slot";
import { applyThrottle, describeThrottle } from "../lib/throttle";
import { selectOverflowModel, OVERFLOW_HEADER, OVERFLOW_NOTICE } from "../lib/overflow";
import { applyTerseToSystem, terseArmOf, type TerseArm } from "../lib/terse";
import { setNudgeHeader } from "../lib/fair-use";
import { sanitizeOpenAiResponse, sanitizeOpenAiChunk } from "../lib/sanitize";

/** TTFT ceiling for lanes that can hang silently — a provider that accepts the
 *  connection and then never sends headers (no 429, no error, just a hung
 *  socket). Caps the wait so failover fires in seconds rather than at the
 *  client's timeout. Cleared once response headers arrive (the stream body
 *  itself is exempt). Metered lanes that abort safely use the wide ceiling. */
const LANE_TTFT_CEILING_MS = 25_000;
/** Wide ceiling for lanes where aborting mid-generation costs money or leaks a
 *  server-side zombie slot. */
const WIDE_TTFT_CEILING_MS = 10 * 60 * 1000;
/** Lanes observed accepting a connection and then never sending headers. Every
 *  other lane gets the wide ceiling: aborting a healthy-but-slow generation
 *  costs real money on metered lanes and leaks a zombie slot on flat ones. */
const HANG_PRONE_LANES = new Set<string>();
const app = new Hono();

// ── Identity/disclosure line (disclosed routing variant) ──
/** One upstream SSE read result (done + optional byte chunk). */
interface UpstreamChunk {
  done: boolean;
  value?: Uint8Array;
}
const IDENTITY_LINE =
  "You are served by Bhaskara Labs' smart-routed endpoint. When asked which model you are, state that you are the Bhaskara Labs endpoint for this model family — a smart-routed system.";
const DISCLOSE_MODELS = new Set(["glm-5.3", "theta"]);

function withIdentity(messages: ChatMessage[], endpointModel: string, terseArm: TerseArm = "off", persist = false, expandForm = false): ChatMessage[] {
  if (!DISCLOSE_MODELS.has(endpointModel)) return messages;
  let line = IDENTITY_LINE;
  if (terseArm !== "off") line = applyTerseToSystem(line, terseArm === "ladder");
  if (persist) line = applyPersistToSystem(line);
  if (expandForm) line = `${line}\n\n${EXPAND_MIN_BLOCK}`;
  const first = messages[0];
  if (first?.role === "system" && typeof first.content === "string") {
    if (first.content.includes("Bhaskara Labs")) return messages;
    // user has their own system prompt: prepend ours (+terse if on)
    return [{ role: "system", content: `${line}\n\n${first.content}` }, ...messages.slice(1)];
  }
  return [{ role: "system", content: line }, ...messages];
}
function hyperKeys(): Array<{ id: string; key: string }> {
  const raw = process.env.HYPER_API_KEYS ?? process.env.HYPER_API_KEY ?? "";
  const keys = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .map((key, i) => ({ id: `hyper-${i}`, key }));
  if (keys.length === 0) throw new Error("HYPER_API_KEY(S) not configured");
  return keys;
}
interface PendingTurn {
  userId: string;
  apiKeyId: string;
  sessionId: string;
  endpointModel: string;
  decision: RouterDecision;
  startedAt: number;
  ttftMs?: number;
  rawIn: number; // est tokens of the client-sent history (pre-compaction) = true context pressure
  /** Streamed/completed content chars this turn — feeds the empty-output streak. */
  contentChars?: number;
  /** True when the response requested a tool — a productive turn even with zero
   *  content chars, because tool calls stream outside `delta.content`. */
  responseHadToolCalls?: boolean;
  /** True when the request carried tool schemas (dud detection needs it). */
  toolsPresent: boolean;
  /** Camel: exact metered cost from usage.cost_details.upstream_inference_cost. */
  camelExactCostUsd?: number;
  /** Fleet (admin-panel) account that served this turn — feeds the account
   *  window ring (lib/account-windows) so router-path turns count against the
   *  per-account limits. Only set for FLEET_DISPATCHABLE lanes. */
  fleetAccountId?: string;
  terseArm: TerseArm;
  /** Persistence A/B arm ("on"|"off") — ledger-tagged for readout. */
  persistArm: "on" | "off";
  /** Held while the turn is in flight. Released by trackTurn or the error paths. */
  lease?: ConcurrencyLease;
  /** Who called. Persisted so the allowlist can be built from real traffic
   *  instead of guesses. */
  client?: ClientIdentity;
}

// Writes ledger after stream completes, using tapped usage.
function trackTurn(pending: PendingTurn, usage: HyperUsage | null, providerMeta?: Record<string, unknown>) {
  pending.lease?.release();
  const u = usage ?? { promptTokens: 0, completionTokens: 0 } as HyperUsage;
  console.log(JSON.stringify({
    ev: "turn",
    user: pending.userId.slice(0, 8),
    session: pending.sessionId.slice(0, 8),
    ep: pending.endpointModel,
    to: pending.decision.upstreamModel,
    tier: pending.decision.tier,
    why: pending.decision.reason,
    tok: `${u.promptTokens}/${u.completionTokens}`,
    raw: pending.rawIn,
    cached: u.cachedTokens ?? 0,
    ms: Date.now() - pending.startedAt,
    ttft: pending.ttftMs ?? null,
  }));
  // Empty-output streak: one record per completed turn (stream + non-stream).
  // contentChars is exact when captured (stream tap / non-stream JSON);
  // fall back to completion-token presence so missing capture can't fake an empty streak.
  // A tool call counts as productive: it carries no content chars by design.
  const toolCalls = pending.responseHadToolCalls ?? false;
  const chars = pending.contentChars ?? (u.completionTokens > 0 ? 1 : 0);
  recordContentChars(pending.sessionId, chars, toolCalls);
  recordDudTurn(pending.sessionId, u.promptTokens, u.completionTokens, pending.toolsPresent, toolCalls);
  // Router-path fleet turns must feed the account window ring too, or the
  // per-account limits (dailyCostUsd etc.) only bind the fleet-alias path and
  // the router walks a lane whose allowance is already spent. Cost is priced
  // from the fleet catalogue (pareto's $20/day/account allowance is real money
  // — recording 0 would blind the cap on exactly this path).
  if (pending.fleetAccountId) {
    void meterRouterFleetTurn(pending.decision.provider, pending.fleetAccountId, pending.decision.upstreamModel, u.promptTokens, u.completionTokens, u.cachedTokens ?? 0);
  }
  void writeLedger({
    userId: pending.userId,
    apiKeyId: pending.apiKeyId,
    sessionId: pending.sessionId,
    endpointModel: pending.endpointModel,
    usage: {
      promptTokens: usage?.promptTokens ?? 0,
      completionTokens: usage?.completionTokens ?? 0,
      cachedTokens: usage?.cachedTokens,
      reasoningTokens: usage?.reasoningTokens,
      model: pending.decision.upstreamModel,
      provider: pending.decision.provider,
      // Camel: exact metered cost from provider usage.cost_details.
      ...(pending.decision.provider === "camel" && pending.camelExactCostUsd !== undefined
        ? { actualCostOverrideUsd: pending.camelExactCostUsd }
        : {}),
    },
    routedTo: pending.decision.tier,
    routerEffort: pending.decision.effort,
    routerReason: pending.decision.reason,
    // Raw, not `?? false`: a turn whose shape we never captured is "unknown" and
    // must stay null. Collapsing it to false would count it as a model giving up.
    hasToolCalls: pending.responseHadToolCalls,
    routerSignals: {
      ...(pending.decision.signals ?? {}),
      fairUse: pending.decision.fairUse ?? null,
      fairUseShare: pending.decision.fairUseShare ?? null,
      ...(pending.client
        ? { client: { kind: pending.client.kind, name: pending.client.name, shaped: pending.client.shaped } }
        : {}),
    },
    latencyMs: Date.now() - pending.startedAt,
    ttftMs: pending.ttftMs,
    providerMeta,
  }).catch((err) => console.error("[ledger] write failed", err));
}

// ── POST /v1/chat/completions (OpenAI-compatible) ──
app.post("/v1/chat/completions", async (c) => {
  const authz = c.req.header("Authorization") ?? "";
  const auth = await authenticate(authz.replace(/^Bearer\s+/i, ""));
  if (!auth) return c.json({ error: { message: "Invalid API key", type: "authentication_error" } }, 401);

  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: { message: "Invalid JSON body", type: "invalid_request_error" } }, 400);
  }

  const obj = (typeof body === "object" && body !== null ? body : {}) as Record<string, unknown>;

  // ── Client identity gate ──
  // Runs before any database read or upstream call, because the point is not to
  // spend on a request we are going to refuse. See lib/client-identity.ts for
  // why both a User-Agent and a request-shape signal are required.
  const client = classifyClient(c.req.header("user-agent") ?? null, obj);
  console.log(JSON.stringify({
    ev: "client",
    user: auth.userId.slice(0, 8),
    kind: client.kind,
    name: client.name,
    version: client.version,
    shaped: client.shaped,
    ua: client.raw,
  }));
  if (!isServable(client) && uaGateMode() === "enforce") {
    return c.json(
      { error: { message: UNIDENTIFIED_CLIENT_MESSAGE, type: "invalid_request_error" } },
      400,
    );
  }

  const endpointModel = typeof obj.model === "string" ? obj.model : "";
  const ENDPOINT_MODELS = new Set(["glm-5.3", "theta"]);
  if (!ENDPOINT_MODELS.has(endpointModel)) {
    // DB-fleet aliases (admin panel) are callable too — route to the generic
    // lane when the model matches a fleet alias/modelId.
    const fleet = await getFleet().catch((): Map<string, UpstreamProviderConfig> => new Map());
    let fleetMatch: { providerId: string; modelId: string; inputUsdPerM: number; outputUsdPerM: number } | null = null;
    for (const p of fleet.values()) {
      for (const m of p.models) {
        if (m.alias === endpointModel || m.modelId === endpointModel) {
          fleetMatch = { providerId: p.id, modelId: m.modelId, inputUsdPerM: m.inputUsdPerM, outputUsdPerM: m.outputUsdPerM };
          break;
        }
      }
      if (fleetMatch) break;
    }
    if (!fleetMatch) {
      return c.json(
        { error: { message: `unknown model '${endpointModel}' (endpoints: glm-5.3, theta; or an admin-panel fleet model)`, type: "invalid_request_error" } },
        400,
      );
    }
    // Fleet model → generic dispatch directly (bypasses the smart router
    // chains; fleet models are explicitly admin-configured).
    // Account rotation: healthy + slot-free + window-limits-ok.
    const provider = fleet.get(fleetMatch.providerId)!;
    const eligible = provider.accounts.filter((a) => accountSlotFreeFor(a) && checkAccountWindows(a.id, a.limits).allowed);
    const account = pickAccount(fleetMatch.providerId, eligible);
    // Plan entitlement gate (admin-managed caps, e.g. an enterprise tier with
    const gate = await checkPlanLimits(auth.userId, auth.plan, endpointModel);
    if (!gate.allowed) {
      console.log(JSON.stringify({ ev: "plan-limit", user: auth.userId, model: endpointModel, reason: gate.reason }));
      return c.json({ error: { message: gate.reason ?? "Plan limit reached", type: "rate_limit_error" } }, 429);
    }
    if (!account) return c.json({ error: { message: "No healthy account for this model's provider", type: "api_error" } }, 502);
    try {
      const startedAt = Date.now();
      // Combined abort: client disconnect + 10-min ceiling. Without the
      // ceiling a wedged fleet provider hangs the turn forever (the main
      // paths get BACKCHANNEL_TTFT_CEILING_MS or the hyper 10-min ceiling).
      const fleetSignal = AbortSignal.any([c.req.raw.signal, AbortSignal.timeout(10 * 60 * 1000)]);
      const upstreamRes = await genericChat({
        provider,
        account,
        modelId: fleetMatch.modelId,
        body: obj,
        signal: fleetSignal,
      });
      if (!upstreamRes.ok) return upstreamRes;
      // Meter into the ledger + account windows (plan limits + spend reports
      // need these rows; the fleet path bypasses the smart-router trackTurn).
      return await meterFleetResponse(upstreamRes, {
        userId: auth.userId,
        apiKeyId: auth.apiKeyId,
        sessionId: deriveSessionId(auth.apiKeyId, c.req.raw.headers),
        endpointModel,
        providerId: provider.id,
        accountId: account.id,
        accountLabel: account.label,
        upstreamModel: fleetMatch.modelId,
        inputUsdPerM: fleetMatch.inputUsdPerM,
        outputUsdPerM: fleetMatch.outputUsdPerM,
        startedAt,
        isStream: obj.stream === true,
      });
    } catch (err) {
      console.error(`[fleet ${fleetMatch.providerId}] dispatch failed:`, (err as Error).message);
      return c.json({ error: { message: "Upstream provider temporarily unreachable", type: "api_error" } }, 502);
    }
  }

  // Plan entitlement gate for endpoint models (admin-managed per-model caps).
  {
    const gate = await checkPlanLimits(auth.userId, auth.plan, endpointModel);
    if (!gate.allowed) {
      console.log(JSON.stringify({ ev: "plan-limit", user: auth.userId, model: endpointModel, reason: gate.reason }));
      return c.json({ error: { message: gate.reason ?? "Plan limit reached", type: "rate_limit_error" } }, 429);
    }
    const velocity = await checkTrialVelocity(auth.apiKeyId, auth.plan);
    if (velocity) {
      return c.json({ error: { message: velocity, type: "rate_limit_error" } }, 429);
    }
  }

  const turnStartedAt = Date.now(); // true request-start clock (was captured post-dispatch → latency_ms ≈ 0)
  const assembled = assemble(obj);
  const toolTokens = obj.tools ? Math.ceil(JSON.stringify(obj.tools).length / 4) : 0;
  const rawInTokens = estimateTokens(assembled.messages) + toolTokens; // client-sent context incl. tool schemas (true provider pressure)
  // ── Context engine (both opt-in): live-zone compression + 200K compaction ──
  const flags = resolveFlags(c.req.raw.headers, auth.flags);
  const doCompress = flags.compress;
  const doCompact = flags.compact;
  let messages = assembled.messages;
  let compactionMeta: Record<string, unknown> | undefined;
  // ── Docs registry (opt-in): curated packs splice into the stable prefix
  // (after leading systems, before history). Selection is a pure function of
  // full history → session-monotonic, id-ordered, capped. Ledger-tagged.
  if (flags.docs) {
    const packs = selectPacks(extractTerms(historyTextOf(assembled.messages)), await getPacks());
    if (packs.length > 0) {
      const rendered = renderPacks(packs);
      messages = withDocPacks(messages, rendered);
      const ids = packs.map((p) => p.id);
      compactionMeta = { ...(compactionMeta ?? {}), docs: { packs: ids, bytes: rendered.length } };
      console.log(JSON.stringify({ ev: "docs", session: deriveSessionId(auth.apiKeyId, c.req.raw.headers).slice(0, 8), packs: ids, bytes: rendered.length }));
    }
  }
  if (doCompact) {
    const { messages: compacted, stats } = await maybeCompact(messages, {
      alreadyCompacted: messages.some((m) => typeof m.content === "string" && m.content.includes("[COMPACTED HISTORY")),
      logSkip: flags.compactDebug,
      extraTokens: toolTokens, // tool schemas count toward the threshold, never compacted themselves
    });
    if (stats.triggered) {
      messages = compacted;
      compactionMeta = { compact: { span: stats.spanMessages, tokBefore: stats.tokensBefore, tokAfter: stats.tokensAfter } };
      console.log(JSON.stringify({ ev: "compact", session: deriveSessionId(auth.apiKeyId, c.req.raw.headers).slice(0, 8), ...stats }));
    }
  }
  if (doCompress) {
    const { messages: compressed, stats: lzStats } = compressLiveZone(messages);
    if (lzStats.blocksCompressed > 0) {
      messages = compressed;
      compactionMeta = { ...(compactionMeta ?? {}), livezone: { bytes: `${lzStats.bytesBefore}→${lzStats.bytesAfter}`, via: lzStats.transformers.join(",") } };
      console.log(JSON.stringify({ ev: "livezone", session: deriveSessionId(auth.apiKeyId, c.req.raw.headers).slice(0, 8), ...lzStats }));
    }
  }
  // Shadow mode (measure-before-enable): run the pipeline on a copy, forward
  // the ORIGINAL upstream, and ledger-tag the would-be savings + keep-audit.
  // Zero traffic risk — forwarded bytes are untouched. Skipped when live
  // compression already ran (its livezone stats are the measurement).
  if (flags.shadow && !doCompress) {
    const dry = compressLiveZone(messages, { dryRun: true });
    if (dry.stats.blocksCompressed > 0) {
      const keep = auditPairs(dry.pairs ?? []);
      compactionMeta = {
        ...(compactionMeta ?? {}),
        shadow: {
          mode: "measure", before: dry.stats.bytesBefore, after: dry.stats.bytesAfter,
          via: dry.stats.transformers.join(","),
          errKept: keep.errKept, errTotal: keep.errTotal,
          refKept: keep.refKept, refTotal: keep.refTotal,
          violations: keep.violations.length,
        },
      };
      console.log(JSON.stringify({ ev: "shadow", session: deriveSessionId(auth.apiKeyId, c.req.raw.headers).slice(0, 8), ...dry.stats, err: `${keep.errKept}/${keep.errTotal}`, refs: `${keep.refKept}/${keep.refTotal}`, violations: keep.violations.slice(0, 3) }));
    }
  }
  const quota = await getQuotaState(auth.userId, auth.plan);
  const reject = quotaRejection(quota, endpointModel);
  if (reject) {
    setRetryHeaders(c, quota, endpointModel, reject);
    return c.json({ error: { message: reject, type: "quota_exceeded" } }, 429);
  }
  setQuotaHeaders(c, quota, endpointModel, auth.plan);
  for (const w of assembled.warnings) console.warn(`[prefix-lint] ${auth.userId}: ${w}`);

  // ── Concurrency ──
  // The unlimited theta tier is single-stream by design; parallelism is a
  // priced feature funded by the extra monthly pool. Refusing immediately beats
  // queueing: a queued request still holds a client connection and a slot
  // budget, and a 429 with Retry-After is what every harness understands.
  const lease = acquireConcurrency(auth.apiKeyId, concurrencyLimit(auth.plan, quota.unlimitedTheta));
  if (!lease) {
    c.header("Retry-After", "5");
    return c.json(
      {
        error: {
          message: quota.unlimitedTheta
            ? "Concurrency limit reached: your plan runs one request at a time. Add the extra pool to run more in parallel."
            : "Too many concurrent requests for your plan.",
          type: "rate_limit_error",
        },
      },
      429,
    );
  }
  // From here on every return path must release the lease.
  const releaseLease = () => lease.release();

  // ── Throttle (unlimited tier only) ──
  // Served as latency rather than an error: a slow API makes a runaway agent
  // self-limit, where a 429 makes it retry harder.
  if (quota.throttleDelayMs > 0) {
    console.log(JSON.stringify({ ev: "throttle", user: auth.userId.slice(0, 8), delayMs: quota.throttleDelayMs, window: quota.thetaThisWindow }));
    await applyThrottle(quota.throttleDelayMs, c.req.raw.signal);
  }

  const sessionId = deriveSessionId(auth.apiKeyId, c.req.raw.headers);
  let decision = await decide(auth, sessionId, endpointModel, messages, {
    skill: flags.skill,
    r: flags.r,
  });

  // ── Overflow ──
  // The ladder could not place the turn. Rather than refusing a request the
  // user has already paid for, serve it on an allowlisted model and say so.
  // `hardCapped` is how the router reports an unplaced turn (see fromLane).
  if (decision.hardCapped && decision.reason.includes("ladder-exhausted")) {
    const health = await buildLaneHealth().catch(() => ({}));
    const overflow = selectOverflowModel(health);
    if (overflow) {
      console.log(JSON.stringify({ ev: "overflow", user: auth.userId.slice(0, 8), endpoint: endpointModel, model: overflow.modelId, requested: decision.upstreamModel }));
      c.header(OVERFLOW_HEADER, overflow.modelId);
      decision = {
        ...decision,
        provider: overflow.provider,
        upstreamModel: overflow.modelId,
        tier: "flash",
        effort: "low",
        reason: `${decision.reason} → overflow(${overflow.modelId})`,
      };
    }
    // No eligible overflow: fall through and let dispatch fail loudly. Serving
    // an unmeasured model would break the published quality bar, and a 502 is
    // the honest failure.
  }
  setNudgeHeader(c, decision);
  // Dispatch hardening (ops finding: hyper drops 4–5min generations):
  // 1 retry pre-stream (no client bytes yet), then full→flash degrade for full-tier turns.
  let upstream: Response;
  let usedDecision = decision;
  const terseArm = terseArmOf(c.req.header("x-bhaskara-terse"));
  const persistArm = persistEnabled(c.req.header("x-bhaskara-persist")) ? "on" : "off";
  const effortRequested = parseEffortRequested(c.req.header("x-bhaskara-effort"));
  const expand = expandEnabled(c.req.header("x-bhaskara-expand"));
  // Every provider tried this turn. Failover excludes them, so a burst of bad
  // luck cannot bounce between two lanes that both just failed. Entries are
  // lanes (`provider:model`), not whole providers: a failure that belongs to
  // one model (a free quota running dry) must not lock out the same provider's
  // paid sibling — pickLane reads both granularities.
  const triedProviders = new Set<string>();
  // Which fleet account served the turn (if any) — filled by dispatchUpstream,
  // read into PendingTurn so trackTurn feeds the account window ring.
  const fleetMeta: { accountId?: string } = {};
  const attempt = (d: RouterDecision) => {
    triedProviders.add(`${d.provider}:${d.upstreamModel}`);
    return dispatchUpstream(endpointModel, d, messages, obj, auth, sessionId, terseArm, persistArm === "on", effortRequested, expand, c.req.raw.signal, fleetMeta);
  };

  /**
   * Walk the ladder rung by rung until one serves the turn.
   *
   * The router owns the policy — re-deciding with the tried providers excluded
   * is what makes the ladder order meaningful, and it means this handler only
   * ever executes a hop, never chooses one. Re-deciding also re-reads lane
   * health, so a provider that just marked itself dead is skipped even if it
   * were not already in the exclude set.
   *
   * A rung that refuses or fails MUST NOT end the walk: the old single-hop
   * version returned null on the first failed alternative, which stranded
   * ~2,100 turns on 502s in one 26h window while later rungs (teamorouter,
   * hyper, llmgateway) still had capacity. The walk only ends when the router
   * has no new lane left to offer.
   */
  const tryNextLane = async (cause: string, saturated = false): Promise<Response | null> => {
    triedProviders.add(`${usedDecision.provider}:${usedDecision.upstreamModel}`);
    let from = usedDecision.provider;
    for (;;) {
      const alt = await decideTurn(auth, sessionId, endpointModel, messages, {
        excludeProviders: triedProviders,
        skill: flags.skill,
        r: flags.r,
      }).catch(() => null);
      if (!alt || triedProviders.has(`${alt.provider}:${alt.upstreamModel}`)) return null;
      triedProviders.add(`${alt.provider}:${alt.upstreamModel}`);
      // A hop we caused is not a lane failing. `lane-failover` is the report's
      // signal that a PROVIDER is degrading, and our own admission refusal was
      // inflating it tenfold — 1,274 of 1,413 "failovers" in one window never
      // left the process. Keeping the two events distinct is what makes the
      // failure rate readable as a provider-health number rather than a sum of
      // our own queueing and the provider's faults.
      // `cause` arrives already bounded by `describeUpstreamError`, so it is
      // carried whole: slicing it again here is what cut the reason back out.
      console.log(JSON.stringify({
        ev: saturated ? "lane-saturated-hop" : "lane-failover",
        from,
        to: alt.provider,
        model: alt.upstreamModel,
        tier: alt.tier,
        cause,
      }));
      try {
        const res = await attempt(alt);
        if (res.ok) {
          usedDecision = alt;
          return res;
        }
        // The lane release is wired to the response body (wrapLaneRelease): a
        // non-ok hop whose body is dropped without a read never releases, and
        // the weight is leaked for the process's lifetime — this is how pareto
        // sat "saturated" at 8/8 for two and a half days having served zero
        // turns. Cancel fires the release path (via the shadow hold).
        await res.body?.cancel().catch(() => {});
      } catch {
        // this rung failed too — the walk continues with it excluded
      }
      from = alt.provider;
    }
  };
  /**
   * Connection-failure recovery, shared by the first-attempt and
   * retry-exhausted paths. Order: degrade this turn's own tier to flash (the
   * cheapest thing that still answers the question), then walk the ladder.
   */
  const connectionFailover = async (errMsg: string): Promise<Response | null> => {
    const flashModel = decision.tier === "full" ? FLASH_OF[decision.upstreamModel] ?? null : null;
    if (flashModel) {
      const degraded: RouterDecision = {
        ...decision,
        upstreamModel: flashModel,
        tier: "flash",
        effort: "low",
        reason: `${decision.reason} → degraded-flash(retry-failed)`,
        hardCapped: true,
      };
      try {
        const res = await attempt(degraded);
        if (res.ok) {
          usedDecision = degraded;
          console.log(JSON.stringify({ ev: "dispatch-degraded", from: decision.upstreamModel, to: flashModel, cause: errMsg }));
          return res;
        }
        // Same discard-leak as tryNextLane: cancel so the lane weight returns.
        await res.body?.cancel().catch(() => {});
      } catch { /* fall through to the lane walk */ }
    }
    return null;
  };

  try {
    upstream = await attempt(decision);
  } catch (err) {
    // Client gone → no point retrying (each attempt would abort instantly
    // via the propagated signal; and the response has no reader anyway).
    if (c.req.raw.signal.aborted) {
      console.log(`[dispatch ${decision.provider}] client disconnected mid-generation — aborting turn`);
      releaseLease();
      return c.json({ error: { message: "Client disconnected", type: "api_error" } }, 408);
    }
    const msg = (err as Error).message.slice(0, 60);
    if (msg.includes("ttft ceiling")) {
      // Wedged lane: same-lane retry is a guaranteed 25s waste (observed:
      // 50s+ per turn against a wedge). Fail over immediately.
      console.log(`[dispatch ${decision.provider}] ttft ceiling — lane wedged, failing over (no same-lane retry)`);
      const alt = (await connectionFailover(msg)) ?? (await tryNextLane(`ttft:${msg}`));
      if (alt) {
        upstream = alt;
      } else {
        console.error(`[dispatch ${decision.provider}] connection failure:`, msg);
        releaseLease();
        return c.json({ error: { message: "Upstream provider temporarily unreachable", type: "api_error" } }, 502);
      }
    } else {
      console.warn(`[dispatch ${decision.provider}] attempt 1 failed (${msg}), retrying`);
      try {
        upstream = await attempt(decision);
      } catch (err2) {
        console.error(`[dispatch ${decision.provider}] connection failure:`, (err2 as Error).message);
        const alt = (await connectionFailover((err2 as Error).message.slice(0, 60))) ?? (await tryNextLane(`connect:${(err2 as Error).message.slice(0, 60)}`));
        if (alt) {
          upstream = alt;
        } else {
          releaseLease();
          return c.json({ error: { message: "Upstream provider temporarily unreachable", type: "api_error" } }, 502);
        }
      }
    }
  }
  if (!upstream.ok) {
    const errText = await upstream.text().catch(() => "");
    // Mark the lane unhealthy BEFORE re-deciding, so a dead subscription is
    // skipped for the right reason rather than merely being in the try set.
    //
    // This used to test the status alone — 401/402 — and that missed the case
    // that actually happens most: a spent plan window arrives as a **429** with
    // "API usage limit reached". Nothing cooled the lane, so `agnesEnabled()`
    // stayed true and every subsequent turn re-tried it: 317 consecutive 429s
    // in one window, each one a wasted upstream call and a failover hop that the
    // report then counted against the provider. The body is what distinguishes
    // "you are going too fast" from "your window is spent", so classify the body
    // rather than trusting the number.
    //
    // For how long, ask the provider. Agnes sends `retry-after: 819` and writes
    // the same moment into the body, so `retryAfterFrom` reads the header and
    // falls back to the prose; only when a lane says nothing do we fall back to
    // the streak backoff.
    if (usedDecision.provider === "agnes") {
      const cls = classifyUpstreamError(upstream.status, errText);
      if (cls === "auth" || cls === "quota") markAgnesDead(retryAfterFrom(upstream, errText) ?? undefined);
    }
    if (usedDecision.provider === "stepfun" && upstream.status === 429) markStepfunThrottled(20);
    if (usedDecision.provider === "camel" && upstream.status >= 500) markCamelCool(60);
    // "You're out of credits" is the ACCOUNT refusing, not the daily cap: the
    // budget gate can still read green while every dispatch 402s. Dead-mark so
    // the walk stops paying a doomed round-trip per turn.
    if (usedDecision.provider === "hyper") {
      const cls = classifyUpstreamError(upstream.status, errText);
      if (cls === "quota" || cls === "auth") markHyperDead(retryAfterFrom(upstream, errText) ?? undefined);
    }
    // Our own admission refusal is not a lane error. Counting it as one would
    // attribute a number we chose to a provider that was never contacted, and
    // the failure rate is the signal the whole report is built on. The same
    // distinction has to survive into the hop log below, so it is computed once.
    const saturated = upstream.headers.get(SATURATED_HEADER) !== null;
    if (!saturated) {
      console.log(JSON.stringify({ ev: "lane-error", from: usedDecision.provider, model: usedDecision.upstreamModel, status: upstream.status, cause: describeUpstreamError(errText) }));
    }

    // Walk the ladder for this endpoint. This is the ONLY failover path: the
    // hardcoded same-catalogue hop to llmgateway that used to sit behind it was
    // removed because the ladder already ends there — llmgateway is the last
    // rung of the full chain and the third rung of the flash chain — so the hop
    // could only ever re-try a lane the walk had already declined, and it
    // reported a separate `llmgateway-failover` event that made one failure look
    // like two.
    let hop = await tryNextLane(`${upstream.status}: ${describeUpstreamError(errText)}`, saturated);
    if (!hop) {
      console.error(`[upstream ${usedDecision.provider}] ${upstream.status}: ${errText.slice(0, 500)}`);
      releaseLease();
      return c.json({ error: { message: `Upstream error ${upstream.status}`, type: "api_error" } }, 502);
    }
    upstream = hop;
  }

  const isStream = obj.stream === true;
  const pending: PendingTurn = {
    userId: auth.userId,
    apiKeyId: auth.apiKeyId,
    sessionId,
    toolsPresent: Array.isArray((obj as { tools?: unknown }).tools) && ((obj as { tools?: unknown }).tools as unknown[]).length > 0,
    endpointModel,
    decision: usedDecision,
    terseArm,
    persistArm,
    startedAt: turnStartedAt,
    rawIn: rawInTokens,
    lease,
    client,
    fleetAccountId: fleetMeta.accountId,
  };

  if (!isStream) {
    const json: unknown = await upstream.json();
    const usage = extractUsage(json);
    pending.contentChars = contentCharsOf(json);
    pending.responseHadToolCalls = hasToolCallsOf(json);
    pending.camelExactCostUsd = usage?.camelCostUsd;
    const hyperMeta = extractHyperMeta(json);
    let effUsage = usage;
    const effMeta: Record<string, unknown> = { ...(compactionMeta ?? {}), ...(hyperMeta ?? {}), terseArm: pending.terseArm, persistArm: pending.persistArm, effortRequested: effortRequested ?? undefined, expand: expand || undefined };
    if (expand) {
      const minimal = firstContent(json);
      const ex = minimal ? await expandCompletion(minimal, typeof obj.max_tokens === "number" ? obj.max_tokens : undefined).catch(() => null) : null;
      if (ex && setExpandedContent(json, ex.text)) {
        effUsage = { ...(usage ?? { promptTokens: 0, completionTokens: 0 }), promptTokens: (usage?.promptTokens ?? 0) + ex.usage.promptTokens, completionTokens: (usage?.completionTokens ?? 0) + ex.usage.completionTokens } as typeof usage;
        effMeta.expand = { pass2out: ex.usage.completionTokens };
      }
    }
    trackTurn(pending, effUsage, effMeta);
    void archiveTurn({ userId: pending.userId, apiKeyId: pending.apiKeyId, sessionId: pending.sessionId, endpointModel: pending.endpointModel, provider: pending.decision.provider, upstreamModel: pending.decision.upstreamModel, routedTo: pending.decision.tier, promptTokens: effUsage?.promptTokens ?? 0, completionTokens: effUsage?.completionTokens ?? 0, messages, tools: (obj as { tools?: unknown }).tools }).catch(() => {});
    return c.json(sanitizeOpenAiResponse(json, endpointModel));
  }

  // Streaming pass-through with usage tap (SSE)
  let ttftSet = false;
  const acc = new SseUsageAccumulator();
  c.header("Content-Type", "text/event-stream");
  c.header("Cache-Control", "no-cache");
  c.header("Connection", "keep-alive");
  return streamText(c, async (stream) => {
    const reader = upstream.body?.getReader();
    if (!reader) return;
    const decoder = new TextDecoder();
    let buffer = "";
    // SSE keep-alive: proxies (cloudflared ~90-100s idle timeout) drop silent
    // streams; a `:` comment every 25s keeps the tunnel alive without
    // touching client parsing (SSE spec: comment lines are ignored).
    const KEEPALIVE_MS = 25_000;
    let lastWrite = Date.now();
    let pendingRead: Promise<UpstreamChunk> | null = null;
    // FINALLY: guaranteed cleanup — reader cancel (releases upstream backchannel
    // semaphore slots via wrapRelease.cancel()) even when the loop throws
    // (connection reset, client abort, keepalive write failure). Without this,
    // error paths LEAK semaphore slots and the whole lane goes "busy" forever.
    try {
      while (true) {
        if (!pendingRead) pendingRead = reader.read();
        const wait = Math.max(500, KEEPALIVE_MS - (Date.now() - lastWrite));
        const outcome = await Promise.race([
          pendingRead.then((r) => ({ t: "read" as const, r })),
          new Promise<{ t: "keep" }>((res) => setTimeout(() => res({ t: "keep" }), wait)),
        ]);
        if (outcome.t === "keep") {
          await stream.write(": keepalive\n\n");
          lastWrite = Date.now();
          continue;
        }
        pendingRead = null;
        const { done, value } = outcome.r;
        if (done) break;
        const text = decoder.decode(value, { stream: true });
        if (!ttftSet) {
          pending.ttftMs = Date.now() - pending.startedAt;
          ttftSet = true;
        }
        buffer += text;
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: ")) {
            await stream.write(line + "\n");
            lastWrite = Date.now();
            continue;
          }
          const data = line.slice(6).trim();
          if (!data || data === "[DONE]") {
            await stream.write(line + "\n");
            lastWrite = Date.now();
            continue;
          }
          acc.feed(data);
          const sanitized = sanitizeOpenAiChunk(data, endpointModel);
          if (sanitized !== "__DROP__") await stream.write(`data: ${sanitized}\n\n`);
          lastWrite = Date.now();
        }
      }
      pending.contentChars = acc.contentChars;
      pending.responseHadToolCalls = acc.hasToolCalls;
      pending.camelExactCostUsd = acc.usage?.camelCostUsd;
      const hyperMeta = acc.usage ? extractHyperMeta({ usage: acc.usage }) : undefined;
      trackTurn(pending, acc.usage, { ...(compactionMeta ?? {}), ...(hyperMeta ?? {}), terseArm: pending.terseArm, persistArm: pending.persistArm, effortRequested: effortRequested ?? undefined });
      void archiveTurn({ userId: pending.userId, apiKeyId: pending.apiKeyId, sessionId: pending.sessionId, endpointModel: pending.endpointModel, provider: pending.decision.provider, upstreamModel: pending.decision.upstreamModel, routedTo: pending.decision.tier, promptTokens: acc.usage?.promptTokens ?? 0, completionTokens: acc.usage?.completionTokens ?? 0, messages, tools: (obj as { tools?: unknown }).tools }).catch(() => {});
    } finally {
      // release the upstream reader on ANY exit path (normal, error, abort)
      // — this fires wrapRelease.cancel() which releases the lane slot.
      pendingRead = null;
      await reader.cancel().catch(() => {});
    }
  });
});

// ── User-response sanitization: WHITELIST (lib/sanitize.ts) — upstream provider
// identity (model ids, build fingerprints, cost/remaining meters) never reaches
// users; they see only the endpoint model + standard token accounting.

async function dispatchUpstream(
  endpointModel: string,
  decision: RouterDecision,
  messages: ChatMessage[],
  originalBody: Record<string, unknown>,
  auth: AuthContext,
  sessionId: string,
  terseArm: TerseArm = "off",
  persist = false,
  effort: EffortRequest | null = null,
  expandForm = false,
  clientSignal?: AbortSignal,
  fleetMeta?: { accountId?: string },
): Promise<Response> {
  // Lane admission, before anything is sent.
  //
  // A saturated lane must be skipped, not queued: queueing converts our own
  // oversubscription into the provider's timeout, which arrives as a 504 the
  // client sees and we cannot retry cheaply. Returning a marked 503 here lets
  // the existing failover walk pick the next lane in the ladder — the ladder
  // ordering is the mechanism that makes skipping safe.
  //
  // The status is deliberately 503 and the body deliberately names us, so this
  // is never mistaken for a provider fault: nothing upstream was contacted and
  // the lane's health is untouched.
  const laneWeightWanted = costOnLane(decision.provider, typeof originalBody.max_tokens === "number" ? originalBody.max_tokens : undefined);
  if (!laneFree(decision.provider, laneWeightWanted)) {
    console.log(JSON.stringify({
      ev: "lane-saturated",
      lane: decision.provider,
      model: decision.upstreamModel,
      weight: laneWeightWanted,
      load: laneLoadOf(decision.provider),
      budget: laneBudgetFor(decision.provider),
    }));
    return new Response(
      JSON.stringify({ error: { message: "Lane saturated", type: "api_error" } }),
      { status: 503, headers: { "Content-Type": "application/json", [SATURATED_HEADER]: decision.provider } },
    );
  }
  // A lane in model-level cooldown (e.g. teamorouter's free model out of free
  // quota) must bounce the same way as saturation, not burn an upstream call
  // discovering it again. pickLane already filters these; this covers the race
  // between the decision and the dispatch.
  if (laneCooling(decision.provider, decision.upstreamModel)) {
    return new Response(
      JSON.stringify({ error: { message: "Lane cooling down", type: "api_error" } }),
      { status: 503, headers: { "Content-Type": "application/json", [SATURATED_HEADER]: decision.provider } },
    );
  }
  // `stream_options` is a streaming-only parameter, and some harnesses send it
  // even on non-stream turns. That makes this two rules, not one: add it when we
  // stream, AND drop any client-supplied copy when we do not. Omitting our own
  // is not enough — the payload is built by spreading the client body, so their
  // copy would ride along untouched. Either way Pareto answers 400
  // ("stream_options requires stream=true"), and Pareto leads GLM_FLASH_CHAIN,
  // so the turn fails over to Hyper and pays metered rates for a request the
  // cheap lane would have served.
  const bodyIn = { ...originalBody };
  delete bodyIn.stream_options;
  const streamOptions = bodyIn.stream === true ? { stream_options: { include_usage: true } } : {};
  const rawPayload = { ...bodyIn, messages: withIdentity(messages, endpointModel, terseArm, persist, expandForm), model: decision.upstreamModel, ...streamOptions };
  const payload = applyEffortToBody(rawPayload, decision.upstreamModel, effort);
  // A lane may accept the connection and then never send headers — the client
  // sees a hang, not an error. HANG_PRONE_LANES caps that wait so failover
  // fires in seconds. Every other lane gets the wide ceiling on purpose:
  // aborting a slow generation mid-flight is billed on metered lanes and leaks
  // a zombie slot on flat ones, so a wide ceiling is the cheaper mistake.
  const ttftMs = HANG_PRONE_LANES.has(decision.provider) ? LANE_TTFT_CEILING_MS : WIDE_TTFT_CEILING_MS;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(new Error("lane ttft ceiling")), ttftMs);
  // Client-disconnect propagation — ALL lanes. Paid lanes (hyper/llmgateway)
  // save per-token money on abort; flat lanes free the turn instantly. The
  // flat-lane zombie risk (server keeps generating after our abort, holding
  // one of its server slots while our mirror reads free — observed as
  // "current: 9, limit: 8" 429s) is handled at the semaphore: providers
  // shadow-hold the slot for the estimated remaining generation
  // (lib/shadow-release.ts) so the mirror stays conservative.
  const signal = ac.signal;
  const onClientAbort = () => ac.abort(new Error("client disconnected"));
  clientSignal?.addEventListener("abort", onClientAbort, { once: true });
  const clearTtft = () => {
    clearTimeout(timer);
    clientSignal?.removeEventListener("abort", onClientAbort);
  };
  if (decision.provider === "hyper") {
    const key = pickKeyForSession(hyperKeys(), sessionId);
    // TOCTOU guard: reserve a worst-case estimate so N concurrent turns can't
    // each individually pass hyperBudgetAvailable() while collectively blowing
    // past $12.5 (reserveHyperBudget was dead code — in-flight turns were
    // invisible to the gate). Released on settle; exact cost lands via ledger.
    const estTokens = estimateTokens(messages);
    const estUsd = (estTokens * 3 + 8_000 * 8) / 1e6; // ~prompt at $3/M + 8K out at $8/M worst case
    reserveHyperBudget(estUsd);
    return hyperChat({ model: decision.upstreamModel, body: payload, apiKey: key.key, signal })
      .then((res) => {
        // A 2xx proves the account has credits and the key works — clear the
        // dead-mark streak so the lane re-enters rotation at full health.
        if (res.ok) hyperAccountAlive();
        return res;
      })
      .finally(() => {
        clearTtft();
        releaseHyperBudget(estUsd);
      });
  }
  if (decision.provider === "llmgateway") {
    // Paid fallback lane behind hyper — same model ids, no upstream caching.
    const apiKey = process.env.LLMGATEWAY_API_KEY ?? "";
    return llmGatewayChat({ model: decision.upstreamModel, body: payload, apiKey, signal }).finally(clearTtft);
  }
  if (decision.provider === "camel") {
    // Camel Stream — theta FIRST lane. Metered (usage.cost_details lands in
    // ledger via providerMeta); concurrency 1 guarded inside camelChat.
    // TTFT ceiling: metered lane aborts save money (no zombie risk — the
    // server-side generation is billed only if completed and doesn't hold
    // flat-plan slots), but "auto" routes to frontier-class models whose
    // p90 TTFT can reach ~10s — use the wide ceiling, not the backchannel 25s.
    ac.abort; // no-op reference guard — camel rides the standard 10-min ceiling below
    const camelTtftMs = 10 * 60 * 1000;
    clearTimeout(timer);
    const camelTimer = setTimeout(() => ac.abort(new Error("camel ttft ceiling")), camelTtftMs);
    const apiKey = process.env.CAMEL_API_KEY ?? "";
    return camelChat({ model: decision.upstreamModel, body: payload as Record<string, unknown>, apiKey, signal }).finally(() => {
      clearTimeout(camelTimer);
      clearTtft();
    });
  }
  if (decision.provider === "agnes") {
    const apiKey = process.env.AGNES_API_KEY ?? "";
    return agnesChat({ model: decision.upstreamModel, body: payload, apiKey, signal }).finally(clearTtft);
  }
  if (decision.provider === "stepfun") {
    const apiKey = process.env.STEPFUN_API_KEY ?? "";
    return stepfunChat({ model: decision.upstreamModel, body: payload, apiKey, signal }).finally(clearTtft);
  }
  if (FLEET_DISPATCHABLE.has(decision.provider)) {
    // Providers registered via the admin panel (upstream_providers table)
    // route through the generic dispatcher with account rotation.
    //
    // Walk every slot-free account, not just the rotation's first pick. Picking
    // one and giving up when it was busy reported "no healthy account" while a
    // sibling credential sat idle — an avoidable outage on a provider whose
    // whole reason for having two accounts is that one can be busy.
    const fleet = await getFleet();
    const provider = fleet.get(decision.provider);
    if (provider && provider.accounts.length > 0) {
      // Window limits bind here too, not just the fleet-alias path: a lane
      // whose account spent its plan window must be skipped BEFORE the request
      // is paid for, or the provider answers 402 and the ladder counts a fault.
      const candidates = candidatesFor(provider).filter((a) => {
        const w = checkAccountWindows(a.id, a.limits);
        if (!w.allowed) console.log(JSON.stringify({ ev: "account-window", provider: provider.id, account: a.label, reason: w.reason ?? null }));
        return w.allowed;
      });
      // Rotation still decides the order among healthy accounts, so load
      // spreads the way the fleet was configured — the difference is that a
      // full account now moves to the next instead of ending the turn.
      const first = pickAccount(provider.id, provider.accounts)?.id;
      const ordered = [...candidates.filter((a) => a.id === first), ...candidates.filter((a) => a.id !== first)];
      for (const account of ordered) {
        try {
          const res = await genericChat({ provider, account, modelId: decision.upstreamModel, body: payload, signal });
          clearTtft();
          if (fleetMeta) fleetMeta.accountId = account.id;
          return res;
        } catch (err) {
          console.error(`[dispatch ${decision.provider}] account ${account.label} failed:`, (err as Error).message.slice(0, 120));
        }
      }
    }
    // No slot-free account → fall through to 502 via empty response contract:
    return new Response(JSON.stringify({ error: { message: "No healthy account for provider", type: "api_error" } }), { status: 502, headers: { "Content-Type": "application/json" } });
  }
  // Unreachable in practice: the router only emits providers that appear in a
  // ladder, and every ladder lane has a branch above. Failing loudly beats
  // silently sending the turn to a provider that no longer exists.
  clearTtft();
  console.error(`[dispatch] no handler for provider '${decision.provider}' (model ${decision.upstreamModel})`);
  return new Response(
    JSON.stringify({ error: { message: "Upstream provider temporarily unreachable", type: "api_error" } }),
    { status: 502, headers: { "Content-Type": "application/json" } },
  );
}

function extractUsage(json: unknown): HyperUsage | null {
  if (typeof json !== "object" || json === null || !("usage" in json)) return null;
  return parseUsageNonStream(json);
}

/** Extract Hyper cost/credits metadata for the ledger's provider_meta column.
 *  Hyper returns cost.usd, cost.hypercredits, remaining.hypercredits per call.
 *  Storing these gives us the TRUE billed amount, not just our computed estimate. */
function extractHyperMeta(json: unknown): Record<string, unknown> | undefined {
  if (typeof json !== "object" || json === null) return undefined;
  const obj = json as Record<string, unknown>;
  const usage = obj.usage as Record<string, unknown> | undefined;
  if (!usage || typeof usage !== "object") return undefined;
  const cost = usage.cost as Record<string, unknown> | undefined;
  const remaining = usage.remaining as Record<string, unknown> | undefined;
  const meta: Record<string, unknown> = {};
  if (cost && typeof cost.usd === "number") meta.hyperCostUsd = cost.usd;
  if (cost && typeof cost.hypercredits === "number") meta.hypercredits = cost.hypercredits;
  if (remaining && typeof remaining.hypercredits === "number") meta.hyperRemaining = remaining.hypercredits;
  return Object.keys(meta).length > 0 ? meta : undefined;
}

async function decide(
  auth: AuthContext,
  sessionId: string,
  endpointModel: string,
  messages: ChatMessage[],
  options: DecideOptions = {},
): Promise<RouterDecision> {
  return decideTurn(auth, sessionId, endpointModel, messages, options);
}

// Anthropic-compat endpoint (Claude Code / Crush) — full router pipeline
app.route("/", messagesApp);

app.get("/health", async (c) => {
  const health = await buildLaneHealth().catch(() => ({}));
  return c.json({ ok: true, lanes: health });
});

// Client-facing model catalog. Endpoint models are always listed; public
// models from the DB fleet (admin panel) extend the catalog — private ones
// stay routable but hidden (OpenRouter private-model semantics).
app.get("/v1/models", async (c) => {
  const endpointModels = [
    { id: "glm-5.3", object: "model", owned_by: "bhaskara" },
    { id: "theta", object: "model", owned_by: "bhaskara" },
  ];
  try {
    const fleetModels = await getPublicModels();
    const extra = fleetModels
      .filter((m) => !endpointModels.some((e) => e.id === m.id))
      .map((m) => ({ id: m.id, object: "model", owned_by: "bhaskara-fleet" }));
    return c.json({ object: "list", data: [...endpointModels, ...extra] });
  } catch {
    return c.json({ object: "list", data: endpointModels });
  }
});

// Boot + periodic refresh of DB-fleet dispatchability (admin panel additions
// go live without restart; 60s cadence matches the fleet TTL generously).
void refreshFleetDispatchable();
setInterval(() => void refreshFleetDispatchable(), 60_000);

export default app;