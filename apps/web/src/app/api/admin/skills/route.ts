// Admin API for the skill matrix — the measured per-model capability table the
// routing objective consumes.
//
//   GET   /api/admin/skills            → cards, pool coverage, dogfooding stats
//   PATCH /api/admin/skills            → { modelId, capability, successRate } one cell
//
// A manual edit is stamped source='manual' so a later calibration run can be
// told apart from it. Nothing here is required for the router to work: an empty
// matrix routes on cost alone, which is the honest default.

import { NextResponse } from "next/server";
import { requireAdmin, isAdminResponse } from "@/lib/admin";
import { db } from "@/db";
import { skillCards, usageLedger } from "@/db/schema";
import { and, eq, gte, sql } from "drizzle-orm";
import { CAPABILITIES, SKILL_CLIP, SKILL_POOLS } from "@bhaskara/shared/skill";

export async function GET() {
  const a = await requireAdmin();
  if (isAdminResponse(a)) return a;

  const [rows, calibration, dogfood] = await Promise.all([
    db.select().from(skillCards),
    // When the matrix was last refreshed, and by which source.
    db
      .select({
        source: skillCards.source,
        cells: sql<number>`count(*)::int`,
        models: sql<number>`count(distinct ${skillCards.modelId})::int`,
        latest: sql<Date | null>`max(${skillCards.updatedAt})`,
      })
      .from(skillCards)
      .groupBy(skillCards.source),
    // Dogfooding instrument: on keys running the skill router, how often did it
    // disagree with the heuristic router, and did it buy a bigger tier?
    db
      .select({
        turns: sql<number>`count(*)::int`,
        skillTurns: sql<number>`count(*) filter (where ${usageLedger.routerSignals} like '%"scored"%')::int`,
        disagree: sql<number>`count(*) filter (where ${usageLedger.routerSignals} ilike '%"alt"%')::int`,
        fullTurns: sql<number>`count(*) filter (where ${usageLedger.routedTo} = 'full')::int`,
        costUsd: sql<number>`coalesce(sum(${usageLedger.actualCostUsd}::numeric), 0)::float`,
      })
      .from(usageLedger)
      .where(
        and(
          gte(usageLedger.createdAt, new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)),
          sql`${usageLedger.routerSignals} is not null`,
        ),
      ),
  ]);

  const models = [...new Set(rows.map((r) => r.modelId))].sort();
  return NextResponse.json({
    capabilities: CAPABILITIES,
    pools: Object.fromEntries(
      Object.entries(SKILL_POOLS).map(([endpoint, pool]) => [
        endpoint,
        pool.map((m) => m.modelId),
      ]),
    ),
    cards: rows.map((r) => ({
      modelId: r.modelId,
      capability: r.capability,
      successRate: Number(r.successRate),
      support: r.support,
      source: r.source,
      confidence: r.confidence,
      updatedAt: r.updatedAt,
    })),
    models,
    calibration: calibration.map((c) => ({
      source: c.source,
      cells: c.cells,
      models: c.models,
      latest: c.latest,
    })),
    clip: SKILL_CLIP,
    dogfood: dogfood[0] ?? { turns: 0, skillTurns: 0, disagree: 0, fullTurns: 0, costUsd: 0 },
  });
}

export async function PATCH(req: Request) {
  const a = await requireAdmin();
  if (isAdminResponse(a)) return a;

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }

  const modelId = String(body.modelId ?? "").trim();
  const capability = String(body.capability ?? "").trim();
  const rate = Number(body.successRate);

  if (!modelId) return NextResponse.json({ error: "modelId required" }, { status: 400 });
  if (!(CAPABILITIES as readonly string[]).includes(capability)) {
    return NextResponse.json(
      { error: `capability must be one of ${CAPABILITIES.join(", ")}` },
      { status: 400 },
    );
  }
  const [lo, hi] = SKILL_CLIP;
  if (!Number.isFinite(rate) || rate < lo || rate > hi) {
    return NextResponse.json(
      { error: `successRate must be between ${lo} and ${hi} (the logit clip)` },
      { status: 400 },
    );
  }

  await db
    .insert(skillCards)
    .values({
      id: `${modelId}:${capability}`,
      modelId,
      capability,
      successRate: rate.toFixed(4),
      support: 0,
      source: "manual",
      confidence: "low",
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [skillCards.modelId, skillCards.capability],
      set: {
        successRate: rate.toFixed(4),
        source: "manual",
        confidence: "low",
        updatedAt: new Date(),
      },
    });

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const a = await requireAdmin();
  if (isAdminResponse(a)) return a;
  const url = new URL(req.url);
  const modelId = url.searchParams.get("modelId") ?? "";
  const capability = url.searchParams.get("capability") ?? "";
  if (!modelId || !capability) {
    return NextResponse.json({ error: "modelId and capability required" }, { status: 400 });
  }
  await db
    .delete(skillCards)
    .where(and(eq(skillCards.modelId, modelId), eq(skillCards.capability, capability)));
  return NextResponse.json({ ok: true });
}
