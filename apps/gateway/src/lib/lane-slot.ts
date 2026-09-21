// Weighted per-lane admission control.
//
// Why a lane budget exists at all: the per-key concurrency limit bounds how
// many turns a customer can have open, but says nothing about how many of them
// may land on one provider. With the operator key allowed 32 open turns, all 32
// could reach a single lane, and a provider's own gateway — which is the real
// ceiling — starts timing out long before that.
//
// Why it is WEIGHTED. A provider's concurrency ceiling is not one number,
// because a lane is occupied for as long as the generation runs. Measured on
// pareto 2026-09-13, same lane, same moment:
//
//   8 concurrent short turns (max_tokens 300)  → 0% failure, ~9s each
//   8 concurrent long turns  (max_tokens 4000) → 79% failure, 504 at ~60s
//   1 long turn alone                          → 200, 48.8s (62.3s with tools)
//
// A single long turn finishing in ~60s is the entire explanation: pareto's own
// gateway times out around there, so any queue that pushes a long generation
// past 60s becomes a 504. Treating every request as one slot admits eight long
// generations into a ceiling that fits two or three. Charging by max_tokens is
// how the admission decision sees the difference before it matters.
//
// Weighting uses the REQUESTED max_tokens and not the observed output, because
// the decision happens before the request is sent. A turn that asks for 4000
// and stops at 50 over-holds a slot — and that is the correct direction to be
// wrong in: over-holding costs briefly reduced throughput, under-holding costs
// a 504 the client sees.

/** Aggregate lane budget per provider, in weighted units. */
export const LANE_BUDGET: Record<string, number> = {
  // Tuned by running both settings against live agent traffic:
  //
  //   budget 6 (3 concurrent)  hyper 40.5% of glm turns, pareto p90 24.8s,
  //                            24 refusals in 2.5min, 6 errors
  //   budget 8 (4 concurrent)  hyper 11.6%, pareto p90 6.1s,
  //                            8 refusals in 5min, 8 errors
  //
  // Six was over-serialized: it pushed two fifths of the traffic onto the
  // metered lane and stretched pareto's own p90 fourfold, which is what a lane
  // looks like when it is queued behind itself. Eight keeps the failure rate
  // low without paying hyper for work pareto could take.
  //
  // Override per deployment without a rebuild: BHASKARA_LANE_BUDGET_PARETO.
  pareto: Number(process.env.BHASKARA_LANE_BUDGET_PARETO ?? 8),
  hyper: 8,
  // Counted in REQUESTS, not weight — see LANE_COUNTS_REQUESTS. The plan allows
  // ONE concurrent request, whatever the size, so a weighted budget here was a
  // category error: with a typical weight of 3, a budget of 2 admitted nothing
  // at all and the lane sat permanently "saturated" at zero load.
  //
  // One, not two: the provider's own 429 says two, but the second slot is not
  // usable. Measured against live traffic, the second concurrent turn is what
  // produces the "Concurrency limit exceeded: your plan currently allows 2
  // concurrent request(s)" rejections — the count the plan advertises includes
  // the one already running, so admitting two means the second one races the
  // first and loses. Trusting the advertised number cost every leaked session a
  // wasted round trip before the ladder walked on.
  electronhub: 1,
};

/**
 * Lanes whose upstream limit is on concurrent REQUESTS rather than on work.
 *
 * Electron Hub's plan says "allows 2 concurrent request(s)" — a count, with no
 * reference to how large they are. Charging such a lane by weight does not
 * approximate its limit, it mis-states it in both directions at once: a single
 * long turn is refused admission it would have been granted, and several short
 * ones are admitted past a limit that does not care how short they are.
 *
 * Pareto is the opposite case and is NOT in this set: nothing in its contract
 * caps request count, and what actually breaks there is long generations
 * overlapping, which is precisely what weighting models.
 */
export const LANE_COUNTS_REQUESTS: ReadonlySet<string> = new Set(["electronhub"]);

/**
 * Budget for a provider with no measured ceiling.
 *
 * Generous on purpose: throttling a lane by a number that was measured on a
 * different one would trade a real outage risk for an imaginary one.
 */
export const LANE_BUDGET_DEFAULT = 8;

const laneLoad = new Map<string, number>();

