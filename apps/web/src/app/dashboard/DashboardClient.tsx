"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import type { QuotaSnapshot, DayUsage } from "@/lib/quota-snapshot";

interface KeyRow {
  id: string;
  keyPrefix: string;
  active: boolean;
  createdAt: string;
}

interface Props {
  user: { name: string; email: string; image: string | null };
  initialSnapshot: QuotaSnapshot | null;
  initialUsage: DayUsage[];
  initialKeys: KeyRow[];
  initialOptOut: boolean;
}

const fmtM = (n: number) => (n >= 1e6 ? `${(n / 1e6).toFixed(2)}M` : n >= 1e3 ? `${(n / 1e3).toFixed(1)}K` : `${n}`);

function QuotaCard({ label, used, cap, unit }: { label: string; used: number; cap: number; unit: "tokens" | "requests" }) {
  const capAbs = unit === "tokens" ? cap * 1e6 : cap;
  const pct = capAbs > 0 ? Math.min(100, (used / capAbs) * 100) : 0;
  const fmt = (n: number) => (unit === "tokens" ? fmtM(n) : `${n.toLocaleString("en-US")}`);
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5">
      <div className="flex items-baseline justify-between">
        <h3 className="text-sm font-medium text-zinc-400">{label}</h3>
        <span className={`text-xs ${pct >= 90 ? "text-red-400" : pct >= 70 ? "text-amber-400" : "text-zinc-500"}`}>
          {capAbs > 0 ? `${pct.toFixed(0)}%` : "—"}
        </span>
      </div>
      <p className="mt-2 text-2xl font-semibold tabular-nums">
        {fmt(used)} <span className="text-sm font-normal text-zinc-500">/ {capAbs > 0 ? fmt(capAbs) : "unlimited"}</span>
      </p>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-zinc-800">
        <div
          className={`h-full rounded-full ${pct >= 90 ? "bg-red-500" : pct >= 70 ? "bg-amber-500" : "bg-emerald-500"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export default function DashboardClient({ user, initialSnapshot, initialUsage, initialKeys, initialOptOut }: Props) {
  const router = useRouter();
  const [snapshot] = useState(initialSnapshot);
  const [usage] = useState(initialUsage);
  const [keys, setKeys] = useState<KeyRow[]>(initialKeys);
  const [freshKey, setFreshKey] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [issuing, setIssuing] = useState(false);
  const [optOut, setOptOut] = useState(initialOptOut);
  const [optBusy, setOptBusy] = useState(false);

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
    if (res.ok) setKeys((ks) => ks.map((k) => (k.id === id ? { ...k, active: false } : k)));
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

  const maxReq = Math.max(1, ...usage.map((u) => u.requests));
  const totalSaved = usage.reduce((s, u) => s + u.savedUsd, 0);

  return (
    <main className="mx-auto max-w-5xl px-6 py-12">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          {user.image ? (
            <img src={user.image} alt="" className="h-10 w-10 rounded-full border border-zinc-700" />
          ) : (
            <div className="h-10 w-10 rounded-full bg-zinc-800" />
          )}
          <div>
            <h1 className="text-xl font-semibold">Hey {user.name}</h1>
            <p className="text-sm text-zinc-500">{user.email}</p>
          </div>
          {snapshot && (
            <span className="ml-2 rounded-full border border-amber-500/40 bg-amber-500/10 px-3 py-1 text-xs font-medium uppercase tracking-wide text-amber-400">
              {snapshot.plan}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 text-sm">
          {snapshot?.subRenews && (
            <span className="text-zinc-500">renews {new Date(snapshot.subRenews).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
          )}
          <button onClick={signOut} className="text-zinc-400 hover:text-zinc-100 transition-colors">
            Sign out
          </button>
        </div>
      </div>

      {snapshot && (
        <section className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <QuotaCard label="Frontier input / month" used={snapshot.frontierInUsed} cap={snapshot.limits.frontierInputM} unit="tokens" />
          <QuotaCard label="Frontier output / month" used={snapshot.frontierOutUsed} cap={snapshot.limits.frontierOutputM} unit="tokens" />
          <QuotaCard label="theta · last 5 h" used={snapshot.thetaLast5h} cap={snapshot.limits.thetaPer5h} unit="requests" />
          <QuotaCard label="theta · month" used={snapshot.thetaThisMonth} cap={snapshot.limits.thetaMonthly} unit="requests" />
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5">
            <h3 className="text-sm font-medium text-zinc-400">Plan days left</h3>
            <p className="mt-2 text-2xl font-semibold tabular-nums">
              {snapshot.subRenews
                ? Math.max(0, Math.ceil((new Date(snapshot.subRenews).getTime() - Date.now()) / 86_400_000))
                : "—"}
            </p>
            <p className="mt-3 text-xs text-zinc-600">{snapshot.subRenews ? "current cycle" : "no active subscription"}</p>
          </div>
        </section>
      )}
      {snapshot && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-zinc-800 bg-zinc-900/60 px-5 py-4">
          <p className="text-sm text-zinc-300">
            This month at direct API list rates you would have paid{" "}
            <span className="font-semibold text-zinc-100">${snapshot.equivCostMonthUsd.toFixed(2)}</span>
            {snapshot.plan !== "free" && (
              <>
                {" "}
                — on <span className="capitalize font-medium text-amber-400">{snapshot.plan}</span>:{" "}
                <span className="font-semibold">${snapshot.plan === "basic" ? 15 : 30}/mo</span>
              </>
            )}
          </p>
          <span className="text-xs text-zinc-600">frontier at full-model list rates · theta at $0.20/$0.04/$0.40 per 1M</span>
        </div>
      )}

      <section className="mt-10 grid gap-6 lg:grid-cols-2">
        {/* API keys */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold">API keys</h2>
            <button
              onClick={issueKey}
              disabled={issuing}
              className="rounded-md bg-amber-500 px-3 py-1.5 text-sm font-medium text-zinc-950 hover:bg-amber-400 disabled:opacity-50 transition-colors"
            >
              {issuing ? "Issuing…" : "New key"}
            </button>
          </div>

          {freshKey && (
            <div className="mt-4 rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-4">
              <p className="text-xs text-emerald-300">Copy now — this is the only time it will be shown.</p>
              <div className="mt-2 flex items-center gap-2">
                <code className="flex-1 truncate rounded bg-zinc-950 px-2 py-1.5 text-xs text-zinc-200">{freshKey}</code>
                <button onClick={copyKey} className="shrink-0 rounded bg-zinc-800 px-2.5 py-1.5 text-xs hover:bg-zinc-700 transition-colors">
                  {copied ? "Copied ✓" : "Copy"}
                </button>
              </div>
            </div>
          )}

          <ul className="mt-4 space-y-2">
            {keys.length === 0 && <li className="text-sm text-zinc-500">No keys yet — issue one to start calling the gateway.</li>}
            {keys.map((k) => (
              <li key={k.id} className="flex items-center justify-between rounded-lg border border-zinc-800 px-3 py-2 text-sm">
                <span className="font-mono text-zinc-300">
                  {k.keyPrefix}…
                  {!k.active && <span className="ml-2 text-xs text-red-400">revoked</span>}
                </span>
                <span className="flex items-center gap-3">
                  <span className="text-xs text-zinc-600">{new Date(k.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>
                  {k.active && (
                    <button onClick={() => revokeKey(k.id)} className="text-xs text-zinc-500 hover:text-red-400 transition-colors">
                      Revoke
                    </button>
                  )}
                </span>
              </li>
            ))}
          </ul>

          <p className="mt-4 text-xs text-zinc-600">
            Point your agent at <code className="text-zinc-400">POST /v1/messages</code> (Anthropic-style) or{" "}
            <code className="text-zinc-400">/v1/chat/completions</code> with <code className="text-zinc-400">Authorization: Bearer &lt;key&gt;</code>. Endpoint
            names: <code className="text-zinc-400">glm-5.3 · qwen-3.8 · theta</code> — the router picks the variant. Details:{" "}
            <a href="/docs" className="text-amber-400/80 underline hover:text-amber-300">docs</a>
          </p>
        </div>

        {/* Usage */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5">
          <div className="flex items-baseline justify-between">
            <h2 className="font-semibold">Last 7 days</h2>
            {totalSaved > 0 && <span className="text-sm text-emerald-400">${totalSaved.toFixed(2)} saved vs API rates</span>}
          </div>
          {usage.length === 0 ? (
            <p className="mt-6 text-sm text-zinc-500">No requests yet. Your agent traffic will appear here.</p>
          ) : (
            <div className="mt-6 flex h-32 items-end gap-2">
              {usage.map((u) => (
                <div key={u.date} className="flex flex-1 flex-col items-center gap-1" title={`${u.requests} req · ${fmtM(u.tokens)} tok`}>
                  <div className="w-full rounded-t bg-amber-500/70" style={{ height: `${Math.max(4, (u.requests / maxReq) * 100)}%` }} />
                  <span className="text-[10px] text-zinc-600">{u.date.slice(5)}</span>
                </div>
              ))}
            </div>
          )}

          <div className="mt-6 border-t border-zinc-800 pt-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-medium">Train on my traffic</h3>
                <p className="text-xs text-zinc-500">Help build domain-specific small models. Off = zero retention on your requests.</p>
              </div>
              <button
                onClick={toggleOptOut}
                disabled={optBusy}
                role="switch"
                aria-checked={!optOut}
                className={`relative h-6 w-11 rounded-full transition-colors ${optOut ? "bg-zinc-700" : "bg-emerald-500"}`}
              >
                <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-zinc-100 transition-all ${optOut ? "left-0.5" : "left-[22px]"}`} />
              </button>
            </div>
            <p className="mt-2 text-xs text-zinc-600">{optOut ? "Opted out — we never store your prompts." : "Opted in — traffic may train our models."}</p>
          </div>
        </div>
      </section>

      {snapshot && (
        <p className="mt-8 text-xs text-zinc-600">
          Member since {new Date(snapshot.memberSince).toLocaleDateString("en-US", { month: "long", year: "numeric" })} · cohort #{snapshot.cohort}
        </p>
      )}
    </main>
  );
}