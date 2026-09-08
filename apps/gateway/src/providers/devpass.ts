// [BOOTSTRAP] DevPass by LLM Gateway — deepseek-v4-flash-0731 at old prices ($0.08/$0.15).
// MUST degrade gracefully: kill-switch + health-checked, theta-only fallback target.

import { PROVIDER_CLASS } from "@bhaskara/shared/pricing";

export const DEVPASS_BASE = process.env.DEVPASS_BASE_URL ?? "https://llmgateway.io/v1"; // verify actual base in console

export function devpassEnabled(): boolean {
  return !!process.env.DEVPASS_API_KEY && PROVIDER_CLASS.devpass === "bootstrap";
}

export async function devpassChat(opts: {
  model: string;
  body: unknown;
  apiKey: string;
  signal?: AbortSignal;
}): Promise<Response> {
  return fetch(`${DEVPASS_BASE}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${opts.apiKey}` },
    body: JSON.stringify(opts.body),
    signal: opts.signal,
  });
}