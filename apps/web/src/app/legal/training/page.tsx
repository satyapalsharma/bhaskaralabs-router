import Link from "next/link";
import { LegalPage, Section } from "../legal";

export const metadata = { title: "Training data disclosure" };

export default function TrainingPage() {
  return (
    <LegalPage
      title="Training data disclosure"
      effective="1 September 2026"
      lede="What we store, what we train on, and the exact limits of switching it off."
    >
      <Section heading="Plain answer">
        <p>
          Yes, unless you opt out. Prompts and completions sent through our
          endpoints <em>may</em> be used to train our own models. Opting out takes
          effect on your next request and stops all future content retention for
          your account.
        </p>
        <p>
          The switch is{" "}
          <Link href="/dashboard" className="prose-link">
            in your dashboard
          </Link>
          . It is disclosed on the plans page and in the signup terms before your
          first key is issued, and flipping it has no effect on service quality or
          price.
        </p>
      </Section>

      <Section heading="Why we ask">
        <p>
          The end state is domain-specific small models that answer coding
          questions well enough, cheaply and privately enough, that customers with
          sensitive data never have to ship their prompts to a frontier lab. The
          scarce input for that is honest, well-routed, real-world coding traffic,
          which our users generate.
        </p>
        <p>
          We would rather fund that with your voluntary consent than by selling the
          service short behind fabricated research claims.
        </p>
      </Section>

      <Section heading="What is included if you opt in">
        <ul className="list-disc space-y-2 pl-5">
          <li>
            prompt and completion text of your API requests, including tool-call
            payloads;
          </li>
          <li>
            routing metadata — which tier answered — plus timing and cache
            statistics;
          </li>
          <li>
            you are <strong className="font-medium text-ink">not</strong>{" "}
            identified in any model output by name, account, or by code you have
            submitted, and we do not publish datasets containing your content.
          </li>
        </ul>
      </Section>

      <Section heading="What opting out actually changes">
        <ul className="list-disc space-y-2 pl-5">
          <li>
            your request content stops being stored by us; billing metadata
            continues, because it is needed to run the service;
          </li>
          <li>
            content already used in a training run cannot be un-learned. Deleting
            the source material from our stores does not retroactively remove
            gradients from trained weights. This is the honest limit of an opt-out
            and we state it plainly;
          </li>
          <li>deleting your account erases retained content within 30 days.</li>
        </ul>
      </Section>

      <Section heading="Cohort-level statistics we publish">
        <p>
          Each cohort report discloses the consent rate within the cohort, the
          share of traffic used for training, and the upstream retention terms we
          rely on. No per-user rows are ever published.
        </p>
      </Section>
    </LegalPage>
  );
}
