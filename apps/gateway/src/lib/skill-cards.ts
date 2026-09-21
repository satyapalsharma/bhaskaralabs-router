// Skill-card store — the measured per-model, per-capability success rates the
// routing objective consumes.
//
// Same shape as lib/upstream-config.ts: a short in-process snapshot with a
// forced refresh after a write, so admin edits and calibration runs go live
// within the TTL without a deploy. On a cold or empty table the loader returns
// no cards and callers fall back to a neutral prior rather than failing — a
// missing calibration must never take the gateway down.

import { db } from "../db";
import { skillCards } from "../db/schema";
import { CAPABILITIES, type Capability } from "@bhaskara/shared/skill";

export type SkillMap = Record<string, Record<Capability, number>>;

interface Snapshot {
  skills: SkillMap;
  at: number;
  size: number;
}

let snapshot: Snapshot | null = null;
const TTL_MS = 15_000;

/** Neutral prior: every cell at the medium anchor. Used for models with no card
 *  and for a cold table, so an uncalibrated model is neither favoured nor
 *  punished by the skill term — the cost term decides, which is the honest
 *  default when we have no measurement. */
export function neutralSkills(): Record<Capability, number> {
  return Object.fromEntries(CAPABILITIES.map((c) => [c, 0.72])) as Record<
    Capability,
    number
  >;
}

/** Every model's skill vector, keyed by modelId. */
export async function getSkillMap(force = false): Promise<SkillMap> {
  if (!force && snapshot && Date.now() - snapshot.at < TTL_MS) return snapshot.skills;
  const rows = await db.select().from(skillCards);
  const skills: SkillMap = {};
  for (const row of rows) {
    const cap = row.capability as Capability;
    if (!CAPABILITIES.includes(cap)) continue; // ignore rows from a retired dimension
    const map = (skills[row.modelId] ??= neutralSkills());
    const rate = Number(row.successRate);
    if (Number.isFinite(rate)) map[cap] = rate;
  }
  snapshot = { skills, at: Date.now(), size: rows.length };
  return skills;
}

/** Skill vector for one model, falling back to the neutral prior. */
export async function getSkillsFor(modelId: string): Promise<Record<Capability, number>> {
  const map = await getSkillMap();
  return map[modelId] ?? neutralSkills();
}

/** Rows for the admin surface, including provenance so a measurement can be
 *  told apart from a manual edit. */
export async function listSkillCards() {
  const rows = await db.select().from(skillCards);
  return rows.map((r) => ({
    modelId: r.modelId,
    capability: r.capability,
    successRate: Number(r.successRate),
    support: r.support,
    source: r.source,
    confidence: r.confidence,
    updatedAt: r.updatedAt,
  }));
}

/** Upsert one cell. Manual edits are stamped so a later calibration run can be
 *  compared against them rather than silently overwriting. */
export async function upsertSkillCard(args: {
  modelId: string;
  capability: string;
  successRate: number;
  support: number;
  source: string;
  confidence: string;
}): Promise<void> {
  await db
    .insert(skillCards)
    .values({
      id: `${args.modelId}:${args.capability}`,
      modelId: args.modelId,
      capability: args.capability,
      successRate: args.successRate.toFixed(4),
      support: args.support,
      source: args.source,
      confidence: args.confidence,
      updatedAt: new Date(),
    })
    .onConflictDoUpdate({
      target: [skillCards.modelId, skillCards.capability],
      set: {
        successRate: args.successRate.toFixed(4),
        support: args.support,
        source: args.source,
        confidence: args.confidence,
        updatedAt: new Date(),
      },
    });
  snapshot = null; // refresh lazily on the next read
}

/** Row and model counts for the admin panel, so an empty or stale table is
 *  visible rather than silently routing on the neutral prior. */
export async function skillCardStats(): Promise<{ cards: number; models: number }> {
  const rows = await db
    .select({ modelId: skillCards.modelId, capability: skillCards.capability })
    .from(skillCards);
  return {
    cards: rows.length,
    models: new Set(rows.map((r) => r.modelId)).size,
  };
}

/** Drop the in-process snapshot (used by tests and the calibration script). */
export function invalidateSkillCache(): void {
  snapshot = null;
}
