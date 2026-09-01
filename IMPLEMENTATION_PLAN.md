# Bhaskara Labs (bhaskaralabs.com) — Product & Engineering Plan

> Tagline direction: *"From the land that gave zero to the world — an attempt at solving the price-per-intelligence metric."*
> Named for Bhāskara II; the `theta` model after Ramanujan's mock theta functions.

## 1. Product Summary

A developer-facing inference platform from India exposing **3 API models**:

| Product model | Smart-routes between | Role |
|---|---|---|
| `glm-5.3` | GLM 5.3 ⇄ GLM 5.3-Flash | frontier-tier coding |
| `qwen-3.8` | Qwen3.8-Max ⇄ Qwen3.8-Flash | frontier-tier coding |
| `theta` | Agnes 2.5 Flash ⇄ StepFun 3.7 Flash ⇄ DeepSeek V4 Flash 0731 | in-house fast tier |

Routing policy (all three): long-prefix agentic turns → flash-class (cache pool); planning/hard reasoning → full model; effort levels dialed per task class. **Aggressive target on frontier endpoints: ≥90% flash / ≤10% full (hard cap per user/week; spill → flash + fair-use nudge).** Router decision rule: **(prefix size, cache-eligibility, task hardness)**.

Website pages: **Home** (research-lab positioning), **Coding Plans** (3 plans + savings calculator), **Academics** (interactive LLM learning series), **User dashboard**, **Admin dashboard**.

## 2. ⚠️ Disclosure Policy — DECISION PENDING (owner: founder)

Three elements of the original spec carry existential business risk. This plan is written for the **disclosed variant**; contested items are marked `[CONTESTED]`.

