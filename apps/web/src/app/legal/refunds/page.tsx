import { LegalPage, Section } from "../legal";

export const metadata = { title: "Refund Policy — Bhaskara Labs" };

export default function RefundsPage() {
  return (
    <LegalPage title="Refund Policy" effective="1 September 2026">
      <Section heading="The short promise">
        <p>
          If the service fails you, you don&apos;t pay for the broken part. Cancel anytime before renewal
          and owe nothing further.
        </p>
      </Section>

      <Section heading="Within 7 days of a first paid cycle">
        <p>
          Full refund, no questions — email billing@bhaskaralabs.com. One time per account; we are not a
          subscription-hopping venue.
        </p>
      </Section>

      <Section heading="Mid-cycle problems">
        <ul className="list-disc space-y-1 pl-5">
          <li>
            <strong className="text-zinc-200">Service down &gt; 24 hours continuously</strong> (planned
            maintenance excluded, announced 24h ahead): pro-rata credit or refund for the downtime day, your
            choice.
          </li>
          <li>
            <strong className="text-zinc-200">Billing errors</strong> (charged twice, wrong plan price,
            coupon honoured then revoked): corrected and refunded within 5 business days.
          </li>
          <li>
            <strong className="text-zinc-200">We terminate your account for a breach by you</strong>: no
            refund for the remainder of the cycle except where consumer law requires one.
          </li>
          <li>
            <strong className="text-zinc-200">We terminate for convenience or end-of-cohort</strong>: full
            pro-rata refund of the unused period.
          </li>
        </ul>
      </Section>

      <Section heading="What is not refundable">
        <p>
          Quota you used and liked, model outputs you disagree with, and requests you rate-limited yourself
          with (429 responses are quota, not outages). Inference is probabilistic — &quot;the answer was
          bad&quot; is not a defect in the pipe. If a systemic issue caused it, see down &gt; 24h above.
        </p>
      </Section>

      <Section heading="How refunds are paid">
        <p>
          Back to the original payment method within 10 business days of approval (UPI/card rails decide the
          exact speed). Free-trial data and keys are deactivated on refund; the account stays for reading
          your dashboard.
        </p>
      </Section>

      <Section heading="Consumer rights">
        <p>
          Nothing in this policy limits your rights under the Consumer Protection Act (India), the EU
          consumer acquis, or any other non-waivable regime. Where this policy is stricter than your local
          law, this policy applies.
        </p>
      </Section>
    </LegalPage>
  );
}