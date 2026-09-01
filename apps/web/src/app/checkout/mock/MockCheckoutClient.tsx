"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function MockCheckoutClient({ sessionId, pending }: { sessionId: string; pending: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState<"idle" | "paid" | "error">(pending ? "idle" : "paid");
  const [msg, setMsg] = useState("");
  const [coupon, setCoupon] = useState("");
  const [couponMsg, setCouponMsg] = useState("");

  const applyCoupon = async () => {
    setBusy(true);
    setCouponMsg("");
    try {
      const res = await fetch("/api/checkout/coupon", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, coupon }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (data.ok) {
        setCouponMsg("Applied ✓");
        router.refresh(); // re-render server totals
      } else setCouponMsg(data.error ?? "failed");
    } finally {
      setBusy(false);
    }
  };

  const pay = async () => {
    setBusy(true);
    setMsg("");
    try {
      const res = await fetch("/api/checkout/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (data.ok) {
        setState("paid");
        setTimeout(() => router.push("/dashboard"), 900);
      } else {
        setMsg(data.error ?? "something went wrong");
        setState("error");
      }
    } catch {
      setMsg("network error");
      setState("error");
    } finally {
      setBusy(false);
    }
  };

  if (state === "paid") {
    return (
      <div className="mt-6 rounded-lg border border-emerald-500/40 bg-emerald-500/10 p-4 text-sm text-emerald-300">
        ✓ Activated — redirecting to your dashboard…
      </div>
    );
  }

  return (
    <div className="mt-6">
      {pending && (
        <>
          <div className="flex gap-2">
            <input
              value={coupon}
              onChange={(e) => setCoupon(e.target.value)}
              placeholder="Coupon code (optional)"
              className="flex-1 rounded-md border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm uppercase"
            />
            <button
              onClick={applyCoupon}
              disabled={busy || !coupon.trim()}
              className="rounded-md border border-zinc-700 px-3 py-2 text-sm hover:border-zinc-500 disabled:opacity-50 transition-colors"
            >
              Apply
            </button>
          </div>
          {couponMsg && <p className="mt-1.5 text-xs text-zinc-400">{couponMsg}</p>}
        </>
      )}
      <button
        onClick={pay}
        disabled={busy}
        className="mt-3 w-full rounded-md bg-emerald-500 px-4 py-2.5 font-medium text-zinc-950 hover:bg-emerald-400 disabled:opacity-50 transition-colors"
      >
        {busy ? "Processing…" : "Pay & activate (stub)"}
      </button>
      {state === "error" && <p className="mt-2 text-sm text-red-400">{msg}</p>}
    </div>
  );
}