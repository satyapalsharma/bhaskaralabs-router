"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { authClient } from "@/lib/auth-client";
import Wordmark from "@/components/Wordmark";

export default function LoginPage() {
  const [waitlistEmail, setWaitlistEmail] = useState("");
  const [waitlisted, setWaitlisted] = useState(false);
  const [gateOpen, setGateOpen] = useState<boolean | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch("/api/gate")
      .then((r) => r.json())
      .then((d: { open?: boolean }) => {
        if (!cancelled) setGateOpen(d.open ?? true);
      })
      .catch(() => {
        if (!cancelled) setGateOpen(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const joinWaitlist = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    const res = await fetch("/api/waitlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: waitlistEmail }),
    });
    if (res.ok) setWaitlisted(true);
    else setError("That did not go through. Try again in a moment.");
  };

  return (
    <main className="mx-auto grid max-w-5xl gap-14 px-5 py-16 sm:px-6 sm:py-24 lg:grid-cols-2 lg:gap-20">
      {/* ── Column: the pitch ─────────────────────────────────── */}
      <div>
        <p className="label text-accent-deep">Get access</p>
        <h1 className="claim mt-6">One key, two endpoints, full ledger.</h1>
        <p className="lede measure-tight mt-5">
          Signing in gives you a dashboard with quota cards, an equivalent-cost
          view at direct API rates, per-key context-engine flags, and a
          one-toggle opt-out from training. No card for the trial.
        </p>

        <dl className="mt-9 space-y-4 border-t border-rule pt-5">
          {[
            ["Trial includes", "100 theta · 20 glm-5.3 requests per window"],
            ["Endpoints", "theta · glm-5.3"],
            ["Compatibility", "OpenAI & Anthropic SDKs, unchanged"],
          ].map(([k, v]) => (
            <div key={k} className="flex flex-wrap gap-x-6">
              <dt className="label w-32 shrink-0 pt-1 text-ink-faint">{k}</dt>
              <dd className="font-mono text-[0.8125rem] text-ink-soft">{v}</dd>
            </div>
          ))}
        </dl>
      </div>

      {/* ── Column: the action ────────────────────────────────── */}
      <div className="lg:pt-2">
        <div className="panel p-6">
          <Wordmark />

          {gateOpen === null && (
            <p className="mt-8 text-[0.875rem] text-ink-mute">
              Checking availability…
            </p>
          )}

          {gateOpen === true && (
            <>
              <h2 className="subhead mt-7">Sign in</h2>
              <p className="mt-3 text-[0.875rem] leading-relaxed text-ink-soft">
                One click with GitHub. We read your public profile and your
                email address, and nothing else.
              </p>

              <button
                type="button"
                onClick={() => {
                  const next = new URLSearchParams(window.location.search).get(
                    "next",
                  );
                  authClient.signIn.social({
                    provider: "github",
                    callbackURL: next ?? "/dashboard",
                  });
                }}
                className="btn btn-primary mt-6 w-full"
              >
                <svg
                  viewBox="0 0 16 16"
                  width="16"
                  height="16"
                  fill="currentColor"
                  aria-hidden
                >
                  <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27s1.36.09 2 .27c1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
                </svg>
                Continue with GitHub
              </button>
            </>
          )}

          {gateOpen === false && (
            <>
              <h2 className="subhead mt-7">We&apos;re at capacity</h2>
              <p className="mt-3 text-[0.875rem] leading-relaxed text-ink-soft">
                Cohorts are capped at 100 so that everyone inside one gets stable
                throughput. Leave an address and we will write when the next
                cohort opens.
              </p>

              {waitlisted ? (
                <p
                  role="status"
                  className="mt-6 flex items-center gap-2 text-[0.875rem] text-ok"
                >
                  <span className="dot" />
                  You are on the list.
                </p>
              ) : (
                <form onSubmit={joinWaitlist} className="mt-6">
                  <label htmlFor="waitlist-email" className="label text-ink-faint">
                    Email address
                  </label>
                  <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                    <input
                      id="waitlist-email"
                      type="email"
                      required
                      autoComplete="email"
                      value={waitlistEmail}
                      onChange={(e) => setWaitlistEmail(e.target.value)}
                      placeholder="you@example.com"
                      className="field flex-1"
                    />
                    <button type="submit" className="btn btn-primary">
                      Join waitlist
                    </button>
                  </div>
                </form>
              )}
              {error && (
                <p role="alert" className="mt-3 text-[0.8125rem] text-danger">
                  {error}
                </p>
              )}
            </>
          )}

          <p className="mt-7 border-t border-rule-faint pt-4 text-[0.75rem] leading-relaxed text-ink-faint">
            By continuing you agree to the{" "}
            <Link href="/legal/terms" className="prose-link">
              terms
            </Link>
            . We may use API traffic to{" "}
            <Link href="/legal/training" className="prose-link">
              train our own models
            </Link>{" "}
            — opt out any time from the dashboard. See the{" "}
            <Link href="/legal/privacy" className="prose-link">
              privacy policy
            </Link>
            .
          </p>
        </div>
      </div>
    </main>
  );
}
