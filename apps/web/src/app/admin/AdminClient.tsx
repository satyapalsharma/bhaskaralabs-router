"use client";

import { useEffect, useState } from "react";
import UpstreamFleet from "./UpstreamFleet";
import PlansPanel from "./PlansPanel";
type AdminUser = {
  id: string;
  email: string;
  plan: string;
  cohort: number;
  role: string;
  joined: string;
  optOut: boolean;
  tokens: number;
  requests: number;
  thetaRequests: number;
  cogsUsd: number;
  revenueUsd: number;
  marginUsd: number;
  equivApiUsd: number;
  cacheHitPct: number;
  fullSharePct: number;
  coupons: string;
};

type ProviderRow = {
  provider: string;
  class: string;
  requests: number;
  tokens: number;
  cacheHitPct: number;
  meteredUsd: number;
  planFeeUsd: number;
  trueBurnUsd: number;
  notes: string | null;
};

type ProvidersData = {
  month: string;
  providers: ProviderRow[];
  summary: { cogsUsd: number; equivUsd: number; providerFeesUsd: number };
};

type Coupon = {
  code: string;
  discountPct: number;
  usageLimit: number;
  perUserLimit: number;
  usedCount: number;
  redeemedCount: number;
  plans: string;
  active: boolean;
  validUntil: string | null;
};

type Alert = {
  id: string;
  severity: "amber" | "red";
  title: string;
  detail: string;
};

type AlertsData = {
  alerts: Alert[];
  cohortPnl: {
    month: string;
    revenueUsd: number;
    cogsUsd: number;
    providerFeesUsd: number;
    infraShareUsd: number;
    marginUsd: number;
    frontierTurns: number;
    activeUsers: number;
    equivApiUsd: number;
    verdict: "go" | "watch" | "no-go" | "no-revenue-yet";
  };
  shadowMargin: {
    window: string;
    hyperOnlyCogsUsd: number;
    bootstrapCogsUsd: number;
    weekRevenueUsd: number;
    marginUsd: number;
    note: string;
  };
  fullSharePolicy: { alertAt: number; hardCap: number };
};

