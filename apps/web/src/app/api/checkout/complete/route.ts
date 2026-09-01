import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { db } from "@/db";
import { checkoutSessions } from "@/db/schema";
import { eq } from "drizzle-orm";
import { activateCheckout } from "@/lib/checkout";

// Stub-mode completion: only allowed while STRIPE/RAZORPAY keys absent
// (createCheckout sets provider="stub"). Real PSPs confirm via webhook route.
export async function POST(req: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { sessionId?: unknown };
  if (typeof body.sessionId !== "string") return NextResponse.json({ error: "bad_request" }, { status: 400 });

  const rows = await db.select().from(checkoutSessions).where(eq(checkoutSessions.id, body.sessionId)).limit(1);
  const cs = rows[0];
  if (!cs) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (cs.userId !== session.user.id) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  if (cs.provider !== "stub") return NextResponse.json({ error: "complete_via_webhook_only" }, { status: 402 });
  if (cs.status !== "pending") return NextResponse.json({ error: `already_${cs.status}` }, { status: 409 });

  try {
    await activateCheckout({
      checkoutId: cs.id,
      userId: cs.userId,
      plan: cs.plan,
      currency: cs.currency,
      priceUsd: cs.priceUsd,
      discountUsd: cs.discountUsd,
      couponCode: cs.couponCode ?? undefined,
    });
  } catch (e) {
    if (e instanceof Error && e.message === "ALREADY_PROCESSED") {
      return NextResponse.json({ error: "already_processed" }, { status: 409 });
    }
    throw e;
  }
  return NextResponse.json({ ok: true, plan: cs.plan });
}