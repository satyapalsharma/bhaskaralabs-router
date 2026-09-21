import { FRONTIER_DISPLAY, ROUTER } from "@bhaskara/shared/pricing";
import { rate, usd } from "@/lib/format";

/**
 * One priced line in the receipt. Declared at module scope so React keeps
 * its identity across renders.
 */
function Line({
  label,
  detail,
  value,
  strong = false,
}: {
  label: string;
  detail: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="machine-row flex items-baseline gap-4 px-5 py-2.5">
      <span
        className={`w-16 shrink-0 font-mono text-[0.6875rem] uppercase tracking-[0.1em] ${
          strong ? "text-m-accent" : "text-machine-mute"
        }`}
      >
        {label}
      </span>
      <span className="min-w-0 flex-1 truncate font-mono text-[0.75rem] text-machine-mute">
        {detail}
      </span>
      <span
        className={`num shrink-0 font-mono text-[0.8125rem] ${
          strong ? "text-machine-ink" : "text-machine-soft"
        }`}
      >
        {value}
      </span>
    </div>
  );
}

/**
 * The proof object: one recorded turn, priced line by line at the same
 * list rates a direct customer would pay. Every number is computed from
 * the published rate card, so a reader can check the arithmetic rather
 * than trust it.
 *
 * The only thing that differs between the two totals is whether the
 * prefix was byte-stable, which is the whole product claim.
 */
export default function RoutingReceipt() {
  const card = FRONTIER_DISPLAY;

  const cached = 10_854;
  const fresh = 1_626;
  const output = 842;
  const prefix = cached + fresh;

  const cachedCost = (cached * card.cacheHit!) / 1e6;
  const freshCost = (fresh * card.input) / 1e6;
  const outputCost = (output * card.output) / 1e6;
  const total = cachedCost + freshCost + outputCost;

  // The same turn with a cold prefix: the whole prompt bills at the
  // uncached input rate.
  const cold = (prefix * card.input) / 1e6 + outputCost;
  const savedPct = (1 - total / cold) * 100;

  return (
    <figure className="m-0">
      <div className="machine settle overflow-hidden">
        {/* Readout header */}
        <div className="flex items-center justify-between gap-4 border-b border-machine-rule px-5 py-3">
          <span className="label text-machine-mute">Sample request</span>
          <span className="flex items-center gap-2 font-mono text-[0.6875rem] text-machine-soft">
            <span className="dot text-m-ok" />
            glm-5.3 · 200 · 6.8s
          </span>
        </div>

        {/* Routing decision */}
        <dl className="px-5 py-3.5 font-mono text-[0.75rem]">
          {[
            ["endpoint", "glm-5.3 (family)"],
            ["tier", "full"],
            ["escalated on", "failing-test signal"],
            ["prefix", `${prefix.toLocaleString("en-US")} tok · 87% cached`],
          ].map(([k, v]) => (
            <div key={k} className="flex gap-4 py-[3px]">
              <dt className="w-24 shrink-0 text-machine-mute">{k}</dt>
              <dd className="text-machine-ink">{v}</dd>
            </div>
          ))}
        </dl>

        {/* Price, line by line */}
        <div className="border-t border-machine-rule">
          <Line
            label="cached"
            detail={`${cached.toLocaleString("en-US")} × $${rate(card.cacheHit!)}/M`}
            value={usd(cachedCost)}
          />
          <Line
            label="fresh"
            detail={`${fresh.toLocaleString("en-US")} × $${rate(card.input)}/M`}
            value={usd(freshCost)}
          />
          <Line
            label="output"
            detail={`${output.toLocaleString("en-US")} × $${rate(card.output)}/M`}
            value={usd(outputCost)}
          />
        </div>

        <div className="border-t border-machine-rule px-5 py-3">
          <div className="flex items-baseline justify-between gap-4">
            <span className="font-mono text-[0.75rem] text-machine-soft">
              this turn
            </span>
            <span className="num font-mono text-[1.0625rem] font-medium text-machine-ink">
              {usd(total)}
            </span>
          </div>
          <div className="mt-2 flex items-baseline justify-between gap-4">
            <span className="font-mono text-[0.6875rem] text-machine-mute">
              same turn, prefix not cacheable
            </span>
            <span className="num font-mono text-[0.8125rem] text-machine-mute line-through decoration-machine-rule-strong">
              {usd(cold)}
            </span>
          </div>
        </div>

        <div className="flex items-center justify-between gap-4 border-t border-machine-rule bg-machine-2 px-5 py-3">
          <span className="font-mono text-[0.6875rem] text-machine-mute">
            saved by cache-stable prefixes
          </span>
          <span className="num font-mono text-[0.9375rem] font-medium text-m-ok">
            {savedPct.toFixed(0)}%
          </span>
        </div>

        <div className="machine-row flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 px-5 py-3">
          <span className="font-mono text-[0.6875rem] text-machine-mute">
            full-model share this week
          </span>
          <span className="num font-mono text-[0.75rem] text-machine-soft">
            {(ROUTER.fullModelShareAlertAt * 100).toFixed(0)}% alert ·{" "}
            {(ROUTER.fullModelShareCap * 100).toFixed(0)}% cap
          </span>
        </div>
      </div>

      <figcaption className="mt-3 text-[0.75rem] leading-relaxed text-ink-faint">
        A recorded turn from the routing ledger. Rates are the published
        list prices for GLM-5.3; the same fields are logged for every request
        you make and appear in your dashboard.
      </figcaption>
    </figure>
  );
}
