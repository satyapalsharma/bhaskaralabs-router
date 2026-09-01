import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { db } from "@/db";
import { checkoutSessions } from "@/db/schema";
import { createCheckout, paymentMode, type CheckoutIntent } from "@/lib/payments";
import { validateCoupon } from "@/lib/coupons";
import { PLANS } from "@bhaskara/shared/pricing";
import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";

// Start a checkout for basic/advanced. Currency: inr if region hint says India else usd.
export async function POST(req: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { plan?: unknown; coupon?: unknown; currency?: unknown };
  const plan = body.plan === "basic" || body.plan === "advanced" ? body.plan : null;
  if (!plan) return NextResponse.json({ error: "plan must be basic or advanced" }, { status: 400 });
  const currency = body.currency === "inr" ? "inr" : "usd";

  const p = PLANS[plan];
  const baseUsd = p.priceUsd;

  // Coupon (optional) — validated server-side; discount stored on the session.
  let discountUsd = 0;
  let couponCode: string | undefined;
  if (typeof body.coupon === "string" && body.coupon.trim()) {
    const check = await validateCoupon(body.coupon, plan, session.user.id);
    if (!check.ok) return NextResponse.json({ error: check.error }, { status: 400 });
    couponCode = check.code;
    discountUsd = Number(((baseUsd * check.discountPct) / 100).toFixed(2));
  }

  const sessionId = randomUUID();
  const intent: CheckoutIntent = {
    plan,
    currency,
    amount: Math.max(0, Number((baseUsd - discountUsd).toFixed(2))),
    userId: session.user.id,
    sessionId,
    couponCode,
  };

  await db.insert(checkoutSessions).values({
    id: sessionId,
    userId: session.user.id,
    plan,
    currency,
    priceUsd: String(intent.amount),
    couponCode,
    discountUsd: String(discountUsd),
    provider: paymentMode(),
    status: "pending",
  });

  const ticket = await createCheckout(intent);
  await db.update(checkoutSessions).set({ providerRef: ticket.providerRef, updatedAt: new Date() }).where(eq(checkoutSessions.id, sessionId));
  return NextResponse.json({ sessionId, redirectTo: ticket.redirectTo, provider: ticket.provider, amount: intent.amount, currency });
}
