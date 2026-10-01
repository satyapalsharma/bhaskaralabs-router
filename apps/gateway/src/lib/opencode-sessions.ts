/**
 * OpenCode zen "free tier" session pool.
 *
 * The free models on opencode.ai/zen (longcat-2.5-preview-free,
 * mimo-v2.6-flash-free, …) are gated to requests that carry an
 * x-opencode-session id the zen gateway recognises: sessions are minted by
 * the real opencode client, which syncs them to its console, and any other
 * caller — API key or not — draws FreeTierError 403. The recipe that works
 * (verified end-to-end, including from this host's IP): no Authorization
 * header at all, the client's User-Agent, x-opencode-client: cli,
 * x-opencode-project: global, a registered session id, and a freshly minted
 * msg_ request id (13 hex chars + 12 nanoid chars).
 *
 * Sessions outlive many turns, so the pool is small and rotated
 * round-robin. The opencode binary on the host mints and syncs new sessions
 * on a cron (~/limitless/scripts/opencode-mint.sh) and upserts them into
 * opencode_free_sessions; this module refreshes from that table once a
 * minute. If the table is unreachable or empty the lane throws, which the
 * walk treats as an account error — cooldown, next lane.
 */
import { sql } from "drizzle-orm";
import { db } from "../db";

/** Must match the opencode client's own UA byte-for-byte: the gate reads it. */
export const OPENCODE_FREE_UA =
  "opencode/1.18.31 ai-sdk/provider-utils/4.0.23 runtime/bun/1.3.14";

const ALPHA = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

function nanoid(n: number): string {
  const bytes = crypto.getRandomValues(new Uint8Array(n));
  let out = "";
  for (let i = 0; i < n; i++) out += ALPHA[bytes[i]! % ALPHA.length];
  return out;
}

/** x-opencode-request: minted fresh per turn; only the session must be
 *  pre-registered, request ids are free-form (verified). */
export function mintOpencodeMsgId(): string {
  const ts = Date.now().toString(16).padStart(13, "0").slice(0, 13);
  return `msg_${ts}${nanoid(12)}`;
}

let pool: string[] = [];
let loadedAt = 0;
let cursor = 0;

async function refresh(): Promise<void> {
  try {
    const rows = (await db.execute(
      sql`select id from opencode_free_sessions order by id`,
    )) as unknown;
    const ids = Array.isArray(rows)
      ? rows
          .map((r) => (r as { id?: unknown }).id)
          .filter((v): v is string => typeof v === "string")
      : [];
    if (ids.length > 0) pool = ids;
  } catch {
    // Table missing or DB hiccup: keep serving from the last good pool.
  }
  loadedAt = Date.now();
}

export async function pickOpencodeSession(): Promise<string> {
  if (Date.now() - loadedAt > 60_000) await refresh();
  const id = pool[cursor % pool.length];
  cursor++;
  if (!id) throw new Error("opencode-free session pool empty");
  return id;
}
