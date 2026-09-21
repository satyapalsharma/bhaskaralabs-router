"use client";
// Upstream fleet management: custom providers (any base URL) plus models.dev
// catalog presets, many accounts per provider, models with visibility, tiers
// and pricing, and per-account limits.

import { useCallback, useEffect, useMemo, useState } from "react";

interface Provider {
  id: string;
  name: string;
  baseUrl: string;
  protocol: string;
  authStyle: string;
  billing: string;
  active: boolean;
  notes: string | null;
}
interface Account {
  id: string;
  providerId: string;
  label: string;
  apiKey: string;
  disabled: boolean;
  cooldownUntil: string | null;
  weight: number;
  limits: string | null;
}
interface Model {
  id: string;
  providerId: string;
  modelId: string;
  alias: string | null;
  visibility: string;
  tier: string;
  contextWindow: number;
  maxOutput: number;
  inputUsdPerM: string;
  outputUsdPerM: string;
  reasoning: boolean;
  active: boolean;
}
interface CatalogProvider {
  id: string;
  name: string;
  api: string;
}

const LIMIT_FIELDS = [
  "maxConcurrent",
  "per5hRequests",
  "per5hTokens",
  "perWeekRequests",
  "perWeekTokens",
  "dailyCostUsd",
] as const;

/** A labelled form field. Every input in this panel has one. */
function Field({
  id,
  label,
  children,
}: {
  id: string;
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="label text-ink-faint">
        {label}
      </label>
      <div className="mt-2.5">{children}</div>
    </div>
  );
}

function PanelHeading({
  title,
  note,
}: {
  title: string;
  note?: string;
}) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-4 border-t-2 border-ink pt-5">
      <h2 className="subhead">{title}</h2>
      {note && (
        <p className="font-mono text-[0.6875rem] text-ink-faint">{note}</p>
      )}
    </div>
  );
}

