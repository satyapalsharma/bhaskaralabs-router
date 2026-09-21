// Operator account: one key with no caps, no throttle and max concurrency.
//
// Deliberately creates NO subscription row. `authenticate()` prefers a
// subscription's plan over `user.plan`, so a subscription here would both
// override the plan and book fake revenue — this account pays nothing, and the
// economics panel should show its usage as cost, not as a paying customer.
//
// Idempotent: re-running issues a fresh key against the same user, which is the
// recovery path when a key is lost (only the hash is stored, so it cannot be
// re-read).
//
//   bun apps/gateway/src/db/seed-super.ts [email]

import { db } from "./index";
import { user as users, apiKeys } from "./schema";
import { newApiKey } from "../lib/auth";
import { CONCURRENCY } from "@bhaskara/shared/pricing";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";

const email = process.argv[2] ?? "ops@bhaskaralabs.dev";

const existing = await db.select({ id: users.id, plan: users.plan }).from(users).where(eq(users.email, email)).limit(1);

let userId: string;
if (existing[0]) {
  userId = existing[0].id;
  await db.update(users).set({ plan: "super", role: "admin" }).where(eq(users.id, userId));
  console.log(`reusing user ${email} (was plan=${existing[0].plan})`);
} else {
  userId = randomUUID();
  await db.insert(users).values({
    id: userId,
    name: "ops",
    email,
    plan: "super",
    role: "admin",
    cohort: 0,
    emailVerified: true,
  });
  console.log(`created user ${email}`);
}

const key = newApiKey();
await db.insert(apiKeys).values({
  id: randomUUID(),
  userId,
  keyPrefix: key.prefix,
  keyHash: key.hash,
  flags: "compress,compact",
});

console.log(`user id: ${userId}`);
console.log(`plan:    super (unlimited — no quota, no throttle, ${CONCURRENCY.superTier} concurrent)`);
console.log("");
console.log(`API KEY (shown once, only the hash is stored):`);
console.log(`  ${key.full}`);
process.exit(0);
