import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { db } from "@/db";
import { user as users } from "@/db/schema";
import { eq } from "drizzle-orm";
import AdminClient from "./AdminClient";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) redirect("/login?next=%2Fadmin");
  const rows = await db.select({ role: users.role }).from(users).where(eq(users.id, session.user.id)).limit(1);
  if (rows[0]?.role !== "admin") redirect("/dashboard");
  return <AdminClient />;
}