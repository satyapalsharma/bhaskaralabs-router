// Time-based hyper/qwen3.8-flash quota stewardship (2026-10-19, operator design).
//
// Hyper's plan quota resets 03:00 IST and the operator stops batching at
// 23:00 IST, so an idle evening's quota would go to waste. Two windows:
//
//   Day (04:00–23:30 IST): a fixed per-hour trickle of calls is promoted to
//   the FRONT of the theta chain — exactly N turns/hour land on qwen3.8-flash
//   and the rest flow to the agnes fleet, so the daily quota drains slowly
//   across the day and personal-use quota stays saved. N is
//   BHASKARA_HYPER_TRICKLE_PER_HOUR (0 disables the day trickle).
//
//   Primary (23:30–04:00 IST): unlimited — the rung sits at the FRONT with no
//   counter, so the leftover quota is dumped before the 03:00 reset instead
//   of being wasted.
//
// IST = UTC + 5:30. The window wraps midnight IST, so it is expressed in
// minutes-since-IST-midnight and tested as [from, 1440) ∪ [0, to).

const IST_OFFSET_MIN = 330;

/** Minutes since IST midnight (0..1439). */
export function istMinutesOf(now: Date = new Date()): number {
  return (now.getUTCHours() * 60 + now.getUTCMinutes() + IST_OFFSET_MIN) % 1440;
}

/** Primary window bounds in IST minutes, overridable via env. */
const PRIMARY_FROM = Number(process.env.BHASKARA_HYPER_PRIMARY_FROM ?? 1410); // 23:30 IST
const PRIMARY_TO = Number(process.env.BHASKARA_HYPER_PRIMARY_TO ?? 240); // 04:00 IST

/** True inside the "dump the remainder before reset" window. */
export function hyperPrimaryWindow(now: Date = new Date()): boolean {
  const m = istMinutesOf(now);
  return PRIMARY_FROM > PRIMARY_TO
    ? m >= PRIMARY_FROM || m < PRIMARY_TO
    : m >= PRIMARY_FROM && m < PRIMARY_TO;
}

const TRICKLE_PER_HOUR = Number(process.env.BHASKARA_HYPER_TRICKLE_PER_HOUR ?? 40);

// One bucket per IST hour; a turn's bucket is (day, floor(minutes/60)).
let bucketKey = "";
let bucketUsed = 0;

function currentBucketKey(now: Date): string {
  const m = istMinutesOf(now);
  return `${now.getUTCFullYear()}-${now.getUTCMonth()}-${now.getUTCDate()}-${Math.floor(m / 60)}`;
}

/** Remaining trickle calls for this IST hour (peek — does not consume). */
export function hyperTrickleRemaining(now: Date = new Date()): number {
  if (TRICKLE_PER_HOUR <= 0) return 0;
  const key = currentBucketKey(now);
  const used = key === bucketKey ? bucketUsed : 0;
  return Math.max(0, TRICKLE_PER_HOUR - used);
}

/** Consume one trickle slot — call when a decision actually lands on the
 *  scheduled qwen rung outside the primary window. Slightly over-consuming
 *  on races is fine: N is a knob, not a contract. */
export function hyperTrickleClaim(now: Date = new Date()): void {
  const key = currentBucketKey(now);
  if (key !== bucketKey) {
    bucketKey = key;
    bucketUsed = 0;
  }
  bucketUsed++;
}

/** Test seam. */
export function __resetHyperScheduleForTest(): void {
  bucketKey = "";
  bucketUsed = 0;
}
