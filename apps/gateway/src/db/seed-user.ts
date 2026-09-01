import { db } from "./index";
import { users, apiKeys, subscriptions } from "./schema";
import { newApiKey } from "../lib/auth";
import { randomUUID } from "node:crypto";

const email = process.argv[2] ?? "test@bhaskaralabs.dev";
const plan = process.argv[3] ?? "basic";
const userId = randomUUID();
await db.insert(users).values({ id: userId, email, plan, cohort: 1, passwordHash: "seed-no-login" });

const key = newApiKey();
await db.insert(apiKeys).values({
  id: randomUUID(),
  userId,
  keyPrefix: key.prefix,
  keyHash: key.hash,
});

const periodEnd = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
await db.insert(subscriptions).values({
  id: randomUUID(),
  userId,
  plan,
  currency: "usd",
  pricePaid: plan === "advanced" ? "30" : "15",
  periodEnd,
});

console.log("user:", email, "plan:", plan, "id:", userId);
console.log("API KEY (save it):", key.full);
process.exit(0);