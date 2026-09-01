import { NextResponse } from "next/server";
import { requireAdmin, isAdminResponse } from "@/lib/admin";
import { db } from "@/db";
import { coupons, couponRedemptions } from "@/db/schema";
import { eq, count, desc } from "drizzle-orm";
import { randomBytes } from "crypto";

// GET /api/admin/coupons — list with live redemption counts.
export async function GET() {
  const a = await requireAdmin();
  if (isAdminResponse(a)) return a;
  const rows = await db.select().from(coupons).orderBy(desc(coupons.createdAt));
  const used = await db
    .select({ code: couponRedemptions.couponCode, n: count() })
    .from(couponRedemptions)
    .groupBy(couponRedemptions.couponCode);
  const uMap = new Map(used.map((r) => [r.code, Number(r.n)]));
  return NextResponse.json({
    coupons: rows.map((c) => ({ ...c, redeemedCount: uMap.get(c.code) ?? 0 })),
  });
}

// POST { code?, discountPct, usageLimit, perUserLimit?, plans?, validUntilIso? } — create.
export async function POST(req: Request) {
  const a = await requireAdmin();
  if (isAdminResponse(a)) return a;

  const b = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const pct = Number(b.discountPct);
  const limit = Number(b.usageLimit);
  if (!Number.isInteger(pct) || pct < 1 || pct > 100) return NextResponse.json({ error: "discountPct 1–100" }, { status: 400 });
  if (!Number.isInteger(limit) || limit < 1) return NextResponse.json({ error: "usageLimit ≥ 1" }, { status: 400 });

  const code = (typeof b.code === "string" && b.code.trim())
    ? b.code.trim().toUpperCase().replace(/[^A-Z0-9_-]/g, "")
    : `BH-${randomBytes(3).toString("hex").toUpperCase()}`;

  try {
    await db.insert(coupons).values({
      code,
      discountPct: pct,
      usageLimit: limit,
      perUserLimit: Number.isInteger(b.perUserLimit) ? Number(b.perUserLimit) : 1,
      plans: typeof b.plans === "string" ? b.plans : "*",
      validUntil: typeof b.validUntilIso === "string" ? new Date(b.validUntilIso) : null,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "";
    return NextResponse.json({ error: msg.includes("duplicate") || msg.includes("unique") ? "code exists" : "create_failed" }, { status: 400 });
  }
  return NextResponse.json({ ok: true, code });
}

// PATCH { code, active? } — disable/enable.
export async function PATCH(req: Request) {
  const a = await requireAdmin();
  if (isAdminResponse(a)) return a;
  const b = (await req.json().catch(() => ({}))) as { code?: unknown; active?: unknown };
  if (typeof b.code !== "string" || typeof b.active !== "boolean") return NextResponse.json({ error: "bad_request" }, { status: 400 });

  const upd = await db.update(coupons).set({ active: b.active }).where(eq(coupons.code, b.code.toUpperCase())).returning({ code: coupons.code });
  if (upd.length === 0) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}