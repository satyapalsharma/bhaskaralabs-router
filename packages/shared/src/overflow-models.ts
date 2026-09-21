// Overflow allowlist — the quality floor for models we serve when our own
// capacity is exhausted.
//
// The public commitment on the theta page is: an alternate model is used only
// if it scores **≥70% on Terminal-Bench 2.1** or **≥50 on the Artificial
// Analysis Intelligence Index**. This file is that commitment in code.
//
// Two rules keep it honest:
//
//   1. A model is routable only if it appears here. `lib/overflow.ts` refuses
//      anything absent — there is no "default overflow model".
//   2. Every entry carries a score AND a source. `overflow.test.ts` fails if a
//      score is missing, out of range, or if the entry's `verifiedAt` is older
//      than the staleness window. A model we cannot cite is a model we do not
//      serve.
//
// To add a model: run it against the benchmark, record the number and a link to
// the result, then add the entry. Do not add an entry on a vendor's marketing
// claim alone — the whole point of publishing a bar is that we hold it.

export type OverflowModel = {
  /** Upstream model id, as the provider names it. */
  modelId: string;
  provider: string;
  /** Terminal-Bench 2.1 score, 0–100. null when not measured. */
  terminalBench21: number | null;
  /** Artificial Analysis Intelligence Index, 0–100. null when not measured. */
  aaIntelligenceIndex: number | null;
  /** Where the score came from. Required. */
  source: string;
  /** When the score was recorded (ISO date). Entries go stale. */
  verifiedAt: string;
};

/** The bar, in one place. Changing these changes the published promise, so they
 *  are deliberately not env-tunable. */
export const OVERFLOW_BAR = {
  terminalBench21: 70,
  aaIntelligenceIndex: 50,
} as const;

/** How long a recorded score is trusted before it must be re-verified. */
export const OVERFLOW_STALENESS_DAYS = 180;

/**
 * Models eligible for overflow. Ordered by preference (cheapest capable first).
 *
 * Deliberately short. Only models with a recorded score on one of the two
 * benchmarks appear here; anything the founder has discussed but that has not
 * been measured (muse-spark, gemini-3.8-flash) is absent until it is.
 */
export const OVERFLOW_ALLOWLIST: readonly OverflowModel[] = [
  {
    modelId: "gpt-5.6-luna",
    provider: "teamorouter",
    terminalBench21: 84.3,
    aaIntelligenceIndex: null,
    source: "https://www.buildfastwithai.com/blogs/gpt-5-6-review-sol-terra-luna-2026",
    verifiedAt: "2026-09-12",
  },
  {
    modelId: "gpt-5.6-sol",
    provider: "teamorouter",
    terminalBench21: 88.8,
    aaIntelligenceIndex: null,
    source: "https://the-agent-report.com/2026/07/gpt-5-6-sol-terra-luna-benchmarks-pricing-analysis/",
    verifiedAt: "2026-09-12",
  },
];

/** Whether a model clears at least one of the two bars. */
export function meetsOverflowBar(m: OverflowModel): boolean {
  const tb = m.terminalBench21;
  const aa = m.aaIntelligenceIndex;
  return (
    (typeof tb === "number" && tb >= OVERFLOW_BAR.terminalBench21) ||
    (typeof aa === "number" && aa >= OVERFLOW_BAR.aaIntelligenceIndex)
  );
}

/** Whether a recorded score is still fresh enough to trust. */
export function isFresh(m: OverflowModel, now: Date = new Date()): boolean {
  const at = new Date(m.verifiedAt);
  if (Number.isNaN(at.getTime())) return false;
  const ageMs = now.getTime() - at.getTime();
  return ageMs <= OVERFLOW_STALENESS_DAYS * 24 * 60 * 60 * 1000;
}

/** An overflow model is eligible when it clears the bar and its score is fresh. */
export function isEligible(m: OverflowModel, now: Date = new Date()): boolean {
  return meetsOverflowBar(m) && isFresh(m, now);
}

/** Look up an eligible model by id. Returns null for absent, below-bar, stale,
 *  or unscored models — the caller must treat all four identically. */
export function findEligibleOverflow(
  modelId: string,
  now: Date = new Date(),
): OverflowModel | null {
  const found = OVERFLOW_ALLOWLIST.find((m) => m.modelId === modelId);
  if (!found) return null;
  if (!isEligible(found, now)) return null;
  return found;
}
