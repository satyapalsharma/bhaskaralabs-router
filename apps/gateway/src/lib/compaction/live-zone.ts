// Live-zone compression dispatcher (headroom-inspired, our port).
//
// THE RULE: only the LAST user message's blocks are eligible. Everything before
// it (system, tools, history) is the frozen prefix — byte-identical across turns
// so the provider cache survives. Compression never touches it.
//
// Content routing: JSON arrays → SmartCrusher; grep output → SearchCrusher;
// log/build output → LogCrusher. Below byte thresholds → untouched.
// Self-checks inside each crusher guarantee original text on no-benefit.

import type { ChatMessage } from "../prefix";
import { smartCrush, looksLikeJsonArray } from "./smart-crusher";
import { logCrush, searchCrush, looksLikeGrepOutput, looksLikeLogOutput } from "./crushers";

const MIN_JSON_BYTES = 1024;    // 1 KiB — below this, savings don't justify bytes change
const MIN_LOG_BYTES = 2048;     // 2 KiB
const MIN_GREP_BYTES = 1024;

export interface LiveZoneStats {
  enabled: boolean;
  blocksCompressed: number;
  bytesBefore: number;
  bytesAfter: number;
  transformers: string[];
}

/** Compress eligible blocks inside the last user message. Returns new array (frozen prefix untouched) + stats. */
export function compressLiveZone(messages: ChatMessage[]): { messages: ChatMessage[]; stats: LiveZoneStats } {
  const stats: LiveZoneStats = { enabled: true, blocksCompressed: 0, bytesBefore: 0, bytesAfter: 0, transformers: [] };
  if (messages.length === 0) return { messages, stats };

  // find last user message
  let lastUserIdx = -1;
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === "user") {
      lastUserIdx = i;
      break;
    }
  }
  if (lastUserIdx < 0) return { messages, stats };
  const lastUser = messages[lastUserIdx];
  if (typeof lastUser.content !== "string") {
    // structured content blocks: compress string parts of tool-shaped blocks
    return { messages, stats };
  }

  const text = lastUser.content;
  if (text.length < MIN_JSON_BYTES) return { messages, stats };

  const result = routeAndCompress(text);
  if (result.text === text) return { messages, stats };

  stats.blocksCompressed = 1;
  stats.bytesBefore = text.length;
  stats.bytesAfter = result.text.length;
  stats.transformers.push(result.transformer);

  const out = messages.slice();
  out[lastUserIdx] = { role: "user", content: result.text };
  return { messages: out, stats };
}

function routeAndCompress(text: string): { text: string; transformer: string } {
  const trimmed = text.trim();

  // JSON first (most structured, safest wins)
  if (looksLikeJsonArray(trimmed) && trimmed.length >= MIN_JSON_BYTES) {
    const r = smartCrush(trimmed);
    if (r.kept >= 0) return { text: r.text, transformer: `smartcrusher(${r.total}→${r.kept})` };
  }
  // grep output
  if (looksLikeGrepOutput(trimmed) && trimmed.length >= MIN_GREP_BYTES) {
    const r = searchCrush(trimmed);
    if (r.kept >= 0) return { text: r.text, transformer: `searchcrusher(${r.total}→${r.kept})` };
  }
  // logs
  if (looksLikeLogOutput(trimmed) && trimmed.length >= MIN_LOG_BYTES) {
    const r = logCrush(trimmed);
    if (r.kept >= 0) return { text: r.text, transformer: `logcrusher(${r.total}→${r.kept})` };
  }
  return { text, transformer: "none" };
}