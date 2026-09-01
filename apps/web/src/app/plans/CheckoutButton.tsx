"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function CheckoutButton({
  plan,
  signedIn,
  highlight,
  children,
}: {
  plan: "basic" | "advanced";
  signedIn: boolean;
  highlight?: boolean;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const go = async () => {
    if (!signedIn) {
      router.push(`/checkout-start?plan=${plan}`);
      return;
    }
    setBusy(true);
    setErr("");
    try {
      // Currency by coarse geo hint (IN plan numbers for India; refine w/ Cloudflare country later)
      const currency = Intl.DateTimeFormat().resolvedOptions().timeZone === "Asia/Kolkata" ? "inr" : "usd";
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan, currency }),
      });
      const data = (await res.json()) as { redirectTo?: string; error?: string };
      if (data.redirectTo) router.push(data.redirectTo);
      else setErr(data.error ?? "checkout failed");
    } catch {
      setErr("network error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <button
        onClick={go}
        disabled={busy}
        className={`mt-6 w-full rounded-md px-4 py-2.5 font-medium transition-colors disabled:opacity-50 ${
          highlight ? "bg-amber-500 text-zinc-950 hover:bg-amber-400" : "border border-zinc-700 hover:border-zinc-500"
        }`}
      >
        {busy ? "Starting…" : children}
      </button>
      {err && <p className="mt-2 text-xs text-red-400">{err}</p>}
    </div>
  );
}