// Checkout activation — single implementation used by the stub-complete route
// now and by real PSP webhook handlers later (Stripe/Razorpay).
import { db } from "@/db";
import { checkoutSessions, subscriptions, user as users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { randomUUID } from "crypto";
import { redeemCoupon } from "@/lib/coupons";

/** Activate a paid checkout: subscription + plan flip + session status. Idempotent per session id. */
export async function activateCheckout(opts: {
  checkoutId: string;
  userId: string;
  plan: string;
  currency: string;
  priceUsd: string;
  discountUsd?: string;
  couponCode?: string;
}): Promise<void> {
  const now = new Date();
  const periodEnd = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const subId = randomUUID();

  await db.transaction(async (tx) => {
    const cur = await tx
      .select({ status: checkoutSessions.status })
      .from(checkoutSessions)
      .where(eq(checkoutSessions.id, opts.checkoutId))
      .limit(1);
    if (cur[0]?.status !== "pending") throw new Error("ALREADY_PROCESSED");

    await tx.insert(subscriptions).values({
      id: subId,
      userId: opts.userId,
      plan: opts.plan,
      currency: opts.currency,
      pricePaid: opts.priceUsd,
      periodStart: now,
      periodEnd,
      couponCode: opts.couponCode ?? null,
    });
    await tx.update(users).set({ plan: opts.plan, updatedAt: now }).where(eq(users.id, opts.userId));
    await tx
      .update(checkoutSessions)
      .set({ status: "paid", updatedAt: now })
      .where(eq(checkoutSessions.id, opts.checkoutId));
  });

  if (opts.couponCode) {
    // Audit row + usage counter; limits already enforced at validation.
    await redeemCoupon({
      code: opts.couponCode,
      userId: opts.userId,
      subscriptionId: subId,
      discountUsd: Number(opts.discountUsd ?? "0"),
    }).catch(() => null);
  }
}