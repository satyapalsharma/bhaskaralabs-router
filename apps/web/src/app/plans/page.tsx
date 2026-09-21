import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { PLANS, THETA_DISPLAY, FRONTIER_DISPLAY, CONCURRENCY } from "@bhaskara/shared/pricing";
import { auth } from "@/lib/auth";
import Section from "@/components/Section";
import { rate } from "@/lib/format";
import SavingsCalculator from "./SavingsCalculator";
import CheckoutButton from "./CheckoutButton";

export const metadata: Metadata = {
  title: "Plans & pricing",
  description:
    "Two endpoints, counted in requests. Starter and Pro for theta and glm-5.3, with regional pricing for India and international and a public savings calculator.",
};

type PlanId = "starter" | "pro";

/** One row of the comparison. Values are read from the pricing config, so a
 *  plan change here is a config change, never a copy edit that drifts. */
const ROWS: {
  label: string;
  hint?: string;
  value: (id: PlanId) => string;
  strong?: boolean;
}[] = [
  {
    label: "theta requests",
    hint: "rolling 5-hour window",
    value: (id) => {
      const v = PLANS[id].thetaPer5h;
      return v === null ? "Unlimited" : v.toLocaleString("en-US");
    },
    strong: true,
  },
  {
    label: "theta concurrency",
    hint: "requests in flight at once",
    value: (id) => (PLANS[id].thetaPer5h === null ? String(CONCURRENCY.unlimitedTier) : String(CONCURRENCY.extraTierMax)),
  },
  {
    label: "Extra theta pool",
    hint: "monthly, usable up to 5 concurrent",
    value: (id) => {
      const v = PLANS[id].thetaExtraMonthly;
      return v > 0 ? `${v.toLocaleString("en-US")} requests` : "—";
    },
  },
  {
    label: "glm-5.3 requests",
    hint: "rolling 5-hour window",
    value: (id) => PLANS[id].glmPer5h.toLocaleString("en-US"),
    strong: true,
  },
  {
    label: "glm-5.3 token budget",
    hint: "rolling 5-hour window, across all calls",
    value: (id) => `${(PLANS[id].glmTokensPer5h / 1e6).toFixed(0)}M`,
  },
  {
    label: "Endpoints",
    hint: "both plans get both",
    value: () => "theta (ours) · glm-5.3",
  },
  {
    label: "Context window",
    value: () => "200K theta · 1M glm-5.3",
  },
  {
    label: "API compatibility",
    value: () => "OpenAI · Anthropic",
  },
  {
    label: "Quota headers on every response",
    value: () => "Included",
  },
  {
    label: "Savings calculator & ledger",
    value: () => "Included",
  },
];

const ORDER: PlanId[] = ["starter", "pro"];
const CTA: Record<PlanId, string> = {
  starter: "Choose Starter",
  pro: "Choose Pro",
};

