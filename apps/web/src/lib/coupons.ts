// Coupon validation + redemption. Used by checkout create (validate) and
// activation (redeem). Rules mirror TODO: code, discount %, usage limit,
// per-user limit, validity window, plan scope.
import { db } from "@/db";
import { coupons, couponRedemptions } from "@/db/schema";
import { and, count, eq, sql } from "drizzle-orm";
import { randomUUID } from "crypto";

export type CouponCheck =
  | { ok: true; code: string; discountPct: number }
  | { ok: false; error: string };

export async function validateCoupon(code: string, plan: string, userId: string): Promise<CouponCheck> {
  const c = code.trim().toUpperCase();
  const rows = await db.select().from(coupons).where(eq(coupons.code, c)).limit(1);
  const cp = rows[0];
  if (!cp || !cp.active) return { ok: false, error: "Invalid code" };

  const now = new Date();
  if (cp.validFrom > now) return { ok: false, error: "Code not active yet" };
  if (cp.validUntil && cp.validUntil < now) return { ok: false, error: "Code expired" };

  if (cp.plans !== "*") {
    const allowed = cp.plans.split(",").map((s) => s.trim());
    if (!allowed.includes(plan)) return { ok: false, error: "Code not valid for this plan" };
  }
  if (cp.usedCount >= cp.usageLimit) return { ok: false, error: "Code fully redeemed" };

  const mine = await db
    .select({ n: count() })
    .from(couponRedemptions)
    .where(and(eq(couponRedemptions.couponCode, c), eq(couponRedemptions.userId, userId)));
  if (Number(mine[0]?.n ?? 0) >= cp.perUserLimit) return { ok: false, error: "You've already used this code" };

  return { ok: true, code: c, discountPct: cp.discountPct };
}

/** Atomically record redemption (increments usage counter; enforces limits). Returns true if applied. */
export async function redeemCoupon(opts: {
  code: string;
  userId: string;
  subscriptionId: string;
  discountUsd: number;
}): Promise<boolean> {
  const applied = await db.transaction(async (tx) => {
    const upd = await tx
      .update(coupons)
      .set({ usedCount: sql`${coupons.usedCount} + 1` })
      .where(
        and(
          eq(coupons.code, opts.code),
          eq(coupons.active, true),
          sql`${coupons.usedCount} < ${coupons.usageLimit}`,
          sql`NOT EXISTS (SELECT 1 FROM coupon_redemptions WHERE coupon_code = ${opts.code} AND user_id = ${opts.userId})`,
        ),
      )
      .returning({ code: coupons.code });
    if (upd.length === 0) return false;

    await tx.insert(couponRedemptions).values({
      id: randomUUID(),
      couponCode: opts.code,
      userId: opts.userId,
      subscriptionId: opts.subscriptionId,
      discountApplied: String(opts.discountUsd),
    });
    return true;
  });
  return applied;
}