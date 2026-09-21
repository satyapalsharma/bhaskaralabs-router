import Link from "next/link";
import { LegalPage, Section } from "../legal/legal";

export const metadata = { title: "FAQ" };

function Q({ q, children }: { q: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-rule-faint pt-5 first:border-t-0 first:pt-0">
      <h3 className="text-[0.9375rem] font-medium text-ink">{q}</h3>
      <div className="measure mt-2.5 space-y-3 text-[0.9375rem] leading-relaxed text-ink-soft">
        {children}
      </div>
    </div>
  );
}

function C({ children }: { children: React.ReactNode }) {
  return (
    <code className="whitespace-nowrap font-mono text-[0.8125rem] text-ink">
      {children}
    </code>
  );
}

export default function FaqPage() {
  return (
    <LegalPage
      title="FAQ"
      effective="1 September 2026"
      lede="How the endpoints behave, how the router makes decisions, and what the quota headers mean. Where an answer depends on a number, the number is stated."
    >
      <Section heading="Endpoints and models">
        <Q q="Which endpoints can I call?">
          <p>
            <C>POST /v1/chat/completions</C> (OpenAI-compatible) and{" "}
            <C>POST /v1/messages</C> (Anthropic-compatible). Authenticate with{" "}
            <C>Authorization: Bearer sk-bhaskara-…</C>; the Anthropic-style{" "}
            <C>x-api-key</C> also works on <C>/v1/messages</C>. Model names you
            can use: <C>glm-5.3</C> and <C>theta</C>. The flash variants exist
            upstream and are selected by the router, so you address the family
            name rather than a variant.
          </p>
        </Q>
        <Q q="What exactly is theta?">
          <p>
            theta is our own model. We build and serve it ourselves — the
            inference stack, the routing between its backends and the tuning are
            ours end to end. That is what lets us price it per request instead
            of per token: you stop counting tokens, and we carry the variance.
          </p>
          <p>
            Per request also means predictable. A long context, a short one, a
            burst of tool calls — the same cost, because you are not paying for
            a number you cannot see before you send it. For a chatty,
            context-heavy agent that is usually the cheaper bill, and it is
            always the easier one to budget.
          </p>
        </Q>
        <Q q="Do you swap models without telling me?">
          <p>
            No. A request naming <C>glm-5.3</C> is answered by the GLM-5.3 family.
            Which variant, full or flash, is a session-level routing decision, and
            every response states which tier answered. You always know the endpoint
            you called and the tier that served it.
          </p>
        </Q>
      </Section>

      <Section heading="Routing and caching">
        <Q q="What is the session-sticky model lock?">
          <p>
            Provider prompt caches are keyed to a stable request prefix and to a
            specific model. Flipping your session between a full model and its
            flash variant turn to turn would wipe the cache and re-bill your
            entire prefix at the new tier&apos;s rates. So the first request of a
            session is routed by task difficulty, and that choice then holds for
            the session, with a two-hour idle TTL.
          </p>
          <p>
            There is one priced exception. A genuinely hard turn — debugging,
            planning, architecture — inside a flash-locked session can trigger a
            single upgrade to the full model, and only when two conditions hold:
            the cache-wipe penalty (your prefix re-billed at full-model rates)
            stays under a strict budget, and your weekly full-model share has
            headroom. Fresh sessions get fresh decisions.
          </p>
        </Q>
        <Q q="How do I keep my own cache hits high?">
          <p>
            Put the stable material first: system prompt, tool definitions,
            long-lived context. Append only at the end, and never rewrite history
            or prune the middle. Any mid-context edit invalidates everything after
            it. Watch <C>x-ratelimit-remaining-*</C> and the cache column in your
            dashboard, which report the real hit rate rather than an estimate.
          </p>
        </Q>
        <Q q="Which headers tell me my quota state?">
          <p>
            Every successful response carries <C>x-quota-plan</C> and{" "}
            <C>x-quota-monthly-reset</C>. theta responses add{" "}
            <C>x-ratelimit-limit-requests</C> and{" "}
            <C>-remaining-requests</C>; frontier responses add{" "}
            <C>x-ratelimit-limit-tokens</C>, <C>-remaining-tokens</C> and{" "}
            <C>x-quota-output-tokens-remaining</C>. On a 429 you also get{" "}
            <C>Retry-After</C> in seconds. No pricing data appears in any header —
            costs live in the dashboard.
          </p>
        </Q>
      </Section>

      <Section heading="Quotas and plans">
        <Q q="Which limits apply, and when do they reset?">
          <p>
            Frontier endpoints count prompt and completion tokens separately
            against monthly caps that reset at 00:00 UTC on the first of the
            month. theta counts requests in a rolling five-hour window plus a
            monthly ceiling. Exceeding any of them returns a clean 429 with the
            reset time, never a silent degrade.
          </p>
        </Q>
        <Q q="What happens if quota runs out mid-session?">
          <p>
            You get a 429 with a link to the dashboard. The session&apos;s sticky
            lock stays as it was, so once the window resets you resume on the same
            model with the cache still warm.
          </p>
        </Q>
        <Q q="Why is signup sometimes closed?">
          <p>
            Cohorts are capped at 100. While a cohort review runs, new addresses
            go to the waitlist so that everyone inside a cohort keeps stable
            capacity. The gate closes automatically at the cap and is reopened by
            hand after the review.
          </p>
        </Q>
      </Section>

      <Section heading="Privacy and training">
        <Q q="Do you train on my prompts?">
          <p>
            Only while the &quot;Train on my traffic&quot; switch in your
            dashboard is on. Flip it off and the very next request stops being
            stored. The full mechanics, including the honest limit of an opt-out
            (gradients do not unlearn), are in the{" "}
            <Link href="/legal/training" className="prose-link">
              training disclosure
            </Link>
            .
          </p>
        </Q>
        <Q q="Where is my data?">
          <p>
            The primary store is hosted in India and encrypted at rest. Upstream
            inference providers see the live request only and are contractually
            zero-retention for pass-through traffic. Details in the{" "}
            <Link href="/legal/privacy" className="prose-link">
              privacy policy
            </Link>
            .
          </p>
        </Q>
      </Section>

      <Section heading="Billing">
        <Q q="Why compare against direct API rates?">
          <p>
            Because it is the only comparison that means anything: the same
            uncached prompt at the full list price of the frontier family, with no
            cache discounts applied. It is an estimate and labelled as one. The{" "}
            <Link href="/plans#calculator" className="prose-link">
              calculator
            </Link>{" "}
            is public, and the three engineering choices behind the price —
            cache engineering, context management, routing — are disclosed on the
            plans page.
          </p>
        </Q>
        <Q q="What is the refund policy?">
          <p>
            A full refund within 7 days of a first paid cycle, and pro-rata for
            downtime over 24 hours or billing errors. The{" "}
            <Link href="/legal/refunds" className="prose-link">
              refund policy
            </Link>{" "}
            has the detail.
          </p>
        </Q>
      </Section>

      <Section heading="Legal">
        <p>
          <Link href="/legal/terms" className="prose-link">
            Terms of Service
          </Link>{" "}
          ·{" "}
          <Link href="/legal/privacy" className="prose-link">
            Privacy Policy
          </Link>{" "}
          ·{" "}
          <Link href="/legal/training" className="prose-link">
            Training data disclosure
          </Link>{" "}
          ·{" "}
          <Link href="/legal/refunds" className="prose-link">
            Refund policy
          </Link>
        </p>
      </Section>
    </LegalPage>
  );
}
