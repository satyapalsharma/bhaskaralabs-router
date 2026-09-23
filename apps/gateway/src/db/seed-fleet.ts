// Fleet registration for the four DB-managed lanes.
//
// These providers are not env-configured — they live in the fleet tables so an
// account or model can be added without a deploy. That also means the routing
// ladders in packages/shared/src/pricing.ts can reference a provider that does
// not exist in the database yet, and the failure is silent: the lane reports
// unhealthy, the ladder skips it, and traffic quietly moves to the expensive
// fallback. This script closes that gap.
//
// Keys come from the environment, never from this file. Set them in the deploy
// environment before running against production:
//
//   TEAMOROUTER_API_KEY, ELECTRONHUB_API_KEY, OPENFERENCE_API_KEY,
//   PARETO_API_KEY, PARETO_API_KEY_2
//
//   bun src/db/seed-fleet.ts            # report what would change
//   bun src/db/seed-fleet.ts --apply    # write
//
// Idempotent: re-running updates an existing row rather than duplicating it, so
// rotating a key is the same command with a new environment value.

import postgres from "postgres";
import { randomUUID } from "node:crypto";

const url = process.env.DATABASE_URL ?? "postgres://localhost:5432/bhaskara";
const apply = process.argv.slice(2).includes("--apply");
const sql = postgres(url, { connect_timeout: 5 });

interface ProviderSpec {
  id: string;
  name: string;
  baseUrl: string;
  authStyle: "bearer" | "x-api-key";
  billing: "flat" | "metered" | "credits";
  notes: string;
  /** Env var holding the key, plus the account label to store it under. */
  accounts: Array<{ label: string; env: string; limits: Record<string, number> }>;
  models: Array<{
    modelId: string;
    alias?: string;
    tier: "full" | "flash";
    contextWindow: number;
    maxOutput: number;
    input: number;
    output: number;
    cacheHit?: number;
    reasoning?: boolean;
    /** Default true. false on a model the PROVIDER has paused (not an admin
     *  disable) so a fresh seed does not advertise a lane that 402s. */
    active?: boolean;
    note?: string;
  }>;
}

/**
 * Rates are USD per 1M tokens and are COGS only — they feed the ledger and the
 * admin economics, never the user-facing rates in the same file. They mirror
 * `RATE_CARDS` in packages/shared/src/pricing.ts; a change there belongs here
 * too, or the ledger and the router will disagree about what a turn cost.
 */
