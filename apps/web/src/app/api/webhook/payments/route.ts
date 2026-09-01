import { NextResponse } from "next/server";
import { paymentMode } from "@/lib/payments";

// PSP webhook receiver — placeholder until real keys land.
//
// When Stripe live (apps/web/src/lib/payments.ts wires STRIPE_SECRET_KEY):
//   1. read raw body + "stripe-signature" header
//   2. stripe.webhooks.constructEvent(raw, sig, STRIPE_WEBHOOK_SECRET) → reject invalid
//   3. on checkout.session.completed: sessionId = event.data.object.client_reference_id
//      → activateCheckout(...) from "@/lib/checkout" (idempotent per session)
//
// When Razorpay live (RAZORPAY_KEY_ID set):
//   1. HMAC-sha256(raw, RAZORPAY_WEBHOOK_SECRET) === x-razorpay-signature
//   2. on payment.captured: receipt = our sessionId → activateCheckout(...)
//
// Stub mode never reaches PSPs: /checkout/mock completes via /api/checkout/complete.
export async function POST() {
  const mode = paymentMode();
  return NextResponse.json({ error: `${mode} mode: webhook verification not wired yet` }, { status: 501 });
}