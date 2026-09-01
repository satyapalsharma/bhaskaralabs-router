import { LegalPage, Section } from "../legal";

export const metadata = { title: "Privacy Policy — Bhaskara Labs" };

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy" effective="1 September 2026">
      <Section heading="Who we are; what this covers">
        <p>
          Bhaskara Labs (&quot;we&quot;, &quot;us&quot;) operates inference API endpoints for coding agents.
          This policy covers personal data we process when you use bhaskaralabs.com or call our API. We act
          as data controller for account data and as processor for the prompts you send through the API.
        </p>
        <p>
          For users in the European Economic Area we apply GDPR standards as our baseline. For users in
          India we honour the Digital Personal Data Protection Act, 2023 (DPDP Act) — including consent,
          purpose limitation, and your rights listed below. Where the two differ, we apply the stricter one.
        </p>
      </Section>

      <Section heading="Data we collect">
        <p>
          <strong className="text-zinc-200">Account data:</strong> your name, email address, and avatar from
          GitHub (or the email you sign up with), hashed passwords where relevant, plan and billing history,
          and cohort/gate status.
        </p>
        <p>
          <strong className="text-zinc-200">Usage metadata:</strong> per-request records — model endpoint,
          routing tier, token counts, cached/reasoning token counts, latency, time-to-first-token, and
          computed costs. This is what powers your dashboard quota cards and our margin accounting.
        </p>
        <p>
          <strong className="text-zinc-200">Prompt and completion content:</strong> only when your account
          has training use enabled (see section below). Your dashboard switch controls this, and it takes
          effect on your very next request.
        </p>
      </Section>

      <Section heading="Prompt content retention — the short version">
        <p>
          With <strong className="text-zinc-200">training use ON</strong>: prompts and completions are
          retained to improve our systems and to train our models, for up to 30 months, in our
          India-hosted database, encrypted at rest.
        </p>
        <p>
          With <strong className="text-zinc-200">training use OFF</strong>: your request content is passed
          through to the upstream inference provider for the duration of the call and is{" "}
          <strong className="text-zinc-200">not written to our store</strong>. We retain only the usage
          metadata (token counts, timings) needed to bill and operate the service. Upstream providers we
          contract with are required to be zero-data-retention for pass-through traffic.
        </p>
      </Section>

      <Section heading="Why we process it (lawful bases)">
        <ul className="list-disc space-y-1 pl-5">
          <li>performance of your contract with us (serving the API, billing, quotas);</li>
          <li>your consent, which you control — training use, and marketing email if you opt in;</li>
          <li>legitimate interests, limited to abuse prevention, fraud detection, and service security;</li>
          <li>legal obligation (tax records, lawful requests).</li>
        </ul>
      </Section>

      <Section heading="Who we share it with">
        <p>
          Inference capacity providers receive the full request payload necessary to answer it (prompts,
          completions, model choice) — this is unavoidable: they compute the answer. Payment processors
          receive billing identity. We do not sell personal data, and we do not allow any partner to use
          your content to train their own models unless your training use is on and you have been told the
          partner is such a recipient before signup completion.
        </p>
      </Section>

      <Section heading="Your rights">
        <p>
          Access, correction, erasure, portability, and the right to withdraw consent (including
          permanently deleting retained prompts under your account) — email privacy@bhaskaralabs.com; we
          respond within 30 days. Under the DPDP Act you may also nominate a person to exercise these
          rights in the event of death or incapacity. You can withdraw consent anytime without affecting
          processing done before that date.
        </p>
        <p>
          Indian users may escalate unresolved complaints to the Data Protection Board of India under the
          DPDP Act; EEA users may complain to their supervisory authority.
        </p>
      </Section>

      <Section heading="Security and retention">
        <p>
          API keys are stored as one-way hashes; sessions rotate; the admin surface is role-gated and
          access-logged. Account data is kept while your plan is active and for 7 years after termination
          for tax/legal compliance. Aggregate usage statistics are retained indefinitely in de-identified
          form. We notify affected users within 72 hours of confirming a personal-data breach, and to the
          Board where required.
        </p>
      </Section>

      <Section heading="Children; jurisdiction notes">
        <p>
          The service is not directed at children under 18. We do not knowingly collect their data. This
          policy may change; material changes are emailed before taking effect. Governing law for any
          dispute: India (Bengaluru), except where your local consumer law gives you a stronger forum.
        </p>
      </Section>
    </LegalPage>
  );
}