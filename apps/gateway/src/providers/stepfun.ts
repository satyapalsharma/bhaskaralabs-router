// [BOOTSTRAP] StepFun Step Plan — credit tiers, OpenAI-compat.
// COGS model: plan fee amortized per consumed credit. Track credit burn via response usage if exposed.

export const STEPFUN_BASE = process.env.STEPFUN_BASE_URL ?? "https://api.stepfun.ai/step_plan/v1";

export function stepfunEnabled(): boolean {
  return !!process.env.STEPFUN_API_KEY;
}

export async function stepfunChat(opts: {
  model: string; // step-3.7-flash
  body: unknown;
  apiKey: string;
  signal?: AbortSignal;
}): Promise<Response> {
  return fetch(`${STEPFUN_BASE}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${opts.apiKey}` },
    body: JSON.stringify(opts.body),
    signal: opts.signal,
  });
}