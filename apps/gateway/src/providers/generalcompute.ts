// General Compute (api.generalcompute.com) — theta lane before Hyper.
// minimax-m2.7 (192k ctx, $0.28/M in, $1.20/M out), OpenAI-compat, Bearer auth.
// PAYG limits: 100rpm / 200K TPM / 10M tokens/day. 429 → short cooldown so the
// failover retry lands on hyper instead of hammering. No concurrency mirror v1
// (server concurrent limit unpublished) — throttle flag only; revisit if 429s
// appear without rpm/TPM exhaustion.
export const GENERALCOMPUTE_BASE = process.env.GENERALCOMPUTE_BASE_URL ?? "https://api.generalcompute.com/v1";
export const GENERALCOMPUTE_MODEL = "minimax-m2.7";

export function generalcomputeEnabled(): boolean {
  return !!process.env.GENERALCOMPUTE_API_KEY;
}

let throttleUntil = 0;
/** True when not in 429 cooldown. */
export function generalcomputeSlotFree(): boolean {
  return Date.now() >= throttleUntil;
}
export function markGeneralcomputeThrottled(seconds = 20): void {
  throttleUntil = Date.now() + seconds * 1000;
}

export interface GeneralComputeChatOpts {
  model: string;
  body: Record<string, unknown>;
  apiKey: string;
  signal?: AbortSignal;
}

/** POST to General Compute chat/completions; raw Response for streaming pass-through. */
export async function generalcomputeChat(opts: GeneralComputeChatOpts): Promise<Response> {
  return fetch(`${GENERALCOMPUTE_BASE}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${opts.apiKey}`,
    },
    body: JSON.stringify({ ...opts.body, model: opts.model }),
    signal: opts.signal,
  });
}
