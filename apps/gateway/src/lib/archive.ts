// Request archival: truncated full traces for router training + disputes.
// Heavy rows by design → 100KB JSON cap + env kill-switch (ARCHIVE_TURNS=0).
// Fire-and-forget from turn writers (void ... .catch), never blocks responses.

import { db } from "../db";
import { requestArchives } from "../db/schema";
import { randomUUID } from "node:crypto";

const ARCHIVE_MAX_JSON = 100_000;

export function archiveEnabled(): boolean {
  return process.env.ARCHIVE_TURNS !== "0";
}

export interface ArchiveEntry {
  userId: string;
  apiKeyId: string;
  sessionId: string;
  endpointModel: string;
  provider: string;
  upstreamModel: string;
  routedTo: string;
  promptTokens: number;
  completionTokens: number;
  messages: unknown;
  tools?: unknown;
}

const PER_MSG_CAP = 20_000;

/**
 * Serialize an archived request under a hard byte cap while keeping it valid
 * JSON.
 *
 * The previous version stringified everything and then did `json.slice(0, cap)`.
 * That cuts mid-token, so any row over the cap was stored as unparseable JSON —
 * 11,990 of 38,903 rows at the time this was written, roughly 31%, silently
 * unusable for the router training and dispute reading this archive exists for.
 * A cap that corrupts the data is worse than no cap, because the `truncated`
 * flag makes it look deliberate.
 *
 * Now the cap is applied to *messages* before serialization: messages are
 * rendered individually and taken from the tail (most recent turns are what
 * routing decisions are read from), and the result is always well-formed.
 * Leading `tool` messages are dropped from the kept slice, because a tool reply
 * whose assistant call fell outside the window is not just noise — it is the
 * exact orphan shape an audit would flag as a gateway defect.
 */
export function serializeArchive(messages: unknown, tools: unknown, maxBytes = ARCHIVE_MAX_JSON): { json: string; truncated: boolean } {
  const list = (Array.isArray(messages) ? messages : []).map((m) => {
    const o = (m ?? {}) as Record<string, unknown>;
    const c = o.content;
    return {
      ...o,
      content:
        typeof c === "string" && c.length > PER_MSG_CAP
          ? c.slice(0, PER_MSG_CAP) + `+[${c.length - PER_MSG_CAP} chars]`
          : c,
    };
  });

  const full = safeStringify({ messages: list, tools: tools ?? null });
  if (full === null) return { json: '{"unserializable":true}', truncated: false };
  if (full.length <= maxBytes) return { json: full, truncated: false };

  // Over budget: keep the newest messages that fit. Reserve room for the
  // envelope and the tools block so the rebuilt JSON cannot overshoot.
  const toolsJson = safeStringify(tools ?? null) ?? "null";
  const envelope = '{"messages":[],"tools":'.length + toolsJson.length + 1;
  const budget = Math.max(0, maxBytes - envelope);

  const rendered = list.map((m) => safeStringify(m));
  const kept: string[] = [];
  let used = 0;
  for (let i = rendered.length - 1; i >= 0; i--) {
    const r = rendered[i];
    if (r === null) continue;
    const cost = r.length + 1;
    if (used + cost > budget) break;
    kept.push(r);
    used += cost;
  }
  kept.reverse();

  // A kept slice must not begin with a tool reply: its assistant call would be
  // outside the window, and the row would read as a malformed request.
  while (kept.length > 0) {
    const first = JSON.parse(kept[0]) as { role?: string };
    if (first.role !== "tool") break;
    kept.shift();
  }

  return { json: `{"messages":[${kept.join(",")}],"tools":${toolsJson}}`, truncated: true };
}

function safeStringify(v: unknown): string | null {
  try {
    const s = JSON.stringify(v);
    return typeof s === "string" ? s : null;
  } catch {
    return null;
  }
}

export async function archiveTurn(e: ArchiveEntry): Promise<void> {
  if (!archiveEnabled()) return;
  const { json, truncated } = serializeArchive(e.messages, e.tools);
  const r = (n: number | undefined) => Math.round(Number.isFinite(n) ? (n as number) : 0);
  await db.insert(requestArchives).values({
    id: randomUUID(),
    userId: e.userId,
    apiKeyId: e.apiKeyId,
    sessionId: e.sessionId,
    endpointModel: e.endpointModel,
    provider: e.provider,
    upstreamModel: e.upstreamModel,
    routedTo: e.routedTo,
    promptTokens: r(e.promptTokens),
    completionTokens: r(e.completionTokens),
    requestJson: json,
    truncated,
  });
}
