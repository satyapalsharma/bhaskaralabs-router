import { pgTable, text, integer, bigint, numeric, timestamp, boolean, index, uniqueIndex } from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: text("id").primaryKey(),                    // uuid
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  plan: text("plan").notNull().default("free"),   // free | basic | advanced
  cohort: integer("cohort").notNull().default(1),
  country: text("country"),
  trainingOptOut: boolean("training_opt_out").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const subscriptions = pgTable("subscriptions", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  plan: text("plan").notNull(),
  currency: text("currency").notNull().default("usd"), // usd | inr
  pricePaid: numeric("price_paid", { precision: 10, scale: 2 }).notNull(),
  status: text("status").notNull().default("active"),  // active | expired | canceled
  periodStart: timestamp("period_start", { withTimezone: true }).notNull().defaultNow(),
  periodEnd: timestamp("period_end", { withTimezone: true }).notNull(),
  couponCode: text("coupon_code"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const apiKeys = pgTable("api_keys", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  keyPrefix: text("key_prefix").notNull(),   // sk-bhaskara-xxxx (display)
  keyHash: text("key_hash").notNull().unique(),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const usageLedger = pgTable(
  "usage_ledger",
  {
    id: text("id").primaryKey(),
    userId: text("user_id").notNull(),
    apiKeyId: text("api_key_id"),
    sessionId: text("session_id").notNull(),
    endpointModel: text("endpoint_model").notNull(),   // glm-5.3 | qwen-3.8 | theta (what user called)
    provider: text("provider").notNull(),              // hyper | devpass | agnes | stepfun
    upstreamModel: text("upstream_model").notNull(),   // actual model served
    routedTo: text("routed_to").notNull(),             // "full" | "flash" | theta backend
    routerEffort: text("router_effort").notNull().default("low"),
    promptTokens: bigint("prompt_tokens", { mode: "number" }).notNull(),
    completionTokens: bigint("completion_tokens", { mode: "number" }).notNull(),
    cachedTokens: bigint("cached_tokens", { mode: "number" }).default(0).notNull(),
    reasoningTokens: bigint("reasoning_tokens", { mode: "number" }).default(0).notNull(),
    // user-facing (dual ledger side A)
    userEquivalentCostUsd: numeric("user_equiv_cost_usd", { precision: 12, scale: 6 }).notNull(),
    // internal (dual ledger side B)
    actualCostUsd: numeric("actual_cost_usd", { precision: 12, scale: 6 }).notNull().default("0"),
    providerMeta: text("provider_meta"),               // JSON: hypercredits, allowance burn, etc.
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
    kind: text("kind").notNull(),      // theta_5h | theta_month | frontier_in | frontier_out
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
  plans: text("plans").notNull().default("*"),       // csv of plan ids or *
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
    provider: text("provider").notNull(),       // hyper | devpass | agnes | stepfun
    month: text("month").notNull(),             // 2026-09
    planFeeUsd: numeric("plan_fee_usd", { precision: 10, scale: 2 }).notNull().default("0"),
    meteredUsd: numeric("metered_usd", { precision: 10, scale: 4 }).notNull().default("0"),
    requests: bigint("requests", { mode: "number" }).notNull().default(0),
    notes: text("notes"),
  },
  (t) => [uniqueIndex("provider_month_unique").on(t.provider, t.month)],
);