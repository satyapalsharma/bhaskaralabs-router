import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { checkoutSessions } from "@/db/schema";
import { eq } from "drizzle-orm";
import { paymentMode } from "@/lib/payments";
import MockCheckoutClient from "./MockCheckoutClient";

export const dynamic = "force-dynamic";

// Stub PSP page. In production this route never renders — Stripe/Razorpay host
// checkout on their domains and confirm via webhook.
export default async function MockCheckoutPage({
  searchParams,
}: {
  searchParams: Promise<{ session?: string }>;
}) {
  if (paymentMode() !== "stub") redirect("/plans"); // real PSPs don't use this page

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) redirect("/login");

  const { session: sid } = await searchParams;
  if (!sid) redirect("/plans");

  const rows = await db.select().from(checkoutSessions).where(eq(checkoutSessions.id, sid)).limit(1);
  const cs = rows[0];
  if (!cs || cs.userId !== session.user.id) redirect("/plans");

  return (
    <main className="mx-auto max-w-md px-6 py-24">
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-6">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold">Checkout</h1>
          <span className="rounded-full border border-zinc-700 px-2.5 py-0.5 text-[10px] uppercase tracking-widest text-zinc-500">
            stub mode
          </span>
        </div>
        <p className="mt-1 text-sm text-zinc-500">
          Payments processor integration pending keys — this page simulates the PSP-hosted flow
          end-to-end. No card, no charge.
        </p>
        <dl className="mt-6 space-y-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-zinc-400">Plan</dt>
            <dd className="font-medium capitalize">{cs.plan}</dd>
          </div>
          {Number(cs.discountUsd) > 0 && (
            <div className="flex justify-between">
              <dt className="text-zinc-400">Discount ({cs.couponCode})</dt>
              <dd className="text-emerald-400">−${cs.discountUsd}</dd>
            </div>
          )}
          <div className="flex justify-between border-t border-zinc-800 pt-2">
            <dt className="text-zinc-400">Total (first cycle)</dt>
            <dd className="text-lg font-semibold">${cs.priceUsd} {cs.currency.toUpperCase() === "INR" ? "≈ ₹" + (Number(cs.priceUsd) * 100).toLocaleString() : ""}</dd>
          </div>
        </dl>
        <MockCheckoutClient sessionId={cs.id} pending={cs.status === "pending"} />
      </div>
    </main>
  );
}