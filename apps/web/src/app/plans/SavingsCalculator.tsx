"use client";

import { useMemo, useState } from "react";
import {
  FRONTIER_DISPLAY,
  THETA_DISPLAY,
  PLANS,
  ROUTER,
} from "@bhaskara/shared/pricing";
import { rate, usd } from "@/lib/format";

/* All rates come from the single pricing config — no hardcoded numbers. */

function Slider({
  id,
  label,
  value,
  display,
  min,
  max,
  step,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  display: string;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-4">
        <label htmlFor={id} className="label text-ink-faint">
          {label}
        </label>
        <output htmlFor={id} className="num font-mono text-[0.875rem] text-ink">
          {display}
        </output>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="slider mt-3"
      />
    </div>
  );
}

function Figure({
  label,
  value,
  detail,
  tone = "plain",
}: {
  label: string;
  value: string;
  detail: string;
  tone?: "plain" | "signal";
}) {
  const signal = tone === "signal";
  return (
    <div
      className={`border-t-2 px-5 py-5 ${
        signal ? "border-accent bg-accent-soft" : "border-ink bg-panel"
      }`}
    >
      <p className={`label ${signal ? "text-accent-deep" : "text-ink-faint"}`}>
        {label}
      </p>
      <p
        className={`num mt-3 font-mono text-[1.75rem] font-medium leading-none ${
          signal ? "text-accent-deep" : "text-ink"
        }`}
      >
        {value}
      </p>
      <p className="mt-3 text-[0.75rem] leading-relaxed text-ink-mute">
        {detail}
      </p>
    </div>
  );
}

