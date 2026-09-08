import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { db } from "@/db";
import { apiKeys } from "@/db/schema";
import { and, eq } from "drizzle-orm";

// Revoke: DELETE /api/keys/<id>
export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { id } = await params;
  const updated = await db
    .update(apiKeys)
    .set({ active: false })
    .where(and(eq(apiKeys.id, id), eq(apiKeys.userId, session.user.id)))
    .returning({ id: apiKeys.id });

  if (updated.length === 0) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
// Flags: PATCH /api/keys/<id> { flags: "compress,compact" }
// Per-key context-engine opt-ins (CSV subset of compress,compact,shadow,docs).
// Canonical order on write: compress,compact,shadow,docs. Empty → null.
const KEY_FLAGS = ["compress", "compact", "shadow", "docs"] as const;

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { flags?: unknown } | null;
  if (typeof body?.flags !== "string") return NextResponse.json({ error: "flags must be a CSV string" }, { status: 400 });
  const parts = body.flags.split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);
  const bad = parts.filter((p) => !(KEY_FLAGS as readonly string[]).includes(p));
  if (bad.length > 0) return NextResponse.json({ error: `unknown flags: ${bad.join(", ")}` }, { status: 400 });
  const flags = KEY_FLAGS.filter((f) => parts.includes(f)).join(",");

  const { id } = await params;
  const updated = await db
    .update(apiKeys)
    .set({ flags: flags || null })
    .where(and(eq(apiKeys.id, id), eq(apiKeys.userId, session.user.id)))
    .returning({ id: apiKeys.id, flags: apiKeys.flags });

  if (updated.length === 0) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ id: updated[0].id, flags: updated[0].flags });
}