const FLEET: ProviderSpec[] = [
  {
    id: "teamorouter",
    name: "TeamoRouter",
    baseUrl: "https://api.teamorouter.com/v1",
    authStyle: "bearer",
    billing: "metered",
    // Carries three things the other lanes do not: a free flash tier, a paid
    // flash tier at Hyper's rates, and DeepSeek V4.1 Flash for the theta tail.
    notes: "OpenAI-compatible. glm-5.3-flash-free is a DAILY allowance (resets 09:00 PT) and returns 402 once spent — the ladder must degrade past it, not fail.",
    accounts: [{ label: "teamorouter-1", env: "TEAMOROUTER_API_KEY", limits: {} }],
    models: [
      {
        modelId: "glm-5.3-flash-free",
        tier: "flash",
        contextWindow: 200000,
        maxOutput: 32768,
        input: 0,
        output: 0,
        note: "Free daily allowance. Zero COGS until the allowance is spent, then 402.",
      },
      {
        modelId: "glm-5.3-flash",
        tier: "flash",
        contextWindow: 200000,
        maxOutput: 32768,
        input: 0.16332,
        output: 0.5444,
        cacheHit: 0.0315752,
        note: "Reasoning model: the visible content can be empty when max_tokens is small, because reasoning tokens are billed from the same budget.",
      },
      {
        modelId: "deepseek-flash",
        tier: "flash",
        contextWindow: 200000,
        maxOutput: 32768,
        input: 0.15,
        output: 0.6,
        cacheHit: 0.003,
        reasoning: true,
      },
      {
        modelId: "glm-5.3",
        tier: "full",
        contextWindow: 200000,
        maxOutput: 32768,
        input: 1.52432,
        output: 4.79072,
        cacheHit: 0.283088,
      },
    ],
  },
  {
    id: "electronhub",
    name: "Electron Hub",
    baseUrl: "https://api.electronhub.ai/v1",
    authStyle: "bearer",
    billing: "flat",
    // Verified 2026-09-13 against the live API. The base URL is the only one
    // that answers: every other spelling (electronhub.ai/api/v1, no /v1, a
    // /devpass/ segment) returns a Cloudflare HTML page rather than JSON.
    //
    // The account has a Coding Plan, so the lane asks for the DevPass ids:
    // `glm-5.3:dev` is `devpass_only`, priced input 0 / output 0 with a plan
    // multiplier, and is what a DevPass key is allowed to call. The plain
    // `glm-5.3` is a *separate premium model* this account 402s on, so the two
    // ids are not interchangeable even though they are the same weights.
    //
    // The key must be a DevPass one (`ek-dev-…`). A regular `ek-…` key
    // authenticates fine and passes /models, but every `:dev` call answers 403
    // "exclusive to the Electron Hub Coding Plan".
    notes: "Flat DevPass lane. Requires a `ek-dev-…` key: a regular key authenticates but 403s on every :dev model. Declared input window is 262k — the narrowest in the full ladder, carried as maxInputTokens on the lane so long turns skip it rather than collect a 400.",
    accounts: [{ label: "electronhub-1", env: "ELECTRONHUB_API_KEY", limits: {} }],
    models: [
      {
        modelId: "glm-5.3:dev",
        tier: "full",
        contextWindow: 262000,
        maxOutput: 32768,
        // List rates, following the same convention as the other flat lanes:
        // `FLAT_PROVIDERS` is what zeroes actual_cost_usd, so these are the
        // reference prices Electron publishes (its own `reference` field,
        // 1.4/4.4) and keep the admin panel comparable against the metered
        // lanes instead of reading as a free model.
        input: 1.4,
        output: 4.4,
        cacheHit: 0.26,
        note: "DevPass variant of glm-5.3. 262k window — narrower than every other full lane.",
      },
      {
        modelId: "glm-5.3-flash:dev",
        tier: "flash",
        contextWindow: 1000000,
        maxOutput: 32768,
        input: 0.15,
        output: 0.5,
        cacheHit: 0.03,
        note: "DevPass variant of glm-5.3-flash. Reasoning model: small max_tokens return empty content with finish_reason=length.",
      },
    ],
  },
  {
    id: "openference",
    name: "Openference",
    baseUrl: "https://api.openference.com/v1",
    authStyle: "bearer",
    // `flat`, and it has to match `FLAT_PROVIDERS` in pricing.ts. The two were
    // out of step — the ledger read the hardcoded list and booked these turns at
    // $0, while the router read this column, priced the lane at list, and
    // refused every switch into it on the cache-wipe penalty. The lane looked
    // free in the spend report and metered to the routing decision, so it was
    // never used and never missed.
    //
    // The allowance is the true shape of the cost: a free tier of 400 requests
    // per 5 hours, and its 402 says "top up your balance" once that is spent.
    // Requests, not tokens, are the scarce unit — which is why it sits in the
    // full ladder only: spending one on a flash call wastes an allowance a full
    // call needs. Per-token rates are recorded at list so the ledger's unit
    // economics stay comparable even though the invoice is per request.
    billing: "flat",
    notes: "Meters requests, not tokens: 400 per 5 hours, then 402 'top up your balance'. Model ids are case-insensitive (glm-5.3 == GLM-5.3) but /models advertises uppercase.",
    accounts: [{ label: "openference-1", env: "OPENFERENCE_API_KEY", limits: {} }],
    models: [
      {
        modelId: "glm-5.3",
        tier: "full",
        contextWindow: 200000,
        maxOutput: 32768,
        input: 1.52432,
        output: 4.79072,
        cacheHit: 0.283088,
      },
    ],
  },
  {
    id: "pareto",
    name: "Pareto Inference",
    baseUrl: "https://api.paretoinference.com/v1",
    authStyle: "bearer",
    billing: "credits",
    // Two accounts sharing one prepaid balance. The router can rotate between
    // them; the balance is the shared ceiling, so each is capped at half of the
    // daily allowance rather than each getting the full amount.
    notes: "Prepaid credits. Accepts both `glm-5.3-flash` and `z-ai/glm-5.3-flash`; /models advertises the z-ai/ form. Two accounts, shared balance. Carries DeepSeek V4.1 Flash for theta's third rung.",
    accounts: [
      { label: "pareto-1", env: "PARETO_API_KEY", limits: { dailyCostUsd: 20, maxConcurrent: 3 } },
      { label: "pareto-2", env: "PARETO_API_KEY_2", limits: { dailyCostUsd: 20, maxConcurrent: 3 } },
    ],
    models: [
      {
        // Provider has glm-5.3 FULL paused on their side (2026-09-18) — only
        // glm-5.3-flash is running. Re-enable when they restore it, and put
        // the rung back in GLM_FULL_CHAIN (packages/shared/src/pricing.ts).
        modelId: "glm-5.3",
        tier: "full",
        contextWindow: 200000,
        maxOutput: 32768,
        input: 1.52432,
        output: 4.79072,
        cacheHit: 0.283088,
        active: false,
      },
      {
        modelId: "glm-5.3-flash",
        tier: "flash",
        contextWindow: 200000,
        maxOutput: 32768,
        input: 0.16332,
        output: 0.5444,
        cacheHit: 0.0315752,
      },
      {
        // The id is namespaced and the namespace is required: Pareto's
        // catalogue lists `deepseek/deepseek-v4-flash` and nothing shorter,
        // unlike GLM which it serves under both forms. Verified live
        // 2026-09-13 — /models returns exactly three entries, and this is the
        // only DeepSeek among them.
        //
        // 1M window, which is why it sits third on THETA_CHAIN: it is the one
        // theta rung that can take a prompt no other lane would accept.
        modelId: "deepseek/deepseek-v4-flash",
        tier: "flash",
        contextWindow: 1048576,
        maxOutput: 32768,
        input: 0.15,
        output: 0.6,
        cacheHit: 0.003,
        reasoning: true,
        note: "DeepSeek V4.1 Flash. Namespaced id; list rates match the same model on TeamoRouter.",
      },
    ],
  },
];