export default function SavingsCalculator() {
  const [glmRequests, setGlmRequests] = useState(600);
  const [contextK, setContextK] = useState(60);
  const [outputK, setOutputK] = useState(6);
  const [thetaRequests, setThetaRequests] = useState(6000);
  const [cacheHit, setCacheHit] = useState(ROUTER.cacheHitAssumption * 100);
  const [showSecondary, setShowSecondary] = useState(false);

  const plan = PLANS.pro;

  const calc = useMemo(() => {
    const reads = glmRequests * contextK * 1_000;
    const writes = glmRequests * outputK * 1_000;

    // Bought direct, at list, with no cache engineering at all.
    const directCost = (reads * FRONTIER_DISPLAY.input + writes * FRONTIER_DISPLAY.output) / 1e6;

    // The same workload with your own caching in front of it. This is the
    // honest comparison — nobody buying at these volumes pays full input rate.
    const cacheRate = FRONTIER_DISPLAY.cacheHit ?? FRONTIER_DISPLAY.input;
    const diyCached =
      ((reads * (cacheHit / 100) * cacheRate) +
        (reads * (1 - cacheHit / 100) * FRONTIER_DISPLAY.input) +
        writes * FRONTIER_DISPLAY.output) /
      1e6;

    // theta is metered per request in the plans. This is the display-rate value
    // of the same traffic, which is what the dashboard shows alongside it.
    const thetaDisplayValue =
      (thetaRequests * contextK * 1_000 * THETA_DISPLAY.input +
        thetaRequests * outputK * 1_000 * THETA_DISPLAY.output) /
      1e6;

    return { reads, writes, directCost, diyCached, thetaDisplayValue };
  }, [glmRequests, contextK, outputK, thetaRequests, cacheHit]);

  const monthlyUsd = plan.priceUsd;
  const savingsPct = Math.max(0, (1 - monthlyUsd / calc.directCost) * 100);
  const savedUsd = calc.directCost - monthlyUsd;
  const diySavingsPct = Math.max(0, (1 - monthlyUsd / calc.diyCached) * 100);

  // Whether the workload actually fits the plan's window. This is the honest
  // caveat: a plan is a rate, and a rate has a shape.
  const perDay = glmRequests / 30;
  const per5h = perDay * (5 / 24);
  const fitsWindow = per5h <= plan.glmPer5h;

  return (
    <div className="grid gap-px bg-rule lg:grid-cols-12">
      {/* ── Controls ─────────────────────────────────────────── */}
      <div className="min-w-0 bg-panel p-6 lg:col-span-5">
        <p className="label border-b border-rule pb-4 text-ink-faint">
          Your month
        </p>

        <div className="mt-6 space-y-7">
          <Slider
            id="calc-glm-requests"
            label="glm-5.3 requests"
            value={glmRequests}
            display={glmRequests.toLocaleString("en-US")}
            min={100}
            max={3000}
            step={50}
            onChange={setGlmRequests}
          />
          <Slider
            id="calc-theta-requests"
            label="theta requests"
            value={thetaRequests}
            display={thetaRequests.toLocaleString("en-US")}
            min={1000}
            max={40000}
            step={500}
            onChange={setThetaRequests}
          />
          <Slider
            id="calc-context"
            label="Context per request"
            value={contextK}
            display={`${contextK}K tok`}
            min={5}
            max={400}
            step={5}
            onChange={setContextK}
          />
          <Slider
            id="calc-output"
            label="Output per request"
            value={outputK}
            display={`${outputK}K tok`}
            min={1}
            max={60}
            step={1}
            onChange={setOutputK}
          />
        </div>

        <dl className="mt-7 space-y-2.5 border-t border-rule pt-5 font-mono text-[0.75rem]">
          {[
            ["input", `${(calc.reads / 1e6).toFixed(1)}M tok`],
            ["output", `${(calc.writes / 1e6).toFixed(1)}M tok`],
            ["glm / 5h", `${per5h.toFixed(1)} req`],
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between gap-4">
              <dt className="text-ink-faint">{k}</dt>
              <dd className="num text-ink-soft">{v}</dd>
            </div>
          ))}
        </dl>
      </div>

      {/* ── Result ───────────────────────────────────────────── */}
      <div className="min-w-0 bg-panel lg:col-span-7">
        <div className="grid sm:grid-cols-2">
          <Figure
            label="Bought direct, at list"
            value={usd(calc.directCost)}
            detail={`${glmRequests.toLocaleString("en-US")} glm-5.3 requests at list rates, no cache discount applied.`}
          />
          <Figure
            label="On the plan"
            value={`${usd(monthlyUsd)}/mo`}
            detail={`${plan.id} — ${plan.glmPer5h} glm-5.3 requests and ${(plan.glmTokensPer5h / 1e6).toFixed(0)}M tokens per 5-hour window, plus ${plan.thetaPer5h === null ? "unlimited" : plan.thetaPer5h} theta requests.`}
          />
        </div>

        <div className="grid border-t border-rule sm:grid-cols-2">
          <Figure
            tone="signal"
            label="Difference"
            value={`${savingsPct.toFixed(0)}%`}
            detail={`${usd(savedUsd)} a month, or ${usd(savedUsd * 12)} a year.`}
          />
          <div className="border-t-2 border-ink bg-panel px-5 py-5">
            <p className="label text-ink-faint">Does it fit?</p>
            <p className="mt-3 text-[0.75rem] leading-relaxed text-ink-mute">
              {fitsWindow ? (
                <>
                  This workload averages{" "}
                  <span className="num font-mono text-ink-soft">
                    {per5h.toFixed(1)}
                  </span>{" "}
                  glm requests per 5-hour window — inside the plan&rsquo;s{" "}
                  <span className="num font-mono text-ink-soft">
                    {plan.glmPer5h}
                  </span>
                  .
                </>
              ) : (
                <>
                  Spread evenly this fits, but a bursty month is a different
                  question: the cap is{" "}
                  <span className="num font-mono text-ink-soft">
                    {plan.glmPer5h}
                  </span>{" "}
                  requests per rolling 5 hours. If your work arrives in bursts,
                  size against the burst, not the average.
                </>
              )}
            </p>
          </div>
        </div>

        {/* ── Secondary: DIY cache economics ─────────────────── */}
        <div className="border-t border-rule p-5">
          <button
            type="button"
            onClick={() => setShowSecondary((v) => !v)}
            aria-expanded={showSecondary}
            aria-controls="calc-secondary"
            className="flex w-full items-center justify-between gap-4 text-left"
          >
            <span className="text-[0.875rem] font-medium text-ink">
              If you built the caching yourself
            </span>
            <span
              aria-hidden
              className={`font-mono text-[0.875rem] text-ink-faint transition-transform duration-200 ${
                showSecondary ? "rotate-45" : ""
              }`}
            >
              +
            </span>
          </button>

          {showSecondary && (
            <div id="calc-secondary" className="mt-5 space-y-6">
              <Slider
                id="calc-cache-hit"
                label="Your cache hit rate"
                value={cacheHit}
                display={`${cacheHit}%`}
                min={0}
                max={100}
                step={1}
                onChange={setCacheHit}
              />

              <div className="grid gap-px bg-rule sm:grid-cols-3">
                <div className="bg-sunken px-4 py-4">
                  <p className="label text-ink-faint">Your cost</p>
                  <p className="num mt-2 font-mono text-[1.0625rem] text-ink">
                    {usd(calc.diyCached)}
                  </p>
                </div>
                <div className="bg-sunken px-4 py-4">
                  <p className="label text-ink-faint">Against the plan</p>
                  <p className="num mt-2 font-mono text-[1.0625rem] text-ink">
                    {diySavingsPct.toFixed(0)}% saved
                  </p>
                </div>
                <div className="bg-sunken px-4 py-4">
                  <p className="label text-ink-faint">theta, valued</p>
                  <p className="num mt-2 font-mono text-[1.0625rem] text-ink">
                    {usd(calc.thetaDisplayValue)}
                  </p>
                </div>
              </div>

              <p className="text-[0.75rem] leading-relaxed text-ink-faint">
                theta is metered per request in the plans. The figure above is
                what the same traffic would be worth at theta&rsquo;s display
                rates (${rate(THETA_DISPLAY.input)}/M in, $
                {rate(THETA_DISPLAY.output)}/M out) — the number your dashboard
                shows beside your usage, not a charge. The default cache-hit
                assumption is {ROUTER.cacheHitAssumption * 100}%.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