### 2.1 Model routing disclosure
- Marketing sells "GLM5.3 / QWEN3.8 with smart routing" — the routing **is the product story** (it's how price-per-intelligence drops).
- `[CONTESTED]` *intercepting "which model are you?" questions* and *string-replacing "flash" → full-model names in outputs*: this is active concealment. One viral teardown post from a developer audience (which WILL probe) ends the brand; also consumer-protection exposure (Consumer Protection Act 2019 — misleading advertising). **Plan default: not implemented.** Disclosed alternative: system-prompt identity line — *"You are served by Bhaskara Labs' GLM5.3 endpoint, a smart-routed system"* — plus plan-page copy explaining routing tiers.
- Precedent that makes the honest version normal: OpenRouter auto-router, provider "gpt-4"-style family endpoints. Routing disclosed = defensible; routing hidden = laundering.

### 2.2 theta backend sourcing
- `[CONTESTED]` Renting personal Agnes/StepPlan subscription accounts to serve paying customers undisclosed: commercial-scale ToS arbitrage (same failure mode as Hyper account pooling, discussed earlier). One upstream account ban kills theta mid-billing-cycle for paying users → chargebacks + reputation death.
- Plan default: market theta honestly as **"routed ensemble (preview)"** until the Ornith fine-tune ships, then it genuinely becomes in-house. Parallel track: approach Agnes/StepFun for reseller/API agreements (revenue for them — realistic yes). DeepSeek V4 Flash 0731 via Hyper is already a legitimate theta backend.
- theta hard-route target: DeepSeek V4 Flash 0731 via **DevPass (LLM Gateway) at old prices — $0.08/$0.15 per M** (effective ≈ $0.027/$0.05 inside the 3× plan allowance; Lite $29 = $87 metered) `[BOOTSTRAP]`. Cheaper than Hyper's flash ($0.15/$0.47 qwen3.8-flash) and far below Hyper's raised 0731 prices ($0.44/$1.32). Dependency class = Agnes/StepPlan: swappable backend behind a kill-switch, never load-bearing (§3 core-vs-bootstrap, §9).

### 2.3 Training on customer data
- Disclaimer on plan page = right instinct. Add: explicit **opt-out toggle** (per user), DPDP Act 2023–compliant consent flow, and a future enterprise tier with no-training guarantee. Training target: fine-tuned Ornith-1.5-35B-A3B variant (MIT base — license-clean).
- Brand caution: the long-term pitch is *sensitive-data customers*; blanket training-on-by-default conflicts with it. Default-on for free/basic + visible opt-out is the defensible middle.

### 2.4 Research claims
Position as "research lab **building toward** domain-specific small models"; don't claim published research that doesn't exist yet. The academics series + theta fine-tune become the evidence trail.

## 3. Plans & Economics

| | Free (1-day trial) | Basic | Advanced |
|---|---|---|---|
| Price | $0 | $15 / ₹1500 | $30 / ₹3000 |
| Frontier input | 1M | 20M / mo | 40M / mo |
| Frontier output | ⚠️ recommend 250k cap (output is 3x cost; uncapped = abuse vector) | 5M / mo | 10M / mo |
| theta | 100 requests | 400 req / 5h window (~57.6k/mo ceiling) | 800 req / 5h (~115k/mo ceiling) |

**COGS at 100% quota utilization — HYPER-ONLY core** (verified pricing 2026-08-31/09-01; **90% flash / 10% full**, 80% cache hit):

| | GLM-routed (Hyper) | Qwen-routed (Hyper) |
|---|---|---|
| Basic $15 | $8.94 (**40% margin**) | $9.89 (**34% margin**) |
| Advanced $30 | $17.87 (**40%**) | $19.77 (**34%**) |

Infra share at cohort scale: Hetzner-class VPS ~$5–15/mo ÷ 100 users ≈ $0.05–0.15/user-month — ledgered, negligible. The 10% hard cap converts the old "adversarial 30% full-share" loss case into a fair-use throttle instead of a margin hole.

**Read:** the core is profitable on legitimate infrastructure alone (Hyper team account). Margin guards:
1. Router is the margin — measure full-share per user weekly; **hard cap 10%**, alert at 8%.
2. Effort dial (`low` for bulk) — reasoning tokens are the hidden output multiplier.
3. Fair-use throttle + per-user frontier soft-cap; heavy planners nudged to Advanced.
4. Real utilization is 20–50% of quota for most users (gym economics) — but plan for the whale.

**Core vs bootstrap (governing principle):** margins above are the permanent viability proof — the business MUST stay profitable on Hyper alone. DevPass / Agnes / StepPlan (later: Crof, Nube) are `[BOOTSTRAP]`: temporary cost-cutters for the pre-scale phase, each behind a per-provider kill-switch, with **weekly Hyper-only shadow accounting** (§5) so true core margin is always visible. Exit criteria: upstream ToS pressure, pricing/quantization changes, or scale making the boost unnecessary. **Graduation path:** at user scale, negotiate volume discounts directly (Hyper sales, Zhipu/GLM, Alibaba Model Studio) and migrate spend from bootstrap hacks to legitimate volume pricing.

**Savings calculator display policy:** headline shows **FULL direct-API cost at list rates with no cache discounts** — the honest no-engineering alternative, and the number that makes plan value viscerally clear: Basic saves **72%** vs GLM5.3 list ($54.44 → $15), **79%** vs Qwen3.8-Max ($70 → $15); Advanced same percentages ($108.88 → $30, $140 → $30). Cache-hit slider + theta-metered view live in a secondary collapsible panel.

**theta capacity & actual costs (Q1 RESOLVED — founder-confirmed + researched 2026-09-01):** tokens are INCLUDED in both plans. **Agnes:** $10/mo = 200k requests, tokens included (founder-confirmed; public listing is ambiguous — free Agnes 2.5 Flash tier and Pro ~$19.90 appear publicly, so verify the exact plan terms in-console at integration). ≈ 3.5 maxed-out Basic users per account (≈ $2.86/user). **StepFun Step Plan:** credit tiers — Mini $6.99/400M, Plus $9.99/1.6B, Pro $29/8B, Max $99/40B credits/month (unused credits expire; booster packs available); Step 3.7 Flash PAYG equivalents $0.20/M in, $0.04/M cache hit, $1.15/M out; OpenAI-compat at `api.stepfun.ai/step_plan/v1`. Ledger model: plan fee amortized per credit/request consumed; verify per-model credit burn in console.

## 4. Website Spec

### 4.1 Home
Research-lab positioning: hero ("price per intelligence"), zero-origin tagline, three pillars (inference platform / academics / research toward domain-specific small models for sensitive-data orgs), model cards (glm-5.3, qwen-3.8, theta), CTA → plans. No fabricated research claims.

### 4.2 Coding Plans page
- 3 plan cards + feature table. **Regional pricing (Q3 RESOLVED): India ₹1500/₹3000 via Razorpay; international $15/$30 via Stripe** — intentional split, geo-detected at checkout.
- Transparency block: "how we sustain these prices: prompt-cache engineering, context management, smart routing" (+ training-data disclosure with opt-out link).
- **Savings calculator:** headline = full direct-API cost (list rates, no cache discounts, GLM5.3 / Qwen3.8-Max selectable) vs plan price → savings %. Sliders: monthly tokens, in/out split, cache-hit % (default 80). Secondary collapsible: theta-equivalent metered at USER-FACING theta rates ($0.20 in / $0.04 cache / $0.40 out) + DIY-with-caching view. Rates live in one config (editable without deploy). Display policy confirmed (Q4 RESOLVED).
- Checkout: Stripe (USD, international) + Razorpay (INR/UPI, India), geo-based plan display (Q3 RESOLVED). Coupons accepted here.

### 4.3 Coupon system
Admin-created: code, discount %, usage limit (global + per-user=1), valid window, applicable plans. Enforcement at checkout; subscription records coupon. (Stripe/Razorpay native coupons can back this; we still own the ledger.)

### 4.4 User dashboard
- API keys (`sk-bhaskara-…`), create/revoke.
- **Quota panel — 5 cards** (total + remaining): frontier input tokens · frontier output tokens · theta requests (current 5h window) · theta requests (this month) · plan days remaining (Q5 CONFIRMED).
- **Equivalent API cost card:** "at direct API rates your usage would have cost $X" — frontier usage valued at full-model list rates, theta usage at **theta display rates** ($0.20/$0.04/$0.40). The value story.
- Usage shown = **raw streamed tokens, pre-compression** (never show optimized counts to users).
- Training-data opt-out toggle.

### 4.5 Admin dashboard
- Users table: plan, status, signup date, coupon used.
- Per-user usage: tokens in/out, theta requests, **actual COGS** (dual ledger below) vs plan revenue → per-user margin.
- Aggregate: COGS by provider (Hyper hypercredits, Agnes amortized, StepPlan amortized, DevPass allowance burn — CORE vs BOOTSTRAP tagged) + **infra share** (hosting amortized per active user), router full-share distribution, cache-hit distribution.
- Coupon CRUD + redemption counts.
- Abuse alerts: trial-farm patterns, >8% full-share users (hard cap 10%), quota-burst users.
- **Signup gate (admin dial):** `signup_enabled` + `cohort_cap` (default 100). Auto-close signups at cap; waitlist capture while closed; reopen manually only after cohort review — prevents sudden load/cost spikes.
- **Cohort gate report:** per-cohort P&L (plan revenue vs provider COGS + infra share), error rates, hit rates, full-share distribution → the go/no-go evidence for opening the next 100.

## 5. Metering: Dual Ledger

Every request logs TWO token accounts:
1. **User-facing:** raw streamed prompt/completion tokens (pre-caveman/parsec) → quota deduction + equivalent-API-cost valuation: frontier at full-model list rates; **theta at display rates ($0.20 in / $0.04 cache / $0.40 out per 1M) — these are the prices users see in calculator & dashboard, NOT our costs.**
2. **Internal:** actual provider usage — Hyper: `usage.cost.hypercredits` + cached_tokens verbatim; Agnes: flat $10/mo / 200k requests, tokens included (Q1 RESOLVED); StepFun: plan fee amortized over consumed credits (tiers $6.99/400M … $99/40B); DevPass: metered-at-list burn vs plan allowance. Plus **infra cost share** (hosting/DB monthly ÷ active users) applied at margin level. Weekly **Hyper-only shadow margin** (COGS recomputed excluding every `[BOOTSTRAP]` provider) is computed automatically — the standing proof the core works without hacks. Compression savings appear ONLY here, as margin.

Invariants: quota counted on raw tokens never optimized ones; cached_tokens logged per request from day 1; provider responses archived (traces) for router training + disputes.

**Theta dual pricing (founder directive):** user-facing theta price = **$0.20/M input, $0.04/M cache hit, $0.40/M output** — used in the calculator and any user-facing theta valuation. Admin theta COGS = actual upstream costs (Agnes flat plan, StepFun credits, DevPass DeepSeek). The difference is margin and lives ONLY in the admin ledger — never shown to users as cost.

## 6. Gateway Engine

### Cache commandments (code-enforced)
1. Prefix order fixed: system → tools → docs packs → session → tail. 2. Append-only history. 3. Deterministic serialization; no timestamps/random-ids/dates in prefix. 4. Session→key affinity (consistent hash). 5. Model stickiness per session (cache is per-model). 6. Never re-compress a cached region. 7. Every request logs cached_tokens.

### Provider pool
- **Hyper** (team account: master key + sub-keys; NO multi-account pooling — ToS) `[CORE]`: glm-5.3, glm-5.3-flash, qwen3.8-max, qwen3.8-flash.
- **Agnes** accounts `[BOOTSTRAP]`: agnes-2.5-flash (theta) — resale posture pending (Q1/§2.2).
- **StepPlan** accounts `[BOOTSTRAP]`: stepfun-3.7-flash (theta) — same.
- **DevPass (LLM Gateway)** `[BOOTSTRAP]`: deepseek-v4-flash-0731 at old prices ($0.08/$0.15; 3× allowance economics) — theta hard-route + optional flash overflow; verify prompt-caching pass-through and usage fields in Phase 2.
- **Crof (nahcrof)** `[BOOTSTRAP/PILOT — later phase]`: pay-per-token OpenAI-compat discounter ("open-source at cost", GLM family + own Greg models, multi-provider routing with failover). VERIFY BEFORE TRAFFIC: cheap models may be quantized (GGUF) and infra rides partly on rented GPUs — run eval traces + latency checks first.
- **Nube Cloud AI** `[BOOTSTRAP/PILOT — later phase]`: aggregator claiming up to 90% off GLM/Qwen/DeepSeek/Kimi. VERIFY BEFORE TRAFFIC: quantization level + price volatility (promo pricing may shift). Note: Nube's VPS arm ($1.09–2.4/mo instances, APAC+EU+US nodes) is also a candidate to benchmark against Hetzner for hosting.

### Subsystems
- **Frontier router** (glm-5.3 / qwen-3.8 endpoints): heuristics v0 + Needle2 (14MB local) intent/keyword classifier w/ confidence escalation; effort dial; session stickiness; escalate-on-failure to full model. Switchyard eval spike (time-boxed) as plumbing alternative.
- **theta router:** cheap-turn → agnes/stepfun flash; planning/hard turns → deepseek-v4-flash-0731 (DevPass); provider-health failover; **kill-switch per bootstrap provider degrades theta to Hyper-only flash routing**; 400/800-per-5h rolling windows + monthly ceilings.
- **Identity/disclosure middleware** (per §2.1 disclosed variant): system-prompt identity line; no output rewriting.
- **Compression** (post-beta): deterministic trim at compaction events; Parsec tail-only deterministic mode; Caveman output style — all behind Answer-Keep eval gates, invisible to user-facing metering.
- **Compaction:** threshold 300–500k; strip→summarize; immutable summary block + file manifest.
- **Trial-abuse defense:** email verification + device fingerprint; recommend card-required $0-auth for trial (free 1M tokens with no friction = farm target).

## 7. Academics Series (MDX)

Interactive LLM curriculum for students; ~40 articles in 5 modules; launch with **Module 1 complete** (rest shown as roadmap — honest "coming soon", no stubs).

- **M1 Foundations:** what is an LLM · tokenization *(interactive tokenizer)* · embeddings · attention *(interactive heatmap)* · generation & sampling *(temperature playground)* · the KV cache *(ties into our product story)*
- **M2 Training:** pretraining · SFT · RLHF · scaling laws · evals
- **M3 Inference & serving:** prefill vs decode · KV-cache economics · quantization · speculative decoding · prompt caching *(interactive cost calc — reuses plan-page calculator component)*
- **M4 Agents:** tool calling · context management · RAG · multi-agent · cost engineering
- **M5 Frontier:** MoE · hybrid SSM/attention · reasoning models · distillation · training small domain models
- Components: quizzes per article, progress tracking, code playgrounds; MDX + React islands in Next.js.

## 8. Stack

- **Monorepo:** `apps/web` (Next.js 15, App Router, Tailwind — site + both dashboards), `apps/gateway` (Bun/TS — OpenAI+Anthropic-compat proxy, SSE), `packages/shared` (pricing config, metering types).
- **DB:** Postgres + Drizzle (users, plans, keys, quotas, ledger, coupons, sessions). Redis (or Postgres TTL indexes) for 5h rolling windows.
- **Payments:** Stripe (USD subscriptions + native coupons) + Razorpay (INR/UPI) — pending Q3.
- **ML sidecar (Python):** cactus-needle (Needle2), eval harness, Switchyard spike.
- **Deploy:** single **Hetzner VPS + Coolify** (web + gateway + Postgres + Redis on one box, ~€5–15/mo — verify current lineup on Hetzner's calculator after the June 2026 repricing; Nube VPS is the budget alternative to benchmark). Chosen because the gateway is an I/O-bound SSE proxy (a small box handles hundreds of concurrent streams) and **no platform timeout exists on long generations**. Railway rejected as primary: verified 5-minute HTTP timeout caps long SSE streams (frontier generations with long reasoning exceed it); usage billing ≈ $15–30/mo sustained anyway. Railway/Vercel acceptable for the web app only. Migration path: second VPS + managed Postgres when cohort 3+ lands.

## 9. Risk Register

| Risk | Sev | Mitigation |
|---|---|---|
| `[CONTESTED]` output-scrubbing/identity-faking discovered publicly | **Existential** | Not built; disclosed routing instead (§2.1) |
| `[CONTESTED]` Agnes/StepPlan accounts banned (ToS resale) | High | Reseller agreements; honest "ensemble preview" label; Hyper-side theta backends (§2.2) |
| Whale with planning-heavy workload → negative margin | High | 10% full-share hard cap + alert at 8%, fair-use, effort dial (§3) |
| Free-trial farming | Med | $0 card-auth or strong verification + fingerprint |
| Hyper cache scope/TTL undocumented | Med | Day-1 instrumentation; empirical cross-session test; email support |
| Training-data backlash (enterprise ambition) | Med | Opt-out toggle, DPDP consent, enterprise no-training tier later |
| Payment-provider ban for misleading claims | Med | Honest copy (§2); calculator uses real list prices |
| INR vs USD pricing split | Low | RESOLVED (Q3): intentional regional pricing ₹1500/₹3000 vs $15/$30, geo-based display |
| DevPass/Agnes/StepPlan/Crof/Nube allowance exhaustion, pricing, ToS or quantization surprise | Med | All `[BOOTSTRAP]` behind kill-switches + pilot-verified before traffic; theta degrades to Hyper flash routing; allowance-burn monitoring |
| Bootstrap creep — core margin quietly comes to depend on hacks | High | Weekly Hyper-only shadow accounting in admin; quarterly exit review; §3 principle + volume-discount graduation path |
| Platform timeout kills long SSE generations | Med | Self-hosted VPS primary (no platform limit); Railway 5-min HTTP cap disqualifies it as gateway host |

## 10. Build Order

1. **Foundation** — repo, DB schema, auth, provider clients, metering ledger (nothing else is measurable without it)
2. **Gateway v1** — 3 model endpoints, routing v0 (heuristics), quotas + rate windows, dual ledger
3. **Site v1** — home, plans, calculator, checkout, coupons
4. **Dashboards** — user (5 quotas + equivalent cost + keys + opt-out), admin (COGS, margins, coupons, alerts)
5. **Academics v1** — MDX pipeline + Module 1 + interactive components
6. **Beta hardening** — abuse defense, load test, cache-hit verification, router full-share monitoring
7. **Post-beta** — Needle2 router layer, compression stack, compaction, docs packs (from prior gateway plan), theta fine-tune (Ornith), enterprise tier
