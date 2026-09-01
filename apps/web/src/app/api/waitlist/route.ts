import { NextResponse } from "next/server";
import { db } from "@/db";
import { waitlist } from "@/db/schema";
import { randomUUID } from "crypto";

// Waitlist capture while cohort gate is closed.
export async function POST(req: Request) {
  try {
    const body = (await req.json()) as { email?: unknown };
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: "invalid_email" }, { status: 400 });
    }
    await db.insert(waitlist).values({ id: randomUUID(), email }).onConflictDoNothing();
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "server_error" }, { status: 500 });
  }
}