const fmt = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}K` : `${n}`);
const usd = (n: number) => `$${n.toFixed(n >= 100 ? 0 : n >= 1 ? 2 : 4)}`;

export default function AdminClient() {
  const [usersRows, setUsers] = useState<AdminUser[] | null>(null);
  const [providers, setProviders] = useState<ProvidersData | null>(null);
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [alertsData, setAlertsData] = useState<AlertsData | null>(null);
  const [gate, setGate] = useState({ signup_enabled: "true", cohort_cap: "100", waitlistCount: 0 });
  const [tab, setTab] = useState<"users" | "economics" | "alerts" | "coupons" | "growth" | "fleet" | "plans">("users");
  const [newCode, setNewCode] = useState({ code: "", discountPct: 20, usageLimit: 100 });
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  const load = () => {
    fetch("/api/admin/users").then((r) => r.json()).then((d) => setUsers(d.users ?? []));
    fetch("/api/admin/providers").then((r) => r.json()).then(setProviders);
    fetch("/api/admin/coupons").then((r) => r.json()).then((d) => setCoupons(d.coupons ?? []));
    fetch("/api/admin/alerts").then((r) => r.json()).then(setAlertsData);
    fetch("/api/admin/settings")
      .then((r) => r.json())
      .then((d) => setGate({ signup_enabled: d.settings.signup_enabled || "true", cohort_cap: d.settings.cohort_cap || "100", waitlistCount: d.waitlistCount ?? 0 }));
  };
  useEffect(load, []);


  const call = async (url: string, body: unknown, method = "POST") => {
    setBusy(true);
    setMsg("");
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    if (data.error) setMsg(data.error);
    setBusy(false);
    load();
  };

  const totalRevenue = (usersRows ?? []).reduce((s, u) => s + u.revenueUsd, 0);
  const totalCogs = providers?.summary.cogsUsd ?? 0;

  return (
    <main className="mx-auto max-w-6xl px-6 py-10">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Admin</h1>
        <div className="flex gap-1 rounded-lg border border-zinc-800 p-1 text-sm">
          {(["users", "economics", "alerts", "coupons", "growth", "fleet", "plans"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1 capitalize transition-colors ${tab === t ? "bg-zinc-800 text-zinc-100" : "text-zinc-500 hover:text-zinc-300"}`}
            >
              {t}
              {t === "alerts" && (alertsData?.alerts.length ?? 0) > 0 && (
                <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${alertsData!.alerts.some((x) => x.severity === "red") ? "bg-red-500/20 text-red-400" : "bg-amber-500/20 text-amber-400"}`}>
                  {alertsData!.alerts.length}
                </span>
              )}
            </button>
          ))}
        </div>
      </div>
      {tab === "alerts" && alertsData && (
        <section className="mt-8 space-y-6">
          {/* Alerts list */}
          <div className="space-y-2">
            <h2 className="font-semibold">
              Alerts
              {alertsData.fullSharePolicy && (
                <span className="ml-2 text-xs font-normal text-zinc-500">
                  full-share alert {(alertsData.fullSharePolicy.alertAt * 100).toFixed(0)}% · hard cap {(alertsData.fullSharePolicy.hardCap * 100).toFixed(0)}%
                </span>
              )}
            </h2>
            {alertsData.alerts.length === 0 && (
              <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5 text-sm text-zinc-500">
                No alerts — all users inside margin and fair-use lines.
              </div>
            )}
            {alertsData.alerts.map((al) => (
              <div
                key={al.id}
                className={`rounded-xl border p-4 ${al.severity === "red" ? "border-red-500/40 bg-red-500/5" : "border-amber-500/40 bg-amber-500/5"}`}
              >
                <p className={`text-sm font-semibold ${al.severity === "red" ? "text-red-400" : "text-amber-400"}`}>{al.title}</p>
                <p className="mt-1 text-sm text-zinc-400">{al.detail}</p>
              </div>
            ))}
          </div>

          {/* Cohort P&L — go/no-go evidence for opening the next 100 signups */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5">
            <h2 className="font-semibold">Cohort P&amp;L — {alertsData.cohortPnl.month}</h2>
            <p className="mt-1 text-sm text-zinc-500">The go/no-go report for the cohort gate. Verdict: margin ≥30% go · 15–30% watch · &lt;15% no-go.</p>
            <div className="mt-4 grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
              {[
                ["Revenue", usd(alertsData.cohortPnl.revenueUsd)],
                ["Token COGS", usd(alertsData.cohortPnl.cogsUsd)],
                ["Provider fees", usd(alertsData.cohortPnl.providerFeesUsd)],
                ["Margin", usd(alertsData.cohortPnl.marginUsd)],
                ["Frontier turns", `${alertsData.cohortPnl.frontierTurns}`],
                ["Active users", `${alertsData.cohortPnl.activeUsers}`],
              ].map(([l, v]) => (
                <div key={l} className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-3">
                  <p className="text-xs text-zinc-500">{l}</p>
                  <p className="mt-1 text-lg font-semibold tabular-nums">{v}</p>
                </div>
              ))}
            </div>
            <div className="mt-4 flex items-center gap-3">
              <span
                className={`rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-wide ${
                  alertsData.cohortPnl.verdict === "go"
                    ? "bg-emerald-500/15 text-emerald-400"
                    : alertsData.cohortPnl.verdict === "watch"
                      ? "bg-amber-500/15 text-amber-400"
                      : alertsData.cohortPnl.verdict === "no-go"
                        ? "bg-red-500/15 text-red-400"
                        : "bg-zinc-800 text-zinc-400"
                }`}
              >
                {alertsData.cohortPnl.verdict}
              </span>
              <span className="text-xs text-zinc-500">
                users&apos; equivalent-API spend: {usd(alertsData.cohortPnl.equivApiUsd)} · infra share rows land in provider_monthly
              </span>
            </div>
          </div>

          {/* Hyper-only shadow margin — core-vs-bootstrap proof */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5">
            <h2 className="font-semibold">Hyper-only shadow margin — {alertsData.shadowMargin.window}</h2>
            <p className="mt-1 text-sm text-zinc-500">{alertsData.shadowMargin.note}</p>
            <div className="mt-4 grid gap-4 sm:grid-cols-4">
              {[
                ["Hyper-only COGS", usd(alertsData.shadowMargin.hyperOnlyCogsUsd)],
                ["Bootstrap COGS (actual)", usd(alertsData.shadowMargin.bootstrapCogsUsd)],
                ["Week revenue", usd(alertsData.shadowMargin.weekRevenueUsd)],
                ["Hyper-only margin", usd(alertsData.shadowMargin.marginUsd)],
              ].map(([l, v]) => (
                <div key={l} className="rounded-lg border border-zinc-800 bg-zinc-950/50 p-3">
                  <p className="text-xs text-zinc-500">{l}</p>
                  <p className="mt-1 text-lg font-semibold tabular-nums">{v}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}


      {tab === "growth" && (
        <section className="mt-8 max-w-md space-y-4">
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5">
            <h2 className="font-semibold">Signup gate</h2>
            <p className="mt-1 text-sm text-zinc-500">Closed → login page switches to waitlist capture. Cap auto-closes at cohort size.</p>
            <div className="mt-4 flex items-center justify-between">
              <span className="text-sm">signups {gate.signup_enabled === "false" ? "CLOSED" : "open"}</span>
              <button
                onClick={() => call("/api/admin/settings", { signupEnabled: gate.signup_enabled !== "false" })}
                disabled={busy}
                className={`h-6 w-11 rounded-full transition-colors ${gate.signup_enabled === "false" ? "bg-zinc-700" : "bg-emerald-500"}`}
              >
                <span
                  className={`block h-5 w-5 translate-y-0.5 rounded-full bg-zinc-100 transition-all ${
                    gate.signup_enabled === "false" ? "translate-x-0.5" : "translate-x-[22px]"
                  }`}
                />
              </button>
            </div>
            <label className="mt-4 block text-sm">
              Cohort cap
              <div className="mt-1 flex gap-2">
                <input
                  type="number"
                  min={1}
                  value={gate.cohort_cap}
                  onChange={(e) => setGate((g) => ({ ...g, cohort_cap: e.target.value }))}
                  className="w-28 rounded-md border border-zinc-700 bg-zinc-950 px-3 py-1.5 text-sm"
                />
                <button
                  onClick={() => call("/api/admin/settings", { cohortCap: Number(gate.cohort_cap) })}
                  disabled={busy}
                  className="rounded-md border border-zinc-700 px-3 py-1.5 text-sm hover:border-zinc-500"
                >
                  Set
                </button>
              </div>
            </label>
            <div className="mt-4 flex items-center justify-between text-sm">
              <span className="text-zinc-400">Waitlist: {gate.waitlistCount} {gate.waitlistCount === 1 ? "email" : "emails"}</span>
              <a href="/api/admin/waitlist" className="text-amber-400 hover:text-amber-300">Export CSV ↓</a>
            </div>
            {msg && <p className="mt-2 text-xs text-red-400">{msg}</p>}
          </div>
        </section>
      )}

      {tab === "economics" && providers && (
        <section className="mt-8">
          <div className="grid gap-4 sm:grid-cols-3">
            {[
              ["Revenue (month)", usd(totalRevenue)],
              ["Token COGS (ledger)", usd(totalCogs)],
              ["Gross margin", totalRevenue > 0 ? `${(((totalRevenue - totalCogs) / totalRevenue) * 100).toFixed(0)}%` : "—"],
            ].map(([l, v]) => (
              <div key={l} className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5">
                <p className="text-sm text-zinc-400">{l}</p>
                <p className="mt-1 text-2xl font-semibold">{v}</p>
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-zinc-600">
            {providers.month} · users&apos; equivalent-API spend this month: {usd(providers.summary.equivUsd)} · provider fees: {usd(providers.summary.providerFeesUsd)}
          </p>
          <div className="mt-6 overflow-x-auto rounded-xl border border-zinc-800">
            <table className="w-full text-sm">
              <thead className="bg-zinc-900/80 text-left text-zinc-400">
                <tr>
                  {["Provider", "Class", "Requests", "Tokens", "Cache hit", "Metered", "Plan fee", "True burn"].map((h) => (
                    <th key={h} className="px-4 py-2 font-medium">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {providers.providers.map((p) => (
                  <tr key={p.provider} className="border-t border-zinc-800/60">
                    <td className="px-4 py-2 capitalize">{p.provider}</td>
                    <td className="px-4 py-2">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wide ${
                          p.class === "core" ? "bg-amber-500/15 text-amber-400" : "bg-zinc-800 text-zinc-400"
                        }`}
                      >
                        {p.class}
                      </span>
                    </td>
                    <td className="px-4 py-2 tabular-nums">{p.requests}</td>
                    <td className="px-4 py-2 tabular-nums">{fmt(p.tokens)}</td>
                    <td className="px-4 py-2 tabular-nums">{p.cacheHitPct}%</td>
                    <td className="px-4 py-2 tabular-nums">{usd(p.meteredUsd)}</td>
                    <td className="px-4 py-2 tabular-nums">{usd(p.planFeeUsd)}</td>
                    <td className="px-4 py-2 tabular-nums font-medium">{usd(p.trueBurnUsd)}</td>
                  </tr>
                ))}
                {providers.providers.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-4 py-6 text-center text-zinc-500">
                      No ledger rows this month.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-zinc-600">
            Plan-fee columns come from manual provider_monthly rows (add as invoices arrive). Agnes/StepFun per-request cost is 0 in the ledger — flat plans
            amortize here.
          </p>
        </section>
      )}

      {tab === "coupons" && (
        <section className="mt-8 space-y-6">
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5">
            <h2 className="font-semibold">New coupon</h2>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
              <input
                value={newCode.code}
                onChange={(e) => setNewCode((c) => ({ ...c, code: e.target.value }))}
                placeholder="auto code"
                className="w-36 rounded-md border border-zinc-700 bg-zinc-950 px-3 py-1.5 uppercase"
              />
              <span className="text-zinc-500">%</span>
              <input
                type="number"
                min={1}
                max={100}
                value={newCode.discountPct}
                onChange={(e) => setNewCode((c) => ({ ...c, discountPct: Number(e.target.value) }))}
                className="w-20 rounded-md border border-zinc-700 bg-zinc-950 px-3 py-1.5"
              />
              <span className="text-zinc-500">off ·</span>
              <input
                type="number"
                min={1}
                value={newCode.usageLimit}
                onChange={(e) => setNewCode((c) => ({ ...c, usageLimit: Number(e.target.value) }))}
                className="w-20 rounded-md border border-zinc-700 bg-zinc-950 px-3 py-1.5"
              />
              <span className="text-zinc-500">limit</span>
              <button onClick={() => call("/api/admin/coupons", newCode)} disabled={busy} className="rounded-md bg-amber-500 px-3 py-1.5 font-medium text-zinc-950 hover:bg-amber-400">
                Create
              </button>
              {msg && <span className="text-xs text-red-400">{msg}</span>}
            </div>
          </div>
          <div className="overflow-x-auto rounded-xl border border-zinc-800">
            <table className="w-full text-sm">
              <thead className="bg-zinc-900/80 text-left text-zinc-400">
                <tr>
                  {["Code", "Off", "Redeemed", "Per-user", "Plans", "Expires", "State", ""].map((h) => (
                    <th key={h} className="px-4 py-2 font-medium">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {coupons.map((c) => (
                  <tr key={c.code} className="border-t border-zinc-800/60">
                    <td className="px-4 py-2 font-mono">{c.code}</td>
                    <td className="px-4 py-2">{c.discountPct}%</td>
                    <td className="px-4 py-2">
                      {c.redeemedCount}/{c.usageLimit}
                    </td>
                    <td className="px-4 py-2">{c.perUserLimit}</td>
                    <td className="px-4 py-2">{c.plans}</td>
                    <td className="px-4 py-2 text-zinc-500">
                      {c.validUntil ? new Date(c.validUntil).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "never"}
                    </td>
                    <td className="px-4 py-2">{c.active ? <span className="text-emerald-400">live</span> : <span className="text-red-400">off</span>}</td>
                    <td className="px-4 py-2">
                      <button onClick={() => call("/api/admin/coupons", { code: c.code, active: !c.active }, "PATCH")} className="text-zinc-500 hover:text-zinc-200">
                        {c.active ? "Disable" : "Enable"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {tab === "users" && (
        <div className="mt-8 overflow-x-auto rounded-xl border border-zinc-800">
          <table className="w-full text-sm">
            <thead className="bg-zinc-900/80 text-left text-zinc-400">
              <tr>
                {["Email", "Plan", "Joined", "Reqs", "Tokens", "Theta", "Rev", "COGS", "Margin", "Cache", "Full%", "Coupons", "Opt-out"].map((h) => (
                  <th key={h} className="px-3 py-2 font-medium">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(usersRows ?? []).map((u) => (
                <tr key={u.id} className="border-t border-zinc-800/60">
                  <td className="px-3 py-2">
                    {u.email}
                    {u.role === "admin" && <span className="ml-1 text-[10px] text-amber-400">ADMIN</span>}
                  </td>
                  <td className="px-3 py-2 capitalize">{u.plan}</td>
                  <td className="px-3 py-2 text-zinc-500">{new Date(u.joined).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</td>
                  <td className="px-3 py-2 tabular-nums">{u.requests}</td>
                  <td className="px-3 py-2 tabular-nums">{fmt(u.tokens)}</td>
                  <td className="px-3 py-2 tabular-nums">{u.thetaRequests}</td>
                  <td className="px-3 py-2 tabular-nums">{usd(u.revenueUsd)}</td>
                  <td className="px-3 py-2 tabular-nums">{usd(u.cogsUsd)}</td>
                  <td className={`px-3 py-2 tabular-nums ${u.marginUsd < 0 ? "text-red-400" : "text-emerald-400"}`}>{usd(u.marginUsd)}</td>
                  <td className="px-3 py-2 tabular-nums">{u.cacheHitPct}%</td>
                  <td className={`px-3 py-2 tabular-nums ${u.fullSharePct > 8 ? "text-amber-400" : ""}`}>{u.fullSharePct}%</td>
                  <td className="px-3 py-2 text-zinc-500">{u.coupons || "—"}</td>
                  <td className="px-3 py-2 text-zinc-500">{u.optOut ? "yes" : "no"}</td>
                </tr>
              ))}
              {usersRows === null && (
                <tr>
                  <td colSpan={13} className="px-4 py-6 text-center text-zinc-500">
                    Loading…
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
      {tab === "fleet" && (
        <div className="mt-8">
          <UpstreamFleet />
        </div>
      )}
      {tab === "plans" && (
        <div className="mt-8">
          <PlansPanel />
        </div>
      )}
    </main>
  );
}