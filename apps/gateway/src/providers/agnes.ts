// [BOOTSTRAP] Agnes — $10/mo flat for 200k requests, tokens included.
// Per-request COGS = 0; ledger tracks request count, monthly amortization applied at margin level.

export const AGNES_BASE = process.env.AGNES_BASE_URL ?? "https://api.agnes.ai/v1"; // TODO verify actual endpoint

export function agnesEnabled(): boolean {
  return !!process.env.AGNES_API_KEY;
}

export async function agnesChat(opts: {
  model: string; // e.g. agnes-2.5-flash
  body: unknown;
  apiKey: string;
  signal?: AbortSignal;
}): Promise<Response> {
  return fetch(`${AGNES_BASE}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${opts.apiKey}` },
    body: JSON.stringify(opts.body),
    signal: opts.signal,
  });
}