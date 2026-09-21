import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { db } from "@/db";
import { apiKeys } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { normalizeFlags } from "@bhaskara/shared/skill";

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

// Flags: PATCH /api/keys/<id> { flags: "compress,compact,pro" }
//
// Allows: compress, compact, shadow, docs, skill, and at most one routing
// profile (eco | balanced | pro). Validation and canonical ordering live in
// @bhaskara/shared/skill so this route and the gateway flag resolver cannot
// disagree about what a flag means — they previously held two separate lists.
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { flags?: unknown } | null;
  if (typeof body?.flags !== "string") {
    return NextResponse.json({ error: "flags must be a CSV string" }, { status: 400 });
  }

  let flags: string | null;
  try {
    flags = normalizeFlags(body.flags);
  } catch (err) {
    const message = err instanceof Error ? err.message : "invalid flags";
    return NextResponse.json({ error: message }, { status: 400 });
  }

  const { id } = await params;
  const updated = await db
    .update(apiKeys)
    .set({ flags })
    .where(and(eq(apiKeys.id, id), eq(apiKeys.userId, session.user.id)))
    .returning({ id: apiKeys.id, flags: apiKeys.flags });

  if (updated.length === 0) return NextResponse.json({ error: "not_found" }, { status: 404 });
  return NextResponse.json({ id: updated[0].id, flags: updated[0].flags });
}
