import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { getQuotaSnapshot, getRecentUsage } from "@/lib/quota-snapshot";

// Quota API for the dashboard (plan limits + current window usage).
export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const snapshot = await getQuotaSnapshot(session.user.id);
  if (!snapshot) return NextResponse.json({ error: "no_user" }, { status: 404 });
  const usage = await getRecentUsage(session.user.id);

  return NextResponse.json({ snapshot, usage });
}