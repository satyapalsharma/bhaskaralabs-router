// Admin API for plan entitlements: per-plan, per-model, per-window caps.
//   GET    /api/admin/plans                    → plans (distinct plan slugs w/ row counts) + all limit rows
//   POST   /api/admin/plans?type=limit          → { plan, endpointModel, windowHours, maxRequests?, maxTokens?, maxCostUsd? }
//   PATCH  /api/admin/plans?type=limit&id=...   → partial update (incl. active toggle)
//   DELETE /api/admin/plans?type=limit&id=...   → delete one row
// Plan slugs are free-text and must match subscriptions.plan ("bigpro"...).
// Windows are hours: 5 (5h), 24 (daily), 168 (weekly).
import { NextResponse } from "next/server";
import { requireAdmin, isAdminResponse } from "@/lib/admin";
import { db } from "@/db";
import { planModelLimits, subscriptions } from "@/db/schema";
import { eq, asc, sql } from "drizzle-orm";
import { randomUUID } from "crypto";

const WINDOWS = new Set([1, 5, 24, 168]);

function validWindow(h: unknown): h is number {
  return typeof h === "number" && WINDOWS.has(h);
}

export async function GET() {
  const a = await requireAdmin();
  if (isAdminResponse(a)) return a;
  const [limits, plansInUse, plansConfigured] = await Promise.all([
    db.select().from(planModelLimits).orderBy(asc(planModelLimits.plan), asc(planModelLimits.endpointModel)),
    db.select({ plan: subscriptions.plan, users: sql<number>`count(*)::int` }).from(subscriptions).groupBy(subscriptions.plan),
    db.select({ plan: planModelLimits.plan, rows: sql<number>`count(*)::int` }).from(planModelLimits).groupBy(planModelLimits.plan),
  ]);
  return NextResponse.json({ limits, plansInUse, plansConfigured });
}

export async function POST(req: Request) {
  const a = await requireAdmin();
  if (isAdminResponse(a)) return a;
  const type = new URL(req.url).searchParams.get("type");
  if (type !== "limit") return NextResponse.json({ error: "unknown type" }, { status: 400 });
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  try {
    const plan = String(body.plan ?? "").trim();
    const endpointModel = String(body.endpointModel ?? "").trim();
    if (!plan) return NextResponse.json({ error: "plan required (e.g. bigpro)" }, { status: 400 });
    if (!endpointModel) return NextResponse.json({ error: "endpointModel required (e.g. qwen-3.8, theta)" }, { status: 400 });
    if (!validWindow(body.windowHours)) return NextResponse.json({ error: "windowHours must be one of 1, 5, 24, 168" }, { status: 400 });
    const maxRequests = body.maxRequests == null || body.maxRequests === "" ? null : Number(body.maxRequests);
    const maxTokens = body.maxTokens == null || body.maxTokens === "" ? null : Number(body.maxTokens);
    const maxCostUsd = body.maxCostUsd == null || body.maxCostUsd === "" ? null : String(body.maxCostUsd);
    if (maxRequests == null && maxTokens == null && maxCostUsd == null) {
      return NextResponse.json({ error: "at least one of maxRequests, maxTokens, maxCostUsd required" }, { status: 400 });
    }
    if (maxRequests != null && (!Number.isFinite(maxRequests) || maxRequests < 0)) {
      return NextResponse.json({ error: "maxRequests must be a non-negative number" }, { status: 400 });
    }
    if (maxTokens != null && (!Number.isFinite(maxTokens) || maxTokens < 0)) {
      return NextResponse.json({ error: "maxTokens must be a non-negative number" }, { status: 400 });
    }
    await db.insert(planModelLimits).values({
      id: randomUUID(),
      plan,
      endpointModel,
      windowHours: body.windowHours,
      maxRequests: maxRequests == null ? null : Math.floor(maxRequests),
      maxTokens: maxTokens == null ? null : Math.floor(maxTokens),
      maxCostUsd,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("duplicate") || msg.includes("unique")) {
      return NextResponse.json({ error: "a row for this plan + model + window already exists (edit it instead)" }, { status: 409 });
    }
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}

export async function PATCH(req: Request) {
  const a = await requireAdmin();
  if (isAdminResponse(a)) return a;
  const url = new URL(req.url);
  if (url.searchParams.get("type") !== "limit") return NextResponse.json({ error: "unknown type" }, { status: 400 });
  const id = url.searchParams.get("id") ?? "";
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid JSON" }, { status: 400 });
  }
  const patch: Record<string, unknown> = {};
  if ("maxRequests" in body) patch.maxRequests = body.maxRequests == null || body.maxRequests === "" ? null : Math.floor(Number(body.maxRequests));
  if ("maxTokens" in body) patch.maxTokens = body.maxTokens == null || body.maxTokens === "" ? null : Math.floor(Number(body.maxTokens));
  if ("maxCostUsd" in body) patch.maxCostUsd = body.maxCostUsd == null || body.maxCostUsd === "" ? null : String(body.maxCostUsd);
  if ("active" in body) patch.active = body.active === true;
  await db.update(planModelLimits).set(patch).where(eq(planModelLimits.id, id));
  return NextResponse.json({ ok: true });
}

export async function DELETE(req: Request) {
  const a = await requireAdmin();
  if (isAdminResponse(a)) return a;
  const url = new URL(req.url);
  if (url.searchParams.get("type") !== "limit") return NextResponse.json({ error: "unknown type" }, { status: 400 });
  const id = url.searchParams.get("id") ?? "";
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await db.delete(planModelLimits).where(eq(planModelLimits.id, id));
  return NextResponse.json({ ok: true });
}
