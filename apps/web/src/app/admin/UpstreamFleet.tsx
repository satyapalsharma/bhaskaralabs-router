"use client";
// Upstream fleet management: CUSTOM providers (any base URL) + catalog presets
// (models.dev, 213 providers auto-filled), multi-account per provider, models
// with public/private visibility + tiers + pricing, and per-account limits.

import { useCallback, useEffect, useMemo, useState } from "react";

interface Provider { id: string; name: string; baseUrl: string; protocol: string; authStyle: string; billing: string; active: boolean; notes: string | null }
interface Account { id: string; providerId: string; label: string; apiKey: string; disabled: boolean; cooldownUntil: string | null; weight: number; limits: string | null }
interface Model { id: string; providerId: string; modelId: string; alias: string | null; visibility: string; tier: string; contextWindow: number; maxOutput: number; inputUsdPerM: string; outputUsdPerM: string; reasoning: boolean; active: boolean }
interface CatalogProvider { id: string; name: string; api: string }

const LIMIT_FIELDS = ["maxConcurrent", "per5hRequests", "per5hTokens", "perWeekRequests", "perWeekTokens", "dailyCostUsd"] as const;

export default function UpstreamFleet() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [models, setModels] = useState<Model[]>([]);
  const [catalog, setCatalog] = useState<CatalogProvider[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  // ── add-provider form (custom OR catalog preset) ──
  const [np, setNp] = useState({ id: "", name: "", baseUrl: "", protocol: "openai", authStyle: "bearer", billing: "flat" });
  const [preset, setPreset] = useState(""); // catalog provider id, "" = manual

  // ── add-account form (providerId pre-set by [+ account] buttons) ──
  const [na, setNa] = useState<{ providerId: string; label: string; apiKey: string; weight: number; limits: Record<string, string> }>({ providerId: "", label: "", apiKey: "", weight: 1, limits: {} });

  // ── add-model form ──
  const [nm, setNm] = useState({ providerId: "", modelId: "", alias: "", visibility: "public", tier: "flash", contextWindow: 128000, maxOutput: 32768, inputUsdPerM: "0", outputUsdPerM: "0", reasoning: false });
  const [importProvider, setImportProvider] = useState({ providerId: "", catalogId: "" });

  const load = useCallback(async () => {
    const r = await fetch("/api/admin/upstream");
    const d = await r.json();
    setProviders(d.providers ?? []);
    setAccounts(d.accounts ?? []);
    setModels(d.models ?? []);
  }, []);

  // models.dev catalog (for the preset dropdown — fetched once client-side,
  // cached in state; failure degrades to manual-only mode).
  useEffect(() => {
    fetch("https://models.dev/api.json")
      .then((r) => r.json())
      .then((d: Record<string, { name?: string; api?: string }>) => {
        const list = Object.entries(d)
          .filter(([, v]) => !!v.api)
          .map(([id, v]) => ({ id, name: v.name ?? id, api: v.api! }))
          .sort((a, b) => a.name.localeCompare(b.name));
        setCatalog(list);
      })
      .catch(() => setCatalog([]));
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

  const applyPreset = (cid: string) => {
    setPreset(cid);
    const c = catalog.find((x) => x.id === cid);
    if (c) setNp((p) => ({ ...p, id: p.id || c.id, name: c.name, baseUrl: c.api }));
  };

  const accountsOf = (pid: string) => accounts.filter((a) => a.providerId === pid);
  const modelsOf = (pid: string) => models.filter((m) => m.providerId === pid);

  const input = "w-full rounded border px-2 py-1 text-xs bg-white text-black";
  const btn = "rounded bg-blue-600 px-2 py-1 text-xs text-white disabled:opacity-50";
  const sbtn = "rounded border px-1 text-[10px] disabled:opacity-50";

  const sortedProviders = useMemo(() => [...providers].sort((a, b) => a.id.localeCompare(b.id)), [providers]);

  return (
    <div className="space-y-6">
      {msg && <div className="text-xs text-blue-700">{msg}</div>}

      {/* ── Add CUSTOM provider (manual) or from catalog preset ── */}
      <section className="rounded border p-3">
        <h3 className="mb-2 text-sm font-bold">Add provider <span className="font-normal text-neutral-400">— custom (any base URL) ya models.dev preset</span></h3>
        <div className="mb-2 grid grid-cols-2 gap-1">
          <select className={input} value={preset} onChange={(e) => applyPreset(e.target.value)}>
            <option value="">✏️ custom — manually type below</option>
            {catalog.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.id})</option>)}
          </select>
          <div className="text-[10px] text-neutral-500 self-center">
            {catalog.length > 0 ? `${catalog.length} catalog presets loaded — baseUrl auto-fills` : "catalog offline — manual entry only"}
          </div>
        </div>
        <div className="grid grid-cols-6 gap-1">
          <input className={input} placeholder="id (slug)" value={np.id} onChange={(e) => setNp({ ...np, id: e.target.value })} />
          <input className={input} placeholder="display name" value={np.name} onChange={(e) => setNp({ ...np, name: e.target.value })} />
          <input className={input} placeholder="https://api.x.com/v1" value={np.baseUrl} onChange={(e) => setNp({ ...np, baseUrl: e.target.value })} />
          <select className={input} value={np.protocol} onChange={(e) => setNp({ ...np, protocol: e.target.value })}><option value="openai">openai</option><option value="anthropic">anthropic</option></select>
          <select className={input} value={np.authStyle} onChange={(e) => setNp({ ...np, authStyle: e.target.value })}><option value="bearer">bearer</option><option value="x-api-key">x-api-key</option></select>
          <select className={input} value={np.billing} onChange={(e) => setNp({ ...np, billing: e.target.value })}><option value="flat">flat</option><option value="metered">metered</option><option value="credits">credits</option></select>
        </div>
        <button className={btn} disabled={busy || !np.id || !np.baseUrl} onClick={async () => {
          const ok = await call("/api/admin/upstream?type=provider", "POST", np);
          if (ok) { setNp({ id: "", name: "", baseUrl: "", protocol: "openai", authStyle: "bearer", billing: "flat" }); setPreset(""); }
        }}>+ add provider</button>
      </section>

      {/* ── Fleet: providers with inline accounts + models ── */}
      <section className="rounded border p-3">
        <h3 className="mb-2 text-sm font-bold">Fleet <span className="text-neutral-400">({providers.length} providers, {accounts.length} accounts, {models.length} models)</span></h3>
        {sortedProviders.length === 0 && <div className="py-2 text-xs text-neutral-400">no providers yet — add one above</div>}
        {sortedProviders.map((p) => (
          <div key={p.id} className="mb-3 rounded border bg-neutral-50 p-2">
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <span className="font-mono font-bold">{p.id}</span>
              <span className="text-neutral-500">{p.name}</span>
              <span className="font-mono text-[10px] text-neutral-400">{p.baseUrl}</span>
              <span className="rounded bg-neutral-200 px-1 text-[10px]">{p.protocol}</span>
              <span className="rounded bg-neutral-200 px-1 text-[10px]">{p.billing}</span>
              <span>{p.active ? "✅" : "⬜"}</span>
              <span className="ml-auto space-x-1">
                <button className={sbtn} disabled={busy} title="add an account (API key) to this provider" onClick={() => setNa({ ...na, providerId: p.id, label: "", apiKey: "" })}>+ account</button>
                <button className={sbtn} disabled={busy} title="add a model to this provider" onClick={() => setNm({ ...nm, providerId: p.id })}>+ model</button>
                <button className={sbtn} disabled={busy} onClick={() => call(`/api/admin/upstream?type=provider&id=${p.id}`, "PATCH", { active: !p.active })}>{p.active ? "disable" : "enable"}</button>
                <button className={sbtn} disabled={busy} onClick={() => setImportProvider({ providerId: p.id, catalogId: "" })}>import catalog</button>
                <button className={`${sbtn} text-red-600`} disabled={busy} onClick={() => confirm(`Delete ${p.id} + ${accountsOf(p.id).length} accounts + ${modelsOf(p.id).length} models?`) && call(`/api/admin/upstream?type=provider&id=${p.id}`, "DELETE")}>del</button>
              </span>
            </div>

            {/* accounts of this provider */}
            <div className="mt-1 ml-2 space-y-1">
              {accountsOf(p.id).map((a) => (
                <div key={a.id} className="flex flex-wrap items-center gap-2 text-[11px]">
                  <span>🔑 {a.label}</span>
                  <span className="font-mono text-neutral-400">{a.apiKey}</span>
                  <span className="text-neutral-400">w{a.weight}</span>
                  {a.limits && <span className="font-mono text-[9px] text-neutral-500">{a.limits}</span>}
                  {a.cooldownUntil && new Date(a.cooldownUntil) > new Date() && <span className="text-orange-600">🔥 cooling → {new Date(a.cooldownUntil).toLocaleTimeString()}</span>}
                  <span>{a.disabled ? "⬜" : "✅"}</span>
                  <span className="ml-auto space-x-1">
                    <button className={sbtn} disabled={busy} onClick={() => call(`/api/admin/upstream?type=account&id=${a.id}`, "PATCH", { cooldownUntil: null, disabled: !a.disabled })}>{a.disabled ? "enable" : "disable"}</button>
                    <button className={`${sbtn} text-red-600`} disabled={busy} onClick={() => confirm(`Delete account ${a.label}?`) && call(`/api/admin/upstream?type=account&id=${a.id}`, "DELETE")}>del</button>
                  </span>
                </div>
              ))}
              {/* models of this provider */}
              {modelsOf(p.id).map((m) => (
                <div key={m.id} className="flex flex-wrap items-center gap-2 text-[11px]">
                  <span>📦 <span className="font-mono">{m.modelId}</span>{m.alias ? <span className="text-neutral-500"> as “{m.alias}”</span> : null}</span>
                  <span>{m.visibility === "public" ? "🌐" : "🔒"}</span>
                  <span className="rounded bg-neutral-200 px-1 text-[9px]">{m.tier}</span>
                  <span className="text-neutral-400">{(m.contextWindow / 1000) | 0}K · ${m.inputUsdPerM}/${m.outputUsdPerM} per M</span>
                  <span className="ml-auto space-x-1">
                    <button className={sbtn} disabled={busy} onClick={() => call(`/api/admin/upstream?type=model&id=${m.id}`, "PATCH", { visibility: m.visibility === "public" ? "private" : "public" })}>{m.visibility === "public" ? "make private" : "make public"}</button>
                    <button className={sbtn} disabled={busy} onClick={() => call(`/api/admin/upstream?type=model&id=${m.id}`, "PATCH", { active: !m.active })}>{m.active ? "off" : "on"}</button>
                    <button className={`${sbtn} text-red-600`} disabled={busy} onClick={() => confirm(`Delete model ${m.modelId}?`) && call(`/api/admin/upstream?type=model&id=${m.id}`, "DELETE")}>del</button>
                  </span>
                </div>
              ))}
            </div>

            {/* per-provider catalog import (mini form) */}
            {importProvider.providerId === p.id && (
              <div className="mt-2 flex gap-1 rounded border border-dashed p-2">
                <select className={input} value={importProvider.catalogId} onChange={(e) => setImportProvider({ ...importProvider, catalogId: e.target.value })}>
                  <option value="">models.dev catalog provider…</option>
                  {catalog.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.id})</option>)}
                </select>
                <button className={btn} disabled={busy || !importProvider.catalogId} onClick={() => call("/api/admin/upstream?type=import-catalog", "POST", importProvider)}>import models</button>
                <button className={sbtn} onClick={() => setImportProvider({ providerId: "", catalogId: "" })}>✕</button>
              </div>
            )}
          </div>
        ))}
      </section>

      {/* ── Add account (multi-account; providerId pre-set via [+ account]) ── */}
      <section className="rounded border p-3">
        <h3 className="mb-2 text-sm font-bold">Add account <span className="text-neutral-400">(same provider ke multiple accounts — rotation + limits)</span></h3>
        <div className="grid grid-cols-4 gap-1">
          <select className={input} value={na.providerId} onChange={(e) => setNa({ ...na, providerId: e.target.value })}>
            <option value="">provider…</option>
            {providers.map((p) => <option key={p.id} value={p.id}>{p.id}</option>)}
          </select>
          <input className={input} placeholder="label (e.g. main / backup-2)" value={na.label} onChange={(e) => setNa({ ...na, label: e.target.value })} />
          <input className={input} placeholder="API key" value={na.apiKey} onChange={(e) => setNa({ ...na, apiKey: e.target.value })} />
          <input className={input} type="number" min={1} title="weight (rotation)" value={na.weight} onChange={(e) => setNa({ ...na, weight: Number(e.target.value) })} />
        </div>
        <div className="mt-1 grid grid-cols-6 gap-1">
          {LIMIT_FIELDS.map((f) => (
            <input key={f} className={input} placeholder={f} title={f} value={na.limits[f] ?? ""} onChange={(e) => setNa({ ...na, limits: { ...na.limits, [f]: e.target.value } })} />
          ))}
        </div>
        <div className="mt-1 flex items-center gap-2">
          <button className={btn} disabled={busy || !na.providerId || !na.apiKey} onClick={async () => {
            const limits: Record<string, number> = {};
            for (const [k, v] of Object.entries(na.limits)) if (v !== "") limits[k] = Number(v);
            const ok = await call("/api/admin/upstream?type=account", "POST", { ...na, limits: Object.keys(limits).length ? limits : undefined });
            if (ok) setNa({ ...na, label: "", apiKey: "", limits: {} });
          }}>+ add account</button>
          <span className="text-[10px] text-neutral-400">limits optional — khali chhodo to unlimited</span>
        </div>
      </section>

      {/* ── Add model ── */}
      <section className="rounded border p-3">
        <h3 className="mb-2 text-sm font-bold">Add model <span className="text-neutral-400">(public = /v1/models pe dikhega; private = hidden but routable)</span></h3>
        <div className="grid grid-cols-5 gap-1">
          <select className={input} value={nm.providerId} onChange={(e) => setNm({ ...nm, providerId: e.target.value })}>
            <option value="">provider…</option>
            {providers.map((p) => <option key={p.id} value={p.id}>{p.id}</option>)}
          </select>
          <input className={input} placeholder="model id (upstream ka naam)" value={nm.modelId} onChange={(e) => setNm({ ...nm, modelId: e.target.value })} />
          <input className={input} placeholder="alias (clients ise naam se call karenge)" value={nm.alias} onChange={(e) => setNm({ ...nm, alias: e.target.value })} />
          <select className={input} value={nm.visibility} onChange={(e) => setNm({ ...nm, visibility: e.target.value })}><option value="public">🌐 public</option><option value="private">🔒 private</option></select>
          <select className={input} value={nm.tier} onChange={(e) => setNm({ ...nm, tier: e.target.value })}><option value="flash">flash</option><option value="full">full</option><option value="cheap">cheap</option></select>
        </div>
        <div className="mt-1 grid grid-cols-5 gap-1">
          <input className={input} type="number" placeholder="context window" value={nm.contextWindow} onChange={(e) => setNm({ ...nm, contextWindow: Number(e.target.value) })} />
          <input className={input} type="number" placeholder="max output" value={nm.maxOutput} onChange={(e) => setNm({ ...nm, maxOutput: Number(e.target.value) })} />
          <input className={input} placeholder="$ input /M" value={nm.inputUsdPerM} onChange={(e) => setNm({ ...nm, inputUsdPerM: e.target.value })} />
          <input className={input} placeholder="$ output /M" value={nm.outputUsdPerM} onChange={(e) => setNm({ ...nm, outputUsdPerM: e.target.value })} />
          <label className="flex items-center gap-1 text-xs"><input type="checkbox" checked={nm.reasoning} onChange={(e) => setNm({ ...nm, reasoning: e.target.checked })} /> reasoning</label>
        </div>
        <button className={btn} disabled={busy || !nm.providerId || !nm.modelId} onClick={async () => {
          const ok = await call("/api/admin/upstream?type=model", "POST", nm);
          if (ok) setNm({ ...nm, modelId: "", alias: "" });
        }}>+ add model</button>
      </section>
    </div>
  );
}
