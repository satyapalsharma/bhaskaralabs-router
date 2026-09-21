"use client";
// Skill matrix — the measured per-model capability table the routing objective
// consumes. Models as rows, capability dimensions as columns. An empty matrix is
// not an error: the router falls back to cost-only routing until cells exist.
//
// Methodology: Brick, arXiv 2606.13241. Dimension set and the cache term are
// ours — see packages/shared/src/skill.ts.

import { useCallback, useEffect, useState } from "react";

interface Card {
  modelId: string;
  capability: string;
  successRate: number;
  support: number;
  source: string;
  confidence: string;
  updatedAt: string;
}

interface SkillsData {
  capabilities: string[];
  pools: Record<string, string[]>;
  cards: Card[];
  models: string[];
  calibration: { source: string; cells: number; models: number; latest: string | null }[];
  clip: [number, number];
  dogfood: {
    turns: number;
    skillTurns: number;
    disagree: number;
    fullTurns: number;
    costUsd: number;
  };
}

export default function SkillCards() {
  const [data, setData] = useState<SkillsData | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");
  const [editing, setEditing] = useState<{ modelId: string; capability: string } | null>(null);
  const [draft, setDraft] = useState("");

  const load = useCallback(async () => {
    const r = await fetch("/api/admin/skills");
    if (!r.ok) {
      setMsg(`Could not load skill cards (${r.status})`);
      return;
    }
    setData((await r.json()) as SkillsData);
  }, []);

  useEffect(() => {
    const run = async () => {
      await load();
    };
    void run();
  }, [load]);

  const save = async (modelId: string, capability: string, value: number) => {
    setBusy(true);
    setMsg("");
    try {
      const r = await fetch("/api/admin/skills", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ modelId, capability, successRate: value }),
      });
      const d = (await r.json().catch(() => ({}))) as { error?: string };
      setMsg(r.ok ? "Saved." : (d.error ?? `Save failed (${r.status})`));
      if (r.ok) await load();
    } finally {
      setBusy(false);
      setEditing(null);
    }
  };

  const clearCell = async (modelId: string, capability: string) => {
    setBusy(true);
    try {
      await fetch(
        `/api/admin/skills?modelId=${encodeURIComponent(modelId)}&capability=${encodeURIComponent(capability)}`,
        { method: "DELETE" },
      );
      await load();
      setMsg("Cell cleared — the neutral prior applies.");
    } finally {
      setBusy(false);
    }
  };

  if (!data) {
    return <p className="text-[0.875rem] text-ink-mute">Loading…</p>;
  }

  const cellFor = (modelId: string, capability: string) =>
    data.cards.find((c) => c.modelId === modelId && c.capability === capability);

  const inPool = new Set(Object.values(data.pools).flat());
  // Models that appear in a pool but carry no card are the ones the router is
  // currently treating as unknown — worth showing even with no rows yet.
  const rows = [...new Set([...data.models, ...inPool])].sort();

  const [clipLo, clipHi] = data.clip;
  const totalCells = rows.length * data.capabilities.length;
  const filled = data.cards.length;

  return (
    <div className="space-y-12">
      {msg && (
        <p role="status" className="font-mono text-[0.75rem] text-accent-deep">
          {msg}
        </p>
      )}

      {/* ── Dogfooding readout ─────────────────────────────────── */}
      <section>
        <div className="flex flex-wrap items-baseline justify-between gap-4 border-t-2 border-ink pt-5">
          <h2 className="subhead">Routing comparison · last 7 days</h2>
          <p className="font-mono text-[0.6875rem] text-ink-faint">
            {filled} of {totalCells} cells measured
          </p>
        </div>
        <div className="mt-5 grid gap-px bg-rule sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["Routed turns", `${data.dogfood.turns}`, "frontier turns with a recorded decision"],
            [
              "Skill-router turns",
              `${data.dogfood.skillTurns}`,
              "turns where the objective ran",
            ],
            [
              "Disagreed with heuristic",
              `${data.dogfood.disagree}`,
              "the comparison that matters: cases where J-argmin chose differently",
            ],
            [
              "Full-tier share",
              data.dogfood.turns > 0
                ? `${((data.dogfood.fullTurns / data.dogfood.turns) * 100).toFixed(1)}%`
                : "—",
              "watch this fall without escalation rising",
            ],
          ].map(([label, value, note]) => (
            <div key={label} className="border-t-2 border-ink bg-panel px-4 py-4">
              <p className="label text-ink-faint">{label}</p>
              <p className="num mt-3 font-mono text-[1.25rem] font-medium leading-none text-ink">
                {value}
              </p>
              <p className="mt-2 text-[0.75rem] leading-snug text-ink-mute">{note}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ── The matrix ────────────────────────────────────────── */}
      <section>
        <div className="flex flex-wrap items-baseline justify-between gap-4 border-t-2 border-ink pt-5">
          <h2 className="subhead">Capability matrix</h2>
          <p className="font-mono text-[0.6875rem] text-ink-faint">
            click a cell to override · values clipped to ({clipLo}, {clipHi})
          </p>
        </div>

        {rows.length === 0 ? (
          <p className="measure mt-5 text-[0.875rem] leading-relaxed text-ink-mute">
            No models and no pool configured yet. Calibrate with{" "}
            <code className="font-mono text-[0.8125rem]">
              bun scripts/calibrate-skills.ts
            </code>{" "}
            once the ledger carries routing signals, or set cells by hand here.
          </p>
        ) : (
          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[52rem] border-collapse text-left">
              <thead>
                <tr className="border-b border-ink">
                  <th scope="col" className="label pb-3 pr-4 font-medium text-ink-faint">
                    Model
                  </th>
                  {data.capabilities.map((c) => (
                    <th
                      key={c}
                      scope="col"
                      className="label pb-3 pr-4 text-right font-medium text-ink-faint"
                    >
                      {c.replace(/_/g, " ")}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((modelId) => (
                  <tr key={modelId} className="border-b border-rule-faint">
                    <th scope="row" className="py-3 pr-4 text-left font-normal">
                      <span className="font-mono text-[0.75rem] text-ink">{modelId}</span>
                      {!inPool.has(modelId) && (
                        <span className="tag ml-2">not in a pool</span>
                      )}
                    </th>
                    {data.capabilities.map((capability) => {
                      const cell = cellFor(modelId, capability);
                      const isEditing =
                        editing?.modelId === modelId && editing?.capability === capability;

                      if (isEditing) {
                        return (
                          <td key={capability} className="py-2 pr-4 text-right">
                            <span className="flex items-center justify-end gap-1.5">
                              <input
                                autoFocus
                                value={draft}
                                onChange={(e) => setDraft(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    const v = Number(draft);
                                    if (Number.isFinite(v)) void save(modelId, capability, v);
                                  }
                                  if (e.key === "Escape") setEditing(null);
                                }}
                                className="field num w-20 py-0.5 text-right font-mono"
                                aria-label={`${modelId} ${capability} success rate`}
                              />
                              <button
                                type="button"
                                disabled={busy || !Number.isFinite(Number(draft))}
                                onClick={() => void save(modelId, capability, Number(draft))}
                                className="btn btn-primary btn-sm"
                              >
                                Save
                              </button>
                              {cell && (
                                <button
                                  type="button"
                                  disabled={busy}
                                  onClick={() => void clearCell(modelId, capability)}
                                  className="font-mono text-[0.6875rem] text-ink-mute transition-colors hover:text-danger disabled:opacity-50"
                                >
                                  clear
                                </button>
                              )}
                            </span>
                          </td>
                        );
                      }

                      return (
                        <td key={capability} className="py-3 pr-4 text-right">
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => {
                              setEditing({ modelId, capability });
                              setDraft(cell ? cell.successRate.toFixed(2) : "0.72");
                            }}
                            title={
                              cell
                                ? `${cell.source} · support ${cell.support} · ${cell.confidence} confidence`
                                : "no measurement — the neutral prior (0.72) applies"
                            }
                            className={`num rounded-xs px-1.5 py-0.5 font-mono text-[0.75rem] transition-colors hover:bg-fill ${
                              cell
                                ? cell.confidence === "high"
                                  ? "text-ink"
                                  : "text-ink-soft"
                                : "text-ink-faint"
                            }`}
                          >
                            {cell ? cell.successRate.toFixed(2) : "—"}
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <p className="measure mt-4 text-[0.75rem] leading-relaxed text-ink-faint">
          A dash means no measurement: the router applies a neutral prior (0.72),
          so the model is neither favoured nor punished by the skill term and cost
          decides. Cell data comes from{" "}
          <code className="font-mono">calibrate-skills.ts</code>, which derives
          labels from escalation behaviour in the ledger.
        </p>
      </section>

      {/* ── Provenance ────────────────────────────────────────── */}
      <section>
        <div className="border-t-2 border-ink pt-5">
          <h2 className="subhead">Calibration provenance</h2>
        </div>
        {data.calibration.length === 0 ? (
          <p className="mt-5 text-[0.875rem] text-ink-mute">
            Never calibrated. Until it is, the router has no measured capability
            data and routes on cost alone.
          </p>
        ) : (
          <div className="mt-5 overflow-x-auto">
            <table className="w-full min-w-[34rem] border-collapse text-left">
              <thead>
                <tr className="border-b border-ink">
                  <th scope="col" className="label pb-3 pr-6 font-medium text-ink-faint">Source</th>
                  <th scope="col" className="label pb-3 pr-6 text-right font-medium text-ink-faint">Cells</th>
                  <th scope="col" className="label pb-3 pr-6 text-right font-medium text-ink-faint">Models</th>
                  <th scope="col" className="label pb-3 font-medium text-ink-faint">Last run</th>
                </tr>
              </thead>
              <tbody>
                {data.calibration.map((c) => (
                  <tr key={c.source} className="border-b border-rule-faint">
                    <th scope="row" className="py-3 pr-6 text-left font-mono text-[0.75rem] font-normal text-ink">
                      {c.source}
                    </th>
                    <td className="num py-3 pr-6 text-right font-mono text-[0.75rem] text-ink-soft">
                      {c.cells}
                    </td>
                    <td className="num py-3 pr-6 text-right font-mono text-[0.75rem] text-ink-soft">
                      {c.models}
                    </td>
                    <td className="num py-3 font-mono text-[0.75rem] text-ink-mute">
                      {c.latest ? new Date(c.latest).toLocaleString() : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="measure mt-4 text-[0.75rem] leading-relaxed text-ink-faint">
          A future replay-eval harness writes rows with a different{" "}
          <code className="font-mono">source</code> and can supersede a cell.
          Manual edits are stamped{" "}
          <code className="font-mono">manual</code> so they are never mistaken for
          a measurement.
        </p>
      </section>
    </div>
  );
}
