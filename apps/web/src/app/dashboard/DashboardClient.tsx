"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import type { QuotaSnapshot, DayUsage } from "@/lib/quota-snapshot";
import {
  PROFILE_FLAGS,
  VALID_FLAGS,
  type RoutingProfileName,
} from "@bhaskara/shared/skill";
import { compactTokens, tokens as fmtTokens, usd } from "@/lib/format";
import { PLANS, type PlanId } from "@bhaskara/shared/pricing";

interface KeyRow {
  id: string;
  keyPrefix: string;
  active: boolean;
  flags?: string | null;
  createdAt: string;
}

const FLAG_HINTS: Record<string, string> = {
  compress: "live-zone compression",
  compact: "200K compaction",
  shadow: "shadow audit",
  docs: "docs lookup",
  skill: "capability-aware routing",
};

const KEY_FLAGS = VALID_FLAGS.map((name) => ({
  name,
  hint: FLAG_HINTS[name] ?? "",
}));

const PROFILE_HINTS: Record<RoutingProfileName, string> = {
  eco: "cheapest model that can carry the turn",
  balanced: "quality where it matters, cost everywhere else",
  pro: "strongest model whenever the turn looks hard",
};

const parseFlags = (csv: string | null | undefined): Record<string, true> => {
  const out: Record<string, true> = {};
  for (const s of (csv ?? "").split(",")) {
    const f = s.trim().toLowerCase();
    if (f) out[f] = true;
  }
  return out;
};

interface Props {
  user: { name: string; email: string; image: string | null };
  initialSnapshot: QuotaSnapshot | null;
  initialUsage: DayUsage[];
  initialKeys: KeyRow[];
  initialOptOut: boolean;
}

/**
 * A quota meter. State is carried by the numeric readout and a label,
 * not by colour alone; the bar is a rule with a filled portion.
 */
