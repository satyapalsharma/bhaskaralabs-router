import { NextResponse } from "next/server";
import { requireAdmin, isAdminResponse } from "@/lib/admin";
import { db } from "@/db";
import { settings } from "@/db/schema";
import { eq } from "drizzle-orm";

const KEYS = ["signup_enabled", "cohort_cap"] as const;

// GET /api/admin/settings — current dial values.
export async function GET() {
  const a = await requireAdmin();
  if (isAdminResponse(a)) return a;
  const rows = await db.select().from(settings);
  const out: Record<string, string> = {};
  for (const k of KEYS) out[k] = rows.find((r) => r.key === k)?.value ?? "";
  return NextResponse.json({ settings: out });
}

// POST { signupEnabled?: boolean, cohortCap?: number }
export async function POST(req: Request) {
  const a = await requireAdmin();
  if (isAdminResponse(a)) return a;

  const body = (await req.json().catch(() => ({}))) as { signupEnabled?: unknown; cohortCap?: unknown };
  const now = new Date();

  if (typeof body.signupEnabled === "boolean") {
    await db
      .insert(settings)
      .values({ key: "signup_enabled", value: String(body.signupEnabled), updatedAt: now })
      .onConflictDoUpdate({ target: settings.key, set: { value: String(body.signupEnabled), updatedAt: now } });
  }
  if (typeof body.cohortCap === "number" && Number.isInteger(body.cohortCap) && body.cohortCap > 0) {
    await db
      .insert(settings)
      .values({ key: "cohort_cap", value: String(body.cohortCap), updatedAt: now })
      .onConflictDoUpdate({ target: settings.key, set: { value: String(body.cohortCap), updatedAt: now } });
  }
  return NextResponse.json({ ok: true });
}