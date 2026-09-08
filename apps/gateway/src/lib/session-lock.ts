// Session locks v2 — per (session, endpoint) model lock (cache commandment #5).
// v1 locked per bare session: a glm-full lock served qwen/theta turns on the
// same key (observed 2026-09-08: 168 qwen-endpoint turns on glm-5.3 full).
// v2 rows are keyed (session, endpoint) so locks never cross endpoints.
// De-escalation: routine_streak counts trailing routine-hardness turns (any
// tier); N calm turns on a full lock → flash downgrade, paying the same
// switch discipline as upgrades (count cap + cooldown). First frontier turn
// decides + locks; every later turn reuses — a switch wipes prefix cache.
// Idle TTL 2h releases (task-boundary approximation for v0).
import { db } from "../db";
import { sessionLocks as locks } from "../db/schema";
import { and, eq, sql } from "drizzle-orm";

const IDLE_TTL_MS = 2 * 60 * 60 * 1000; // 2h idle → next request starts a fresh lock
/** Min interval between model switches in either direction (anti-flip-flop). */
export const SWITCH_COOLDOWN_MS = Number(process.env.LOCK_SWITCH_COOLDOWN_MS ?? 10 * 60 * 1000);
/** Trailing routine turns that de-escalate a full lock to flash. */
export const DOWN_STREAK = Number(process.env.LOCK_DOWN_STREAK ?? 8);

export interface SessionLock {
  lockedModel: string | null; // null = no active lock (fresh session)
  stale: boolean; // lock existed but exceeded TTL → treat as fresh
  switchCount: number; // switches used (both directions share the cap)
  routineStreak: number; // trailing routine-hardness turns (any tier)
  lastSwitchAt: Date | null;
}

export async function getLock(sessionId: string, userId: string, endpoint: string): Promise<SessionLock> {
  const rows = await db
    .select()
    .from(locks)
    .where(and(eq(locks.sessionId, sessionId), eq(locks.endpointModel, endpoint)))
    .limit(1);
  const row = rows[0];
  if (!row || !row.lockedModel) return { lockedModel: null, stale: false, switchCount: 0, routineStreak: 0, lastSwitchAt: null };

  const idleMs = Date.now() - new Date(row.lastSeenAt).getTime();
  if (idleMs > IDLE_TTL_MS)
    return { lockedModel: row.lockedModel, stale: true, switchCount: row.switchCount ?? 0, routineStreak: row.routineStreak ?? 0, lastSwitchAt: row.lastSwitchAt };
  return { lockedModel: row.lockedModel, stale: false, switchCount: row.switchCount ?? 0, routineStreak: row.routineStreak ?? 0, lastSwitchAt: row.lastSwitchAt };
}

/** Create/refresh the lock. routine=true extends the calm streak, else resets. */
export async function setLock(
  sessionId: string,
  userId: string,
  endpoint: string,
  model: string,
  opts?: { bumpSwitch?: boolean; routine?: boolean },
): Promise<void> {
  const bump = opts?.bumpSwitch ? { switchCount: sql`${locks.switchCount} + 1`, lastSwitchAt: new Date() } : {};
  const streak = opts?.routine ? sql`${locks.routineStreak} + 1` : 0;
  await db
    .insert(locks)
    .values({
      sessionId,
      endpointModel: endpoint,
      userId,
      lockedModel: model,
      lockedAt: new Date(),
      lastSeenAt: new Date(),
      routineStreak: opts?.routine ? 1 : 0,
      ...(opts?.bumpSwitch ? { switchCount: 1, lastSwitchAt: new Date() } : {}),
    })
    .onConflictDoUpdate({
      target: [locks.sessionId, locks.endpointModel],
      set: { userId, lockedModel: model, lastSeenAt: new Date(), routineStreak: streak, ...bump },
    });
}

/** Heartbeat: lastSeenAt + streak, lock model untouched. */
export async function touchSession(sessionId: string, userId: string, endpoint: string, routine = false): Promise<void> {
  const streak = routine ? sql`${locks.routineStreak} + 1` : 0;
  await db
    .insert(locks)
    .values({ sessionId, endpointModel: endpoint, userId, lastSeenAt: new Date(), routineStreak: routine ? 1 : 0 })
    .onConflictDoUpdate({
      target: [locks.sessionId, locks.endpointModel],
      set: { lastSeenAt: new Date(), routineStreak: streak },
    });
}
