# Where provider keys go

There are two places, and which one you use depends on whether the provider is
*hardcoded* or *fleet-managed*. Getting this wrong is silent: the gateway simply
never routes to that lane, and the ladder quietly falls through to the next one.

## 1. Fleet providers — the admin panel (this is where new keys go)

**`/admin` → Fleet tab.** No deploy, no restart. Adding a lane is three rows in
the database: a provider, one or more accounts (each with its key), and the
models it serves.

Take effect within 15 seconds (the fleet has an in-process cache with a 15s TTL).

Use this for:

| Provider | Why it is here |
|---|---|
| `teamorouter` | glm-5.3-flash + DeepSeek lanes, metered or flat |
| `electronhub` | `glm-5.3:dev` full, first lane in the full ladder — needs a Coding Plan |
| `openference` | glm-5.3 full, flat rate |
| `pareto` | glm-5.3 full + flash, flat rate |
| anything new | if you are adding it, it goes here |

### What each row needs

**Provider** — `id` (the slug the router matches on, e.g. `pareto`), `base_url`,
`protocol` (`openai` or `anthropic`), `auth_style` (`bearer` or `x-api-key`),
`billing` (`flat` for a subscription, `metered` for per-token, `credits` for
prepaid bundles).

> The `id` must match the name used in the routing ladders in
> `packages/shared/src/pricing.ts`. A provider called `pareto-2` in the admin
> panel will never be reached, because the ladder is looking for `pareto`.

**Account** — `label`, the `api_key`, a `weight` for round-robin, and `limits`
as JSON. Multiple accounts per provider rotate automatically, and an account that
returns 429/401/402 is cooled down and skipped rather than retried.

`limits` is where a flat plan's real ceiling goes, so the router stops using a
lane *before* the provider starts rejecting:

```json
{ "maxConcurrent": 4, "per5hRequests": 2500, "perWeekRequests": 35000, "dailyCostUsd": 20 }
```

**Model** — `model_id` (the upstream name), `alias` (what clients may call it),
`tier` (`full` or `flash`), `context_window`, `max_output`, and the three rate
columns. The rates are **COGS only** — they feed the ledger and the admin
economics, and are never shown to users.

### Seeding it faster

The Fleet tab pulls from a models.dev catalogue, so a known provider can be
added as a preset and then edited rather than typed from scratch.

### The four lanes, registered

`apps/gateway/src/db/seed-fleet.ts` registers teamorouter, electronhub,
openference and pareto with the values below. It reads keys from the
environment, never from the file, so the same command works locally and on the
VPS:

```bash
TEAMOROUTER_API_KEY=… ELECTRONHUB_API_KEY=… OPENFERENCE_API_KEY=… \
PARETO_API_KEY=… PARETO_API_KEY_2=… \
  bun src/db/seed-fleet.ts --apply
```

Verified against the live APIs on 2026-09-13:

| Provider | Base URL | Billing | Model ids that exist |
|---|---|---|---|
| `teamorouter` | `https://api.teamorouter.com/v1` | metered | `glm-5.3-flash-free`, `glm-5.3-flash`, `glm-5.3`, `deepseek-flash` |
| `electronhub` | `https://api.electronhub.ai/v1` | flat (DevPass) | `glm-5.3:dev` (262k window), `glm-5.3-flash:dev` (1M window) — plus the plain ids, which this account cannot use |
| `openference` | `https://api.openference.com/v1` | credits (per request) | `glm-5.3` (899k window, case-insensitive) |
| `pareto` | `https://api.paretoinference.com/v1` | credits | `glm-5.3`, `glm-5.3-flash`, and the `z-ai/` forms |

**Electron Hub needs a Coding Plan.** The ladder asks for `glm-5.3:dev`, which is
the flat-rate DevPass variant — `devpass_only: true` in Electron's catalogue,
priced `input 0 / output 0` with a plan multiplier of 2. The plain `glm-5.3` is a
separate premium model the account 402s on, and it must not be requested here:
the two ids bill differently even though they are the same weights.

Without a Coding Plan the `:dev` ids answer `403 This model is exclusive to the
Electron Hub Coding Plan… use your DevPass API key`, so the key must come from
[app.electronhub.ai](https://app.electronhub.ai) after subscribing. Until then
the lane fails fast on every full turn and the ladder walks past it — same
observable cost as the 402 it replaced, so swapping the key in is the whole fix.

The 262k window is the narrowest in the full ladder (openference accepts 899k,
and pareto/hyper/llmgateway declare none), so it is carried as
`maxInputTokens` on the lane and an oversized turn skips Electron for
openference instead of collecting a 400.

**Three behaviours worth knowing before debugging a lane that "looks up":**

- **Pareto rejects `stream_options` unless `stream: true`** (`400 stream_options
  requires stream=true`). Most lanes ignore the field, which is why the gateway
  used to send it unconditionally; that made every non-streaming Pareto turn
  fail over to Hyper. Send it only on streaming requests.
- **`glm-5.3-flash-free` is a daily allowance**, not an unlimited tier. Once
  spent it returns `402` until 09:00 Pacific. Budget for the paid id and treat
  the free one as a bonus, never as the lane a ladder depends on.
- **TeamoRouter's flash ids are reasoning models.** On 2026-09-13 a 10-token
  `max_tokens` produced empty `content` because all 57 completion tokens went to
  `reasoning_content`. An empty completion at a small `max_tokens` is the
  budget being consumed upstream, not a broken lane.

## 2. Hardcoded lanes — `apps/gateway/.env`

These five have bespoke failure handling in `routes/chat.ts` — per-provider
semaphores, cooldown marking, and in the case of Camel, exact metered cost
readback from the upstream response. They read their keys from the environment
and are not managed from the admin panel.

| Lane | Variable |
|---|---|
| Hyper (the reference lane, core fallback) | `HYPER_API_KEY` or `HYPER_API_KEYS` (comma-separated, rotated per session) |
| Agnes (flat, prepaid) | `AGNES_API_KEY` |
| StepFun (metered) | `STEPFUN_API_KEY` |
| Camel (metered, exact cost) | `CAMEL_API_KEY`, `CAMEL_BASE_URL` |
| LLMGateway (same catalogue as Hyper) | `LLMGATEWAY_API_KEY` |

These are also the ones copied into `.env.deploy` on the VPS. Fleet keys are not
in that file, because they live in the database — make sure the production
database has them before switching traffic.

## The two mistakes worth avoiding

**A ladder lane with no key.** The lane reports unhealthy and the ladder skips
it. That is correct behaviour, but it means the symptom is "traffic went to the
expensive fallback", not an error. `/health` shows lane health directly:

```bash
curl -s https://your-gateway/health | jq .lanes
```

**A provider id that does not match the ladder.** Same symptom, harder to spot,
because the provider looks healthy in the panel. The ids must match
`packages/shared/src/pricing.ts` exactly.
