import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { settings, user as users } from "@/db/schema";
import { count, gte } from "drizzle-orm";

// Cohort gate: signups closed when (a) admin dial is off, or (b) active users
// in current cohort >= cohort_cap (default 100). Manual reopen after review.
const COHORT_CAP_DEFAULT = 100;

export async function signupOpen(): Promise<boolean> {
  try {
    const rows = await db.select().from(settings).limit(10);
    const get = (k: string) => rows.find((r) => r.key === k)?.value;
    if (get("signup_enabled") === "false") return false;
    const cap = Number(get("cohort_cap") ?? COHORT_CAP_DEFAULT);
    const [{ n }] = await db
      .select({ n: count() })
      .from(users)
      .where(gte(users.createdAt, new Date(0))); // all-time; cohort = rolling cap
    if (Number.isFinite(cap) && cap > 0 && n >= cap) return false;
    return true;
  } catch {
    return true; // fail-open during setup; admin dial governs in prod
  }
}

// Email+password is a dev/QA convenience with NO email verification — in
// production it is an open door to mint trial accounts. Default therefore
// flips by environment: on for a local BETTER_AUTH_URL, off anywhere else.
// BETTER_AUTH_EMAIL_SIGNUP=true|false forces either way.
const EMAIL_PASSWORD_ENABLED =
  process.env.BETTER_AUTH_EMAIL_SIGNUP != null
    ? process.env.BETTER_AUTH_EMAIL_SIGNUP === "true"
    : /localhost|127\.0\.0\.1/.test(process.env.BETTER_AUTH_URL ?? "");

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema,
  }),
  emailAndPassword: {
    enabled: EMAIL_PASSWORD_ENABLED,
    minPasswordLength: 10,
    autoSignIn: true,
  },
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