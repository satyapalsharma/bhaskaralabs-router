// Admin API for the upstream provider fleet (DB-driven routing config).
// One route, subresource via ?type= — keeps the admin surface small:
//   GET    /api/admin/upstream                     → full fleet (providers + accounts + models; keys masked)
//   POST   /api/admin/upstream?type=provider       → { id, name, baseUrl, protocol, authStyle, billing }
//   POST   /api/admin/upstream?type=account        → { providerId, label, apiKey, weight?, limits? }
//   POST   /api/admin/upstream?type=model          → { providerId, modelId, alias?, visibility?, tier?, ... }
//   PATCH  /api/admin/upstream?type=provider|account|model&id=... → partial update
//   DELETE /api/admin/upstream?type=...&id=...
//   POST   /api/admin/upstream?type=import-catalog → { providerId, catalogId? } (models.dev import)
// limits JSON shape (validated): { maxConcurrent, per5hRequests, per5hTokens,
//   perWeekRequests, perWeekTokens, dailyCostUsd }
import { NextResponse } from "next/server";
import { requireAdmin, isAdminResponse } from "@/lib/admin";
import { db } from "@/db";
import { upstreamProviders, upstreamAccounts, upstreamModels } from "@/db/schema";
import { eq, asc } from "drizzle-orm";
import { randomUUID } from "crypto";

const LIMIT_FIELDS = new Set(["maxConcurrent", "per5hRequests", "per5hTokens", "perWeekRequests", "perWeekTokens", "dailyCostUsd"]);

function parseLimits(raw: unknown): string | null {
  if (raw == null || raw === "") return null;
  if (typeof raw !== "object") throw new Error("limits must be an object");
  const out: Record<string, number> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!LIMIT_FIELDS.has(k)) throw new Error(`unknown limit field: ${k}`);
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0) throw new Error(`limit ${k} must be a non-negative number`);
    out[k] = n;
  }
  return JSON.stringify(out);
}

function maskKey(key: string): string {
  if (key.length <= 10) return key.slice(0, 2) + "***";
  return key.slice(0, 6) + "..." + key.slice(-4);
}

export async function GET() {
  const a = await requireAdmin();
  if (isAdminResponse(a)) return a;
  const [providers, accounts, models] = await Promise.all([
    db.select().from(upstreamProviders).orderBy(asc(upstreamProviders.id)),
    db.select().from(upstreamAccounts).orderBy(asc(upstreamAccounts.label)),
    db.select().from(upstreamModels).orderBy(asc(upstreamModels.modelId)),
  ]);
  return NextResponse.json({
    providers,
    accounts: accounts.map((acc) => ({ ...acc, apiKey: maskKey(acc.apiKey) })),
    models,
  });
}

