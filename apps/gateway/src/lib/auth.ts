// Auth middleware: sk-bhaskara-… bearer key → user + plan + quotas.
// Keys stored hashed (sha256); prefix stored for display.

import { db } from "../db";
import { apiKeys, users, subscriptions } from "../db/schema";
import { eq } from "drizzle-orm";
import { createHash, randomBytes } from "node:crypto";

export interface AuthContext {
  userId: string;
  plan: string;
  apiKeyId: string;
  sessionId: string;
}

export function newApiKey(): { full: string; prefix: string; hash: string } {
  const secret = randomBytes(24).toString("base64url");
  const full = `sk-bhaskara-${secret}`;
  const prefix = full.slice(0, 16);
  const hash = sha256(full);
  return { full, prefix, hash };
}

function sha256(input: string): string {
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
  // latest active subscription defines the plan; fall back to user.plan
  const subRows = await db
    .select()
    .from(subscriptions)
    .where(eq(subscriptions.userId, user.id))
    .limit(1);
  const plan = subRows[0]?.plan ?? user.plan;
  return {
    userId: user.id,
    plan,
    apiKeyId: key.id,
    sessionId: key.id, // session→key affinity; x-bhaskara-session refines later
  };
}