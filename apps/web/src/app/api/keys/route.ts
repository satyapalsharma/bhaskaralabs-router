import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { db } from "@/db";
import { apiKeys } from "@/db/schema";
import { randomBytes, createHash, randomUUID } from "crypto";
import { desc, eq } from "drizzle-orm";

function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

// Issue a new gateway API key (same scheme as gateway/lib/auth.newApiKey).
export async function POST() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const secret = randomBytes(24).toString("base64url");
  const full = `sk-bhaskara-${secret}`;
  await db.insert(apiKeys).values({
    id: randomUUID(),
    userId: session.user.id,
    keyPrefix: full.slice(0, 16),
    keyHash: sha256(full),
  });

  // Full key returned exactly once — only the hash is stored.
  return NextResponse.json({ key: full });
}

// List keys (metadata only — full keys are never retrievable, hash-only storage).
export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const rows = await db
    .select({ id: apiKeys.id, keyPrefix: apiKeys.keyPrefix, active: apiKeys.active, flags: apiKeys.flags, createdAt: apiKeys.createdAt })
    .from(apiKeys)
    .where(eq(apiKeys.userId, session.user.id))
    .orderBy(desc(apiKeys.createdAt));
  return NextResponse.json({ keys: rows });
}