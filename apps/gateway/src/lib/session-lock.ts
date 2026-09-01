// Session-sticky model lock (cache commandment #5).
// First frontier turn for a session decides + LOCKS the workhorse model.
// Every later turn in that session reuses the lock — model switch = cache wipe.
// Lock auto-releases after IDLE_TTL (task-boundary approximation for v0).

import { db } from "../db";
import { routerSessions as sessions } from "../db/schema";
import { eq } from "drizzle-orm";

const IDLE_TTL_MS = 2 * 60 * 60 * 1000; // 2h idle → next request starts a fresh lock

export interface SessionLock {
  lockedModel: string | null; // null = no active lock (fresh session)
  stale: boolean;             // lock existed but exceeded TTL → treat as fresh
}

export async function getLock(sessionId: string, userId: string): Promise<SessionLock> {
  const rows = await db.select().from(sessions).where(eq(sessions.id, sessionId)).limit(1);
  const row = rows[0];
  if (!row || !row.lockedModel) return { lockedModel: null, stale: false };

  const idleMs = Date.now() - new Date(row.lastSeenAt).getTime();
  if (idleMs > IDLE_TTL_MS) return { lockedModel: row.lockedModel, stale: true };
  return { lockedModel: row.lockedModel, stale: false };
}

/** Create or refresh the lock for a session. Called after every frontier turn. */
export async function setLock(sessionId: string, userId: string, model: string): Promise<void> {
  await db
    .insert(sessions)
    .values({ id: sessionId, userId, lockedModel: model, lockedAt: new Date(), lastSeenAt: new Date() })
    .onConflictDoUpdate({
      target: sessions.id,
      set: {
        userId,
        lockedModel: model,
        lastSeenAt: new Date(),
        // lockedAt only on first lock — keep original timestamp while the lock persists
        ...(await isFreshLock(sessionId) ? { lockedAt: new Date() } : {}),
      },
    });
}

async function isFreshLock(sessionId: string): Promise<boolean> {
  const rows = await db.select().from(sessions).where(eq(sessions.id, sessionId)).limit(1);
  return !rows[0]?.lockedModel;
}

/** Touch lastSeenAt without changing the lock (heartbeat on every turn). */
export async function touchSession(sessionId: string, userId: string): Promise<void> {
  await db
    .insert(sessions)
    .values({ id: sessionId, userId, lastSeenAt: new Date() })
    .onConflictDoUpdate({ target: sessions.id, set: { lastSeenAt: new Date() } });
}