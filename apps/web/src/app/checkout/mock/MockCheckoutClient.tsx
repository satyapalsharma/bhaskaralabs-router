"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function MockCheckoutClient({
  sessionId,
  pending,
}: {
  sessionId: string;
  pending: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [state, setState] = useState<"idle" | "paid" | "error">(
    pending ? "idle" : "paid",
  );
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
        setCouponMsg("Applied.");
        router.refresh();
      } else setCouponMsg(data.error ?? "That code was not accepted.");
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
        setMsg(data.error ?? "Something went wrong on our side.");
        setState("error");
      }
    } catch {
      setMsg("Network error. Try again.");
      setState("error");
    } finally {
      setBusy(false);
    }
  };

  if (state === "paid") {
    return (
      <p
        role="status"
        className="mt-6 flex items-center gap-2 border border-ok bg-ok-soft px-4 py-3 text-[0.875rem] text-ok"
      >
        <span className="dot" />
        Activated. Taking you to the dashboard…
      </p>
    );
  }

  return (
    <div className="mt-6">
      {pending && (
        <>
          <label htmlFor="coupon" className="label text-ink-faint">
            Coupon code · optional
          </label>
          <div className="mt-3 flex gap-2">
            <input
              id="coupon"
              value={coupon}
              onChange={(e) => setCoupon(e.target.value)}
              placeholder="LAUNCH50"
              className="field flex-1 font-mono uppercase"
            />
            <button
              type="button"
              onClick={applyCoupon}
              disabled={busy || !coupon.trim()}
              className="btn btn-outline"
            >
              Apply
            </button>
          </div>
          {couponMsg && (
            <p className="mt-2 font-mono text-[0.6875rem] text-ink-mute">
              {couponMsg}
            </p>
          )}
        </>
      )}

      <button
        type="button"
        onClick={pay}
        disabled={busy}
        className="btn btn-primary mt-4 w-full"
      >
        {busy ? "Processing…" : "Pay and activate"}
      </button>

      {state === "error" && (
        <p role="alert" className="mt-3 text-[0.8125rem] text-danger">
          {msg}
        </p>
      )}
    </div>
  );
}
