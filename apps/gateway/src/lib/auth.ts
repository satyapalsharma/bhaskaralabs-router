// Auth middleware: sk-bhaskara-… bearer key → user + plan + quotas.
// Keys stored hashed (sha256); prefix stored for display.
// Per-key context-engine flags (compress/compact) ride along on AuthContext.

import { db } from "../db";
import { apiKeys, user as users, subscriptions } from "../db/schema";
import { and, desc, eq } from "drizzle-orm";
import { createHash, randomBytes } from "node:crypto";

export interface AuthContext {
  userId: string;
  plan: string;
  apiKeyId: string;
  sessionId: string;
  /** CSV flags from api_keys.flags, e.g. "compress,compact". */
  flags: string | null;
}

export function newApiKey(): { full: string; prefix: string; hash: string } {
  const secret = randomBytes(24).toString("base64url");
  const full = `sk-bhaskara-${secret}`;
  const prefix = full.slice(0, 16);
  const hash = sha256(full);
  return { full, prefix, hash };
}

export function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

export async function authenticate(bearer: string | null): Promise<AuthContext | null> {
  if (!bearer || !bearer.startsWith("sk-bhaskara-")) return null;
  const hash = sha256(bearer.trim());
  const rows = await db.select().from(apiKeys).where(eq(apiKeys.keyHash, hash)).limit(1);
  const key = rows[0];
  if (!key || !key.active) return null;
  const userRows = await db.select().from(users).where(eq(users.id, key.userId)).limit(1);
  const user = userRows[0];
  if (!user) return null;
  // Latest active subscription defines the plan; fall back to user.plan.
  //
  // The ordering and the status filter are both load-bearing. Without them this
  // was `.limit(1)` over an unordered set, which returns whichever row the
  // planner happens to reach first — in practice the oldest, so the first plan a
  // user ever bought would keep overriding every one after it. Upgrading a
  // subscription then looked like it had silently done nothing: the row was
  // correct in the table and the request was still served on the old plan.
  const subRows = await db
    .select()
    .from(subscriptions)
    .where(and(eq(subscriptions.userId, user.id), eq(subscriptions.status, "active")))
    .orderBy(desc(subscriptions.createdAt))
    .limit(1);
  const plan = subRows[0]?.plan ?? user.plan;
  return {
    userId: user.id,
    plan,
    apiKeyId: key.id,
    sessionId: key.id, // session→key affinity; x-bhaskara-session refines later
    flags: (key as { flags?: string | null }).flags ?? null,
  };
}
