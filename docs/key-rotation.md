# Key rotation runbook (Bhaskara gateway/web)

Scope: this repo only. Every variable below was found by grepping
`process.env` in `apps/gateway/src` (plus `apps/web/src/lib/payments.ts`
for the PSP placeholders). Anything not verifiable from the repo is marked
[UNVERIFIED].

## 0. Secret inventory (code-grounded)

| Secret env var | Read in code | Default / notes |
|---|---|---|
| `HYPER_API_KEY` / `HYPER_API_KEYS` (comma-separated) | `apps/gateway/src/routes/chat.ts` (`hyperKeys()`), `routes/messages.ts`, `lib/compaction/compact.ts` | No default; missing → `throw "HYPER_API_KEY(S) not configured"` |
| `HYPER_BASE_URL` | `providers/hyper.ts` | `https://hyper.charm.land` |
| `CAMEL_API_KEY` | `providers/camel.ts` (`camelEnabled()`), `routes/chat.ts` | No default; missing → lane skipped |
| `CAMEL_BASE_URL` | `providers/camel.ts` | `https://stream.camelai.com/v1` |
| `AGNES_API_KEY` | `providers/agnes.ts` (`agnesEnabled()`), `routes/chat.ts` | No default; missing → lane skipped |
| `AGNES_BASE_URL` | `providers/agnes.ts` | `https://apihub.agnes-ai.com/v1` |
| `STEPFUN_API_KEY` | `providers/stepfun.ts` (`stepfunEnabled()`), `routes/chat.ts` | No default; missing → lane skipped |
| `STEPFUN_BASE_URL` | `providers/stepfun.ts` | `https://api.stepfun.ai/step_plan/v1` |
| `LLMGATEWAY_API_KEY` | `providers/llmgateway.ts` (`llmGatewayEnabled()`), `routes/chat.ts`, `routes/messages.ts` | No default; missing → fallback lane skipped |
| `LLMGATEWAY_BASE_URL` | `providers/llmgateway.ts` | `https://api.llmgateway.io/v1` |
| `DEVPASS_API_KEY` | `providers/devpass.ts` (`devpassEnabled()`), `routes/chat.ts` | Also gated on `PROVIDER_CLASS.devpass === "bootstrap"` (`@bhaskara/shared/pricing`) |
| `DEVPASS_BASE_URL` | `providers/devpass.ts` | `https://llmgateway.io/v1` (file notes "verify actual base in console") |
| `FEIHOA_API_KEY` | `providers/feihoa.ts` (`feihoaEnabled()`), `routes/chat.ts` | No default; missing → lane + backchannel off |
| `FEIHOA_BASE_URL` / `FEIHOA_MODEL` | `providers/feihoa.ts` | `https://api.feihoa.com/v1` / `Qwen3.8-27B-Uncensored` |
| `YOLO_AUTO_API_KEY` | `providers/yolo.ts` (`yoloEnabled()`), `src/index.ts` (boot probe), `lib/llm-judge.ts`, `routes/chat.ts` | No default; missing → lane + boot probe skipped |
| `YOLO_BASE_URL` / `YOLO_MODEL` | `providers/yolo.ts`, `src/index.ts` | `https://yolo-auto.com/v1` / `qwen3.8-27b` |
| `DATABASE_URL` | `apps/gateway/src/db/index.ts`, `apps/gateway/drizzle.config.ts`, `apps/gateway/scripts/docs-setup.ts`, `apps/web/src/db/index.ts`, `apps/web/drizzle.config.ts` | `postgres://localhost:5432/bhaskara` |
| `PORT` | `apps/gateway/src/index.ts` | `8787`; ops run on `PORT=8793` |
| `STRIPE_SECRET_KEY` | `apps/web/src/lib/payments.ts` (`paymentMode()`) | Placeholder: stripe mode throws `"Stripe provider not yet wired"` until implemented |
| `RAZORPAY_KEY_ID` | `apps/web/src/lib/payments.ts` (`paymentMode()`) | Placeholder: razorpay mode throws until implemented |
| `STRIPE_WEBHOOK_SECRET`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET` | Comments only (`payments.ts`, `app/api/webhook/payments/route.ts`) — no `process.env` reader | Placeholders; no rotation target yet |
| `BETTER_AUTH_SECRET` / `BETTER_AUTH_URL` | Present in root `.env`; no `process.env` reader found in `apps/*/src` [UNVERIFIED] | Rotate only if a reader lands; see §6 |
| `BHASKARA_TEST_KEY` | `apps/gateway/scripts/load-test.ts` only (client `sk-bhaskara-…` key for load runs) | Not a server secret; mint per §5 |
| `sk-bhaskara-…` client keys | `apps/gateway/src/lib/auth.ts` (`newApiKey()`, sha256-hashed in DB) | Prefix `sk-bhaskara-`, first 16 chars stored for display |

Non-secret knobs that look secret-adjacent (do NOT rotate):
`HYPER_DAILY_BUDGET_USD`, `BHASKARA_BACKCHANNEL`, `BHASKARA_COMPACT_THRESHOLD/SPAN`,
`BHASKARA_COMPRESS/COMPACT/SHADOW/DOCS`, `BHASKARA_QWEN_SMART`.

## 1. Common rotation flow (all provider keys)

1. Generate the replacement key on the provider side (per-provider notes in §2).
2. Update the env var in `apps/gateway/.env` — the gateway's single source of
   truth. Bun auto-loads it from the process cwd; root `.env` is NOT read by
   the gateway. Provider keys here: `AGNES_API_KEY`, `CAMEL_API_KEY`,
   `CAMEL_BASE_URL`, `FEIHOA_API_KEY`, `GENERALCOMPUTE_API_KEY`,
   `HYPER_API_KEY`, `LLMGATEWAY_API_KEY`, `STEPFUN_API_KEY`,
   `YOLO_AUTO_API_KEY` (+ `BHASKARA_*` tuning). Root `.env` keeps legacy
   copies of `CAMEL_*`/`HYPER_*` — harmless fallback for root-cwd launches,
   but never rely on them: exported vars SHADOW the file, which is exactly
   how lanes went dark in the past.
3. Restart the gateway from `apps/gateway` (no sourcing — the file loads itself):
   ```sh
   cd apps/gateway && PORT=8793 bun run src/index.ts
   ```
   Background: append `nohup ... &`. Health-check after (step 4).
4. Health-check (route verified in `apps/gateway/src/routes/chat.ts`):
   ```sh
   curl -s http://localhost:8793/health
   ```
   Expect `{"ok":true,"providers":{"camel":…,"agnes":…,"stepfun":…,"devpass":…,"feihoa":…,"yolo":…,"llmgateway":…},…}`.
   A freshly rotated provider should read `true`; `false` means the env var
   is still empty (or, for camel, a 5xx cooldown is active).
5. Send one real turn per rotated lane (model `theta`, `stream: false`) and
   confirm a 2xx plus a new `usage_ledger` row (§7 in the load-test script
   pattern). A first 2xx also clears any dead-lane cooldown
   (`camelAlive` / `agnesAlive` reset the backoff on success).

## 2. Per-provider notes

- **Hyper (`HYPER_API_KEY` / `HYPER_API_KEYS`)** — Generate: [UNVERIFIED] team-account dashboard (code notes "Team account, master/sub-keys, NO pooling (ToS)" in `providers/hyper.ts`). Rotation: replace the value (or one comma entry of `HYPER_API_KEYS` for zero-downtime, then remove the old entry and restart again). If skipped/stale: every chat turn throws `"HYPER_API_KEY(S) not configured"` or upstream 401s; the summarizer (`lib/compaction/compact.ts`) also fails. The comma list is split in `hyperKeys()` — no spaces required, entries are trimmed.
- **Camel (`CAMEL_API_KEY`)** — Generate: [UNVERIFIED] CamelAI plan dashboard (`https://stream.camelai.com` per `CAMEL_BASE`). Rotation: §1 flow. If skipped/stale: `camelEnabled()` is false so the theta first lane is skipped; a 401/402/403 at runtime calls `markCamelDead()` → backoff 5m → 15m → 45m → 2h cap, cleared only by a 2xx or a restart. Plan concurrency is 1 (`CAMEL_MAX_CONCURRENCY`) — do not load-test above it.
- **Agnes (`AGNES_API_KEY`)** — Generate: [UNVERIFIED] Agnes dashboard (code comment in `providers/agnes.ts` notes the 2026-09-05 rotation came from "the Agnes dashboard", key prefix `cpk-`). Rotation: §1 flow. If skipped/stale: lane skipped; runtime 401/402 calls `markAgnesDead()` with the same 5m→2h backoff as camel. Concurrency cap is 10 (`AGNES_MAX_CONCURRENCY`).
- **StepFun (`STEPFUN_API_KEY`)** — Generate: [UNVERIFIED] StepFun console for the Step Plan allowance (`https://api.stepfun.ai` per `STEPFUN_BASE`). Rotation: §1 flow. If skipped/stale: lane skipped; server 429s (concurrency limit 8, mirrored at 6) call `markStepfunThrottled()` → 20s cooldown.
- **LLMGateway (`LLMGATEWAY_API_KEY`)** — Generate: [UNVERIFIED] LLMGateway console (`https://api.llmgateway.io` per `LLMGATEWAY_BASE`). Rotation: §1 flow. If skipped/stale: paid fallback lane behind Hyper is skipped; Hyper outages then have one fewer failover target (`routes/chat.ts`, `routes/messages.ts`).
- **DevPass (`DEVPASS_API_KEY`)** — Generate: [UNVERIFIED] DevPass/LLMGateway console (file header says "verify actual base in console"). Rotation: §1 flow. If skipped/stale: `devpassEnabled()` is false (also requires `PROVIDER_CLASS.devpass === "bootstrap"`), theta-only fallback target disappears.
- **Feihoa (`FEIHOA_API_KEY`)** — Generate: [UNVERIFIED] Feihoa console (`https://api.feihoa.com` per `FEIHOA_BASE`). Rotation: §1 flow. If skipped/stale: lane skipped and `BHASKARA_BACKCHANNEL=feihoa` backchannel silently degrades (guarded by `feihoaEnabled() || yoloEnabled()` in `routes/chat.ts`).
- **Yolo (`YOLO_AUTO_API_KEY`)** — Generate: [UNVERIFIED] Yolo console (`https://yolo-auto.com` per `YOLO_BASE`). Rotation: §1 flow; the boot probe in `src/index.ts` picks the new key up at startup (15s timeout; failure pre-marks the lane wedged for 30m via `markYoloWedged`). If skipped/stale: lane skipped, boot probe skipped, `yoloEnabled()` false everywhere including `lib/llm-judge.ts`.

## 3. `DATABASE_URL`

Readers: gateway `src/db/index.ts`, `drizzle.config.ts`, `scripts/docs-setup.ts`;
web `src/db/index.ts`, `drizzle.config.ts`. Default `postgres://localhost:5432/bhaskara`.

1. Rotate at the database ([UNVERIFIED] provider-specific: `ALTER USER … PASSWORD`, connection-string update).
2. Update `DATABASE_URL` everywhere the two apps load env (root `.env`, gateway/web env files as deployed).
3. Restart gateway (§1.3) and web. If skipped/stale: all DB calls fail — auth (`lib/auth.ts`), ledger writes (`lib/ledger.ts`, logged as `[ledger] write failed`), quotas, plan limits, fleet config.

## 4. Stripe / Razorpay (placeholders — no live rotation yet)

`paymentMode()` in `apps/web/src/lib/payments.ts` returns `"stub"` while
`STRIPE_SECRET_KEY` / `RAZORPAY_KEY_ID` are absent; stub checkout completes via
`/checkout/mock` → `/api/checkout/complete`. Setting either key flips live
traffic onto a provider path that currently throws (`"not yet wired"`), so do
NOT set PSP keys until the PSP implementation lands. Webhook secrets
(`STRIPE_WEBHOOK_SECRET`, `RAZORPAY_WEBHOOK_SECRET`) exist only in comments in
`app/api/webhook/payments/route.ts` — nothing to rotate.

## 5. Client API keys (`sk-bhaskara-…`)

Minted by `newApiKey()` in `apps/gateway/src/lib/auth.ts` (24 random bytes,
`sk-bhaskara-` prefix, sha256 stored, 16-char prefix displayed). To rotate a
client key: insert the new hash into `api_keys`, hand out the `full` value
once (it is never stored), verify a `curl` with `Bearer <new>` 2xxs, then set
`active=false` on the old row. `BHASKARA_TEST_KEY` for
`bun scripts/load-test.ts` is one such client key — mint a dedicated one, keep
it out of logs (the script never prints it).

## 6. `BETTER_AUTH_*` [UNVERIFIED]

`BETTER_AUTH_SECRET` / `BETTER_AUTH_URL` exist in root `.env` but no reader was
found under `apps/*/src`. Do not rotate blindly: find the reader first
(likely the web auth layer), then rotate secret + restart web and re-verify
login/session flows. Rotating a secret nobody reads is harmless but pointless;
rotating one a session layer DOES read invalidates all sessions — plan a
maintenance window once the reader is confirmed.
