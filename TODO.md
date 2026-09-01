# Bhaskara Labs — Detailed TODO List

Status: `[ ]` todo · `[~]` in progress · `[x]` done · `[POST-BETA]` deferred — Q1–Q5 ALL RESOLVED (2026-09-01)

## Phase 1 — Foundation

- [ ] Monorepo scaffold: `apps/web` (Next.js 15 + Tailwind), `apps/gateway` (Bun), `packages/shared`
- [ ] Postgres + Drizzle schema: users, plans, subscriptions, api_keys, quotas, usage_ledger, provider_costs, coupons, coupon_redemptions, sessions, rate_windows
- [ ] Auth: email + password (or magic link), session management
- [ ] API key management: issue `sk-bhaskara-…`, revoke, hash-at-rest
- [ ] Provider client: Hyper OpenAI-compat + Anthropic-compat (streaming, retry/backoff 429/5xx)
- [ ] Provider client: Agnes — flat $10/mo per 200k requests, tokens included (founder-confirmed); verify exact plan terms + usage fields in console
- [ ] Provider client: StepFun Step Plan — credit tiers ($6.99/400M → $99/40B monthly), `api.stepfun.ai/step_plan/v1` OpenAI-compat; verify per-model credit burn in console
- [ ] Hyper team account: master + sub-keys; catalog snapshot fixture
- [ ] Metering ledger writer: dual-accounting rows (user-facing raw tokens vs internal actual cost)
- [ ] Parse provider usage verbatim: `usage.cost.hypercredits`, cached-token fields — verify live field names
- [ ] Pricing config file: all model rates + **theta dual pricing** (user-facing display $0.20 in/$0.04 cache/$0.40 out; admin actual = Agnes/StepFun/DevPass upstream costs) + plan definitions (single editable source)
- [ ] Email hypersupport@charm.land: cache scope/TTL/per-key semantics → `docs/cache-notes.md`
- [ ] Hosting: provision gateway host — Hetzner VPS + Coolify primary (no platform SSE timeout); validate: 10-min SSE stream survives; Railway only for web (verified 5-min HTTP limit disqualifies it as gateway host)
- [ ] Infra cost model in pricing config: monthly hosting + DB + misc → per-active-user-month share for admin margin
- [ ] DB: `users.cohort`, `waitlist` table, `settings` (signup_enabled, cohort_cap)

## Phase 2 — Gateway v1

- [ ] Endpoint `glm-5.3`: routes GLM 5.3 ⇄ GLM 5.3-Flash
- [ ] Endpoint `qwen-3.8`: routes Qwen3.8-Max ⇄ Qwen3.8-Flash
- [ ] Endpoint `theta`: routes Agnes 2.5 Flash ⇄ StepFun 3.7 Flash ⇄ DeepSeek V4 Flash 0731 (DevPass, old prices $0.08/$0.15) `[BOOTSTRAP — must degrade gracefully to Hyper-only]`
- [ ] Provider client: DevPass/LLM Gateway (deepseek-v4-flash-0731 @ $0.08/$0.15, old prices) — verify caching pass-through + usage fields; track allowance burn
- [ ] Router v0 heuristics: (prefix size, cache-eligibility, task hardness) → tier; config-driven rule table; HARD CAP 10% full-model share per user/week (spill → flash + fair-use nudge)
- [ ] Effort dial: `low` default bulk, `high/max` planning (GLM effort params)
- [ ] Session stickiness store: model lock per session; unlock at task boundary only
- [ ] Escalation: N failures/test-fail signal → full model retry with same cache-aligned prefix
- [ ] Canonical prefix assembler: system → tools → session → tail; deterministic serializer
- [ ] Prefix-lint middleware: reject timestamps/random-ids/dates/volatile ordering in prefix
- [ ] Session→sub-key consistent hashing (Hyper pool)
- [ ] Append-only history enforcement (no mid-history edits outside compaction)
- [ ] theta rate windows: 400/800 per rolling 5h + monthly ceilings (57.6k/115.2k)
- [ ] Frontier quotas: input/output token caps per plan (free: 1M in / ⚠️250k out recommended)
- [ ] Quota enforcement middleware (reject with clear error + dashboard deep-link)
- [ ] Request archival: full traces (router training data + disputes)
- [ ] Smoke: Claude Code/Crush end-to-end on all 3 endpoints; ledger rows correct

## Phase 3 — Site v1

- [x] Home: hero (zero tagline, price-per-intelligence), pillars, model cards, CTA
- [ ] Brand: "building toward" research claims only (no fabricated research) — copy review pass
- [x] Plans page: 3 cards, regional pricing display (₹1500/₹3000 India · $15/$30 international — geo-detected, Q3 resolved), feature table
- [x] Transparency block: cache engineering + context management + smart routing + training disclosure with opt-out link
- [x] Calculator: sliders (tokens, in/out split, cache-hit % default 80) → headline = FULL direct frontier API cost, no cache discounts (GLM5.3 & Qwen3.8-Max list) vs plan price → savings %; secondary collapsible: theta metered at USER-FACING rates ($0.20/$0.04/$0.40) + DIY-with-caching (Q4 resolved)
- [ ] Checkout: Stripe subscriptions (USD, international) — Q3 resolved. ⏳ keys pending; stub live, swap via `payments.ts` TODO(psp)
- [ ] Checkout: Razorpay (INR/UPI, India) — Q3 resolved. ⏳ keys pending; same swap path
- [x] Coupons: schema (code, discount %, usage limit, per-user limit, window, plans) + redemption at checkout + code validation API
- [ ] Free trial flow: 1-day, email verification + abuse friction (recommend $0 card-auth)
- [x] Signup cohort gate: `signup_enabled` + `cohort_cap` (default 100) — auto-close at cap; waitlist email capture while closed; manual reopen only after cohort review
- [ ] Legal pages: ToS, privacy, training-data disclosure (DPDP 2023 consent language), refund policy

