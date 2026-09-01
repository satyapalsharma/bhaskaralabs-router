// Admin guard: session + role=admin. Never trust client.
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { user as users } from "@/db/schema";
import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";

export async function requireAdmin(): Promise<{ userId: string; email: string } | NextResponse> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const rows = await db
    .select({ role: users.role })
    .from(users)
    .where(eq(users.id, session.user.id))
    .limit(1);
  if (rows[0]?.role !== "admin") return NextResponse.json({ error: "forbidden" }, { status: 403 });
  return { userId: session.user.id, email: session.user.email };
}

export function isAdminResponse(v: unknown): v is NextResponse {
  return v instanceof NextResponse;
}