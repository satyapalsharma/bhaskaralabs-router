// Docs registry — curated reference packs for the stable prefix.
//
// STORE DECISION (2026-09-08): Postgres table (persistence/admin) +
// boot-loaded in-memory keyword index (hot path). No Elasticsearch: none on
// the box, no docker, and a hundreds-of-packs corpus doesn't justify a JVM on
// a single VPS. If the corpus ever outgrows in-memory scoring, replace the
// scorer inside selectPacks with a to_tsquery call against doc_packs.fts —
// injection, ordering, and ledger tagging stay untouched.
//
// CACHE CONTRACT (load-bearing — read before touching):
// 1. Pack bytes stable per (id, version) — content edits bump version.
// 2. Selection is a pure function of FULL history → the term set only grows
//    as the session covers more topics → the pack set only grows.
// 3. Render order fixed by pack id → growth appends, never reorders.
// 4. MAX_PACKS bounds prefix cost. Net effect: at most one partial cache
//    re-warm per newly-covered topic, never churn.
// 5. Injected as system-role AFTER leading systems (chat) / appended to the
//    system text (Anthropic) → compaction's non-system span skips them, and
//    the live-zone floor (post-last-assistant) never touches them.
// 6. Caveat: a compaction rewrite can drop topics → pack set shrinks →
//    one-time re-warm, same class as the compaction wipe itself.

import { db } from "../db";
import { docPacks } from "../db/schema";
import type { ChatMessage } from "./prefix";

export interface DocPack {
  id: string;
  title: string;
  keywords: string[];
  content: string;
  version: number;
  /** Lowercased content+title word set (len>=4) for O(1) scoring lookups. */
  words: Set<string>;
}

export const MAX_PACKS = 3;
export const FIRE_THRESHOLD = 3;
const REFRESH_TTL_MS = 5 * 60 * 1000;

let cache: DocPack[] | null = null;
let cacheAt = 0;

function toPack(r: typeof docPacks.$inferSelect): DocPack {
  const words = new Set<string>();
  for (const w of `${r.title} ${r.content}`.toLowerCase().match(/[a-z0-9_.-]{4,}/g) ?? []) words.add(w);
  return {
    id: r.id,
    title: r.title,
    keywords: r.keywords.split(/\s+/).filter(Boolean),
    content: r.content,
    version: r.version ?? 1,
    words,
  };
}

const STOP = new Set(
  "the,be,to,of,and,for,not,with,that,have,this,from,they,what,when,how,why,will,would,should,could,there,their,been,being,more,most,some,such,only,into,over,after,about,while,which,your,does,doing,done,here,make,sure,need,please,help,thing,code,file,files,error,using,used,use,also,just,like,much,many,well,than,then,very,each,other,these,those,is,it,as,at,by,on,or,if,up,we,us,my,me,so,am,an,do,go,no,ok,hi,vs,via,per,yet,nor,own,same,too,out,off,any,all,are,was,were,has,had,its,can,cannot".split(","),
);

export async function refreshDocs(): Promise<DocPack[]> {
  const rows = await db.select().from(docPacks);
  cache = rows.map(toPack).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  cacheAt = Date.now();
  return cache;
}

/** Hot-path accessor: TTL-cached, fail-open to stale/empty (docs silently off). */
export async function getPacks(): Promise<DocPack[]> {
  if (!cache || Date.now() - cacheAt > REFRESH_TTL_MS) {
    try {
      await refreshDocs();
    } catch (err) {
      console.error("[docs] refresh failed, using stale/empty:", (err as Error).message);
      if (!cache) cache = [];
    }
  }
  return cache ?? [];
}

/** Deterministic term extraction: backtick/quote spans (len>=2) + identifiers.
 * Short terms (2-3 chars) are KEPT — scoring gates filter them: only an exact
 * keyword hit (i.e. the user literally named the tool: rg, bun, go) can fire
 * them. Rule: name the tool → get its pack. */
export function extractTerms(historyText: string): Set<string> {
  const terms = new Set<string>();
  const add = (w: string, min: number) => {
    const t = w.toLowerCase();
    if (t.length >= min && !STOP.has(t) && terms.size < 256) terms.add(t);
  };
  for (const m of historyText.matchAll(/[`'"]([^`'"]{1,64})[`'"]/g)) {
    for (const w of m[1].split(/[^a-zA-Z0-9_.-]+/)) add(w, 2);
  }
  for (const m of historyText.matchAll(/[a-zA-Z][a-zA-Z0-9_.-]{1,39}/g)) add(m[0], 2);
  return terms;
}

function scorePack(pack: DocPack, terms: Set<string>): number {
  const kw = new Set(pack.keywords.map((k) => k.toLowerCase()));
  const title = pack.title.toLowerCase();
  let s = 0;
  for (const t of terms) {
    if (kw.has(t)) {
      s += 3; // exact keyword at any length — the user named the tool
      continue;
    }
    // content/title gates stay length-bound so short junk can't fire them
    if (t.length >= 5 && (pack.words.has(t) || (t.endsWith("s") && pack.words.has(t.slice(0, -1))))) s += 1;
    if (t.length >= 4 && title.includes(t)) s += 2;
  }
  return s;
}

/** Deterministic select: threshold → score desc, id tiebreak → top-N → id order. */
export function selectPacks(terms: Set<string>, packs: DocPack[], max = MAX_PACKS): DocPack[] {
  return packs
    .map((p) => ({ p, s: scorePack(p, terms) }))
    .filter((x) => x.s >= FIRE_THRESHOLD)
    .sort((a, b) => b.s - a.s || (a.p.id < b.p.id ? -1 : 1))
    .slice(0, max)
    .map((x) => x.p)
    .sort((a, b) => (a.id < b.id ? -1 : 1));
}

export function renderPacks(packs: DocPack[]): string {
  if (packs.length === 0) return "";
  const bodies = packs.map((p) => `[docs:${p.id} v${p.version} — ${p.title}]\n${p.content.trim()}`);
  return `Reference notes (stable context — consult when relevant, do not restate):\n${bodies.join("\n\n")}`;
}

/** Splice the rendered packs as a system message after leading systems. */
export function withDocPacks(messages: ChatMessage[], text: string): ChatMessage[] {
  if (!text) return messages;
  let i = 0;
  while (i < messages.length && messages[i].role === "system") i++;
  return [...messages.slice(0, i), { role: "system", content: text }, ...messages.slice(i)];
}

/** Join string contents for term extraction (256K-char safety cap — terms
 * saturate long before that; keeps regex scans cheap under concurrency). */
export function historyTextOf(messages: Array<{ content?: unknown }>): string {
  let out = "";
  for (const m of messages) {
    if (typeof m.content === "string") {
      out += "\n" + m.content;
      if (out.length > 256_000) break;
    }
  }
  return out;
}
