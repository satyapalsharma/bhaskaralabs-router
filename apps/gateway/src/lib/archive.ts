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

export async function archiveTurn(e: ArchiveEntry): Promise<void> {
  if (!archiveEnabled()) return;
  let json: string;
  let truncated = false;
  try {
    // Cap per-message BEFORE stringify: stringifying a 200K-token history
    // into one giant string is an OOM vector under concurrency. The 100KB
    // total cap below stays as backstop.
    const slim = (Array.isArray(e.messages) ? e.messages : []).map((m) => {
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
    json = JSON.stringify({ messages: slim, tools: e.tools ?? null });
  } catch {
    json = '{"unserializable":true}';
  }
  if (json.length > ARCHIVE_MAX_JSON) {
    json = json.slice(0, ARCHIVE_MAX_JSON);
    truncated = true;
  }
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
