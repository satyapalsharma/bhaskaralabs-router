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