/**
 * Budget units a request costs.
 *
 * Banded rather than linear so the arithmetic stays legible in logs and a
 * client cannot fine-tune itself into a slot it did not pay for by nudging
 * max_tokens down by one.
 */
export function laneWeight(maxTokens: number | undefined): number {
  const want = maxTokens ?? 1024;
  if (want <= 512) return 1;
  if (want <= 1200) return 2;
  if (want <= 2500) return 3;
  if (want <= 4000) return 4;
  return 5;
}

/** What a request costs on this lane: its weight, or 1 if the lane counts requests. */
export function costOnLane(providerId: string, maxTokens: number | undefined): number {
  return LANE_COUNTS_REQUESTS.has(providerId) ? 1 : laneWeight(maxTokens);
}

/**
 * Marker header on a saturation refusal.
 *
 * The failover path logs every non-ok upstream response as a lane-error, and a
 * refusal we generated ourselves must not be counted as one: it would inflate
 * the lane's observed failure rate with faults that never left the process, and
 * the whole point of the report is to show which PROVIDER is degrading.
 */
export const SATURATED_HEADER = "x-bhaskara-lane-saturated";

export function laneBudgetFor(providerId: string): number {
  return LANE_BUDGET[providerId] ?? LANE_BUDGET_DEFAULT;
}

export function laneLoadOf(providerId: string): number {
  return laneLoad.get(providerId) ?? 0;
}

/** True when the lane has room for a request of this weight. */
export function laneFree(providerId: string, weight = 1): boolean {
  return laneLoadOf(providerId) + weight <= laneBudgetFor(providerId);
}

/**
 * Take a unit of the lane budget.
 *
 * Callers must pair this with the returned release on every exit path,
 * including aborts — `wrapLaneRelease` exists so that pairing is structural
 * rather than something each dispatch branch has to remember.
 */
export function laneAcquire(providerId: string, weight: number): () => void {
  laneLoad.set(providerId, laneLoadOf(providerId) + weight);
  let released = false;
  return () => {
    if (released) return;
    released = true;
    laneLoad.set(providerId, Math.max(0, laneLoadOf(providerId) - weight));
  };
}

/**
 * Attach a lane release to a Response body.
 *
 * A lane slot must be held for the whole generation, not just the fetch: the
 * upstream is still occupying its own concurrency while we stream, so
 * releasing at fetch-return would make the mirror read free while the provider
 * is still busy — the exact undercount that produces "current: 9, limit: 8".
 * Releasing on body end is therefore the only correct hook, and the abort path
 * needs the provider's shadow-hold rather than an immediate release.
 */
export function wrapLaneRelease(res: Response, release: () => void, shadowRelease: () => void): Response {
  if (!res.body) {
    release();
    return res;
  }
  const [mine, sink] = res.body.tee();
  void sink.cancel().catch(() => {});
  const reader = mine.getReader();
  const passthrough = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { done, value } = await reader.read();
        if (done) {
          controller.close();
          release();
          return;
        }
        controller.enqueue(value);
      } catch (err) {
        release();
        controller.error(err);
      }
    },
    cancel(reason) {
      shadowRelease();
      return reader.cancel(reason);
    },
  });
  return new Response(passthrough, { status: res.status, headers: res.headers });
}

/** Test seam. */
export function resetLaneLoad(): void {
  laneLoad.clear();
}

// Lane-level (provider+model) cooldowns. For failures that belong to ONE model
// while the account stays healthy — TeamoRouter's free model answering 402
// free_request_quota_exhausted (an availability refusal, not a daily quota)
// while the paid model on the same key still serves. An account cooldown there
// would silence the paid lane too, which is the exact capacity the account was
// topped up for. Lives here (not in upstream-config) so the router stays
// importable without the database.
const laneCooldowns = new Map<string, number>();

export function markLaneCooldown(providerId: string, modelId: string, ms: number): void {
  laneCooldowns.set(`${providerId}:${modelId}`, Date.now() + ms);
  for (const [key, until] of laneCooldowns) {
    if (until <= Date.now()) laneCooldowns.delete(key);
  }
}

export function laneCooling(providerId: string, modelId: string): boolean {
  const until = laneCooldowns.get(`${providerId}:${modelId}`);
  return until != null && until > Date.now();
}

/** Test seam. */
export function resetLaneCooldowns(): void {
  laneCooldowns.clear();
}
