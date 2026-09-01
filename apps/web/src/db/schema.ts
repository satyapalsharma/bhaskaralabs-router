// SINGLE schema source for the whole platform (web + gateway share this DB).
// Better-auth tables: user, session, account, verification.
// Bhaskara domain: apiKeys, subscriptions, usageLedger, rateWindows, coupons,
//                  couponRedemptions, waitlist, settings, providerMonthly, sessions (router lock).
import { pgTable, text, integer, bigint, numeric, timestamp, boolean, index, uniqueIndex } from "drizzle-orm/pg-core";

// ── better-auth ──
export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  plan: text("plan").notNull().default("free"),
  cohort: integer("cohort").notNull().default(1),
  trainingOptOut: boolean("training_opt_out").notNull().default(false),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  token: text("token").notNull().unique(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// ── Bhaskara domain ──
export const apiKeys = pgTable("api_keys", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  keyPrefix: text("key_prefix").notNull(),
  keyHash: text("key_hash").notNull().unique(),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const subscriptions = pgTable("subscriptions", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  plan: text("plan").notNull(),
  currency: text("currency").notNull().default("usd"),
  pricePaid: numeric("price_paid", { precision: 10, scale: 2 }).notNull(),
  status: text("status").notNull().default("active"),
  periodStart: timestamp("period_start", { withTimezone: true }).notNull().defaultNow(),
  periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),
  couponCode: text("coupon_code"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const usageLedger = pgTable(
  "usage_ledger",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    apiKeyId: text("api_key_id"),
    sessionId: text("session_id").notNull(),
    endpointModel: text("endpoint_model").notNull(),
    provider: text("provider").notNull(),
    upstreamModel: text("upstream_model").notNull(),
    routedTo: text("routed_to").notNull(),
    routerEffort: text("router_effort").notNull().default("low"),
    promptTokens: bigint("prompt_tokens", { mode: "number" }).notNull(),
    completionTokens: bigint("completion_tokens", { mode: "number" }).notNull(),
    cachedTokens: bigint("cached_tokens", { mode: "number" }).default(0).notNull(),
    reasoningTokens: bigint("reasoning_tokens", { mode: "number" }).default(0).notNull(),
    userEquivalentCostUsd: numeric("user_equiv_cost_usd", { precision: 12, scale: 6 }).notNull(),
    actualCostUsd: numeric("actual_cost_usd", { precision: 12, scale: 6 }).notNull().default("0"),
    providerMeta: text("provider_meta"),
    latencyMs: integer("latency_ms"),
    ttftMs: integer("ttft_ms"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("usage_user_created_idx").on(t.userId, t.createdAt),
    index("usage_session_idx").on(t.sessionId),
    index("usage_provider_idx").on(t.provider, t.createdAt),
  ],
);

export const rateWindows = pgTable(
  "rate_windows",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    kind: text("kind").notNull(),
    tokensOrReqs: bigint("tokens_or_reqs", { mode: "number" }).notNull().default(0),
    windowStart: timestamp("window_start", { withTimezone: true }).notNull(),
  },
  (t) => [uniqueIndex("rate_window_unique").on(t.userId, t.kind, t.windowStart)],
);

export const coupons = pgTable("coupons", {
  code: text("code").primaryKey(),
  discountPct: integer("discount_pct").notNull(),
  usageLimit: integer("usage_limit").notNull(),
  usedCount: integer("used_count").notNull().default(0),
  perUserLimit: integer("per_user_limit").notNull().default(1),
  validFrom: timestamp("valid_from", { withTimezone: true }).notNull().defaultNow(),
  validUntil: timestamp("valid_until", { withTimezone: true }),
  plans: text("plans").notNull().default("*"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const couponRedemptions = pgTable(
  "coupon_redemptions",
  {
    id: text("id").primaryKey(),
    couponCode: text("coupon_code").notNull().references(() => coupons.code),
    userId: text("user_id").notNull(),
    subscriptionId: text("subscription_id").notNull(),
    discountApplied: numeric("discount_applied", { precision: 10, scale: 2 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex("coupon_user_unique").on(t.couponCode, t.userId)],
);

export const waitlist = pgTable("waitlist", {
  id: text("id").primaryKey(),
  email: text("email").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const settings = pgTable("settings", {
  key: text("key").primaryKey(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const providerMonthly = pgTable(
  "provider_monthly",
  {
    id: text("id").primaryKey(),
    provider: text("provider").notNull(),
    month: text("month").notNull(),
    planFeeUsd: numeric("plan_fee_usd", { precision: 10, scale: 2 }).notNull().default("0"),
    meteredUsd: numeric("metered_usd", { precision: 10, scale: 4 }).notNull().default("0"),
    requests: bigint("requests", { mode: "number" }).notNull().default(0),
    notes: text("notes"),
  },
  (t) => [uniqueIndex("provider_month_unique").on(t.provider, t.month)],
);

// Session-sticky model lock (router cache commandment #5)
export const routerSessions = pgTable(
  "sessions",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    lockedModel: text("locked_model"),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("session_user_idx").on(t.userId)],
);