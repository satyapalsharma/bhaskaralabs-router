"use client";
// Plan entitlements: per-plan, per-model, per-window caps.
// e.g. an enterprise tier → glm-5.3: 400 requests / 5h.
// Plan slugs must match subscriptions.plan. Windows: 5h / 24h / 168h.

import { useCallback, useEffect, useState } from "react";

interface LimitRow {
  id: string;
  plan: string;
  endpointModel: string;
  windowHours: number;
  maxRequests: number | null;
  maxTokens: number | null;
  maxCostUsd: string | null;
  active: boolean;
}
interface PlanUsage {
  plan: string;
  users: number;
}

const WINDOWS = [1, 5, 24, 168] as const;
const MODELS = ["glm-5.3", "theta"] as const;

function windowLabel(h: number): string {
  return h === 1 ? "1h" : h === 5 ? "5h" : h === 24 ? "daily" : h === 168 ? "weekly" : `${h}h`;
}

export default function PlansPanel() {
  const [limits, setLimits] = useState<LimitRow[]>([]);
  const [plansInUse, setPlansInUse] = useState<PlanUsage[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [f, setF] = useState({
    plan: "",
    endpointModel: "glm-5.3",
    windowHours: 5,
    maxRequests: "",
    maxTokens: "",
    maxCostUsd: "",
  });

  const load = useCallback(async () => {
    const r = await fetch("/api/admin/plans");
    const d = await r.json();
    setLimits(d.limits ?? []);
    setPlansInUse(d.plansInUse ?? []);
  }, []);
  useEffect(() => {
    const run = async () => {
      await load();
    };
    void run();
  }, [load]);

  const call = async (url: string, method: string, body?: unknown) => {
    setBusy(true);
    try {
      const r = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
      });
      const d = await r.json().catch(() => ({}));
      setMsg(r.ok ? "Saved." : (d.error ?? `Request failed (${r.status}).`));
      await load();
      return r.ok;
    } finally {
      setBusy(false);
    }
  };

  const plans = [
    ...new Set([...plansInUse.map((p) => p.plan), ...limits.map((l) => l.plan)]),
  ].sort();

  return (
    <div className="space-y-12">
      {msg && (
        <p role="status" className="font-mono text-[0.75rem] text-accent-deep">
          {msg}
        </p>
      )}

      {/* ── Existing caps ─────────────────────────────────────── */}
      <section>
        <div className="flex flex-wrap items-baseline justify-between gap-4 border-t-2 border-ink pt-5">
          <h2 className="subhead">Plan caps</h2>
          <p className="font-mono text-[0.6875rem] text-ink-faint">
            {plansInUse.length > 0
              ? plansInUse.map((p) => `${p.plan}: ${p.users}`).join(" · ")
              : "no subscriptions yet"}
          </p>
        </div>

        {plans.length === 0 ? (
          <p className="mt-5 text-[0.875rem] text-ink-mute">
            No plan limits yet. Add the first cap below.
          </p>
        ) : (
          <div className="mt-6 space-y-8">
            {plans.map((plan) => {
              const rows = limits.filter((l) => l.plan === plan);
              return (
                <div key={plan}>
                  <h3 className="font-mono text-[0.8125rem] font-medium text-ink">
                    {plan}
                  </h3>
                  {rows.length === 0 ? (
                    <p className="mt-3 border-t border-rule-faint pt-3 text-[0.8125rem] text-ink-mute">
                      No caps on this plan — every endpoint is unlimited. Add one
                      below to start metering it.
                    </p>
                  ) : (
                    <div className="mt-3 overflow-x-auto">
                      <table className="w-full min-w-[38rem] border-collapse text-left">
                        <thead>
                          <tr className="border-b border-ink">
                            <th scope="col" className="label pb-2.5 pr-4 font-medium text-ink-faint">Model</th>
                            <th scope="col" className="label pb-2.5 pr-4 font-medium text-ink-faint">Window</th>
                            <th scope="col" className="label pb-2.5 pr-4 text-right font-medium text-ink-faint">Max req</th>
                            <th scope="col" className="label pb-2.5 pr-4 text-right font-medium text-ink-faint">Max tokens</th>
                            <th scope="col" className="label pb-2.5 pr-4 text-right font-medium text-ink-faint">Max $</th>
                            <th scope="col" className="label pb-2.5 pr-4 font-medium text-ink-faint">State</th>
                            <th scope="col" className="label pb-2.5 text-right font-medium text-ink-faint">{""}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {rows.map((l) => (
                            <tr key={l.id} className="border-b border-rule-faint">
                              <th scope="row" className="whitespace-nowrap py-2.5 pr-4 text-left font-mono text-[0.75rem] font-normal text-ink">
                                {l.endpointModel}
                              </th>
                              <td className="py-2.5 pr-4 font-mono text-[0.75rem] text-ink-soft">
                                {windowLabel(l.windowHours)}
                              </td>
                              <td className="num py-2.5 pr-4 text-right font-mono text-[0.75rem] text-ink-soft">
                                {l.maxRequests ?? "—"}
                              </td>
                              <td className="num py-2.5 pr-4 text-right font-mono text-[0.75rem] text-ink-soft">
                                {l.maxTokens ?? "—"}
                              </td>
                              <td className="num py-2.5 pr-4 text-right font-mono text-[0.75rem] text-ink-soft">
                                {l.maxCostUsd ?? "—"}
                              </td>
                              <td className="py-2.5 pr-4">
                                {l.active ? (
                                  <span className="tag tag-ok">
                                    <span className="dot" />
                                    On
                                  </span>
                                ) : (
                                  <span className="tag">Off</span>
                                )}
                              </td>
                              <td className="py-2.5 text-right">
                                <span className="flex justify-end gap-2">
                                  <button
                                    type="button"
                                    className="btn btn-outline btn-sm"
                                    disabled={busy}
                                    onClick={() =>
                                      call(
                                        `/api/admin/plans?type=limit&id=${l.id}`,
                                        "PATCH",
                                        { active: !l.active },
                                      )
                                    }
                                  >
                                    {l.active ? "Disable" : "Enable"}
                                  </button>
                                  <button
                                    type="button"
                                    disabled={busy}
                                    className="font-mono text-[0.6875rem] text-ink-mute transition-colors hover:text-danger disabled:opacity-50"
                                    onClick={() =>
                                      confirm(
                                        `Delete ${plan} / ${l.endpointModel} / ${windowLabel(l.windowHours)} cap?`,
                                      ) &&
                                      call(
                                        `/api/admin/plans?type=limit&id=${l.id}`,
                                        "DELETE",
                                      )
                                    }
                                  >
                                    delete
                                  </button>
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ── Add a cap ─────────────────────────────────────────── */}
      <section>
        <div className="flex flex-wrap items-baseline justify-between gap-4 border-t-2 border-ink pt-5">
          <h2 className="subhead">Add a cap</h2>
          <p className="font-mono text-[0.6875rem] text-ink-faint">
            at least one of requests / tokens / cost
          </p>
        </div>

        <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <label htmlFor="cap-plan" className="label text-ink-faint">
              Plan slug
            </label>
            <input
              id="cap-plan"
              className="field mt-3 font-mono"
              placeholder="bigpro"
              list="plan-names"
              value={f.plan}
              onChange={(e) => setF({ ...f, plan: e.target.value })}
            />
            <datalist id="plan-names">
              {plans.map((p) => (
                <option key={p} value={p} />
              ))}
            </datalist>
          </div>
          <div>
            <label htmlFor="cap-model" className="label text-ink-faint">
              Model
            </label>
            <select
              id="cap-model"
              className="field field-select mt-3 font-mono"
              value={f.endpointModel}
              onChange={(e) => setF({ ...f, endpointModel: e.target.value })}
            >
              {MODELS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="cap-window" className="label text-ink-faint">
              Window
            </label>
            <select
              id="cap-window"
              className="field field-select mt-3 font-mono"
              value={f.windowHours}
              onChange={(e) => setF({ ...f, windowHours: Number(e.target.value) })}
            >
              {WINDOWS.map((w) => (
                <option key={w} value={w}>
                  {windowLabel(w)}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="cap-req" className="label text-ink-faint">
              Max requests
            </label>
            <input
              id="cap-req"
              className="field num mt-3 font-mono"
              type="number"
              min={0}
              placeholder="unlimited"
              value={f.maxRequests}
              onChange={(e) => setF({ ...f, maxRequests: e.target.value })}
            />
          </div>
          <div>
            <label htmlFor="cap-tok" className="label text-ink-faint">
              Max tokens
            </label>
            <input
              id="cap-tok"
              className="field num mt-3 font-mono"
              type="number"
              min={0}
              placeholder="unlimited"
              value={f.maxTokens}
              onChange={(e) => setF({ ...f, maxTokens: e.target.value })}
            />
          </div>
          <div>
            <label htmlFor="cap-usd" className="label text-ink-faint">
              Max cost, USD
            </label>
            <input
              id="cap-usd"
              className="field num mt-3 font-mono"
              placeholder="unlimited"
              value={f.maxCostUsd}
              onChange={(e) => setF({ ...f, maxCostUsd: e.target.value })}
            />
          </div>
        </div>

        <button
          type="button"
          className="btn btn-primary mt-6"
          disabled={busy || !f.plan || !f.endpointModel}
          onClick={async () => {
            const ok = await call("/api/admin/plans?type=limit", "POST", {
              plan: f.plan,
              endpointModel: f.endpointModel,
              windowHours: f.windowHours,
              maxRequests: f.maxRequests === "" ? undefined : Number(f.maxRequests),
              maxTokens: f.maxTokens === "" ? undefined : Number(f.maxTokens),
              maxCostUsd: f.maxCostUsd === "" ? undefined : f.maxCostUsd,
            });
            if (ok) setF({ ...f, maxRequests: "", maxTokens: "", maxCostUsd: "" });
          }}
        >
          Add cap
        </button>
      </section>
    </div>
  );
}