console.log(`fleet registration — ${apply ? "APPLYING" : "dry run"}`);
console.log(`  target: ${url.replace(/:[^:@]*@/, ":***@")}\n`);

let changes = 0;
const missing: string[] = [];

for (const p of FLEET) {
  console.log(`${p.id} — ${p.name}`);
  console.log(`  base ${p.baseUrl}  billing=${p.billing}`);

  const existing = await sql<{ id: string }[]>`select id from upstream_providers where id = ${p.id}`;
  if (existing.length === 0) {
    console.log(`  provider: CREATE`);
    changes++;
    if (apply) {
      await sql`
        insert into upstream_providers (id, name, base_url, protocol, auth_style, billing, active, notes)
        values (${p.id}, ${p.name}, ${p.baseUrl}, 'openai', ${p.authStyle}, ${p.billing}, true, ${p.notes})
      `;
    }
  } else {
    console.log(`  provider: exists`);
    if (apply) {
      await sql`
        update upstream_providers
        set name = ${p.name}, base_url = ${p.baseUrl}, auth_style = ${p.authStyle},
            billing = ${p.billing}, notes = ${p.notes}
        where id = ${p.id}
      `;
    }
  }

  for (const a of p.accounts) {
    const key = process.env[a.env];
    if (!key) {
      missing.push(`${a.env} (account ${a.label})`);
      console.log(`  account ${a.label}: SKIP — ${a.env} not set`);
      continue;
    }
    const acc = await sql<{ id: string }[]>`
      select id from upstream_accounts where provider_id = ${p.id} and label = ${a.label}
    `;
    console.log(`  account ${a.label}: ${acc.length === 0 ? "CREATE" : "update key"}`);
    changes++;
    if (apply) {
      const limits = Object.keys(a.limits).length > 0 ? JSON.stringify(a.limits) : null;
      if (acc.length === 0) {
        await sql`
          insert into upstream_accounts (id, provider_id, label, api_key, disabled, weight, limits)
          values (${randomUUID()}, ${p.id}, ${a.label}, ${key}, false, 1, ${limits})
        `;
      } else {
        await sql`
          update upstream_accounts
          set api_key = ${key}, disabled = false, cooldown_until = null, limits = ${limits}
          where id = ${acc[0].id}
        `;
      }
    }
  }

  for (const m of p.models) {
    const model = await sql<{ id: string }[]>`
      select id from upstream_models where provider_id = ${p.id} and model_id = ${m.modelId}
    `;
    console.log(`  model ${m.modelId} (${m.tier}): ${model.length === 0 ? "CREATE" : "update"}`);
    changes++;
    if (apply) {
      const cacheHit = m.cacheHit ?? 0;
      const reasoning = m.reasoning ?? false;
      if (model.length === 0) {
        await sql`
          insert into upstream_models
            (id, provider_id, model_id, alias, visibility, tier, context_window, max_output,
             input_usd_per_m, output_usd_per_m, cache_read_usd_per_m, reasoning, tool_call, active)
          values
            (${randomUUID()}, ${p.id}, ${m.modelId}, ${m.alias ?? null}, 'public', ${m.tier},
             ${m.contextWindow}, ${m.maxOutput}, ${m.input}, ${m.output}, ${cacheHit},
             ${reasoning}, true, ${m.active ?? true})
        `;
      } else {
        // `active` is written only when the seed explicitly declares it (a
        // provider pausing a model) — a plain re-seed must not clobber an
        // admin disable made in the panel.
        if (m.active !== undefined) {
          await sql`
            update upstream_models
            set tier = ${m.tier}, context_window = ${m.contextWindow}, max_output = ${m.maxOutput},
                input_usd_per_m = ${m.input}, output_usd_per_m = ${m.output},
                cache_read_usd_per_m = ${cacheHit}, reasoning = ${reasoning}, active = ${m.active}
            where id = ${model[0].id}
          `;
        } else {
          await sql`
            update upstream_models
            set tier = ${m.tier}, context_window = ${m.contextWindow}, max_output = ${m.maxOutput},
                input_usd_per_m = ${m.input}, output_usd_per_m = ${m.output},
                cache_read_usd_per_m = ${cacheHit}, reasoning = ${reasoning}
            where id = ${model[0].id}
          `;
        }
      }
    }
  }

  // Prune models this provider no longer lists. Without this the table drifts
  // away from the seed and the admin panel advertises models the lane cannot
  // serve — how electronhub kept showing a plain `glm-5.3` with a 200k window
  // long after the ladder moved to `glm-5.3:dev`. Nothing references this table,
  // so removal is safe; accounts are never pruned, because their rows hold the
  // live keys and a seed run must not be able to delete one.
  const listed = p.models.map((m) => m.modelId);
  const stale = await sql<{ model_id: string }[]>`
    select model_id from upstream_models
     where provider_id = ${p.id} and model_id <> all(${sql.array(listed)}::text[])
  `;
  for (const s of stale) {
    console.log(`  model ${s.model_id} (unlisted) : DELETE`);
    changes++;
    if (apply) {
      await sql`delete from upstream_models where provider_id = ${p.id} and model_id = ${s.model_id}`;
    }
  }
  console.log();
}

console.log(`${changes} change${changes === 1 ? "" : "s"} ${apply ? "applied" : "would apply"}.`);
if (!apply && changes > 0) console.log("Re-run with --apply to write.");
if (missing.length > 0) {
  console.log(`\nSkipped accounts with no key in the environment:`);
  for (const m of missing) console.log(`  - ${m}`);
  console.log("Those lanes will report unhealthy until their key is set.");
}

if (apply) {
  const after = await sql<{ provider_id: string; models: string; accounts: string }[]>`
    select p.id as provider_id,
           (select count(*) from upstream_models m where m.provider_id = p.id)::text as models,
           (select count(*) from upstream_accounts a where a.provider_id = p.id)::text as accounts
    from upstream_providers p
    where p.id in ${sql(FLEET.map((f) => f.id))}
    order by p.id
  `;
  console.log("\nfleet after:");
  for (const r of after) console.log(`  ${r.provider_id.padEnd(14)} accounts=${r.accounts} models=${r.models}`);
}

await sql.end();
