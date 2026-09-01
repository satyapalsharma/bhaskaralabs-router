"use client";

import { useState } from "react";
import { authClient } from "@/lib/auth-client";

export default function LoginPage() {
  const [waitlistEmail, setWaitlistEmail] = useState("");
  const [waitlisted, setWaitlisted] = useState(false);
  const [gateOpen, setGateOpen] = useState<boolean | null>(null);
  const [error, setError] = useState("");

  // Gate status from the API (checked on mount)
  if (gateOpen === null) {
    fetch("/api/gate")
      .then((r) => r.json())
      .then((d) => setGateOpen(d.open))
      .catch(() => setGateOpen(true));
  }

  const joinWaitlist = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const res = await fetch("/api/waitlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: waitlistEmail }),
    });
    if (res.ok) setWaitlisted(true);
    else setError("Couldn't join the waitlist — try again.");
  };

  return (
    <main className="mx-auto max-w-md px-6 py-24">
      <h1 className="text-3xl font-bold tracking-tight">Sign in</h1>
      <p className="mt-2 text-sm text-zinc-400">
        One click with GitHub. We only read your public profile and email.
      </p>

      {gateOpen === false ? (
        <div className="mt-8 rounded-xl border border-amber-500/40 bg-amber-500/10 p-6">
          <h2 className="font-semibold text-amber-400">We&apos;re at capacity</h2>
          <p className="mt-2 text-sm text-zinc-300">
            Our first cohort is full. We onboard in batches of 100 so every
            user gets stable, fast inference — join the waitlist and we&apos;ll
            email you when your cohort opens.
          </p>
          {waitlisted ? (
            <p className="mt-4 text-sm font-medium text-emerald-400">
              ✓ You&apos;re on the list. We&apos;ll be in touch.
            </p>
          ) : (
            <form onSubmit={joinWaitlist} className="mt-4 flex gap-2">
              <input
                type="email"
                required
                value={waitlistEmail}
                onChange={(e) => setWaitlistEmail(e.target.value)}
                placeholder="you@example.com"
                className="flex-1 rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm"
              />
              <button
                type="submit"
                className="rounded-md bg-amber-500 px-4 py-2 text-sm font-medium text-zinc-950 hover:bg-amber-400"
              >
                Join waitlist
              </button>
            </form>
          )}
          {error && <p className="mt-2 text-sm text-red-400">{error}</p>}
        </div>
      ) : gateOpen === true ? (
        <button
          onClick={() => {
            const next = new URLSearchParams(window.location.search).get("next");
            authClient.signIn.social({ provider: "github", callbackURL: next ?? "/dashboard" });
          }}
          className="mt-8 w-full rounded-md bg-zinc-100 px-4 py-3 font-medium text-zinc-900 hover:bg-white transition-colors flex items-center justify-center gap-2"
        >
          <svg viewBox="0 0 16 16" width="20" height="20" fill="currentColor" aria-hidden>
            <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
          </svg>
          Continue with GitHub
        </button>
      ) : (
        <p className="mt-8 text-sm text-zinc-500">Checking availability…</p>
      )}

      <p className="mt-6 text-xs text-zinc-600">
        By continuing you agree to our{" "}
        <a href="/legal/terms" className="underline hover:text-zinc-400">terms</a>. We may use API traffic to{" "}
        <a href="/legal/training" className="underline hover:text-zinc-400">train our own models</a> — opt out anytime
        from your dashboard. See our{" "}
        <a href="/legal/privacy" className="underline hover:text-zinc-400">privacy policy</a>.
      </p>
    </main>
  );
}