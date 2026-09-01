import { NextResponse } from "next/server";
import { db } from "@/db";
import { settings } from "@/db/schema";
import { eq } from "drizzle-orm";

// Gate status: signup_enabled setting (default open; admin dial flips it)
export async function GET() {
  try {
    const rows = await db.select().from(settings).where(eq(settings.key, "signup_enabled")).limit(1);
    const open = rows[0]?.value !== "false";
    return NextResponse.json({ open });
  } catch {
    return NextResponse.json({ open: true });
  }
}