export default function UpstreamFleet() {
  const [providers, setProviders] = useState<Provider[]>([]);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [models, setModels] = useState<Model[]>([]);
  const [catalog, setCatalog] = useState<CatalogProvider[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const [np, setNp] = useState({
    id: "",
    name: "",
    baseUrl: "",
    protocol: "openai",
    authStyle: "bearer",
    billing: "flat",
  });
  const [preset, setPreset] = useState("");

  const [na, setNa] = useState<{
    providerId: string;
    label: string;
    apiKey: string;
    weight: number;
    limits: Record<string, string>;
  }>({ providerId: "", label: "", apiKey: "", weight: 1, limits: {} });

  const [nm, setNm] = useState({
    providerId: "",
    modelId: "",
    alias: "",
    visibility: "public",
    tier: "flash",
    contextWindow: 128000,
    maxOutput: 32768,
    inputUsdPerM: "0",
    outputUsdPerM: "0",
    reasoning: false,
  });
  const [importProvider, setImportProvider] = useState({
    providerId: "",
    catalogId: "",
  });

  const load = useCallback(async () => {
    const r = await fetch("/api/admin/upstream");
    const d = await r.json();
    setProviders(d.providers ?? []);
    setAccounts(d.accounts ?? []);
    setModels(d.models ?? []);
  }, []);

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

  const applyPreset = (cid: string) => {
    setPreset(cid);
    const c = catalog.find((x) => x.id === cid);
    if (c) setNp((p) => ({ ...p, id: p.id || c.id, name: c.name, baseUrl: c.api }));
  };

  const accountsOf = (pid: string) => accounts.filter((a) => a.providerId === pid);
  const modelsOf = (pid: string) => models.filter((m) => m.providerId === pid);

  const sortedProviders = useMemo(
    () => [...providers].sort((a, b) => a.id.localeCompare(b.id)),
    [providers],
  );

  return (
    <div className="space-y-14">
      {msg && (
        <p role="status" className="font-mono text-[0.75rem] text-accent-deep">
          {msg}
        </p>
      )}

      {/* ══ Fleet ═══════════════════════════════════════════════ */}
      <section>
        <PanelHeading
          title="Fleet"
          note={`${providers.length} providers · ${accounts.length} accounts · ${models.length} models`}
        />

        {sortedProviders.length === 0 ? (
          <p className="mt-5 text-[0.875rem] text-ink-mute">
            No providers yet. Add one below.
          </p>
        ) : (
          <div className="mt-6 space-y-10">
            {sortedProviders.map((p) => (
              <div key={p.id}>
                <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2 border-b border-rule pb-3">
                  <code className="font-mono text-[0.875rem] font-medium text-ink">
                    {p.id}
                  </code>
                  <span className="text-[0.8125rem] text-ink-mute">{p.name}</span>
                  <code className="font-mono text-[0.6875rem] text-ink-faint">
                    {p.baseUrl}
                  </code>
                  <span className="tag">{p.protocol}</span>
                  <span className="tag">{p.billing}</span>
                  {p.active ? (
                    <span className="tag tag-ok">
                      <span className="dot" />
                      Active
                    </span>
                  ) : (
                    <span className="tag">Disabled</span>
                  )}

                  <span className="ml-auto flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      className="btn btn-outline btn-sm"
                      disabled={busy}
                      onClick={() =>
                        setNa({ ...na, providerId: p.id, label: "", apiKey: "" })
                      }
                    >
                      Account
                    </button>
                    <button
                      type="button"
                      className="btn btn-outline btn-sm"
                      disabled={busy}
                      onClick={() => setNm({ ...nm, providerId: p.id })}
                    >
                      Model
                    </button>
                    <button
                      type="button"
                      className="btn btn-outline btn-sm"
                      disabled={busy}
                      onClick={() =>
                        call(`/api/admin/upstream?type=provider&id=${p.id}`, "PATCH", {
                          active: !p.active,
                        })
                      }
                    >
                      {p.active ? "Disable" : "Enable"}
                    </button>
                    <button
                      type="button"
                      className="btn btn-outline btn-sm"
                      disabled={busy}
                      onClick={() =>
                        setImportProvider({ providerId: p.id, catalogId: "" })
                      }
                    >
                      Import
                    </button>
                    <button
                      type="button"
                      className="font-mono text-[0.6875rem] text-ink-mute transition-colors hover:text-danger disabled:opacity-50"
                      disabled={busy}
                      onClick={() =>
                        confirm(
                          `Delete ${p.id} with ${accountsOf(p.id).length} accounts and ${modelsOf(p.id).length} models?`,
                        ) &&
                        call(`/api/admin/upstream?type=provider&id=${p.id}`, "DELETE")
                      }
                    >
                      delete
                    </button>
                  </span>
                </div>

                {/* Accounts */}
                {accountsOf(p.id).length > 0 && (
                  <ul className="mt-4 space-y-2">
                    {accountsOf(p.id).map((a) => (
                      <li
                        key={a.id}
                        className="flex flex-wrap items-center gap-x-4 gap-y-2"
                      >
                        <span className="label w-16 shrink-0 text-ink-faint">
                          Account
                        </span>
                        <span className="text-[0.8125rem] text-ink">{a.label}</span>
                        <code className="font-mono text-[0.6875rem] text-ink-faint">
                          {a.apiKey}
                        </code>
                        <span className="num font-mono text-[0.6875rem] text-ink-mute">
                          weight {a.weight}
                        </span>
                        {a.limits && (
                          <code className="font-mono text-[0.6875rem] text-ink-faint">
                            {a.limits}
                          </code>
                        )}
                        {a.cooldownUntil &&
                          new Date(a.cooldownUntil) > new Date() && (
                            <span className="tag tag-warn">
                              <span className="dot" />
                              Cooling until{" "}
                              {new Date(a.cooldownUntil).toLocaleTimeString()}
                            </span>
                          )}
                        {a.disabled ? (
                          <span className="tag">Disabled</span>
                        ) : (
                          <span className="tag tag-ok">
                            <span className="dot" />
                            In rotation
                          </span>
                        )}
                        <span className="ml-auto flex gap-3">
                          <button
                            type="button"
                            className="font-mono text-[0.6875rem] text-ink-mute transition-colors hover:text-ink disabled:opacity-50"
                            disabled={busy}
                            onClick={() =>
                              call(`/api/admin/upstream?type=account&id=${a.id}`, "PATCH", {
                                cooldownUntil: null,
                                disabled: !a.disabled,
                              })
                            }
                          >
                            {a.disabled ? "enable" : "disable"}
                          </button>
                          <button
                            type="button"
                            className="font-mono text-[0.6875rem] text-ink-mute transition-colors hover:text-danger disabled:opacity-50"
                            disabled={busy}
                            onClick={() =>
                              confirm(`Delete account ${a.label}?`) &&
                              call(`/api/admin/upstream?type=account&id=${a.id}`, "DELETE")
                            }
                          >
                            delete
                          </button>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}

                {/* Models */}
                {modelsOf(p.id).length > 0 && (
                  <ul className="mt-3 space-y-2">
                    {modelsOf(p.id).map((m) => (
                      <li
                        key={m.id}
                        className="flex flex-wrap items-center gap-x-4 gap-y-2"
                      >
                        <span className="label w-16 shrink-0 text-ink-faint">
                          Model
                        </span>
                        <code className="font-mono text-[0.8125rem] text-ink">
                          {m.modelId}
                        </code>
                        {m.alias && (
                          <span className="font-mono text-[0.6875rem] text-ink-mute">
                            as {m.alias}
                          </span>
                        )}
                        <span className="tag">{m.tier}</span>
                        {m.visibility === "public" ? (
                          <span className="tag tag-ok">
                            <span className="dot" />
                            Public
                          </span>
                        ) : (
                          <span className="tag">Private</span>
                        )}
                        <span className="num font-mono text-[0.6875rem] text-ink-mute">
                          {((m.contextWindow / 1000) | 0)}K · $
                          {m.inputUsdPerM}/${m.outputUsdPerM} per M
                        </span>
                        <span className="ml-auto flex gap-3">
                          <button
                            type="button"
                            className="font-mono text-[0.6875rem] text-ink-mute transition-colors hover:text-ink disabled:opacity-50"
                            disabled={busy}
                            onClick={() =>
                              call(`/api/admin/upstream?type=model&id=${m.id}`, "PATCH", {
                                visibility:
                                  m.visibility === "public" ? "private" : "public",
                              })
                            }
                          >
                            {m.visibility === "public" ? "hide" : "publish"}
                          </button>
                          <button
                            type="button"
                            className="font-mono text-[0.6875rem] text-ink-mute transition-colors hover:text-ink disabled:opacity-50"
                            disabled={busy}
                            onClick={() =>
                              call(`/api/admin/upstream?type=model&id=${m.id}`, "PATCH", {
                                active: !m.active,
                              })
                            }
                          >
                            {m.active ? "off" : "on"}
                          </button>
                          <button
                            type="button"
                            className="font-mono text-[0.6875rem] text-ink-mute transition-colors hover:text-danger disabled:opacity-50"
                            disabled={busy}
                            onClick={() =>
                              confirm(`Delete model ${m.modelId}?`) &&
                              call(`/api/admin/upstream?type=model&id=${m.id}`, "DELETE")
                            }
                          >
                            delete
                          </button>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}

                {importProvider.providerId === p.id && (
                  <div className="mt-4 flex flex-wrap items-end gap-3 border border-dashed border-rule-strong p-4">
                    <div className="min-w-56 flex-1">
                      <label
                        htmlFor={`import-${p.id}`}
                        className="label text-ink-faint"
                      >
                        models.dev provider
                      </label>
                      <select
                        id={`import-${p.id}`}
                        className="field field-select mt-2.5"
                        value={importProvider.catalogId}
                        onChange={(e) =>
                          setImportProvider({
                            ...importProvider,
                            catalogId: e.target.value,
                          })
                        }
                      >
                        <option value="">Choose a provider…</option>
                        {catalog.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name} ({c.id})
                          </option>
                        ))}
                      </select>
                    </div>
                    <button
                      type="button"
                      className="btn btn-primary"
                      disabled={busy || !importProvider.catalogId}
                      onClick={() =>
                        call("/api/admin/upstream?type=import-catalog", "POST", importProvider)
                      }
                    >
                      Import models
                    </button>
                    <button
                      type="button"
                      className="btn btn-quiet"
                      onClick={() =>
                        setImportProvider({ providerId: "", catalogId: "" })
                      }
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ══ Add provider ════════════════════════════════════════ */}
      <section>
        <PanelHeading
          title="Add a provider"
          note={
            catalog.length > 0
              ? `${catalog.length} catalog presets · base URL auto-fills`
              : "catalog offline · manual entry"
          }
        />

        <div className="mt-6">
          <Field id="preset" label="Start from">
            <select
              id="preset"
              className="field field-select"
              value={preset}
              onChange={(e) => applyPreset(e.target.value)}
            >
              <option value="">Custom — type everything below</option>
              {catalog.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.id})
                </option>
              ))}
            </select>
          </Field>
        </div>

        <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <Field id="np-id" label="Slug">
            <input
              id="np-id"
              className="field font-mono"
              placeholder="hyper"
              value={np.id}
              onChange={(e) => setNp({ ...np, id: e.target.value })}
            />
          </Field>
          <Field id="np-name" label="Display name">
            <input
              id="np-name"
              className="field"
              placeholder="Hyper"
              value={np.name}
              onChange={(e) => setNp({ ...np, name: e.target.value })}
            />
          </Field>
          <Field id="np-url" label="Base URL">
            <input
              id="np-url"
              className="field font-mono"
              placeholder="https://api.example.com/v1"
              value={np.baseUrl}
              onChange={(e) => setNp({ ...np, baseUrl: e.target.value })}
            />
          </Field>
          <Field id="np-proto" label="Protocol">
            <select
              id="np-proto"
              className="field field-select font-mono"
              value={np.protocol}
              onChange={(e) => setNp({ ...np, protocol: e.target.value })}
            >
              <option value="openai">openai</option>
              <option value="anthropic">anthropic</option>
            </select>
          </Field>
          <Field id="np-auth" label="Auth style">
            <select
              id="np-auth"
              className="field field-select font-mono"
              value={np.authStyle}
              onChange={(e) => setNp({ ...np, authStyle: e.target.value })}
            >
              <option value="bearer">bearer</option>
              <option value="x-api-key">x-api-key</option>
            </select>
          </Field>
          <Field id="np-billing" label="Billing">
            <select
              id="np-billing"
              className="field field-select font-mono"
              value={np.billing}
              onChange={(e) => setNp({ ...np, billing: e.target.value })}
            >
              <option value="flat">flat</option>
              <option value="metered">metered</option>
              <option value="credits">credits</option>
            </select>
          </Field>
        </div>

        <button
          type="button"
          className="btn btn-primary mt-6"
          disabled={busy || !np.id || !np.baseUrl}
          onClick={async () => {
            const ok = await call("/api/admin/upstream?type=provider", "POST", np);
            if (ok) {
              setNp({
                id: "",
                name: "",
                baseUrl: "",
                protocol: "openai",
                authStyle: "bearer",
                billing: "flat",
              });
              setPreset("");
            }
          }}
        >
          Add provider
        </button>
      </section>

      {/* ══ Add account ═════════════════════════════════════════ */}
      <section>
        <PanelHeading
          title="Add an account"
          note="many accounts per provider · rotation and limits"
        />

        <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
          <Field id="na-provider" label="Provider">
            <select
              id="na-provider"
              className="field field-select font-mono"
              value={na.providerId}
              onChange={(e) => setNa({ ...na, providerId: e.target.value })}
            >
              <option value="">Choose…</option>
              {providers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.id}
                </option>
              ))}
            </select>
          </Field>
          <Field id="na-label" label="Label">
            <input
              id="na-label"
              className="field"
              placeholder="main"
              value={na.label}
              onChange={(e) => setNa({ ...na, label: e.target.value })}
            />
          </Field>
          <Field id="na-key" label="API key">
            <input
              id="na-key"
              className="field font-mono"
              placeholder="sk-…"
              value={na.apiKey}
              onChange={(e) => setNa({ ...na, apiKey: e.target.value })}
            />
          </Field>
          <Field id="na-weight" label="Rotation weight">
            <input
              id="na-weight"
              className="field num font-mono"
              type="number"
              min={1}
              value={na.weight}
              onChange={(e) => setNa({ ...na, weight: Number(e.target.value) })}
            />
          </Field>
        </div>

        <p className="label mt-8 text-ink-faint">Limits · leave empty for none</p>
        <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {LIMIT_FIELDS.map((f) => (
            <div key={f}>
              <label
                htmlFor={`lim-${f}`}
                className="block font-mono text-[0.6875rem] text-ink-mute"
              >
                {f}
              </label>
              <input
                id={`lim-${f}`}
                className="field num mt-2 font-mono"
                placeholder="unlimited"
                value={na.limits[f] ?? ""}
                onChange={(e) =>
                  setNa({ ...na, limits: { ...na.limits, [f]: e.target.value } })
                }
              />
            </div>
          ))}
        </div>

        <button
          type="button"
          className="btn btn-primary mt-6"
          disabled={busy || !na.providerId || !na.apiKey}
          onClick={async () => {
            const limits: Record<string, number> = {};
            for (const [k, v] of Object.entries(na.limits))
              if (v !== "") limits[k] = Number(v);
            const ok = await call("/api/admin/upstream?type=account", "POST", {
              ...na,
              limits: Object.keys(limits).length ? limits : undefined,
            });
            if (ok) setNa({ ...na, label: "", apiKey: "", limits: {} });
          }}
        >
          Add account
        </button>
      </section>

      {/* ══ Add model ═══════════════════════════════════════════ */}
      <section>
        <PanelHeading
          title="Add a model"
          note="public appears on /v1/models · private is routable but hidden"
        />

        <div className="mt-6 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          <Field id="nm-provider" label="Provider">
            <select
              id="nm-provider"
              className="field field-select font-mono"
              value={nm.providerId}
              onChange={(e) => setNm({ ...nm, providerId: e.target.value })}
            >
              <option value="">Choose…</option>
              {providers.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.id}
                </option>
              ))}
            </select>
          </Field>
          <Field id="nm-model" label="Upstream model id">
            <input
              id="nm-model"
              className="field font-mono"
              placeholder="glm-5.3-flash"
              value={nm.modelId}
              onChange={(e) => setNm({ ...nm, modelId: e.target.value })}
            />
          </Field>
          <Field id="nm-alias" label="Client-facing alias">
            <input
              id="nm-alias"
              className="field font-mono"
              placeholder="glm-5.3"
              value={nm.alias}
              onChange={(e) => setNm({ ...nm, alias: e.target.value })}
            />
          </Field>
          <Field id="nm-vis" label="Visibility">
            <select
              id="nm-vis"
              className="field field-select"
              value={nm.visibility}
              onChange={(e) => setNm({ ...nm, visibility: e.target.value })}
            >
              <option value="public">Public</option>
              <option value="private">Private</option>
            </select>
          </Field>
          <Field id="nm-tier" label="Tier">
            <select
              id="nm-tier"
              className="field field-select font-mono"
              value={nm.tier}
              onChange={(e) => setNm({ ...nm, tier: e.target.value })}
            >
              <option value="flash">flash</option>
              <option value="full">full</option>
              <option value="cheap">cheap</option>
            </select>
          </Field>
          <Field id="nm-ctx" label="Context window">
            <input
              id="nm-ctx"
              className="field num font-mono"
              type="number"
              value={nm.contextWindow}
              onChange={(e) =>
                setNm({ ...nm, contextWindow: Number(e.target.value) })
              }
            />
          </Field>
          <Field id="nm-out" label="Max output">
            <input
              id="nm-out"
              className="field num font-mono"
              type="number"
              value={nm.maxOutput}
              onChange={(e) => setNm({ ...nm, maxOutput: Number(e.target.value) })}
            />
          </Field>
          <Field id="nm-in" label="Input, USD per M">
            <input
              id="nm-in"
              className="field num font-mono"
              value={nm.inputUsdPerM}
              onChange={(e) => setNm({ ...nm, inputUsdPerM: e.target.value })}
            />
          </Field>
          <Field id="nm-outusd" label="Output, USD per M">
            <input
              id="nm-outusd"
              className="field num font-mono"
              value={nm.outputUsdPerM}
              onChange={(e) => setNm({ ...nm, outputUsdPerM: e.target.value })}
            />
          </Field>
        </div>

        <label className="mt-6 flex w-fit cursor-pointer items-center gap-3 text-[0.875rem] text-ink-soft">
          <input
            type="checkbox"
            checked={nm.reasoning}
            onChange={(e) => setNm({ ...nm, reasoning: e.target.checked })}
            className="h-4 w-4 accent-[var(--color-accent)]"
          />
          Reasoning model
        </label>

        <button
          type="button"
          className="btn btn-primary mt-6"
          disabled={busy || !nm.providerId || !nm.modelId}
          onClick={async () => {
            const ok = await call("/api/admin/upstream?type=model", "POST", nm);
            if (ok) setNm({ ...nm, modelId: "", alias: "" });
          }}
        >
          Add model
        </button>
      </section>
    </div>
  );
}
