import { LegalPage, Section } from "../legal";

export const metadata = { title: "Terms of Service — Bhaskara Labs" };

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Service" effective="1 September 2026">
      <Section heading="1. What this service is">
        <p>
          Bhaskara Labs provides hosted inference endpoints (<code>glm-5.3</code>, <code>qwen-3.8</code>,{" "}
          <code>glm-5.3-flash</code>, <code>theta</code>) compatible with OpenAI and Anthropic APIs, intended
          for use by software agents and developers. Access is granted against the plan you purchase; each
          account receives API keys that authenticate its requests.
        </p>
        <p>
          We are an independent company. GLM is a model family developed by Zhipu AI; Qwen is developed by
          Alibaba Group. We are not affiliated with, endorsed by, or sponsored by either, and we do not
          claim to serve the vendors&apos; own hosted models — we serve those model weights through our own
          routing and capacity infrastructure at the prices published on our plans page.
        </p>
      </Section>

      <Section heading="2. Your account">
        <p>
          You register with GitHub (or email where offered) and are responsible for everything done with
          your API keys. Keys are shown once and stored only as an irreversible cryptographic hash — we
          cannot recover a lost key, and we will never ask you to paste one into support chat. Revoke any
          key you suspect has leaked from your dashboard immediately.
        </p>
        <p>Do not sell, resell, or share keys. Do not use the service to provide a public API proxy to others.</p>
      </Section>

      <Section heading="3. Acceptable use">
        <p>You agree not to use the endpoints to:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>generate unlawful content, malware, exploitation material, or content targeting minors;</li>
          <li>mass-produce phishing, spam, or fraudulent impersonation;</li>
          <li>attempt to circumvent quota, cohort, billing, or rate limits, including by account farming;</li>
          <li>probe, scan, or attack the service, or attempt to extract other tenants&apos; prompts or outputs;</li>
          <li>violate the licensing terms attached to the underlying model weights.</li>
        </ul>
        <p>
          We may suspend or terminate accounts that breach this section, including where we receive a
          credible legal notice about content generated through your keys.
        </p>
      </Section>

      <Section heading="4. Plans, quotas, and billing">
        <p>
          Subscription plans are billed monthly and renew automatically until cancelled. Cancel any time
          before the renewal date — access continues to the end of the paid period. Quotas apply per
          calendar month (frontier tokens) and as a rolling five-hour window (theta requests); both are
          visible live in your dashboard and in response headers.
        </p>
        <p>
          Where we disclose regional pricing, you are charged the price displayed at checkout for the
          currency of that checkout. Displayed &quot;equivalent API cost&quot; figures are illustrative
          estimates of what an uncached direct-API purchase would have cost. They are a comparison, not an
          invoice, and we may update list rates with notice.
        </p>
        <p>
          If we terminate your plan for a breach, refunds are pro-rata only where the law requires them. If
          we terminate for convenience, we refund the unused period in full.
        </p>
      </Section>

      <Section heading="5. No warranty; availability">
        <p>
          The service is provided &quot;as is&quot;. Inference can fail, degrade, or return incorrect output;
          providers we depend on can fail too. We publish no uptime SLA at this stage and do not warrant
          fitness for a particular purpose. You are responsible for retries, fallbacks, and reviewing
          outputs before you ship them.
        </p>
        <p>
          To the maximum extent permitted by law, our aggregate liability for any claim is limited to the
          fees you paid us in the three months preceding the claim, and we exclude indirect, incidental, and
          consequential losses.
        </p>
      </Section>

      <Section heading="6. Your content; model training">
        <p>
          You keep all rights in the prompts and outputs you pass through the endpoints, to the extent you
          hold them. You are responsible for having the right to submit the material you send us.
        </p>
        <p>
          Where enabled by your account setting, we may retain and use API traffic — prompts, completions,
          and aggregate statistics — to improve our systems, including to train our own small models. This is
          opt-out at any time from your dashboard; toggling off stops further retention going forward. See
          the privacy policy for exactly what is stored and for how long.
        </p>
      </Section>

      <Section heading="7. Changes">
        <p>
          We may update these terms. Material changes are announced by email at least 14 days before they
          take effect; continuing to use the service after that date is acceptance. If you do not accept,
          stop using the service and cancel your plan; we will refund the unused period on request.
        </p>
      </Section>

      <Section heading="8. Law and disputes">
        <p>
          These terms are governed by the laws of India. Courts in Bengaluru, Karnataka have exclusive
          jurisdiction. Nothing here removes any non-waivable consumer right you hold in your own country.
        </p>
      </Section>
    </LegalPage>
  );
}