export default async function PlansPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  const signedIn = !!session?.user;

  return (
    <main className="mx-auto max-w-6xl px-5 sm:px-6">
      {/* ── Header ────────────────────────────────────────────── */}
      <section className="pb-14 pt-14 sm:pt-20">
        <p className="label text-accent-deep">Plans</p>
        <h1 className="display mt-6 max-w-3xl">
          Counted in requests, not in tokens you cannot see.
        </h1>
        <p className="lede measure mt-6">
          Two endpoints, one bill. <strong>theta</strong> is our own model,
          built for volume — long agent loops, mechanical edits, tool chatter.{" "}
          <strong>glm-5.3</strong> is built for the turns that decide the shape
          of the work, on a million-token context. Both are counted in requests
          you can predict, with a live window in your dashboard.
        </p>
        <p className="measure mt-4 text-[0.875rem] leading-relaxed text-ink-soft">
          Regional pricing is deliberate: India is billed in rupees through
          Razorpay, everywhere else in dollars through Stripe.
        </p>
      </section>

      {/* ── Comparison matrix ─────────────────────────────────── */}
      <section aria-labelledby="compare" className="pb-6">
        <h2 id="compare" className="sr-only">
          Plan comparison
        </h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[40rem] border-collapse text-left">
            <caption className="sr-only">
              Allowance comparison across the Starter and Pro plans.
            </caption>
            <thead>
              <tr className="border-b border-ink align-bottom">
                <th
                  scope="col"
                  className="label w-[32%] pb-4 pr-6 font-medium text-ink-faint"
                >
                  Allowance
                </th>
                {ORDER.map((id) => {
                  const p = PLANS[id];
                  const featured = id === "pro";
                  return (
                    <th
                      key={id}
                      scope="col"
                      className={`w-[34%] px-5 pb-5 align-bottom ${
                        featured ? "border-t-2 border-accent bg-accent-soft" : "border-t-2 border-ink"
                      }`}
                    >
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="font-serif text-[1.125rem] font-semibold capitalize text-ink">
                          {id}
                        </span>
                        {id === "pro" && (
                          <span className="tag tag-accent">Unlimited theta</span>
                        )}
                      </span>
                      <span className="num mt-2 block font-mono text-[1.375rem] font-medium text-ink">
                        ${p.priceUsd}
                        <span className="text-[0.8125rem] font-normal text-ink-mute">
                          /month
                        </span>
                      </span>
                      <span className="num mt-1 block font-mono text-[0.6875rem] text-ink-mute">
                        or ₹{p.priceInr.toLocaleString("en-IN")} in India
                      </span>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {ROWS.map((row, i) => (
                <tr key={`${row.label}-${i}`} className="border-b border-rule last:border-b-0">
                  <th scope="row" className="py-4 pr-6 align-top font-normal">
                    <span className="text-[0.875rem] text-ink">{row.label}</span>
                    {row.hint && (
                      <span className="mt-1 block text-[0.75rem] leading-snug text-ink-faint">
                        {row.hint}
                      </span>
                    )}
                  </th>
                  {ORDER.map((id) => (
                    <td
                      key={id}
                      className={`px-5 py-4 align-top ${id === "pro" ? "bg-accent-soft" : ""}`}
                    >
                      <span
                        className={`font-mono ${
                          row.strong
                            ? "num text-[0.9375rem] font-medium text-ink"
                            : "text-[0.8125rem] text-ink-soft"
                        }`}
                      >
                        {row.value(id)}
                      </span>
                    </td>
                  ))}
                </tr>
              ))}

              {/* Actions */}
              <tr>
                <td />
                {ORDER.map((id) => (
                  <td
                    key={id}
                    className={`px-5 pb-6 pt-5 align-top ${id === "pro" ? "bg-accent-soft" : ""}`}
                  >
                    <CheckoutButton
                      plan={id}
                      signedIn={signedIn}
                      variant={id === "pro" ? "primary" : "outline"}
                    >
                      {CTA[id]}
                    </CheckoutButton>
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-[0.75rem] leading-relaxed text-ink-faint">
          Windows roll continuously rather than resetting on a clock, so a burst
          never lands on a boundary. Need to try before paying?{" "}
          <Link href={signedIn ? "/dashboard" : "/login?next=%2Fdashboard"} className="prose-link">
            A one-day trial
          </Link>{" "}
          includes both endpoints at reduced allowance.
        </p>
      </section>

      {/* ── Calculator ────────────────────────────────────────── */}
      <Section
        index="01"
        eyebrow="Savings calculator"
        id="calculator"
        title="Hold the workload still and change only the plan."
        note="public · no sign-in"
        className="mt-20"
      >
        <SavingsCalculator />
      </Section>

      {/* ── Transparency ──────────────────────────────────────── */}
      <Section
        index="02"
        eyebrow="How we sustain these prices"
        id="transparency"
        title="Three engineering choices, all disclosed."
        className="mt-20"
      >
        <div className="grid gap-x-10 gap-y-8 md:grid-cols-3">
          {[
            {
              t: "Prompt-cache engineering",
              b: "Stable prefixes so cache reads stay high. This is the single biggest lever on what a request costs us, and caching only works if the prefix is stable — which is also why a session stays on one lane instead of being re-routed every turn.",
            },
            {
              t: "Context management",
              b: "Your history stays lean without you editing it. Compression happens after metering, so it never reduces the tokens you are charged for.",
            },
            {
              t: "Skill routing",
              b: "Within glm-5.3, a capability-and-cost objective decides whether a turn needs the full model or the flash tier. The full tier is capped at a quarter of your glm calls, so it stays available for the turns that actually need it. You always learn which tier answered.",
            },
          ].map((x) => (
            <div key={x.t} className="border-t border-rule pt-5">
              <h3 className="text-[0.9375rem] font-medium text-ink">{x.t}</h3>
              <p className="mt-3 text-[0.875rem] leading-relaxed text-ink-soft">
                {x.b}
              </p>
            </div>
          ))}
        </div>

        <div className="mt-10 border-t border-rule pt-6">
          <h3 className="text-[0.9375rem] font-medium text-ink">
            Training on your traffic
          </h3>
          <p className="measure mt-3 text-[0.875rem] leading-relaxed text-ink-soft">
            We may use API traffic to train our own models. One toggle in your
            dashboard stops it, and the very next request is not stored. The
            honest limit of that opt-out is stated in the{" "}
            <Link href="/legal/training" className="prose-link">
              training disclosure
            </Link>
            .
          </p>
        </div>
      </Section>

      {/* ── Rates ─────────────────────────────────────────────── */}
      <Section
        index="03"
        eyebrow="Reference rates"
        note="used for valuation only"
        className="mt-20"
      >
        <div className="grid gap-10 lg:grid-cols-12">
          <div className="min-w-0 lg:col-span-7">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[28rem] border-collapse text-left">
                <thead>
                  <tr className="border-b border-ink">
                    <th scope="col" className="label pb-3 pr-6 font-medium text-ink-faint">
                      Model
                    </th>
                    <th scope="col" className="label pb-3 pr-6 text-right font-medium text-ink-faint">
                      Input / M
                    </th>
                    <th scope="col" className="label pb-3 pr-6 text-right font-medium text-ink-faint">
                      Cache read / M
                    </th>
                    <th scope="col" className="label pb-3 text-right font-medium text-ink-faint">
                      Output / M
                    </th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-b border-rule">
                    <th scope="row" className="py-4 pr-6 font-normal">
                      <code className="font-mono text-[0.875rem] font-medium text-accent-deep">
                        theta
                      </code>
                    </th>
                    <td className="num py-4 pr-6 text-right font-mono text-[0.8125rem] text-ink-soft">
                      ${rate(THETA_DISPLAY.input)}
                    </td>
                    <td className="num py-4 pr-6 text-right font-mono text-[0.8125rem] text-ink-soft">
                      ${rate(THETA_DISPLAY.cacheHit!)}
                    </td>
                    <td className="num py-4 text-right font-mono text-[0.8125rem] text-ink-soft">
                      ${rate(THETA_DISPLAY.output)}
                    </td>
                  </tr>
                  <tr className="border-b border-rule">
                    <th scope="row" className="py-4 pr-6 font-normal">
                      <code className="font-mono text-[0.875rem] font-medium text-accent-deep">
                        glm-5.3
                      </code>
                    </th>
                    <td className="num py-4 pr-6 text-right font-mono text-[0.8125rem] text-ink-soft">
                      ${rate(FRONTIER_DISPLAY.input)}
                    </td>
                    <td className="num py-4 pr-6 text-right font-mono text-[0.8125rem] text-ink-soft">
                      ${rate(FRONTIER_DISPLAY.cacheHit!)}
                    </td>
                    <td className="num py-4 text-right font-mono text-[0.8125rem] text-ink-soft">
                      ${rate(FRONTIER_DISPLAY.output)}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
          <div className="min-w-0 lg:col-span-5">
            <p className="text-[0.875rem] leading-relaxed text-ink-soft">
              In the plans, both endpoints are metered per request. These
              per-token rates are glm-5.3&rsquo;s list prices, shown so the
              calculator can compute a like-for-like figure against going
              direct — and so the dashboard can put a value on what you used.
            </p>
            <p className="mt-4 text-[0.875rem] leading-relaxed text-ink-soft">
              A glm-5.3 request also counts against a token budget for its
              window. That is the one place tokens still matter here: a single
              call can carry a million-token context, so a request count alone
              would not bound what it costs to serve you.
            </p>
          </div>
        </div>
      </Section>
    </main>
  );
}
