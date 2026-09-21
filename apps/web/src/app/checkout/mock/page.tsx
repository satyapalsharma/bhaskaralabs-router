import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { checkoutSessions } from "@/db/schema";
import { eq } from "drizzle-orm";
import { paymentMode } from "@/lib/payments";
import MockCheckoutClient from "./MockCheckoutClient";

export const dynamic = "force-dynamic";

// Stub PSP page. In production this route never renders — Stripe and Razorpay
// host checkout on their own domains and confirm by webhook.
export default async function MockCheckoutPage({
  searchParams,
}: {
  searchParams: Promise<{ session?: string }>;
}) {
  if (paymentMode() !== "stub") redirect("/plans");

  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) redirect("/login");

  const { session: sid } = await searchParams;
  if (!sid) redirect("/plans");

  const rows = await db
    .select()
    .from(checkoutSessions)
    .where(eq(checkoutSessions.id, sid))
    .limit(1);
  const cs = rows[0];
  if (!cs || cs.userId !== session.user.id) redirect("/plans");

  const isInr = cs.currency.toUpperCase() === "INR";

  return (
    <main className="mx-auto max-w-lg px-5 py-16 sm:px-6 sm:py-24">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="subhead">Checkout</h1>
        <span className="tag tag-warn">
          <span className="dot" />
          Stub mode
        </span>
      </div>
      <p className="measure mt-4 text-[0.875rem] leading-relaxed text-ink-mute">
        The payment processor is pending keys, so this page simulates the hosted
        flow end to end. No card is charged.
      </p>

      <dl className="mt-8">
        <div className="flex items-baseline justify-between gap-6 border-b border-rule py-3.5">
          <dt className="label text-ink-faint">Plan</dt>
          <dd className="font-mono text-[0.875rem] capitalize text-ink">
            {cs.plan}
          </dd>
        </div>
        {Number(cs.discountUsd) > 0 && (
          <div className="flex items-baseline justify-between gap-6 border-b border-rule py-3.5">
            <dt className="label text-ink-faint">
              Discount · {cs.couponCode}
            </dt>
            <dd className="num font-mono text-[0.875rem] text-ok">
              −${cs.discountUsd}
            </dd>
          </div>
        )}
        <div className="flex items-baseline justify-between gap-6 py-4">
          <dt className="label text-ink-faint">Total, first cycle</dt>
          <dd className="num font-mono text-[1.25rem] font-medium text-ink">
            ${cs.priceUsd}
            {isInr && (
              <span className="ml-2 text-[0.8125rem] font-normal text-ink-mute">
                ≈ ₹
                {(Number(cs.priceUsd) * 100).toLocaleString("en-IN")}
              </span>
            )}
          </dd>
        </div>
      </dl>

      <MockCheckoutClient sessionId={cs.id} pending={cs.status === "pending"} />
    </main>
  );
}
