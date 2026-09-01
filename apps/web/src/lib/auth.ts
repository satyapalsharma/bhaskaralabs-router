import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { settings } from "@/db/schema";
import { eq } from "drizzle-orm";

// Cohort gate: signups closed at cohort cap → waitlist mode.
// Default OPEN with cap 100 (settings override at runtime via admin).
async function signupOpen(): Promise<boolean> {
  try {
    const rows = await db.select().from(settings).where(eq(settings.key, "signup_enabled")).limit(1);
    return rows[0]?.value !== "false";
  } catch {
    return true; // fail-open during setup; admin dial governs in prod
  }
}

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema,
  }),
  socialProviders: {
    github: {
      clientId: process.env.GITHUB_CLIENT_ID ?? "",
      clientSecret: process.env.GITHUB_CLIENT_SECRET ?? "",
    },
  },
  advanced: {
    database: {
      generateId: () => crypto.randomUUID(),
    },
  },
  databaseHooks: {
    user: {
      create: {
        // Cohort gate: block user creation when gate is closed, before the row lands.
        before: async (user) => {
          const open = await signupOpen();
          if (!open) {
            throw new APIError("FORBIDDEN", { message: "Signups are currently closed" });
          }
          return { data: user };
        },
      },
    },
  },
});


export const COHORT_CAP = 100;