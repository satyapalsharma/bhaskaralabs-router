import { NextResponse } from "next/server";
import { requireAdmin, isAdminResponse } from "@/lib/admin";
import { db } from "@/db";
import { waitlist } from "@/db/schema";
import { sql } from "drizzle-orm";
// GET /api/admin/waitlist — CSV export (served as attachment) for email tooling.
export async function GET() {
  const a = await requireAdmin();
  if (isAdminResponse(a)) return a;
  const rows = await db.select({ email: waitlist.email, joinedAt: waitlist.createdAt }).from(waitlist).orderBy(sql`${waitlist.createdAt} asc`);
  const csv = ["email,joined_at", ...rows.map((r) => `${r.email},${r.joinedAt.toISOString()}`)].join("\n");
  return new NextResponse(csv, {
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="bhaskara-waitlist-${rows.length}.csv"`,
    },
  });
}