function Meter({
  label,
  detail,
  used,
  cap,
  unit,
  /** Extra line shown under the bar, when a meter needs a caveat. */
  note,
}: {
  label: string;
  detail: string;
  used: number;
  cap: number | null;
  unit: "tokens" | "requests";
  note?: string;
}) {
  // null is a real value here: it means the plan has no cap on this window, and
  // the throttle replaces it. Rendering it as 0 would read as "exhausted".
  const unlimited = cap === null;
  const capAbs = unlimited ? 0 : unit === "tokens" ? (cap as number) * 1e6 : (cap as number);
  const pct = capAbs > 0 ? Math.min(100, (used / capAbs) * 100) : 0;
  const shown = (n: number) =>
    unit === "tokens" ? compactTokens(n) : n.toLocaleString("en-US");

  const state =
    unlimited
      ? { label: "unlimited", tone: "text-ink-faint", bar: "bg-ink-faint" }
      : capAbs === 0
      ? { label: "unlimited", tone: "text-ink-faint", bar: "bg-ink-faint" }
      : pct >= 90
        ? { label: "at limit", tone: "text-danger", bar: "bg-danger" }
        : pct >= 70
          ? { label: "near limit", tone: "text-warn", bar: "bg-warn" }
          : { label: "within quota", tone: "text-ink-mute", bar: "bg-ink" };

  return (
    <div className="border-t-2 border-ink bg-panel px-4 py-4">
      <p className="label text-ink-faint">{label}</p>
      <p className="num mt-3 font-mono text-[1.375rem] font-medium leading-none text-ink">
        {shown(used)}
      </p>
      <p className="num mt-2 font-mono text-[0.6875rem] text-ink-mute">
        {unlimited ? "no cap" : `of ${shown(capAbs)}`} · {detail}
      </p>
      {note && (
        <p className="mt-2 text-[0.6875rem] leading-snug text-ink-faint">{note}</p>
      )}
      <div
        role="progressbar"
        aria-valuenow={Math.round(pct)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={`${label} used`}
        className="mt-4 h-[3px] w-full bg-fill-strong"
      >
        <div
          className={`h-full ${state.bar}`}
          style={{ width: `${capAbs > 0 ? Math.max(pct, pct > 0 ? 1.5 : 0) : 0}%` }}
        />
      </div>
      <p className={`mt-2.5 font-mono text-[0.6875rem] ${state.tone}`}>
        {capAbs > 0 ? `${pct.toFixed(0)}% · ${state.label}` : state.label}
      </p>
    </div>
  );
}

function Switch({
  on,
  busy,
  onToggle,
  label,
}: {
  on: boolean;
  busy: boolean;
  onToggle: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={busy}
      role="switch"
      aria-checked={on}
      aria-label={label}
      className={`relative h-6 w-11 shrink-0 rounded-sm border transition-colors disabled:opacity-50 ${
        on ? "border-accent bg-accent" : "border-rule-strong bg-fill"
      }`}
    >
      <span
        aria-hidden
        className={`absolute top-[3px] h-4 w-4 rounded-xs bg-panel transition-all ${
          on ? "left-[25px]" : "left-[3px]"
        }`}
      />
    </button>
  );
}

export default function DashboardClient({
  user,
  initialSnapshot,
  initialUsage,
  initialKeys,
  initialOptOut,
}: Props) {
  const router = useRouter();
  const [snapshot] = useState(initialSnapshot);
  const [usage] = useState(initialUsage);
  const [keys, setKeys] = useState<KeyRow[]>(initialKeys);
  const [freshKey, setFreshKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [issuing, setIssuing] = useState(false);
  const [optOut, setOptOut] = useState(initialOptOut);
  const [optBusy, setOptBusy] = useState(false);
  const [flagBusy, setFlagBusy] = useState("");
  const [flagError, setFlagError] = useState("");

  useEffect(() => {
    if (initialKeys.some((k) => k.flags !== undefined)) return;
    fetch("/api/keys")
      .then((r) => r.json())
      .then((d: { keys?: KeyRow[] }) => {
        if (d.keys) setKeys(d.keys);
      })
      .catch(() => {});
  }, [initialKeys]);

  /**
   * Persist a flag change. Profiles are mutually exclusive: selecting one
   * replaces any other, selecting the active one clears it back to balanced.
   * The server re-validates and returns the canonical CSV, which is what we
   * store — never the string we optimistically built here.
   */
  const toggleFlag = async (id: string, name: string) => {
    const key = keys.find((k) => k.id === id);
    if (!key || !key.active) return;
    const on = parseFlags(key.flags);
    const isProfile = (PROFILE_FLAGS as readonly string[]).includes(name);

    const next = KEY_FLAGS.map((f) => f.name)
      .filter((f) => {
        const isProfileFlag = (PROFILE_FLAGS as readonly string[]).includes(f);
        if (f === name) return !on[f]; // toggling this one
        if (isProfile && isProfileFlag) return false; // profiles replace each other
        return on[f]; // everything else keeps its state
      })
      .join(",");

    setFlagBusy(`${id}:${name}`);
    try {
      const res = await fetch(`/api/keys/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ flags: next }),
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        setFlagError(d.error ?? `Could not save (${res.status})`);
        return;
      }
      const data = (await res.json()) as { flags: string | null };
      setFlagError("");
      setKeys((ks) =>
        ks.map((k) => (k.id === id ? { ...k, flags: data.flags } : k)),
      );
    } finally {
      setFlagBusy("");
    }
  };

  const issueKey = async () => {
    setIssuing(true);
    try {
      const res = await fetch("/api/keys", { method: "POST" });
      if (!res.ok) return;
      const data = (await res.json()) as { key: string };
      setFreshKey(data.key);
      const list = await fetch("/api/keys");
      const ld = (await list.json()) as { keys: KeyRow[] };
      setKeys(ld.keys ?? []);
    } finally {
      setIssuing(false);
    }
  };

  const copyKey = async () => {
    if (!freshKey) return;
    await navigator.clipboard.writeText(freshKey);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const revokeKey = async (id: string) => {
    const res = await fetch(`/api/keys/${id}`, { method: "DELETE" });
    if (res.ok)
      setKeys((ks) => ks.map((k) => (k.id === id ? { ...k, active: false } : k)));
  };

  const toggleOptOut = async () => {
    setOptBusy(true);
    try {
      const res = await fetch("/api/settings/training", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ optOut: !optOut }),
      });
      if (res.ok) setOptOut((v) => !v);
    } finally {
      setOptBusy(false);
    }
  };

  const signOut = async () => {
    await authClient.signOut();
    router.push("/");
  };

  const activeKeys = keys.filter((k) => k.active);
  const maxReq = Math.max(1, ...usage.map((u) => u.requests));
  const totalSaved = usage.reduce((s, u) => s + u.savedUsd, 0);
  const periodStart =
    usage.length > 0
      ? new Date(usage[0].date).toLocaleDateString("en-US", {
          month: "short",
          day: "numeric",
        })
      : null;

  return (
    <main className="mx-auto max-w-6xl px-5 py-10 sm:px-6">
      {/* ── Header ────────────────────────────────────────────── */}
      <header className="flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
        <div className="flex items-center gap-3.5">
          {user.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={user.image}
              alt=""
              className="h-10 w-10 rounded-sm border border-rule object-cover"
            />
          ) : (
            <span
              aria-hidden
              className="flex h-10 w-10 items-center justify-center rounded-sm border border-rule bg-sunken font-mono text-[0.8125rem] text-ink-mute"
            >
              {(user.name || user.email).slice(0, 1).toUpperCase()}
            </span>
          )}
          <div>
            <h1 className="subhead">{user.name}</h1>
            <p className="mt-1 font-mono text-[0.75rem] text-ink-mute">
              {user.email}
            </p>
          </div>
          {snapshot && (
            <span className="tag tag-accent ml-1">{snapshot.plan}</span>
          )}
        </div>

        <div className="flex items-center gap-4">
          {snapshot?.subRenews && (
            <span className="font-mono text-[0.75rem] text-ink-mute">
              renews{" "}
              {new Date(snapshot.subRenews).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
              })}
            </span>
          )}
          <button type="button" onClick={signOut} className="btn btn-quiet btn-sm">
            Sign out
          </button>
        </div>
      </header>

      {/* ── Quotas ────────────────────────────────────────────── */}
      {snapshot ? (
        <>
          <section aria-labelledby="quotas" className="mt-10">
            <div className="flex flex-wrap items-baseline justify-between gap-4">
              <h2 id="quotas" className="label text-ink-faint">
                Quotas this cycle
              </h2>
              <p className="font-mono text-[0.6875rem] text-ink-faint">
                resets 00:00 UTC on the 1st · theta windows roll continuously
              </p>
            </div>
            <div className="mt-4 grid gap-px bg-rule sm:grid-cols-2 lg:grid-cols-4">
              <Meter
                label="theta requests"
                detail="rolling 5h"
                used={snapshot.thetaThisWindow}
                cap={snapshot.limits.thetaPer5h}
                unit="requests"
                note={
                  snapshot.unlimitedTheta
                    ? `One request at a time. ${snapshot.limits.thetaExtraMonthly.toLocaleString("en-US")} extra requests/month unlock up to 5.`
                    : undefined
                }
              />
              <Meter
                label="glm-5.3 requests"
                detail="rolling 5h"
                used={snapshot.glmThisWindow}
                cap={snapshot.limits.glmPer5h}
                unit="requests"
              />
              <Meter
                label="glm-5.3 tokens"
                detail="rolling 5h"
                used={snapshot.glmTokensThisWindow}
                cap={snapshot.limits.glmTokensPer5h}
                unit="tokens"
                note="A single call can carry a million tokens, so requests alone would not bound the window."
              />
              <div className="border-t-2 border-ink bg-panel px-4 py-4">
                <p className="label text-ink-faint">Plan days left</p>
                <p className="num mt-3 font-mono text-[1.375rem] font-medium leading-none text-ink">
                  {snapshot.daysLeft ?? "—"}
                </p>
                <p className="mt-2 font-mono text-[0.6875rem] text-ink-mute">
                  {snapshot.subRenews ? "current cycle" : "no subscription"}
                </p>
              </div>
            </div>
          </section>

          {/* ── The value story ─────────────────────────────────── */}
          <section className="machine mt-8 overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-x-8 gap-y-4 px-5 py-4">
              <div>
                <p className="label text-machine-mute">
                  This cycle at direct list rates
                </p>
                <p className="num mt-3 font-mono text-[1.75rem] font-medium leading-none text-machine-ink">
                  {usd(snapshot.equivCostMonthUsd)}
                </p>
              </div>
              {snapshot.plan !== "trial" && (
                <div className="text-right">
                  <p className="label text-machine-mute">
                    You paid
                  </p>
                  <p className="num mt-3 font-mono text-[1.75rem] font-medium leading-none text-m-ok">
                    {usd(PLANS[snapshot.plan as PlanId]?.priceUsd ?? 0)}
                  </p>
                </div>
              )}
            </div>
            <div className="machine-row flex flex-wrap items-center justify-between gap-x-6 gap-y-2 px-5 py-3">
              <span className="font-mono text-[0.6875rem] text-machine-mute">
                glm-5.3 valued at full-model list rates, no cache discount
              </span>
              <span className="font-mono text-[0.6875rem] text-machine-mute">
                theta at its display rates
              </span>
            </div>
          </section>
        </>
      ) : (
        <p className="panel mt-10 p-6 text-[0.9375rem] text-ink-mute">
          No quota record yet for this account.
        </p>
      )}

      {/* ── Keys + usage ──────────────────────────────────────── */}
      <section className="mt-12 grid gap-10 lg:grid-cols-12">
        {/* API keys */}
        <div className="min-w-0 lg:col-span-7">
          <div className="flex items-baseline justify-between gap-4 border-t-2 border-ink pt-5">
            <h2 className="subhead">API keys</h2>
            <button
              type="button"
              onClick={issueKey}
              disabled={issuing}
              className="btn btn-primary btn-sm"
            >
              {issuing ? "Issuing…" : "New key"}
            </button>
          </div>

          {freshKey && (
            <div className="mt-5 border border-ok bg-ok-soft p-4">
              <p className="flex items-center gap-2 text-[0.8125rem] font-medium text-ok">
                <span className="dot" />
                Copy this now. It is not shown again.
              </p>
              <div className="mt-3 flex items-center gap-2">
                <code className="min-w-0 flex-1 truncate rounded-xs border border-rule bg-panel px-2.5 py-2 font-mono text-[0.75rem] text-ink">
                  {freshKey}
                </code>
                <button
                  type="button"
                  onClick={copyKey}
                  className="btn btn-outline btn-sm"
                >
                  {copied ? "Copied" : "Copy"}
                </button>
              </div>
            </div>
          )}

          {keys.length === 0 ? (
            <p className="measure mt-5 text-[0.9375rem] text-ink-mute">
              No keys yet. Issue one to point an agent at the gateway.
            </p>
          ) : (
            <ul className="mt-5">
              {keys.map((k) => (
                <li
                  key={k.id}
                  className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-rule py-3"
                >
                  <span className="flex items-center gap-3">
                    <code className="font-mono text-[0.8125rem] text-ink">
                      {k.keyPrefix}…
                    </code>
                    {k.active ? (
                      <span className="tag tag-ok">
                        <span className="dot" />
                        Active
                      </span>
                    ) : (
                      <span className="tag">Revoked</span>
                    )}
                  </span>
                  <span className="flex items-center gap-4">
                    <span className="font-mono text-[0.6875rem] text-ink-faint">
                      {new Date(k.createdAt).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                      })}
                    </span>
                    {k.active && (
                      <button
                        type="button"
                        onClick={() => revokeKey(k.id)}
                        className="font-mono text-[0.6875rem] text-ink-mute transition-colors hover:text-danger"
                      >
                        revoke
                      </button>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-6 border-t border-rule-faint pt-4">
            <p className="text-[0.8125rem] leading-relaxed text-ink-mute">
              Point an agent at{" "}
              <code className="font-mono text-[0.75rem] text-ink">
                POST /v1/messages
              </code>{" "}
              or{" "}
              <code className="font-mono text-[0.75rem] text-ink">
                /v1/chat/completions
              </code>{" "}
              with{" "}
              <code className="font-mono text-[0.75rem] text-ink">
                Authorization: Bearer &lt;key&gt;
              </code>
              . Endpoint names:{" "}
              <code className="font-mono text-[0.75rem] text-ink">
                theta · glm-5.3
              </code>
              .{" "}
              <Link href="/docs#quickstart" className="prose-link">
                Quick start
              </Link>
            </p>
          </div>
        </div>

        {/* Usage + training */}
        <div className="min-w-0 lg:col-span-5">
          <div className="flex items-baseline justify-between gap-4 border-t-2 border-ink pt-5">
            <h2 className="subhead">Last 7 days</h2>
            {totalSaved > 0 && (
              <span className="num font-mono text-[0.75rem] text-ok">
                {usd(totalSaved)} saved
              </span>
            )}
          </div>

          {usage.length === 0 ? (
            <p className="measure mt-5 text-[0.9375rem] text-ink-mute">
              No requests yet. Agent traffic appears here as soon as a key is
              used.
            </p>
          ) : (
            <figure className="mt-6">
              <div className="flex h-28 items-end gap-1.5">
                {usage.map((u) => (
                  <div
                    key={u.date}
                    className="group flex h-full flex-1 flex-col justify-end"
                    title={`${u.date} · ${u.requests} requests · ${fmtTokens(u.tokens)} tokens`}
                  >
                    <div
                      className="w-full bg-accent transition-colors group-hover:bg-accent-deep"
                      style={{
                        height: `${Math.max(3, (u.requests / maxReq) * 100)}%`,
                      }}
                    />
                  </div>
                ))}
              </div>
              <div className="mt-2 flex gap-1.5 border-t border-rule pt-1.5">
                {usage.map((u) => (
                  <span
                    key={u.date}
                    className="num flex-1 text-center font-mono text-[0.625rem] text-ink-faint"
                  >
                    {u.date.slice(8)}
                  </span>
                ))}
              </div>
              <figcaption className="mt-3 font-mono text-[0.6875rem] text-ink-faint">
                requests per day{periodStart ? ` · from ${periodStart}` : ""}
              </figcaption>
            </figure>
          )}

          <div className="mt-8 border-t border-rule pt-5">
            <div className="flex items-start justify-between gap-6">
              <div>
                <h3 className="text-[0.9375rem] font-medium text-ink">
                  Train on my traffic
                </h3>
                <p className="mt-2 text-[0.8125rem] leading-relaxed text-ink-mute">
                  Off means requests are not stored for training at all. The
                  next request after switching is already excluded.
                </p>
              </div>
              <Switch
                on={!optOut}
                busy={optBusy}
                onToggle={toggleOptOut}
                label="Train on my traffic"
              />
            </div>
            <p className="mt-3 font-mono text-[0.6875rem] text-ink-faint">
              {optOut
                ? "opted out · nothing retained"
                : "opted in · traffic may train our models"}
            </p>
          </div>
        </div>
      </section>

      {/* ── Context engine flags ──────────────────────────────── */}
      {activeKeys.length > 0 && (
        <section className="mt-12">
          <div className="flex flex-wrap items-baseline justify-between gap-4 border-t-2 border-ink pt-5">
            <h2 className="subhead">Context-engine flags</h2>
            <p className="font-mono text-[0.6875rem] text-ink-faint">
              per-key defaults · request headers override
            </p>
          </div>

          <div className="mt-6 space-y-8">
            {activeKeys.map((k) => {
              const on = parseFlags(k.flags);
              return (
                <div key={k.id}>
                  <code className="font-mono text-[0.8125rem] text-ink">
                    {k.keyPrefix}…
                  </code>
                  <div className="mt-3 grid gap-px bg-rule sm:grid-cols-2 lg:grid-cols-4">
                    {KEY_FLAGS.map((f) => {
                      const enabled = !!on[f.name];
                      return (
                        <label
                          key={f.name}
                          className={`flex cursor-pointer items-start gap-3 bg-panel px-4 py-3.5 transition-colors hover:bg-sunken ${
                            flagBusy === `${k.id}:${f.name}`
                              ? "opacity-50"
                              : ""
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={enabled}
                            disabled={flagBusy === `${k.id}:${f.name}`}
                            onChange={() => toggleFlag(k.id, f.name)}
                            className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--color-accent)]"
                          />
                          <span className="min-w-0">
                            <span className="block font-mono text-[0.8125rem] text-ink">
                              {f.name}
                            </span>
                            <span className="mt-1 block text-[0.75rem] leading-snug text-ink-faint">
                              {f.hint}
                            </span>
                          </span>
                        </label>
                      );
                    })}
                  </div>

                  {/* Routing preference knob. Only meaningful with `skill` on;
                      shown alongside it because the two are one decision. */}
                  <div className="mt-5">
                    <div className="flex flex-wrap items-baseline justify-between gap-3">
                      <p className="label text-ink-faint">
                        Routing preference
                      </p>
                      <p className="font-mono text-[0.6875rem] text-ink-faint">
                        header <code className="text-ink-mute">x-bhaskara-r</code>{" "}
                        overrides per request
                      </p>
                    </div>
                    <div className="mt-3 grid gap-px bg-rule sm:grid-cols-3">
                      {PROFILE_FLAGS.map((p) => {
                        const enabled = !!on[p];
                        const active = enabled && !!on.skill;
                        return (
                          <button
                            key={p}
                            type="button"
                            aria-pressed={enabled}
                            disabled={flagBusy === `${k.id}:${p}`}
                            onClick={() => toggleFlag(k.id, p)}
                            className={`px-4 py-3.5 text-left transition-colors ${
                              active
                                ? "bg-accent-soft"
                                : "bg-panel hover:bg-sunken"
                            } ${flagBusy === `${k.id}:${p}` ? "opacity-50" : ""}`}
                          >
                            <span className="flex items-baseline gap-2">
                              <span className="font-mono text-[0.8125rem] text-ink">
                                {p}
                              </span>
                              {enabled && (
                                <span className="tag tag-accent">
                                  {on.skill ? "Active" : "Skill off"}
                                </span>
                              )}
                            </span>
                            <span className="mt-1 block text-[0.75rem] leading-snug text-ink-faint">
                              {PROFILE_HINTS[p]}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                    {!on.skill && (
                      <p className="mt-3 text-[0.75rem] leading-relaxed text-ink-faint">
                        The knob only applies when <code className="font-mono">skill</code>{" "}
                        is on for this key. Without it, routing uses the heuristic
                        tier gate as before.
                      </p>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          <p className="measure mt-5 text-[0.75rem] leading-relaxed text-ink-faint">
            These set per-key defaults for the context engine. Sending{" "}
            <code className="font-mono text-ink-mute">x-bhaskara-compress</code>,{" "}
            <code className="font-mono text-ink-mute">x-bhaskara-compact</code> or{" "}
            <code className="font-mono text-ink-mute">x-bhaskara-shadow</code> on
            a request overrides the stored value for that call only.
          </p>
          {flagError && (
            <p role="alert" className="mt-2 text-[0.75rem] text-danger">
              {flagError}
            </p>
          )}
        </section>
      )}

      {snapshot && (
        <p className="mt-12 border-t border-rule pt-5 font-mono text-[0.6875rem] text-ink-faint">
          member since{" "}
          {new Date(snapshot.memberSince).toLocaleDateString("en-US", {
            month: "long",
            year: "numeric",
          })}{" "}
          · cohort #{snapshot.cohort}
        </p>
      )}
    </main>
  );
}
