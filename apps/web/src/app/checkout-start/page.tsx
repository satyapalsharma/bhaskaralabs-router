import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { checkoutSessions } from "@/db/schema";
import { createCheckout, paymentMode, type CheckoutIntent } from "@/lib/payments";
import { PLANS } from "@bhaskara/shared/pricing";
import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

// Relay: /login?next=/checkout-start?plan=basic lands here post-auth,
// creates the session server-side and bounces to the PSP (stub: /checkout/mock).
export default async function CheckoutStart({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string; coupon?: string }>;
}) {
  const session = await auth.api.getSession({ headers: await headers() });
  const sp = await searchParams;
  const plan = sp.plan === "advanced" ? "advanced" : sp.plan === "basic" ? "basic" : null;
  if (!plan) redirect("/plans");
  if (!session?.user) redirect(`/login?next=${encodeURIComponent(`/checkout-start?plan=${plan}${sp.coupon ? `&coupon=${sp.coupon}` : ""}`)}`);
  const p = PLANS[plan];
  const currency = "usd"; // stub; real PSP flow picks by region
  const sessionId = randomUUID();
  const intent: CheckoutIntent = { plan, currency, amount: p.priceUsd, userId: session.user.id, sessionId };

  await db.insert(checkoutSessions).values({
    id: sessionId,
    userId: session.user.id,
    plan,
    currency,
    priceUsd: String(p.priceUsd),
    provider: paymentMode(),
    status: "pending",
  });

  const ticket = await createCheckout(intent);
  await db.update(checkoutSessions).set({ providerRef: ticket.providerRef, updatedAt: new Date() }).where(eq(checkoutSessions.id, sessionId));
  redirect(ticket.redirectTo);
}