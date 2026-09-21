import Link from "next/link";
import { FRONTIER_DISPLAY, PLANS } from "@bhaskara/shared/pricing";
import Section from "@/components/Section";
import RoutingReceipt from "@/components/RoutingReceipt";
import { rate, usd } from "@/lib/format";

/* The comparison holds the workload constant and varies the plan, so
   the saving is a property of the plan, not of a chosen quota. */
const REF = { inputM: 20, outputM: 5 };

function directCost() {
  return REF.inputM * FRONTIER_DISPLAY.input + REF.outputM * FRONTIER_DISPLAY.output;
}

const ENDPOINTS = [
  {
    name: "glm-5.3",
    family: "GLM-5.3 family",
    context: "1M",
    metered: "requests + tokens",
    note: "Full or Flash chosen per turn by a capability-and-cost objective, then held for the session. The full model is capped at a quarter of your glm calls.",
  },
  {
    name: "theta",
    family: "Our own model",
    context: "200K",
    metered: "requests",
    note: "Built and served by us — the inference stack, the routing between its backends and the tuning are ours. Metered per request, so the price never moves with the prompt.",
  },
];

const DECISIONS = [
  {
    n: "01",
    title: "Prefix discipline",
    body: "Cache hits are computed on the request prefix, so system prompt, tool definitions and long-lived context stay byte-stable. Most of a working session's prompt is then billed at cache rates. A single edit mid-context re-bills everything after it, which is why we do not make them.",
    fact: "cache read ≈ 19% of the input rate",
  },
  {
    n: "02",
    title: "Tier choice",
    body: "Within glm-5.3 a capability-and-cost objective decides whether a turn needs the full model or the flash tier, and the decision sticks for the session — flipping tiers mid-session wipes the provider cache and re-bills the whole prefix at the new tier's rates.",
    fact: "one decision per session",
  },
  {
    n: "03",
    title: "Escalation, priced",
    body: "A flash-locked session that hits a failing test can upgrade once to the full model, and only while the cache-wipe penalty stays under budget and your trailing full-model share has headroom. Every response carries the fair-use state in its headers.",
    fact: "25% cap on full-model turns",
  },
];

const PILLARS = [
  {
    title: "Inference platform",
    body: "OpenAI- and Anthropic-compatible endpoints. Point Claude Code, Codex, openCode, Crush or any SDK at a base URL and a key. No adapter, no wrapper library, no migration.",
    href: "/docs",
    link: "Read the docs",
  },
  {
    title: "Academics",
    body: "A free, interactive series on how LLMs actually work, from tokenization to KV-cache economics, written for students rather than buyers. It is also how we explain our own engineering.",
    href: "/academics",
    link: "Start the series",
  },
  {
    title: "Research",
    body: "Building toward domain-specific small models for organisations that handle sensitive data, trained where the data lives. theta is the first version of that thesis running in production.",
    href: "/plans#transparency",
    link: "How we disclose",
  },
];

