import { LegalPage, Section } from "../legal";

export const metadata = { title: "Training data disclosure — Bhaskara Labs" };

export default function TrainingPage() {
  return (
    <LegalPage title="Training data disclosure" effective="1 September 2026">
      <Section heading="Plain answer">
        <p>
          Yes — unless you opt out. Prompts and completions sent through our endpoints <em>may</em> be
          used to train our own models. Opting out takes effect on your next request and stops all future
          content retention for your account.
        </p>
        <p>
          <a href="/dashboard" className="text-amber-400 hover:text-amber-300 underline">Open dashboard →</a>{" "}
          &quot;Train on my traffic&quot; switch. Usage is disclosed on our plans page and in the signup
          terms before your first key is issued; you can flip it anytime without any effect on service
          quality or price.
        </p>
      </Section>

      <Section heading="Why we ask">
        <p>
          Our end-state — stated on the home page — is domain-specific small models that answer coding
          questions well enough, cheaply and privately enough that customers with sensitive data never have
          to ship their prompts to frontier labs. The scarce input for that is honest, well-routed,
          real-world coding traffic — which our users generate. We would rather fund that with your
          voluntary consent than by selling the service short with fabricated research claims.
        </p>
      </Section>

      <Section heading="What is included if you opt in">
        <ul className="list-disc space-y-1 pl-5">
          <li>prompt and completion text of your API requests (including tool-call payloads);</li>
          <li>routing metadata (which model tier answered), timing, and cache statistics;</li>
          <li>you are <strong className="text-zinc-200">not</strong> identified in any model output by
            name, account, or code you submit; we do not publish datasets containing your content.</li>
        </ul>
      </Section>

      <Section heading="What opt-out actually changes">
        <ul className="list-disc space-y-1 pl-5">
          <li>your request content stops being stored by us (metadata for billing continues — it is needed
            to run the service);</li>
          <li>content already used in a model training run cannot be un-learned — deleting the source
            material from our stores does not retroactively remove gradients from trained weights. This is
            the honest limit of opt-out, and we state it the same way regulators are starting to require;</li>
          <li>deleting your account erases your retained content within 30 days.</li>
        </ul>
      </Section>

      <Section heading="Cohort-level stats we publish">
        <p>
          Each cohort report discloses: consent rate in cohort, share of traffic used for training, and
          upstream retention terms we rely on. No per-user rows are ever published.
        </p>
      </Section>
    </LegalPage>
  );
}