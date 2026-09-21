"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function CheckoutButton({
  plan,
  signedIn,
  children,
  variant = "outline",
  className = "",
}: {
  plan: "starter" | "pro";
  signedIn: boolean;
  children: React.ReactNode;
  variant?: "primary" | "outline";
  className?: string;
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
      // Currency by coarse geo hint; the PSP settles the real region.
      const currency =
        Intl.DateTimeFormat().resolvedOptions().timeZone === "Asia/Kolkata"
          ? "inr"
          : "usd";
      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan, currency }),
      });
      const data = (await res.json()) as { redirectTo?: string; error?: string };
      if (data.redirectTo) router.push(data.redirectTo);
      else setErr(data.error ?? "Checkout could not start.");
    } catch {
      setErr("Network error. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={className}>
      <button
        type="button"
        onClick={go}
        disabled={busy}
        className={`btn w-full ${
          variant === "primary" ? "btn-primary" : "btn-outline"
        }`}
      >
        {busy ? "Starting…" : children}
      </button>
      {err && (
        <p role="alert" className="mt-2 text-[0.75rem] text-danger">
          {err}
        </p>
      )}
    </div>
  );
}
