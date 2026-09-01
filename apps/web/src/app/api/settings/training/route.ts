import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { db } from "@/db";
import { user as users } from "@/db/schema";
import { eq } from "drizzle-orm";

// Training opt-out toggle (privacy disclosure on /plans promises a dashboard switch).
export async function POST(req: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { optOut?: unknown };
  if (typeof body.optOut !== "boolean") return NextResponse.json({ error: "bad_request" }, { status: 400 });

  await db.update(users).set({ trainingOptOut: body.optOut, updatedAt: new Date() }).where(eq(users.id, session.user.id));
  return NextResponse.json({ ok: true, optOut: body.optOut });
}