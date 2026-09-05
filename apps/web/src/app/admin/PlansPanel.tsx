"use client";
// Plan entitlements: per-plan, per-model, per-window caps.
// E.g. bigpro → qwen-3.8: 100 requests / 5h; theta: 500 requests / 5h.
// Plan slugs must match subscriptions.plan. Windows: 5h / 24h / 168h.

import { useCallback, useEffect, useState } from "react";

interface LimitRow { id: string; plan: string; endpointModel: string; windowHours: number; maxRequests: number | null; maxTokens: number | null; maxCostUsd: string | null; active: boolean }
interface PlanUsage { plan: string; users: number }

const WINDOWS = [1, 5, 24, 168] as const;
const MODELS = ["glm-5.3", "qwen-3.8", "theta"] as const;

function windowLabel(h: number): string {
  return h === 1 ? "1h" : h === 5 ? "5h" : h === 24 ? "daily" : h === 168 ? "weekly" : `${h}h`;
}

export default function PlansPanel() {
  const [limits, setLimits] = useState<LimitRow[]>([]);
  const [plansInUse, setPlansInUse] = useState<PlanUsage[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [f, setF] = useState({ plan: "", endpointModel: "qwen-3.8", windowHours: 5, maxRequests: "", maxTokens: "", maxCostUsd: "" });

  const load = useCallback(async () => {
    const r = await fetch("/api/admin/plans");
    const d = await r.json();
    setLimits(d.limits ?? []);
    setPlansInUse(d.plansInUse ?? []);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const call = async (url: string, method: string, body?: unknown) => {
    setBusy(true);
    try {
      const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
      const d = await r.json().catch(() => ({}));
      setMsg(r.ok ? "✓ done" : `✗ ${d.error ?? r.status}`);
      await load();
      return r.ok;
    } finally {
      setBusy(false);
    }
  };

  const plans = [...new Set([...plansInUse.map((p) => p.plan), ...limits.map((l) => l.plan)])].sort();
  const input = "w-full rounded border px-2 py-1 text-xs bg-white text-black";
  const btn = "rounded bg-blue-600 px-2 py-1 text-xs text-white disabled:opacity-50";
  const sbtn = "rounded border px-1 text-[10px] disabled:opacity-50";

  return (
    <div className="space-y-6">
      {msg && <div className="text-xs text-blue-700">{msg}</div>}

      <section className="rounded border p-3">
        <h3 className="mb-2 text-sm font-bold">Plans <span className="font-normal text-neutral-400">— slugs must match subscriptions.plan ({plansInUse.length ? plansInUse.map((p) => `${p.plan} (${p.users} users)`).join(", ") : "no subscriptions yet"})</span></h3>
        {plans.length === 0 && <div className="py-2 text-xs text-neutral-400">no plan limits yet — add the first row below</div>}
        {plans.map((plan) => (
          <div key={plan} className="mb-3 rounded border bg-neutral-50 p-2">
            <div className="mb-1 font-mono text-xs font-bold">{plan}</div>
            <table className="w-full text-xs">
              <thead className="text-left text-neutral-500"><tr><th>model</th><th>window</th><th>max req</th><th>max tokens</th><th>max $</th><th>on</th><th /></tr></thead>
              <tbody>
                {limits.filter((l) => l.plan === plan).map((l) => (
                  <tr key={l.id} className="border-t">
                    <td className="font-mono">{l.endpointModel}</td>
                    <td>{windowLabel(l.windowHours)}</td>
                    <td>{l.maxRequests ?? "—"}</td>
                    <td>{l.maxTokens ?? "—"}</td>
                    <td>{l.maxCostUsd ?? "—"}</td>
                    <td>{l.active ? "✅" : "⬜"}</td>
                    <td className="space-x-1">
                      <button className={sbtn} disabled={busy} onClick={() => call(`/api/admin/plans?type=limit&id=${l.id}`, "PATCH", { active: !l.active })}>{l.active ? "off" : "on"}</button>
                      <button className={`${sbtn} text-red-600`} disabled={busy} onClick={() => confirm(`Delete ${plan} / ${l.endpointModel} / ${windowLabel(l.windowHours)} cap?`) && call(`/api/admin/plans?type=limit&id=${l.id}`, "DELETE")}>del</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </section>

      <section className="rounded border p-3">
        <h3 className="mb-2 text-sm font-bold">Add cap <span className="font-normal text-neutral-400">— e.g. bigpro + qwen-3.8 + 5h + 100 req; bigpro + theta + 5h + 500 req</span></h3>
        <div className="grid grid-cols-6 gap-1">
          <input className={input} placeholder="plan (e.g. bigpro)" list="plan-names" value={f.plan} onChange={(e) => setF({ ...f, plan: e.target.value })} />
          <datalist id="plan-names">{plans.map((p) => <option key={p} value={p} />)}</datalist>
          <select className={input} value={f.endpointModel} onChange={(e) => setF({ ...f, endpointModel: e.target.value })}>
            {MODELS.map((m) => <option key={m} value={m}>{m}</option>)}
          </select>
          <select className={input} value={f.windowHours} onChange={(e) => setF({ ...f, windowHours: Number(e.target.value) })}>
            {WINDOWS.map((w) => <option key={w} value={w}>{windowLabel(w)}</option>)}
          </select>
          <input className={input} type="number" min={0} placeholder="max requests" value={f.maxRequests} onChange={(e) => setF({ ...f, maxRequests: e.target.value })} />
          <input className={input} type="number" min={0} placeholder="max tokens" value={f.maxTokens} onChange={(e) => setF({ ...f, maxTokens: e.target.value })} />
          <input className={input} placeholder="max $ (optional)" value={f.maxCostUsd} onChange={(e) => setF({ ...f, maxCostUsd: e.target.value })} />
        </div>
        <div className="mt-1">
          <button className={btn} disabled={busy || !f.plan || !f.endpointModel} onClick={async () => {
            const ok = await call("/api/admin/plans?type=limit", "POST", {
              plan: f.plan, endpointModel: f.endpointModel, windowHours: f.windowHours,
              maxRequests: f.maxRequests === "" ? undefined : Number(f.maxRequests),
              maxTokens: f.maxTokens === "" ? undefined : Number(f.maxTokens),
              maxCostUsd: f.maxCostUsd === "" ? undefined : f.maxCostUsd,
            });
            if (ok) setF({ ...f, maxRequests: "", maxTokens: "", maxCostUsd: "" });
          }}>+ add cap</button>
          <span className="ml-2 text-[10px] text-neutral-400">at least one of requests / tokens / $ required; empty = unlimited</span>
        </div>
      </section>
    </div>
  );
}