## Phase 4 — Dashboards

- [x] User dashboard: 5 quota cards (total + remaining): frontier in / frontier out / theta 5h-window / theta month / plan days (Q5 confirmed)
- [ ] User dashboard: equivalent-API-cost card (frontier at full-model list rates; theta at display rates $0.20/$0.04/$0.40)
- [x] User dashboard: usage shown = RAW streamed tokens (pre-compression, always)
- [x] User dashboard: API key create/revoke; training opt-out toggle
- [ ] Admin: users table (plan, status, signup, coupon)
- [ ] Admin: per-user tokens, theta requests, actual COGS, revenue, margin
- [ ] Admin: COGS by provider (Hyper hypercredits / Agnes flat $10 per 200k req / StepFun credit amortization / DevPass allowance burn — each tagged CORE vs BOOTSTRAP) + infra share per user
- [ ] Admin: router full-share distribution per user (alert >8%; hard cap 10% — margin guard)
- [ ] Admin: cache-hit distribution, hit-rate cliff alert
- [ ] Admin: coupon CRUD + redemption counts
- [ ] Admin: abuse alerts (trial farms, quota bursts)
- [ ] Admin: signup gate dial (open/close, cap edit, waitlist count/export)
- [ ] Admin: cohort gate report — per-cohort P&L (revenue vs provider COGS + infra share), error rate, hit rate, full-share → go/no-go for next 100
- [ ] Admin: Hyper-only shadow margin — weekly COGS recomputed EXCLUDING all [BOOTSTRAP] providers (proof core stays profitable without hacks)

## Phase 5 — Academics v1

- [ ] MDX pipeline in Next.js + article schema (module, order, quiz data)
- [ ] Series map page: 5 modules, ~40 articles; unwritten shown as honest "coming soon" roadmap
- [ ] Interactive: tokenizer playground (M1.2)
- [ ] Interactive: attention heatmap (M1.4)
- [ ] Interactive: sampling/temperature playground (M1.5)
- [ ] Interactive: prompt-caching cost calc (M3.5 — reuse plan-page calculator component)
- [ ] Quiz component + progress tracking (localStorage + account-sync)
- [ ] Outline Modules 2–5 (titles + one-line abstracts each) for the roadmap page

## Phase 6 — Beta Hardening

- [ ] Cache verification: cross-user shared-prefix test; steady-state hit rate ≥70%
- [ ] Load test: 20 concurrent sessions; quota windows under contention
- [ ] Trial-abuse: device fingerprint + velocity rules
- [ ] Failover orderings: Hyper model alternates, theta provider health checks
- [ ] Monitoring: hit-rate cliff, full-share drift, per-user margin, 429 rates
- [ ] Key rotation runbook + secrets audit
- [ ] Beta cohort: 10–20 devs from communities, coupon-seeded (exercises coupon system in prod)
- [ ] Scale drill: cohort 1 → review gate report + shadow margin → open cohort 2; confirm infra headroom before reopen
- [ ] Bootstrap pilots (later): Crof + Nube — verify live prices, quantization, latency on recorded traces BEFORE enabling traffic; kill-switch default off
- [ ] At cohort 3+: open volume-discount talks (Hyper sales, Zhipu/GLM, Alibaba Model Studio) — graduation path off [BOOTSTRAP] providers

## [POST-BETA] Router intelligence
- [ ] Needle2 sidecar: intent + keyword classification, confidence escalation
- [ ] Switchyard spike (2–3 days): routing quality on recorded traces, session-stickiness support → adopt/keep-custom decision doc
- [ ] Routing eval set: ≥200 labeled turns; ≥90% precision on frontier calls

## [POST-BETA] Context engineering (from gateway plan v1)
- [ ] Docs packs + ES registry (byte-identical packs, shared prefix, tail-only snippets)
- [ ] Compression stack: deterministic trim → Parsec (deterministic-mode verified) → Caveman; Answer-Keep ≥98% gate + kill-switches
- [ ] Compaction: 300–500k threshold, strip→summarize, immutable block + file manifest

## [POST-BETA] theta becomes truly in-house
- [ ] Reseller/API agreements with Agnes + StepFun (or drop from pool) ⚠️ tied to §2.2 decision
- [ ] Training corpus from archived traces (consented users only, opt-out respected)
- [ ] Fine-tune Ornith-1.5-35B-A3B (LoRA/SFT via NeMo Automodel; open agentic RL recipes/dataset)
- [ ] Eval vs rented backends; cutover when parity+; keep fallback chain

## Cross-Cutting (always)
- [ ] Any prefix-assembly change → cache-invariant tests (ordering, determinism, append-only)
- [ ] No optimization ships without before/after ledger numbers
- [ ] User-facing numbers ALWAYS raw tokens at user-facing rates; admin sees actual upstream costs — enforced in one metering module, nowhere else
- [ ] Vendor claims (Parsec 54%, Lightning SWE 51.56, Caveman 75%) unverified until own eval reproduces
- [ ] Weekly: per-user margin review + router full-share review (the two margin killers)
