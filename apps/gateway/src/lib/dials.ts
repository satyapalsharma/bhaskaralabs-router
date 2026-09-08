// User-facing dials: effort override + expander pass (non-compaction flags).
// Effort semantics: router owns decision.effort; this is an explicit user
// override for full-tier turns. Cache-safe (params, not prompt bytes).

export type EffortRequest = "low" | "max";

/** Validated parse: unknown values → null (router decides, no silent coerce). */
export function parseEffortRequested(headerValue: string | undefined | null): EffortRequest | null {
  const v = (headerValue ?? "").trim().toLowerCase();
  if (v === "low") return "low";
  if (v === "max" || v === "high") return "max";
  return null;
}
export function expandEnabled(headerValue: string | undefined | null): boolean {
  const v = (headerValue ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "on";
}

/** Map a low-effort request onto the upstream body. QWEN-ONLY: Hyper accepts
 * reasoning_effort on qwen lanes (HTTP 200 on qwen3.8-max, probed 2026-09-08;
 * note reasoning still ran in that probe — savings UNPROVEN, measured via
 * completion_tokens_details.reasoning_tokens per effortRequested arm).
 * GLM untouched (unknown param risks a provider 400). Never overrides a
 * client-set value. */

export function applyEffortToBody(
  body: Record<string, unknown>,
  upstreamModel: string,
  effort: EffortRequest | null,
): Record<string, unknown> {
  if (effort !== "low") return body;
  if (!upstreamModel.toLowerCase().includes("qwen")) return body;
  if ("reasoning_effort" in body) return body;
  return { ...body, reasoning_effort: "none" };
}
