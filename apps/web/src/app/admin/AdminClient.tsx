"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import UpstreamFleet from "./UpstreamFleet";
import PlansPanel from "./PlansPanel";
import SkillCards from "./SkillCards";
import { compactTokens, usd } from "@/lib/format";

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

const TABS = [
  "users",
  "economics",
  "alerts",
  "coupons",
  "growth",
  "routing",
  "fleet",
  "plans",
] as const;

type Tab = (typeof TABS)[number];

/** A labelled figure. Used across the economics and alert panels. */
function Stat({
  label,
  value,
  note,
  tone = "plain",
}: {
  label: string;
  value: string;
  note?: string;
  tone?: "plain" | "ok" | "warn" | "danger";
}) {
  const toneClass =
    tone === "ok"
      ? "text-ok"
      : tone === "warn"
        ? "text-warn"
        : tone === "danger"
          ? "text-danger"
          : "text-ink";
  return (
    <div className="border-t-2 border-ink bg-panel px-4 py-4">
      <p className="label text-ink-faint">{label}</p>
      <p className={`num mt-3 font-mono text-[1.25rem] font-medium leading-none ${toneClass}`}>
        {value}
      </p>
      {note && (
        <p className="mt-2 text-[0.75rem] leading-snug text-ink-mute">{note}</p>
      )}
    </div>
  );
}

function Th({ children, right = false }: { children: React.ReactNode; right?: boolean }) {
  return (
    <th
      scope="col"
      className={`label whitespace-nowrap px-3 pb-3 font-medium text-ink-faint ${
        right ? "text-right" : "text-left"
      }`}
    >
      {children}
    </th>
  );
}

