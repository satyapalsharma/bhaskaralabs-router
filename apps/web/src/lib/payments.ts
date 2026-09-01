// Payment-provider abstraction. Same contract for Stripe / Razorpay / stub.
// Mode selection is env-driven: as soon as real keys land in .env, the stub
// stops being used — no call-site changes needed.
//
//   STRIPE_SECRET_KEY / STRIPE_WEBHOOK_SECRET   → stripe mode (USD)
//   RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET       → razorpay mode (INR)
//   (neither)                                    → stub mode (dev/test only)
import { randomUUID } from "crypto";

export type CheckoutIntent = {
  plan: "basic" | "advanced";
  currency: "usd" | "inr";
  amount: number; // in currency units, after discount
  userId: string;
  sessionId: string; // our checkout_sessions.id
  couponCode?: string;
};

export type CheckoutTicket = {
  /** Where to send the browser to pay. stub → /checkout/mock */
  redirectTo: string;
  provider: "stripe" | "razorpay" | "stub";
  providerRef: string;
};

export type WebhookResult = {
  sessionId: string;
  status: "paid" | "canceled";
  providerRef: string;
  valid: boolean;
};

export function paymentMode(): "stripe" | "razorpay" | "stub" {
  if (process.env.STRIPE_SECRET_KEY) return "stripe";
  if (process.env.RAZORPAY_KEY_ID) return "razorpay";
  return "stub";
}

export async function createCheckout(intent: CheckoutIntent): Promise<CheckoutTicket> {
  const mode = paymentMode();

  if (mode === "stripe") {
    // TODO(psp): replace with Stripe Checkout Sessions API when keys arrive:
    //   POST https://api.stripe.com/v1/checkout/sessions
    //   { mode: "subscription"|"payment", line_items: [{ price_data: {...}, quantity: 1 }],
    //     success_url, cancel_url, client_reference_id: intent.sessionId }
    //   Auth: Bearer STRIPE_SECRET_KEY. Return { redirectTo: session.url, providerRef: session.id }.
    throw new Error("Stripe provider not yet wired — add implementation with live keys");
  }

  if (mode === "razorpay") {
    // TODO(psp): replace with Razorpay Orders API when keys arrive:
    //   POST https://api.razorpay.com/v1/orders { amount: paise, currency: "INR",
    //     receipt: intent.sessionId }  → then client-side Checkout.js with order id.
    //   Return { redirectTo: "/checkout/razorpay?order=...", providerRef: order.id }.
    throw new Error("Razorpay provider not yet wired — add implementation with live keys");
  }

  // ── stub: no external call. Mock page simulates PSP-hosted checkout. ──
  return {
    redirectTo: `/checkout/mock?session=${intent.sessionId}`,
    provider: "stub",
    providerRef: `stub_${randomUUID()}`,
  };
}

/**
 * Verify a PSP webhook. Stub mode accepts ONLY our own mock-page POST (signed
 * with an internal shared secret — never a public route). Stripe/Razorpay:
 * validate signature headers here.
 */
export async function verifyWebhook(body: Record<string, unknown>): Promise<WebhookResult> {
  const mode = paymentMode();

  if (mode === "stripe") {
    // TODO(psp): stripe.webhooks.constructEvent(payload, sigHeader, STRIPE_WEBHOOK_SECRET)
    //   → checkout.session.completed → client_reference_id = our sessionId
    throw new Error("Stripe webhook verification not yet wired");
  }
  if (mode === "razorpay") {
    // TODO(psp): HMAC-sha256(body, RAZORPAY_WEBHOOK_SECRET) compare vs x-razorpay-signature
    //   → payment.captured → receipt = our sessionId
    throw new Error("Razorpay webhook verification not yet wired");
  }

  // stub: caller already checked the internal secret; trust fields.
  return {
    sessionId: String(body.sessionId ?? ""),
    status: body.event === "checkout.completed" ? "paid" : "canceled",
    providerRef: String(body.providerRef ?? "stub"),
    valid: true,
  };
}