export async function POST(req: Request) {
  const a = await requireAdmin();
  if (isAdminResponse(a)) return a;
  const type = new URL(req.url).searchParams.get("type");
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  try {
    if (type === "provider") {
      const id = String(body.id ?? "").trim().toLowerCase().replace(/[^a-z0-9-]/g, "");
      if (!id) return NextResponse.json({ error: "id required (slug)" }, { status: 400 });
      if (!body.baseUrl || !body.name) return NextResponse.json({ error: "name and baseUrl required" }, { status: 400 });
      await db.insert(upstreamProviders).values({
        id,
        name: String(body.name),
        baseUrl: String(body.baseUrl).replace(/\/$/, ""),
        protocol: body.protocol === "anthropic" ? "anthropic" : "openai",
        authStyle: body.authStyle === "x-api-key" ? "x-api-key" : "bearer",
        billing: ["flat", "metered", "credits"].includes(String(body.billing)) ? String(body.billing) : "flat",
        notes: body.notes ? String(body.notes) : null,
      });
      return NextResponse.json({ ok: true, id });
    }

    if (type === "account") {
      const providerId = String(body.providerId ?? "");
      if (!providerId) return NextResponse.json({ error: "providerId required" }, { status: 400 });
      if (!body.label || !body.apiKey) return NextResponse.json({ error: "label and apiKey required" }, { status: 400 });
      await db.insert(upstreamAccounts).values({
        id: randomUUID(),
        providerId,
        label: String(body.label),
        apiKey: String(body.apiKey).trim(),
        weight: Number(body.weight ?? 1) || 1,
        limits: parseLimits(body.limits),
      });
      return NextResponse.json({ ok: true });
    }

    if (type === "model") {
      const providerId = String(body.providerId ?? "");
      if (!providerId || !body.modelId) return NextResponse.json({ error: "providerId and modelId required" }, { status: 400 });
      await db.insert(upstreamModels).values({
        id: randomUUID(),
        providerId,
        modelId: String(body.modelId),
        alias: body.alias ? String(body.alias) : null,
        visibility: body.visibility === "private" ? "private" : "public",
        tier: ["full", "flash", "cheap"].includes(String(body.tier)) ? String(body.tier) : "flash",
        contextWindow: Number(body.contextWindow ?? 128000) || 128000,
        maxOutput: Number(body.maxOutput ?? 32768) || 32768,
        inputUsdPerM: String(body.inputUsdPerM ?? "0"),
        outputUsdPerM: String(body.outputUsdPerM ?? "0"),
        cacheReadUsdPerM: String(body.cacheReadUsdPerM ?? "0"),
        reasoning: body.reasoning === true,
        toolCall: body.toolCall !== false,
      });
      return NextResponse.json({ ok: true });
    }

    if (type === "import-catalog") {
      // Import provider models from models.dev's public catalog (api.json).
      const providerId = String(body.providerId ?? "");
      const catalogId = String(body.catalogId ?? providerId);
      if (!providerId) return NextResponse.json({ error: "providerId required" }, { status: 400 });
      const res = await fetch("https://models.dev/api.json");
      if (!res.ok) return NextResponse.json({ error: `catalog fetch failed: ${res.status}` }, { status: 502 });
      const catalog = (await res.json()) as Record<string, { api?: string; models?: Record<string, Record<string, unknown>> }>;
      const entry = catalog[catalogId];
      if (!entry?.models) return NextResponse.json({ error: `catalogId '${catalogId}' not found in models.dev` }, { status: 404 });
      let imported = 0;
      for (const [mid, m] of Object.entries(entry.models)) {
        const cost = (m.cost ?? {}) as Record<string, number>;
        const limit = (m.limit ?? {}) as Record<string, number>;
        await db
          .insert(upstreamModels)
          .values({
            id: randomUUID(),
            providerId,
            modelId: mid,
            visibility: "public",
            tier: "flash",
            contextWindow: Number(limit.context ?? 128000) || 128000,
            maxOutput: Number(limit.output ?? 32768) || 32768,
            inputUsdPerM: String(cost.input ?? 0),
            outputUsdPerM: String(cost.output ?? 0),
            cacheReadUsdPerM: String(cost.cache_read ?? 0),
            reasoning: m.reasoning === true,
            toolCall: m.tool_call === true,
          })
          .onConflictDoNothing();
        imported++;
      }
      return NextResponse.json({ ok: true, imported });
    }

    return NextResponse.json({ error: "unknown type" }, { status: 400 });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

export async function PATCH(req: Request) {
  const a = await requireAdmin();
  if (isAdminResponse(a)) return a;
  const url = new URL(req.url);
  const type = url.searchParams.get("type");
  const id = url.searchParams.get("id") ?? "";
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  try {
    if (type === "provider") {
      const patch: Record<string, unknown> = {};
      for (const k of ["name", "baseUrl", "protocol", "authStyle", "billing", "notes"]) if (k in body) patch[k] = body[k] === null ? null : String(body[k]);
      if ("active" in body) patch.active = body.active === true;
      await db.update(upstreamProviders).set(patch).where(eq(upstreamProviders.id, id));
    } else if (type === "account") {
      const patch: Record<string, unknown> = {};
      if ("label" in body) patch.label = String(body.label);
      if ("apiKey" in body && !String(body.apiKey).includes("***")) patch.apiKey = String(body.apiKey).trim();
      if ("disabled" in body) patch.disabled = body.disabled === true;
      if ("cooldownUntil" in body) patch.cooldownUntil = body.cooldownUntil ? new Date(String(body.cooldownUntil)) : null;
      if ("weight" in body) patch.weight = Number(body.weight) || 1;
      if ("limits" in body) patch.limits = parseLimits(body.limits);
      await db.update(upstreamAccounts).set(patch).where(eq(upstreamAccounts.id, id));
    } else if (type === "model") {
      const patch: Record<string, unknown> = {};
      if ("alias" in body) patch.alias = body.alias ? String(body.alias) : null;
      if ("visibility" in body) patch.visibility = body.visibility === "private" ? "private" : "public";
      if ("tier" in body) patch.tier = ["full", "flash", "cheap"].includes(String(body.tier)) ? String(body.tier) : "flash";
      for (const k of ["contextWindow", "maxOutput"]) if (k in body) patch[k] = Number(body[k]) || 0;
      for (const k of ["inputUsdPerM", "outputUsdPerM", "cacheReadUsdPerM"]) if (k in body) patch[k] = String(body[k]);
      if ("reasoning" in body) patch.reasoning = body.reasoning === true;
      if ("toolCall" in body) patch.toolCall = body.toolCall === true;
      if ("active" in body) patch.active = body.active === true;
      await db.update(upstreamModels).set(patch).where(eq(upstreamModels.id, id));
    } else {
      return NextResponse.json({ error: "unknown type" }, { status: 400 });
    }
    return NextResponse.json({ ok: true });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 400 });
  }
}

export async function DELETE(req: Request) {
  const a = await requireAdmin();
  if (isAdminResponse(a)) return a;
  const url = new URL(req.url);
  const type = url.searchParams.get("type");
  const id = url.searchParams.get("id") ?? "";
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  if (type === "provider") await db.delete(upstreamProviders).where(eq(upstreamProviders.id, id));
  else if (type === "account") await db.delete(upstreamAccounts).where(eq(upstreamAccounts.id, id));
  else if (type === "model") await db.delete(upstreamModels).where(eq(upstreamModels.id, id));
  else return NextResponse.json({ error: "unknown type" }, { status: 400 });
  return NextResponse.json({ ok: true });
}
