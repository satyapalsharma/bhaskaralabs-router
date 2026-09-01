"use client";

import { useMemo, useState } from "react";
import { FRONTIER_DISPLAY, THETA_DISPLAY, PLANS, ROUTER } from "@bhaskara/shared/pricing";

// All rates come from the single pricing config — no hardcoded numbers in UI.

const fmtUsd = (n: number) =>
  n >= 100 ? `$${n.toFixed(0)}` : n >= 1 ? `$${n.toFixed(2)}` : `$${n.toFixed(4)}`;

const fmtM = (tokensM: number) => `${tokensM >= 1 ? tokensM.toFixed(0) : tokensM.toFixed(1)}M`;

export default function SavingsCalculator() {
  const [model, setModel] = useState<"glm-5.3" | "qwen-3.8">("glm-5.3");
  const [tokensM, setTokensM] = useState(25);
  const [inputShare, setInputShare] = useState(80); // % of tokens that are input
  const [cacheHit, setCacheHit] = useState(80); // slider, secondary view only
  const [showSecondary, setShowSecondary] = useState(false);

  const plan = tokensM <= 25 ? PLANS.basic : PLANS.advanced;

  const calc = useMemo(() => {
    const inM = (tokensM * inputShare) / 100;
    const outM = tokensM - inM;
    const rate = FRONTIER_DISPLAY[model];

    // Headline: FULL direct-API cost at list rates, no cache discounts —
    // what you'd pay buying direct with zero engineering.
    const directCost = inM * rate.input + outM * rate.output;

    // Secondary view: what DIY caching would cost (same rates, cache-hit share at list cache price)
    const cacheRate = rate.cacheHit ?? rate.input;
    const diyCached = inM * (cacheHit / 100) * cacheRate + inM * (1 - cacheHit / 100) * rate.input + outM * rate.output;

    // theta metered at display rates
    const thetaCost = inM * THETA_DISPLAY.input + outM * THETA_DISPLAY.output;

    return { inM, outM, directCost, diyCached, thetaCost };
  }, [model, tokensM, inputShare, cacheHit]);

  const savingsPct = Math.max(0, (1 - plan.priceUsd / calc.directCost) * 100);

  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
      <h3 className="text-lg font-semibold">What would this cost at direct API rates?</h3>
      <p className="text-sm text-zinc-400 mt-1">
        Compare our plan price against buying the same tokens directly — at list rates, no caching tricks.
      </p>

      {/* Controls */}
      <div className="mt-6 grid sm:grid-cols-3 gap-6">
        <label className="text-sm">
          <span className="text-zinc-400">Model</span>
          <select
            value={model}
            onChange={(e) => setModel(e.target.value as "glm-5.3" | "qwen-3.8")}
            className="mt-1 w-full rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2"
          >
            <option value="glm-5.3">GLM-5.3</option>
            <option value="qwen-3.8">Qwen-3.8</option>
          </select>
        </label>
        <label className="text-sm">
          <span className="text-zinc-400">Monthly tokens: <strong className="text-zinc-100">{fmtM(tokensM)}</strong></span>
          <input
            type="range" min={1} max={100} value={tokensM}
            onChange={(e) => setTokensM(Number(e.target.value))}
            className="mt-3 w-full accent-amber-500"
          />
        </label>
        <label className="text-sm">
          <span className="text-zinc-400">Input share: <strong className="text-zinc-100">{inputShare}%</strong></span>
          <input
            type="range" min={30} max={95} value={inputShare}
            onChange={(e) => setInputShare(Number(e.target.value))}
            className="mt-3 w-full accent-amber-500"
          />
        </label>
      </div>

      {/* Headline comparison */}
      <div className="mt-8 grid sm:grid-cols-3 gap-4">
        <div className="rounded-lg border border-zinc-800 p-4">
          <div className="text-xs text-zinc-500 uppercase tracking-wide">Direct API (list rates)</div>
          <div className="mt-1 text-2xl font-semibold text-zinc-100">{fmtUsd(calc.directCost)}</div>
          <div className="text-xs text-zinc-500 mt-1">{fmtM(calc.inM)} in + {fmtM(calc.outM)} out, {model}</div>
        </div>
        <div className="rounded-lg border border-zinc-800 p-4">
          <div className="text-xs text-zinc-500 uppercase tracking-wide">Bhaskara plan</div>
          <div className="mt-1 text-2xl font-semibold text-zinc-100">${plan.priceUsd}/mo</div>
          <div className="text-xs text-zinc-500 mt-1">{plan.id} plan</div>
        </div>
        <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-4">
          <div className="text-xs text-amber-500 uppercase tracking-wide">You save</div>
          <div className="mt-1 text-2xl font-semibold text-amber-400">{savingsPct.toFixed(0)}%</div>
          <div className="text-xs text-zinc-500 mt-1">{fmtUsd(calc.directCost - plan.priceUsd)} every month</div>
        </div>
      </div>

      {/* Secondary view */}
      <button
        onClick={() => setShowSecondary(!showSecondary)}
        className="mt-6 text-sm text-zinc-400 hover:text-zinc-200 transition-colors"
      >
        {showSecondary ? "− Hide" : "+ Show"} what it&apos;d cost with your own caching
      </button>
      {showSecondary && (
        <div className="mt-4 rounded-lg border border-zinc-800 p-4 text-sm">
          <label className="block">
            <span className="text-zinc-400">Your cache hit rate: <strong className="text-zinc-100">{cacheHit}%</strong></span>
            <input
              type="range" min={0} max={100} value={cacheHit}
              onChange={(e) => setCacheHit(Number(e.target.value))}
              className="mt-2 w-full accent-amber-500"
            />
          </label>
          <div className="mt-4 grid sm:grid-cols-2 gap-4">
            <div>
              <div className="text-xs text-zinc-500 uppercase tracking-wide">Direct API with your caching</div>
              <div className="mt-1 text-xl font-semibold">{fmtUsd(calc.diyCached)}</div>
              <p className="text-xs text-zinc-500 mt-1">
                Still more than the plan — and you&apos;re doing the cache engineering yourself.
              </p>
            </div>
            <div>
              <div className="text-xs text-zinc-500 uppercase tracking-wide">theta metered equivalent</div>
              <div className="mt-1 text-xl font-semibold">{fmtUsd(calc.thetaCost)}</div>
              <p className="text-xs text-zinc-500 mt-1">
                Same volume on theta at display rates (${THETA_DISPLAY.input}/M in, ${THETA_DISPLAY.output}/M out).
              </p>
            </div>
          </div>
          <p className="mt-4 text-xs text-zinc-600">
            Defaults use an {ROUTER.cacheHitAssumption * 100}% cache-hit assumption; adjust to your workload.
          </p>
        </div>
      )}
    </div>
  );
}