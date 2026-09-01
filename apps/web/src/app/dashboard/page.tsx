import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { getQuotaSnapshot, getRecentUsage } from "@/lib/quota-snapshot";
import { db } from "@/db";
import { apiKeys } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import DashboardClient from "./DashboardClient";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) redirect("/login");

  const [snapshot, usage, keys] = await Promise.all([
    getQuotaSnapshot(session.user.id),
    getRecentUsage(session.user.id),
    db
      .select({
        id: apiKeys.id,
        keyPrefix: apiKeys.keyPrefix,
        active: apiKeys.active,
        createdAt: apiKeys.createdAt,
      })
      .from(apiKeys)
      .where(eq(apiKeys.userId, session.user.id))
      .orderBy(desc(apiKeys.createdAt)),
  ]);

  return (
    <DashboardClient
      user={{
        name: session.user.name ?? "developer",
        email: session.user.email,
        image: session.user.image ?? null,
      }}
      initialSnapshot={snapshot}
      initialUsage={usage}
      initialKeys={keys.map((k) => ({ ...k, createdAt: k.createdAt.toISOString() }))}
      initialOptOut={snapshot?.trainingOptOut ?? false}
    />
  );
}