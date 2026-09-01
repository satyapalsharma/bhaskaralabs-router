import SavingsCalculator from "./SavingsCalculator";
import CheckoutButton from "./CheckoutButton";
import { PLANS, THETA_DISPLAY } from "@bhaskara/shared/pricing";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";

const PLAN_ORDER: Array<"free" | "basic" | "advanced"> = ["free", "basic", "advanced"];

const fmtInr = (n: number) => `₹${n.toLocaleString("en-IN")}`;

export default async function PlansPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  return (
    <main className="mx-auto max-w-6xl px-6">
      <section className="py-16 text-center">
        <h1 className="text-4xl font-bold tracking-tight">Coding plans</h1>
        <p className="mt-4 text-zinc-400 max-w-2xl mx-auto">
          Frontier tokens and theta requests, every month. Prices shown for India —
          international checkout in USD. Cancel anytime.
        </p>
      </section>

      {/* Plan cards */}
      <section className="grid md:grid-cols-3 gap-6">
        {PLAN_ORDER.map((id) => {
          const p = PLANS[id];
          const highlight = id === "basic";
          return (
            <div
              key={id}
              className={`rounded-xl border p-6 flex flex-col ${
                highlight ? "border-amber-500 bg-amber-500/5" : "border-zinc-800"
              }`}
            >
              <h2 className="text-xl font-semibold capitalize">{p.id}</h2>
              {id === "free" ? (
                <div className="mt-2 text-3xl font-bold">₹0</div>
              ) : (
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-3xl font-bold">{fmtInr(p.priceInr)}</span>
                  <span className="text-sm text-zinc-500">/mo · ${p.priceUsd} intl</span>
                </div>
              )}
              <ul className="mt-6 space-y-2 text-sm text-zinc-300 flex-1">
                {id === "free" ? (
                  <>
                    <li>1-day trial</li>
                    <li>1M frontier input tokens</li>
                    <li>100 theta requests</li>
                  </>
                ) : (
                  <>
                    <li>{p.frontierInputM}M frontier input / mo</li>
                    <li>{p.frontierOutputM}M frontier output / mo</li>
                    <li>
                      {p.thetaPer5h} theta requests / 5h
                      <span className="text-zinc-500"> (up to ~{Math.round(p.thetaMonthly / 1000)}k / mo)</span>
                    </li>
                    <li>GLM-5.3, Qwen-3.8 & theta endpoints</li>
                    <li>OpenAI + Anthropic compatible</li>
                  </>
                )}
              </ul>
              {id === "free" ? (
                <a
                  href={session?.user ? "/dashboard" : "/login?next=%2Fdashboard"}
                  className="mt-6 inline-block w-full rounded-md border border-zinc-700 px-4 py-2.5 text-center font-medium hover:border-zinc-500 transition-colors"
                >
                  Start free trial
                </a>
              ) : (
                <CheckoutButton plan={id} signedIn={!!session?.user} highlight={highlight}>
                  {`Get ${p.id}`}
                </CheckoutButton>
              )}
            </div>
          );
        })}
      </section>

      {/* Transparency block */}
      <section className="mt-16 rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
        <h2 className="text-lg font-semibold">How we sustain these prices</h2>
        <p className="mt-3 text-sm text-zinc-400 leading-relaxed">
          Three engineering choices, all disclosed: <strong className="text-zinc-200">prompt-cache
          engineering</strong> (stable prefixes so cache hits stay high),
          <strong className="text-zinc-200"> context management</strong> (your history stays
          lean), and <strong className="text-zinc-200">smart routing</strong> (heavy reasoning gets
          the full model; execution runs on the Flash tier). No hidden model
          substitution — you always know which endpoint you called.
        </p>
        <p className="mt-3 text-sm text-zinc-400 leading-relaxed">
          We may use API traffic to train our own models (our theta research).
          You can opt out at any time from your dashboard — one toggle, no email
          required.
        </p>
      </section>

      {/* Calculator */}
      <section className="mt-12 pb-8">
        <SavingsCalculator />
      </section>

      {/* theta rate table */}
      <section className="mt-8 pb-16">
        <h2 className="text-lg font-semibold mb-4">theta — metered display rates</h2>
        <div className="overflow-x-auto rounded-lg border border-zinc-800">
          <table className="w-full text-sm">
            <thead className="bg-zinc-900 text-zinc-400">
              <tr>
                <th className="px-4 py-3 text-left font-medium">Model</th>
                <th className="px-4 py-3 text-right font-medium">Input / M tokens</th>
                <th className="px-4 py-3 text-right font-medium">Cache hit / M</th>
                <th className="px-4 py-3 text-right font-medium">Output / M</th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-t border-zinc-800">
                <td className="px-4 py-3"><code className="text-amber-500">theta</code></td>
                <td className="px-4 py-3 text-right">${THETA_DISPLAY.input}</td>
                <td className="px-4 py-3 text-right">${THETA_DISPLAY.cacheHit}</td>
                <td className="px-4 py-3 text-right">${THETA_DISPLAY.output}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-zinc-500">
          theta is request-metered in plans (see cards above). These display rates
          power the equivalent-cost view in your dashboard and the calculator.
        </p>
      </section>
    </main>
  );
}