export default function Home() {
  return (
    <main className="mx-auto max-w-6xl px-5 sm:px-6">
      {/* ── First viewport ────────────────────────────────────── */}
      <section className="grid gap-12 pb-20 pt-14 sm:pt-20 lg:grid-cols-12 lg:gap-14">
        <div className="min-w-0 lg:col-span-7 lg:pt-6">
          <p className="label text-accent-deep">
            Inference platform · India
          </p>

          <h1 className="display mt-6">
            Solving for price per unit of intelligence.
          </h1>

          <p className="lede measure mt-6">
            Two endpoint names in front of frontier coding models. A router
            sends every turn to the cheapest lane that can carry it, a prefix
            discipline keeps your cache warm, and a ledger records what each
            request actually cost you. The routing is disclosed, not hidden.
          </p>

          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/plans" className="btn btn-primary">
              See the plans
            </Link>
            <Link href="/docs" className="btn btn-outline">
              Read the API docs
            </Link>
          </div>

          <dl className="mt-10 flex flex-wrap gap-x-10 gap-y-4 border-t border-rule pt-5">
            {[
              ["Compatible with", "OpenAI · Anthropic"],
              ["Context", "200K · 1M tokens"],
              ["Endpoint names", "2"],
              ["Cache read", "≈19% of input rate"],
            ].map(([k, v]) => (
              <div key={k}>
                <dt className="label text-ink-faint">{k}</dt>
                <dd className="mt-2 font-mono text-[0.8125rem] text-ink-soft">
                  {v}
                </dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="min-w-0 lg:col-span-5">
          <RoutingReceipt />
        </div>
      </section>

      {/* ── The mechanism ─────────────────────────────────────── */}
      <Section
        index="01"
        eyebrow="How a bill is decided"
        title="Three decisions are made before the model answers, and all three can be checked."
        note="recorded per request"
      >
        <ol className="grid gap-x-10 gap-y-10 md:grid-cols-3">
          {DECISIONS.map((d) => (
            <li key={d.n} className="border-t border-rule pt-5">
              <p className="label text-accent-deep">{d.n}</p>
              <h3 className="subhead mt-3">{d.title}</h3>
              <p className="mt-3 text-[0.9375rem] leading-relaxed text-ink-soft">
                {d.body}
              </p>
              <p className="mt-4 font-mono text-[0.6875rem] uppercase tracking-[0.08em] text-ink-faint">
                {d.fact}
              </p>
            </li>
          ))}
        </ol>
      </Section>

      {/* ── Endpoints ─────────────────────────────────────────── */}
      <Section
        index="02"
        eyebrow="Two names, one base URL"
        title="You address a family. You always know which tier answered."
        note="/v1/chat/completions · /v1/messages"
        className="mt-24"
        id="endpoints"
      >
        <div className="overflow-x-auto">
          <table className="w-full min-w-[42rem] border-collapse text-left">
            <thead>
              <tr className="border-b border-ink">
                {["Name", "What answers", "Context", "Metered as", "Disclosure"].map(
                  (h) => (
                    <th
                      key={h}
                      scope="col"
                      className="label pb-3 pr-6 font-medium text-ink-faint"
                    >
                      {h}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {ENDPOINTS.map((e) => (
                <tr key={e.name} className="border-b border-rule">
                  <th scope="row" className="py-4 pr-6 font-normal">
                    <code className="font-mono text-[0.875rem] font-medium text-accent-deep">
                      {e.name}
                    </code>
                  </th>
                  <td className="py-4 pr-6 text-[0.9375rem] text-ink">
                    {e.family}
                  </td>
                  <td className="num py-4 pr-6 font-mono text-[0.8125rem] text-ink-soft">
                    {e.context}
                  </td>
                  <td className="py-4 pr-6 font-mono text-[0.8125rem] text-ink-soft">
                    {e.metered}
                  </td>
                  <td className="py-4 text-[0.875rem] leading-relaxed text-ink-mute">
                    {e.note}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-4 text-[0.8125rem] leading-relaxed text-ink-faint">
          Flash variants exist upstream and are selected by the router. You
          address the family name — never a substituted family. If our own
          capacity runs out, a turn is served on an alternate model that clears
          a published quality bar, and the response says so.
        </p>
      </Section>

      {/* ── Cost ──────────────────────────────────────────────── */}
      <Section
        index="03"
        eyebrow="What it costs"
        title="A fixed workload, priced two ways."
        note={`${REF.inputM}M input · ${REF.outputM}M output / month`}
        className="mt-24"
      >
        <div className="grid gap-10 lg:grid-cols-12">
          <div className="min-w-0 overflow-x-auto lg:col-span-8">
            <table className="w-full min-w-[36rem] border-collapse text-left">
              <thead>
                <tr className="border-b border-ink">
                  <th scope="col" className="label pb-3 pr-6 font-medium text-ink-faint">
                    Model
                  </th>
                  <th scope="col" className="label pb-3 pr-6 text-right font-medium text-ink-faint">
                    Direct at list
                  </th>
                  <th scope="col" className="label pb-3 pr-6 text-right font-medium text-ink-faint">
                    Starter · ${PLANS.starter.priceUsd}
                  </th>
                  <th scope="col" className="label pb-3 text-right font-medium text-ink-faint">
                    Pro · ${PLANS.pro.priceUsd}
                  </th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-rule">
                  <th scope="row" className="py-5 pr-6 font-normal">
                    <code className="font-mono text-[0.875rem] font-medium text-accent-deep">
                      glm-5.3
                    </code>
                    <span className="mt-1 block font-mono text-[0.6875rem] text-ink-faint">
                      ${rate(FRONTIER_DISPLAY.input)}/M in · $
                      {rate(FRONTIER_DISPLAY.output)}/M out
                    </span>
                  </th>
                  <td className="num py-5 pr-6 text-right font-mono text-[0.9375rem] text-ink-soft line-through decoration-rule-strong decoration-1">
                    {usd(directCost())}
                  </td>
                  {(["starter", "pro"] as const).map((p) => {
                    const save = (1 - PLANS[p].priceUsd / directCost()) * 100;
                    return (
                      <td key={p} className="num py-5 pr-6 text-right last:pr-0">
                        <span className="font-mono text-[1.125rem] font-medium text-ink">
                          {save.toFixed(0)}%
                        </span>
                        <span className="mt-1 block font-mono text-[0.6875rem] text-ink-faint">
                          saved
                        </span>
                      </td>
                    );
                  })}
                </tr>
              </tbody>
            </table>
          </div>

          <div className="min-w-0 lg:col-span-4">
            <div className="panel p-5">
              <h3 className="label text-ink-faint">What the number assumes</h3>
              <ul className="mt-4 space-y-3 text-[0.8125rem] leading-relaxed text-ink-soft">
                <li className="flex gap-3">
                  <span className="mt-[0.45rem] h-px w-3 shrink-0 bg-rule-strong" />
                  Full list rates, no cache discount — the price a direct
                  customer pays with no engineering at all.
                </li>
                <li className="flex gap-3">
                  <span className="mt-[0.45rem] h-px w-3 shrink-0 bg-rule-strong" />
                  Same workload on both plans, so the percentage is a property
                  of the plan rather than a chosen quota.
                </li>
                <li className="flex gap-3">
                  <span className="mt-[0.45rem] h-px w-3 shrink-0 bg-rule-strong" />
                  Excludes theta requests, which are metered per request rather
                  than per token — and which Pro does not count at all.
                </li>
              </ul>
              <Link
                href="/plans#calculator"
                className="btn btn-outline btn-sm mt-5 w-full"
              >
                Run your own numbers
              </Link>
            </div>
          </div>
        </div>
      </Section>

      {/* ── What we are building ──────────────────────────────── */}
      <Section
        index="04"
        eyebrow="What we are building"
        title="A platform, a curriculum, and a research bet."
        className="mt-24"
      >
        <div className="grid gap-x-10 gap-y-10 md:grid-cols-3">
          {PILLARS.map((p) => (
            <div key={p.title} className="border-t border-rule pt-5">
              <h3 className="subhead">{p.title}</h3>
              <p className="mt-3 text-[0.9375rem] leading-relaxed text-ink-soft">
                {p.body}
              </p>
              <Link
                href={p.href}
                className="mt-4 inline-block text-[0.875rem] text-accent-deep underline decoration-rule-strong underline-offset-4 transition-colors hover:decoration-accent"
              >
                {p.link}
              </Link>
            </div>
          ))}
        </div>
      </Section>

      {/* ── Close ─────────────────────────────────────────────── */}
      <section className="mt-24 border-t border-ink pt-10 pb-4">
        <div className="grid gap-10 lg:grid-cols-12 lg:items-end">
          <div className="min-w-0 lg:col-span-7">
            <h2 className="claim">
              Point an agent at it and watch the ledger fill in.
            </h2>
            <p className="lede measure mt-4">
              A one-day trial carries {PLANS.trial.thetaPer5h} theta requests and{}
              {PLANS.trial.glmPer5h} glm-5.3 requests per window. No card required.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link href="/plans" className="btn btn-primary">
                Start free
              </Link>
              <Link href="/docs#quickstart" className="btn btn-outline">
                Quick start
              </Link>
            </div>
          </div>

          <div className="min-w-0 lg:col-span-5">
            <div className="machine overflow-hidden">
              <div className="border-b border-machine-rule px-5 py-2.5">
                <span className="label text-machine-mute">One env var</span>
              </div>
              <pre className="overflow-x-auto px-5 py-4 font-mono text-[0.75rem] leading-relaxed text-machine-soft">
                <code>{`ANTHROPIC_BASE_URL=https://api.bhaskaralabs.com
ANTHROPIC_AUTH_TOKEN=$BHASKARA_API_KEY
claude --model glm-5.3`}</code>
              </pre>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}
