"use client";
// Upstream fleet management: DB-registered providers, accounts (multi-account
// per provider), and models (public/private, tiers, pricing) — drives the
// gateway's generic dispatch lane. models.dev catalog import for fast setup.

import { useCallback, useEffect, useState } from "react";

interface Provider { id: string; name: string; baseUrl: string; protocol: string; authStyle: string; billing: string; active: boolean; notes: string | null }
interface Account { id: string; providerId: string; label: string; apiKey: string; disabled: boolean; cooldownUntil: string | null; weight: number; limits: string | null }
interface Model { id: string; providerId: string; modelId: string; alias: string | null; visibility: string; tier: string; contextWindow: number; maxOutput: number; inputUsdPerM: string; outputUsdPerM: string; reasoning: boolean; active: boolean }

const LIMIT_FIELDS = ["maxConcurrent", "per5hRequests", "per5hTokens", "perWeekRequests", "perWeekTokens", "dailyCostUsd"] as const;

export default function UpstreamFleet() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [models, setModels] = useState<Model[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  // forms
  const [np, setNp] = useState({ id: "", name: "", baseUrl: "", protocol: "openai", authStyle: "bearer", billing: "flat" });
  const [na, setNa] = useState<{ providerId: string; label: string; apiKey: string; weight: number; limits: Record<string, string> }>({ providerId: "", label: "", apiKey: "", weight: 1, limits: {} });
  const [nm, setNm] = useState({ providerId: "", modelId: "", alias: "", visibility: "public", tier: "flash", contextWindow: 128000, maxOutput: 32768, inputUsdPerM: "0", outputUsdPerM: "0", reasoning: false });
  const [importProvider, setImportProvider] = useState({ providerId: "", catalogId: "" });

  const load = useCallback(async () => {
    const r = await fetch("/api/admin/upstream");
    const d = await r.json();
    setProviders(d.providers ?? []);
    setAccounts(d.accounts ?? []);
    setModels(d.models ?? []);
  }, []);
  useEffect(() => { void load(); }, [load]);

  const call = async (url: string, method: string, body?: unknown) => {
    setBusy(true);
    try {
      const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
      const d = await r.json().catch(() => ({}));
      setMsg(r.ok ? "✓ done" : `✗ ${d.error ?? r.status}`);
      await load();
    } finally {
      setBusy(false);
    }
  };

  const input = "w-full rounded border px-2 py-1 text-xs bg-white text-black";
  const btn = "rounded bg-blue-600 px-2 py-1 text-xs text-white disabled:opacity-50";

  return (
    <div className="space-y-6">
      {msg && <div className="text-xs text-blue-700">{msg}</div>}

      {/* ── Providers ── */}
      <section className="rounded border p-3">
        <h3 className="mb-2 text-sm font-bold">Providers</h3>
        <table className="mb-3 w-full text-xs">
          <thead className="text-left text-neutral-500"><tr><th>id</th><th>name</th><th>base URL</th><th>proto</th><th>auth</th><th>billing</th><th>on</th><th /></tr></thead>
          <tbody>
            {providers.map((p) => (
              <tr key={p.id} className="border-t">
                <td className="font-mono">{p.id}</td><td>{p.name}</td>
                <td className="font-mono text-[10px]">{p.baseUrl}</td>
                <td>{p.protocol}</td><td>{p.authStyle}</td><td>{p.billing}</td>
                <td>{p.active ? "✅" : "⬜"}</td>
                <td className="space-x-1">
                  <button className="rounded border px-1" disabled={busy} onClick={() => call(`/api/admin/upstream?type=provider&id=${p.id}`, "PATCH", { active: !p.active })}>{p.active ? "disable" : "enable"}</button>
                  <button className="rounded border px-1 text-red-600" disabled={busy} onClick={() => confirm(`Delete provider ${p.id} + its accounts/models?`) && call(`/api/admin/upstream?type=provider&id=${p.id}`, "DELETE")}>del</button>
                </td>
              </tr>
            ))}
            {providers.length === 0 && <tr><td colSpan={8} className="py-2 text-neutral-400">none yet</td></tr>}
          </tbody>
        </table>
        <div className="grid grid-cols-6 gap-1">
          <input className={input} placeholder="id (slug)" value={np.id} onChange={(e) => setNp({ ...np, id: e.target.value })} />
          <input className={input} placeholder="name" value={np.name} onChange={(e) => setNp({ ...np, name: e.target.value })} />
          <input className={input} placeholder="https://api.x.com/v1" value={np.baseUrl} onChange={(e) => setNp({ ...np, baseUrl: e.target.value })} />
          <select className={input} value={np.protocol} onChange={(e) => setNp({ ...np, protocol: e.target.value })}><option value="openai">openai</option><option value="anthropic">anthropic</option></select>
          <select className={input} value={np.authStyle} onChange={(e) => setNp({ ...np, authStyle: e.target.value })}><option value="bearer">bearer</option><option value="x-api-key">x-api-key</option></select>
          <select className={input} value={np.billing} onChange={(e) => setNp({ ...np, billing: e.target.value })}><option value="flat">flat</option><option value="metered">metered</option><option value="credits">credits</option></select>
        </div>
        <button className={btn} disabled={busy || !np.id || !np.baseUrl} onClick={() => call("/api/admin/upstream?type=provider", "POST", np)}>+ add provider</button>
      </section>

      {/* ── Accounts (multi-account per provider) ── */}
      <section className="rounded border p-3">
        <h3 className="mb-2 text-sm font-bold">Accounts <span className="text-neutral-400">(multiple per provider — rotation + limits)</span></h3>
        <table className="mb-3 w-full text-xs">
          <thead className="text-left text-neutral-500"><tr><th>provider</th><th>label</th><th>key</th><th>weight</th><th>limits</th><th>cooldown</th><th>on</th><th /></tr></thead>
          <tbody>
            {accounts.map((a) => (
              <tr key={a.id} className="border-t">
                <td className="font-mono">{a.providerId}</td><td>{a.label}</td>
                <td className="font-mono text-[10px]">{a.apiKey}</td>
                <td>{a.weight}</td>
                <td className="font-mono text-[10px]">{a.limits ?? "—"}</td>
                <td>{a.cooldownUntil && new Date(a.cooldownUntil) > new Date() ? `🔥 ${new Date(a.cooldownUntil).toLocaleTimeString()}` : "—"}</td>
                <td>{a.disabled ? "⬜" : "✅"}</td>
                <td className="space-x-1">
                  <button className="rounded border px-1" disabled={busy} onClick={() => call(`/api/admin/upstream?type=account&id=${a.id}`, "PATCH", { cooldownUntil: null, disabled: !a.disabled })}>{a.disabled ? "enable" : "disable"}</button>
                  <button className="rounded border px-1 text-red-600" disabled={busy} onClick={() => confirm(`Delete account ${a.label}?`) && call(`/api/admin/upstream?type=account&id=${a.id}`, "DELETE")}>del</button>
                </td>
              </tr>
            ))}
            {accounts.length === 0 && <tr><td colSpan={8} className="py-2 text-neutral-400">none yet</td></tr>}
          </tbody>
        </table>
        <div className="grid grid-cols-4 gap-1">
          <select className={input} value={na.providerId} onChange={(e) => setNa({ ...na, providerId: e.target.value })}>
            <option value="">provider…</option>
            {providers.map((p) => <option key={p.id} value={p.id}>{p.id}</option>)}
          </select>
          <input className={input} placeholder="label (e.g. main)" value={na.label} onChange={(e) => setNa({ ...na, label: e.target.value })} />
          <input className={input} placeholder="API key" value={na.apiKey} onChange={(e) => setNa({ ...na, apiKey: e.target.value })} />
          <input className={input} type="number" min={1} title="weight" value={na.weight} onChange={(e) => setNa({ ...na, weight: Number(e.target.value) })} />
        </div>
        <div className="mt-1 grid grid-cols-6 gap-1">
          {LIMIT_FIELDS.map((f) => (
            <input key={f} className={input} placeholder={f} value={na.limits[f] ?? ""} onChange={(e) => setNa({ ...na, limits: { ...na.limits, [f]: e.target.value } })} />
          ))}
        </div>
        <button className={btn} disabled={busy || !na.providerId || !na.apiKey} onClick={() => {
          const limits: Record<string, number> = {};
          for (const [k, v] of Object.entries(na.limits)) if (v !== "") limits[k] = Number(v);
          call("/api/admin/upstream?type=account", "POST", { ...na, limits: Object.keys(limits).length ? limits : undefined });
        }}>+ add account</button>
      </section>

      {/* ── Models ── */}
      <section className="rounded border p-3">
        <h3 className="mb-2 text-sm font-bold">Models <span className="text-neutral-400">(public = visible on /v1/models; private = hidden but routable)</span></h3>
        <table className="mb-3 w-full text-xs">
          <thead className="text-left text-neutral-500"><tr><th>provider</th><th>model</th><th>alias</th><th>vis</th><th>tier</th><th>ctx</th><th>$/M in/out</th><th>on</th><th /></tr></thead>
          <tbody>
            {models.map((m) => (
              <tr key={m.id} className="border-t">
                <td className="font-mono">{m.providerId}</td><td className="font-mono">{m.modelId}</td>
                <td>{m.alias ?? "—"}</td>
                <td><button className="rounded border px-1" disabled={busy} onClick={() => call(`/api/admin/upstream?type=model&id=${m.id}`, "PATCH", { visibility: m.visibility === "public" ? "private" : "public" })}>{m.visibility === "public" ? "🌐" : "🔒"}</button></td>
                <td><select className="rounded border px-1" value={m.tier} disabled={busy} onChange={(e) => call(`/api/admin/upstream?type=model&id=${m.id}`, "PATCH", { tier: e.target.value })}>
                  <option value="full">full</option><option value="flash">flash</option><option value="cheap">cheap</option>
                </select></td>
                <td>{(m.contextWindow / 1000) | 0}K</td>
                <td>{m.inputUsdPerM}/{m.outputUsdPerM}</td>
                <td>{m.active ? "✅" : "⬜"}</td>
                <td className="space-x-1">
                  <button className="rounded border px-1" disabled={busy} onClick={() => call(`/api/admin/upstream?type=model&id=${m.id}`, "PATCH", { active: !m.active })}>{m.active ? "off" : "on"}</button>
                  <button className="rounded border px-1 text-red-600" disabled={busy} onClick={() => confirm(`Delete model ${m.modelId}?`) && call(`/api/admin/upstream?type=model&id=${m.id}`, "DELETE")}>del</button>
                </td>
              </tr>
            ))}
            {models.length === 0 && <tr><td colSpan={9} className="py-2 text-neutral-400">none yet</td></tr>}
          </tbody>
        </table>
        <div className="grid grid-cols-5 gap-1">
          <select className={input} value={nm.providerId} onChange={(e) => setNm({ ...nm, providerId: e.target.value })}>
            <option value="">provider…</option>
            {providers.map((p) => <option key={p.id} value={p.id}>{p.id}</option>)}
          </select>
          <input className={input} placeholder="model id (upstream)" value={nm.modelId} onChange={(e) => setNm({ ...nm, modelId: e.target.value })} />
          <input className={input} placeholder="alias (public name)" value={nm.alias} onChange={(e) => setNm({ ...nm, alias: e.target.value })} />
          <select className={input} value={nm.visibility} onChange={(e) => setNm({ ...nm, visibility: e.target.value })}><option value="public">public</option><option value="private">private</option></select>
          <select className={input} value={nm.tier} onChange={(e) => setNm({ ...nm, tier: e.target.value })}><option value="flash">flash</option><option value="full">full</option><option value="cheap">cheap</option></select>
        </div>
        <div className="mt-1 grid grid-cols-5 gap-1">
          <input className={input} type="number" placeholder="context" value={nm.contextWindow} onChange={(e) => setNm({ ...nm, contextWindow: Number(e.target.value) })} />
          <input className={input} type="number" placeholder="max output" value={nm.maxOutput} onChange={(e) => setNm({ ...nm, maxOutput: Number(e.target.value) })} />
          <input className={input} placeholder="$ in /M" value={nm.inputUsdPerM} onChange={(e) => setNm({ ...nm, inputUsdPerM: e.target.value })} />
          <input className={input} placeholder="$ out /M" value={nm.outputUsdPerM} onChange={(e) => setNm({ ...nm, outputUsdPerM: e.target.value })} />
          <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={nm.reasoning} onChange={(e) => setNm({ ...nm, reasoning: e.target.checked })} /> reasoning</label>
        </div>
        <button className={btn} disabled={busy || !nm.providerId || !nm.modelId} onClick={() => call("/api/admin/upstream?type=model", "POST", nm)}>+ add model</button>

        {/* models.dev catalog import */}
        <div className="mt-3 rounded bg-neutral-50 p-2">
          <div className="mb-1 text-xs font-semibold">Import from models.dev catalog (213 providers, auto-fills pricing/context)</div>
          <div className="grid grid-cols-3 gap-1">
            <select className={input} value={importProvider.providerId} onChange={(e) => setImportProvider({ ...importProvider, providerId: e.target.value })}>
              <option value="">local provider…</option>
              {providers.map((p) => <option key={p.id} value={p.id}>{p.id}</option>)}
            </select>
            <input className={input} placeholder="catalog id (e.g. openrouter)" value={importProvider.catalogId} onChange={(e) => setImportProvider({ ...importProvider, catalogId: e.target.value })} />
            <button className={btn} disabled={busy || !importProvider.providerId} onClick={() => call("/api/admin/upstream?type=import-catalog", "POST", importProvider)}>import models</button>
          </div>
        </div>
      </section>
    </div>
  );
}