export default function AdminClient() {
  const [usersRows, setUsers] = useState<AdminUser[] | null>(null);
  const [providers, setProviders] = useState<ProvidersData | null>(null);
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [alertsData, setAlertsData] = useState<AlertsData | null>(null);
  const [gate, setGate] = useState({
    signup_enabled: "true",
    cohort_cap: "100",
    waitlistCount: 0,
  });
  const [tab, setTab] = useState<Tab>("users");
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
      .then((d) =>
        setGate({
          signup_enabled: d.settings.signup_enabled || "true",
          cohort_cap: d.settings.cohort_cap || "100",
          waitlistCount: d.waitlistCount ?? 0,
        }),
      );
  };
  useEffect(load, []);

  const call = async (url: string, body: unknown, method = "POST") => {
    setBusy(true);
    setMsg("");
    const res = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    if (data.error) setMsg(data.error);
    setBusy(false);
    load();
  };

  const totalRevenue = (usersRows ?? []).reduce((s, u) => s + u.revenueUsd, 0);
  const totalCogs = providers?.summary.cogsUsd ?? 0;
  const alertCount = alertsData?.alerts.length ?? 0;
  const hasRed = alertsData?.alerts.some((a) => a.severity === "red") ?? false;

  return (
    <main className="mx-auto max-w-6xl px-5 py-10 sm:px-6">
      {/* ── Header + tabs ─────────────────────────────────────── */}
      <header className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="label text-accent-deep">Operator console</p>
          <h1 className="subhead mt-3">Admin</h1>
        </div>
        <div className="flex flex-wrap gap-x-1 gap-y-1 border-b border-rule">
          {TABS.map((t) => {
            const active = tab === t;
            return (
              <button
                key={t}
                type="button"
                onClick={() => setTab(t)}
                aria-current={active ? "page" : undefined}
                className={`-mb-px flex items-center gap-2 border-b-2 px-3 py-2 text-[0.8125rem] capitalize transition-colors ${
                  active
                    ? "border-accent text-ink"
                    : "border-transparent text-ink-mute hover:text-ink"
                }`}
              >
                {t}
                {t === "alerts" && alertCount > 0 && (
                  <span
                    className={`num rounded-xs px-1.5 py-0.5 font-mono text-[0.625rem] ${
                      hasRed
                        ? "bg-danger text-accent-ink"
                        : "bg-accent text-accent-ink"
                    }`}
                  >
                    {alertCount}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </header>

      {/* ══ Users ═══════════════════════════════════════════════ */}
      {tab === "users" && (
        <section className="mt-8">
          <div className="flex flex-wrap items-baseline justify-between gap-4 border-t-2 border-ink pt-5">
            <h2 className="subhead">Cohort users</h2>
            <p className="font-mono text-[0.6875rem] text-ink-faint">
              {usersRows?.length ?? 0} accounts
            </p>
          </div>

          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[62rem] border-collapse text-left">
              <thead>
                <tr className="border-b border-ink">
                  <Th>Email</Th>
                  <Th>Plan</Th>
                  <Th>Joined</Th>
                  <Th right>Reqs</Th>
                  <Th right>Tokens</Th>
                  <Th right>Theta</Th>
                  <Th right>Rev</Th>
                  <Th right>COGS</Th>
                  <Th right>Margin</Th>
                  <Th right>Cache</Th>
                  <Th right>Full%</Th>
                  <Th>Coupons</Th>
                  <Th>Opt-out</Th>
                </tr>
              </thead>
              <tbody>
                {(usersRows ?? []).map((u) => (
                  <tr
                    key={u.id}
                    className="border-b border-rule-faint transition-colors hover:bg-sunken"
                  >
                    <th scope="row" className="px-3 py-3 text-left font-normal">
                      <span className="font-mono text-[0.75rem] text-ink">
                        {u.email}
                      </span>
                      {u.role === "admin" && (
                        <span className="tag tag-accent ml-2">Admin</span>
                      )}
                    </th>
                    <td className="px-3 py-3">
                      <span className="tag capitalize">{u.plan}</span>
                    </td>
                    <td className="num whitespace-nowrap px-3 py-3 font-mono text-[0.75rem] text-ink-mute">
                      {new Date(u.joined).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                      })}
                    </td>
                    <td className="num px-3 py-3 text-right font-mono text-[0.75rem] text-ink-soft">
                      {u.requests}
                    </td>
                    <td className="num px-3 py-3 text-right font-mono text-[0.75rem] text-ink-soft">
                      {compactTokens(u.tokens)}
                    </td>
                    <td className="num px-3 py-3 text-right font-mono text-[0.75rem] text-ink-soft">
                      {u.thetaRequests}
                    </td>
                    <td className="num px-3 py-3 text-right font-mono text-[0.75rem] text-ink-soft">
                      {usd(u.revenueUsd)}
                    </td>
                    <td className="num px-3 py-3 text-right font-mono text-[0.75rem] text-ink-soft">
                      {usd(u.cogsUsd)}
                    </td>
                    <td
                      className={`num px-3 py-3 text-right font-mono text-[0.75rem] ${
                        u.marginUsd < 0 ? "text-danger" : "text-ok"
                      }`}
                    >
                      {usd(u.marginUsd)}
                    </td>
                    <td className="num px-3 py-3 text-right font-mono text-[0.75rem] text-ink-soft">
                      {u.cacheHitPct}%
                    </td>
                    <td
                      className={`num px-3 py-3 text-right font-mono text-[0.75rem] ${
                        u.fullSharePct > 8 ? "text-warn" : "text-ink-soft"
                      }`}
                    >
                      {u.fullSharePct}%
                    </td>
                    <td className="px-3 py-3 font-mono text-[0.75rem] text-ink-mute">
                      {u.coupons || "—"}
                    </td>
                    <td className="px-3 py-3 font-mono text-[0.75rem] text-ink-mute">
                      {u.optOut ? "yes" : "no"}
                    </td>
                  </tr>
                ))}
                {usersRows === null && (
                  <tr>
                    <td colSpan={13} className="px-3 py-8 text-center text-[0.875rem] text-ink-mute">
                      Loading…
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* ══ Alerts ══════════════════════════════════════════════ */}
      {tab === "alerts" && alertsData && (
        <section className="mt-8 space-y-10">
          <div>
            <div className="flex flex-wrap items-baseline justify-between gap-4 border-t-2 border-ink pt-5">
              <h2 className="subhead">Alerts</h2>
              <p className="font-mono text-[0.6875rem] text-ink-faint">
                full-share alert {(alertsData.fullSharePolicy.alertAt * 100).toFixed(0)}% ·
                hard cap {(alertsData.fullSharePolicy.hardCap * 100).toFixed(0)}%
              </p>
            </div>

            {alertsData.alerts.length === 0 ? (
              <p className="mt-5 flex items-center gap-2 text-[0.875rem] text-ink-mute">
                <span className="dot text-ok" />
                Nothing outside margin or fair-use lines.
              </p>
            ) : (
              <ul className="mt-5 space-y-px">
                {alertsData.alerts.map((al) => {
                  const red = al.severity === "red";
                  return (
                    <li
                      key={al.id}
                      className={`border-l-2 py-3.5 pl-4 ${
                        red
                          ? "border-danger bg-danger-soft"
                          : "border-accent bg-accent-soft"
                      }`}
                    >
                      <p className="flex flex-wrap items-center gap-3">
                        <span className={red ? "tag tag-danger" : "tag tag-warn"}>
                          <span className="dot" />
                          {al.severity === "red" ? "Critical" : "Watch"}
                        </span>
                        <span className="text-[0.875rem] font-medium text-ink">
                          {al.title}
                        </span>
                      </p>
                      <p className="mt-2 text-[0.8125rem] leading-relaxed text-ink-soft">
                        {al.detail}
                      </p>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          {/* Cohort P&L */}
          <div>
            <div className="flex flex-wrap items-baseline justify-between gap-4 border-t-2 border-ink pt-5">
              <h2 className="subhead">
                Cohort P&amp;L · {alertsData.cohortPnl.month}
              </h2>
              <p className="font-mono text-[0.6875rem] text-ink-faint">
                go ≥30% · watch 15–30% · no-go &lt;15%
              </p>
            </div>

            <div className="mt-5 grid gap-px bg-rule sm:grid-cols-3 lg:grid-cols-6">
              <Stat label="Revenue" value={usd(alertsData.cohortPnl.revenueUsd)} />
              <Stat label="Token COGS" value={usd(alertsData.cohortPnl.cogsUsd)} />
              <Stat
                label="Provider fees"
                value={usd(alertsData.cohortPnl.providerFeesUsd)}
              />
              <Stat
                label="Margin"
                value={usd(alertsData.cohortPnl.marginUsd)}
                tone={alertsData.cohortPnl.marginUsd >= 0 ? "ok" : "danger"}
              />
              <Stat
                label="Frontier turns"
                value={`${alertsData.cohortPnl.frontierTurns}`}
              />
              <Stat label="Active users" value={`${alertsData.cohortPnl.activeUsers}`} />
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-4">
              {alertsData.cohortPnl.verdict === "go" && (
                <span className="tag tag-ok">
                  <span className="dot" />
                  Go
                </span>
              )}
              {alertsData.cohortPnl.verdict === "watch" && (
                <span className="tag tag-warn">
                  <span className="dot" />
                  Watch
                </span>
              )}
              {alertsData.cohortPnl.verdict === "no-go" && (
                <span className="tag tag-danger">
                  <span className="dot" />
                  No-go
                </span>
              )}
              {alertsData.cohortPnl.verdict === "no-revenue-yet" && (
                <span className="tag">No revenue yet</span>
              )}
              <p className="text-[0.8125rem] text-ink-mute">
                Users&apos; equivalent-API spend{" "}
                <span className="num font-mono text-ink">
                  {usd(alertsData.cohortPnl.equivApiUsd)}
                </span>{" "}
                · infra share rows land in provider_monthly
              </p>
            </div>
          </div>

          {/* Shadow margin */}
          <div>
            <div className="flex flex-wrap items-baseline justify-between gap-4 border-t-2 border-ink pt-5">
              <h2 className="subhead">
                Core-only shadow margin · {alertsData.shadowMargin.window}
              </h2>
              <p className="max-w-md font-mono text-[0.6875rem] leading-relaxed text-ink-faint">
                {alertsData.shadowMargin.note}
              </p>
            </div>

            <div className="mt-5 grid gap-px bg-rule sm:grid-cols-2 lg:grid-cols-4">
              <Stat
                label="Core-only COGS"
                value={usd(alertsData.shadowMargin.hyperOnlyCogsUsd)}
              />
              <Stat
                label="Bootstrap COGS, actual"
                value={usd(alertsData.shadowMargin.bootstrapCogsUsd)}
              />
              <Stat
                label="Week revenue"
                value={usd(alertsData.shadowMargin.weekRevenueUsd)}
              />
              <Stat
                label="Core-only margin"
                value={usd(alertsData.shadowMargin.marginUsd)}
                tone={alertsData.shadowMargin.marginUsd >= 0 ? "ok" : "danger"}
              />
            </div>
          </div>
        </section>
      )}

      {/* ══ Economics ═══════════════════════════════════════════ */}
      {tab === "economics" && providers && (
        <section className="mt-8">
          <div className="flex flex-wrap items-baseline justify-between gap-4 border-t-2 border-ink pt-5">
            <h2 className="subhead">Economics · {providers.month}</h2>
            <p className="font-mono text-[0.6875rem] text-ink-faint">
              equivalent-API spend {usd(providers.summary.equivUsd)} · provider
              fees {usd(providers.summary.providerFeesUsd)}
            </p>
          </div>

          <div className="mt-5 grid gap-px bg-rule sm:grid-cols-3">
            <Stat label="Revenue, month to date" value={usd(totalRevenue)} />
            <Stat label="Token COGS, ledger" value={usd(totalCogs)} />
            <Stat
              label="Gross margin"
              value={
                totalRevenue > 0
                  ? `${(((totalRevenue - totalCogs) / totalRevenue) * 100).toFixed(0)}%`
                  : "—"
              }
              tone={
                totalRevenue > 0 && totalRevenue - totalCogs > 0 ? "ok" : "plain"
              }
            />
          </div>

          <div className="mt-8 overflow-x-auto">
            <table className="w-full min-w-[46rem] border-collapse text-left">
              <thead>
                <tr className="border-b border-ink">
                  <Th>Provider</Th>
                  <Th>Class</Th>
                  <Th right>Requests</Th>
                  <Th right>Tokens</Th>
                  <Th right>Cache hit</Th>
                  <Th right>Metered</Th>
                  <Th right>Plan fee</Th>
                  <Th right>True burn</Th>
                </tr>
              </thead>
              <tbody>
                {providers.providers.map((p) => (
                  <tr key={p.provider} className="border-b border-rule-faint">
                    <th
                      scope="row"
                      className="px-3 py-3 text-left font-mono text-[0.75rem] font-normal capitalize text-ink"
                    >
                      {p.provider}
                    </th>
                    <td className="px-3 py-3">
                      <span
                        className={`tag ${p.class === "core" ? "tag-accent" : ""}`}
                      >
                        {p.class}
                      </span>
                    </td>
                    <td className="num px-3 py-3 text-right font-mono text-[0.75rem] text-ink-soft">
                      {p.requests}
                    </td>
                    <td className="num px-3 py-3 text-right font-mono text-[0.75rem] text-ink-soft">
                      {compactTokens(p.tokens)}
                    </td>
                    <td className="num px-3 py-3 text-right font-mono text-[0.75rem] text-ink-soft">
                      {p.cacheHitPct}%
                    </td>
                    <td className="num px-3 py-3 text-right font-mono text-[0.75rem] text-ink-soft">
                      {usd(p.meteredUsd)}
                    </td>
                    <td className="num px-3 py-3 text-right font-mono text-[0.75rem] text-ink-soft">
                      {usd(p.planFeeUsd)}
                    </td>
                    <td className="num px-3 py-3 text-right font-mono text-[0.75rem] font-medium text-ink">
                      {usd(p.trueBurnUsd)}
                    </td>
                  </tr>
                ))}
                {providers.providers.length === 0 && (
                  <tr>
                    <td colSpan={8} className="px-3 py-8 text-center text-[0.875rem] text-ink-mute">
                      No ledger rows this month.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          <p className="measure mt-4 text-[0.75rem] leading-relaxed text-ink-faint">
            Plan-fee columns come from manual provider_monthly rows, added as
            invoices arrive. Per-request cost is zero in the ledger for flat
            plans — they amortise here instead.
          </p>
        </section>
      )}

      {/* ══ Growth ══════════════════════════════════════════════ */}
      {tab === "growth" && (
        <section className="mt-8 max-w-lg">
          <div className="border-t-2 border-ink pt-5">
            <h2 className="subhead">Signup gate</h2>
            <p className="measure mt-4 text-[0.875rem] leading-relaxed text-ink-soft">
              Closing the gate switches the login page to waitlist capture. The
              cap closes signups automatically once the cohort fills.
            </p>
          </div>

          <div className="mt-6 flex items-center justify-between gap-6 border-t border-rule py-4">
            <div>
              <p className="label text-ink-faint">Signups</p>
              <p className="mt-2.5 flex items-center gap-2 text-[0.875rem] text-ink">
                <span
                  className={`dot ${gate.signup_enabled === "false" ? "text-danger" : "text-ok"}`}
                />
                {gate.signup_enabled === "false" ? "Closed" : "Open"}
              </p>
            </div>
            <button
              type="button"
              onClick={() =>
                call("/api/admin/settings", {
                  signupEnabled: gate.signup_enabled !== "false",
                })
              }
              disabled={busy}
              role="switch"
              aria-checked={gate.signup_enabled !== "false"}
              aria-label="Signups open"
              className={`relative h-6 w-11 shrink-0 rounded-sm border transition-colors disabled:opacity-50 ${
                gate.signup_enabled === "false"
                  ? "border-rule-strong bg-fill"
                  : "border-accent bg-accent"
              }`}
            >
              <span
                aria-hidden
                className={`absolute top-[3px] h-4 w-4 rounded-xs bg-panel transition-all ${
                  gate.signup_enabled === "false" ? "left-[3px]" : "left-[25px]"
                }`}
              />
            </button>
          </div>

          <div className="border-t border-rule py-4">
            <label htmlFor="cohort-cap" className="label text-ink-faint">
              Cohort cap
            </label>
            <div className="mt-3 flex gap-2">
              <input
                id="cohort-cap"
                type="number"
                min={1}
                value={gate.cohort_cap}
                onChange={(e) =>
                  setGate((g) => ({ ...g, cohort_cap: e.target.value }))
                }
                className="field num w-28 font-mono"
              />
              <button
                type="button"
                onClick={() =>
                  call("/api/admin/settings", {
                    cohortCap: Number(gate.cohort_cap),
                  })
                }
                disabled={busy}
                className="btn btn-outline"
              >
                Set
              </button>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-4 border-t border-rule py-4">
            <p className="text-[0.875rem] text-ink-soft">
              Waitlist{" "}
              <span className="num font-mono text-ink">
                {gate.waitlistCount}
              </span>{" "}
              {gate.waitlistCount === 1 ? "address" : "addresses"}
            </p>
            <a href="/api/admin/waitlist" className="btn btn-outline btn-sm">
              Export CSV
            </a>
          </div>

          {msg && (
            <p role="alert" className="mt-3 text-[0.8125rem] text-danger">
              {msg}
            </p>
          )}
        </section>
      )}

      {/* ══ Coupons ═════════════════════════════════════════════ */}
      {tab === "coupons" && (
        <section className="mt-8 space-y-10">
          <div>
            <div className="border-t-2 border-ink pt-5">
              <h2 className="subhead">New coupon</h2>
            </div>
            <div className="mt-5 flex flex-wrap items-end gap-x-5 gap-y-4">
              <div className="w-48">
                <label htmlFor="coupon-code" className="label block text-ink-faint">
                  Code
                </label>
                <input
                  id="coupon-code"
                  value={newCode.code}
                  onChange={(e) =>
                    setNewCode((c) => ({ ...c, code: e.target.value }))
                  }
                  placeholder="auto"
                  className="field mt-3 font-mono uppercase"
                />
              </div>
              <div className="w-28">
                <label htmlFor="coupon-pct" className="label block text-ink-faint">
                  Discount %
                </label>
                <input
                  id="coupon-pct"
                  type="number"
                  min={1}
                  max={100}
                  value={newCode.discountPct}
                  onChange={(e) =>
                    setNewCode((c) => ({
                      ...c,
                      discountPct: Number(e.target.value),
                    }))
                  }
                  className="field num mt-3 font-mono"
                />
              </div>
              <div className="w-32">
                <label htmlFor="coupon-limit" className="label block text-ink-faint">
                  Redemptions
                </label>
                <input
                  id="coupon-limit"
                  type="number"
                  min={1}
                  value={newCode.usageLimit}
                  onChange={(e) =>
                    setNewCode((c) => ({
                      ...c,
                      usageLimit: Number(e.target.value),
                    }))
                  }
                  className="field num mt-3 font-mono"
                />
              </div>
              <button
                type="button"
                onClick={() => call("/api/admin/coupons", newCode)}
                disabled={busy}
                className="btn btn-primary"
              >
                Create coupon
              </button>
              {msg && (
                <p role="alert" className="text-[0.8125rem] text-danger">
                  {msg}
                </p>
              )}
            </div>
          </div>

          <div>
            <div className="flex flex-wrap items-baseline justify-between gap-4 border-t-2 border-ink pt-5">
              <h2 className="subhead">Issued coupons</h2>
              <p className="font-mono text-[0.6875rem] text-ink-faint">
                {coupons.length} {coupons.length === 1 ? "code" : "codes"}
              </p>
            </div>
            <div className="mt-5 overflow-x-auto">
              <table className="w-full min-w-[44rem] border-collapse text-left">
                <thead>
                  <tr className="border-b border-ink">
                    <Th>Code</Th>
                    <Th right>Off</Th>
                    <Th right>Redeemed</Th>
                    <Th right>Per user</Th>
                    <Th>Plans</Th>
                    <Th>Expires</Th>
                    <Th>State</Th>
                    <Th>{""}</Th>
                  </tr>
                </thead>
                <tbody>
                  {coupons.map((c) => (
                    <tr key={c.code} className="border-b border-rule-faint">
                      <th
                        scope="row"
                        className="px-3 py-3 text-left font-mono text-[0.75rem] font-normal text-ink"
                      >
                        {c.code}
                      </th>
                      <td className="num px-3 py-3 text-right font-mono text-[0.75rem] text-ink-soft">
                        {c.discountPct}%
                      </td>
                      <td className="num px-3 py-3 text-right font-mono text-[0.75rem] text-ink-soft">
                        {c.redeemedCount}/{c.usageLimit}
                      </td>
                      <td className="num px-3 py-3 text-right font-mono text-[0.75rem] text-ink-soft">
                        {c.perUserLimit}
                      </td>
                      <td className="px-3 py-3 font-mono text-[0.75rem] text-ink-soft">
                        {c.plans}
                      </td>
                      <td className="num whitespace-nowrap px-3 py-3 font-mono text-[0.75rem] text-ink-mute">
                        {c.validUntil
                          ? new Date(c.validUntil).toLocaleDateString("en-US", {
                              month: "short",
                              day: "numeric",
                              year: "numeric",
                            })
                          : "never"}
                      </td>
                      <td className="px-3 py-3">
                        {c.active ? (
                          <span className="tag tag-ok">
                            <span className="dot" />
                            Live
                          </span>
                        ) : (
                          <span className="tag">Off</span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-right">
                        <button
                          type="button"
                          onClick={() =>
                            call(
                              "/api/admin/coupons",
                              { code: c.code, active: !c.active },
                              "PATCH",
                            )
                          }
                          className="font-mono text-[0.6875rem] text-ink-mute transition-colors hover:text-ink"
                        >
                          {c.active ? "disable" : "enable"}
                        </button>
                      </td>
                    </tr>
                  ))}
                  {coupons.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-3 py-8 text-center text-[0.875rem] text-ink-mute">
                        No coupons issued yet.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>
      )}

      {/* ══ Fleet / Plans / Routing ═════════════════════════════ */}
      {tab === "routing" && (
        <div className="mt-8">
          <SkillCards />
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

      <p className="mt-12 border-t border-rule pt-5 font-mono text-[0.6875rem] text-ink-faint">
        Admin surfaces read the same ledger the gateway writes.{" "}
        <Link href="/dashboard" className="prose-link">
          Your own dashboard
        </Link>{" "}
        shows the user-facing view of the same numbers.
      </p>
    </main>
  );
}
