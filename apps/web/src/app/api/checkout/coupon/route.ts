import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { db } from "@/db";
import { checkoutSessions } from "@/db/schema";
import { eq } from "drizzle-orm";
import { validateCoupon } from "@/lib/coupons";
import { PLANS } from "@bhaskara/shared/pricing";

// Apply/replace a coupon on a pending stub checkout; recompute stored price.
export async function POST(req: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { sessionId?: unknown; coupon?: unknown };
  if (typeof body.sessionId !== "string" || typeof body.coupon !== "string") {
    return NextResponse.json({ error: "bad_request" }, { status: 400 });
  }

  const rows = await db.select().from(checkoutSessions).where(eq(checkoutSessions.id, body.sessionId)).limit(1);
  const cs = rows[0];
  if (!cs || cs.userId !== session.user.id) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (cs.provider !== "stub" || cs.status !== "pending") {
    return NextResponse.json({ error: "cannot_change_coupon" }, { status: 409 });
  }

  const code = body.coupon.trim().toUpperCase();
  if (!code) {
    // Clear coupon → back to base price.
    const base = PLANS[cs.plan as "basic" | "advanced"].priceUsd;
    await db.update(checkoutSessions)
      .set({ couponCode: null, discountUsd: "0", priceUsd: String(base), updatedAt: new Date() })
      .where(eq(checkoutSessions.id, cs.id));
    return NextResponse.json({ ok: true, cleared: true, amount: base });
  }

  const check = await validateCoupon(code, cs.plan, cs.userId);
  if (!check.ok) return NextResponse.json({ error: check.error }, { status: 400 });

  const base = PLANS[cs.plan as "basic" | "advanced"].priceUsd;
  const discountUsd = Number(((base * check.discountPct) / 100).toFixed(2));
  const amount = Math.max(0, Number((base - discountUsd).toFixed(2)));
  await db.update(checkoutSessions)
    .set({ couponCode: check.code, discountUsd: String(discountUsd), priceUsd: String(amount), updatedAt: new Date() })
    .where(eq(checkoutSessions.id, cs.id));

  return NextResponse.json({ ok: true, code: check.code, discountPct: check.discountPct, amount, discountUsd });
}