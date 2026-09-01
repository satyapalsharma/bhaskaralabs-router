import type { ReactNode } from "react";
import CopyCode from "./CopyCode";

function Code({ lang, children }: { lang: string; children: string }) {
  return <CopyCode lang={lang}>{children}</CopyCode>;
}

function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <div className="flex gap-4">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-amber-500/50 bg-amber-500/10 text-sm font-semibold text-amber-400">
        {n}
      </span>
      <div className="min-w-0 flex-1">
        <h3 className="text-base font-semibold">{title}</h3>
        <div className="mt-2 space-y-3 text-sm leading-relaxed text-zinc-400">{children}</div>
      </div>
    </div>
  );
}

export default function DocsPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-16">
      <h1 className="text-3xl font-bold tracking-tight">API documentation</h1>
      <p className="mt-2 text-sm text-zinc-500">
        Two drop-in endpoint families, three model names, honest caching. Base URL:{" "}
        <code className="text-zinc-300">https://api.bhaskaralabs.com</code>
      </p>

      {/* Quick start */}
      <section className="mt-12 space-y-6">
        <h2 className="text-xl font-semibold" id="quickstart">Quick start</h2>
        <Step n={1} title="Get a key">
          <p>
            <a href="/login" className="text-amber-400 underline hover:text-amber-300">Sign in with GitHub</a>{" "}
            → dashboard → <em>New key</em>. Shown once, stored hashed; revoke anytime.
          </p>
        </Step>
        <Step n={2} title="Point one env var">
          <p>Every mainstream agent accepts a custom OpenAI- or Anthropic-compatible base URL:</p>
          <Code lang="bash">{`export BHASKARA_API_KEY="sk-bhaskara-…"
export BHASKARA_BASE_URL="https://api.bhaskaralabs.com/v1"`}</Code>
        </Step>
        <Step n={3} title="Call it like any OpenAI API">
          <Code lang="bash">{`curl -s $BHASKARA_BASE_URL/chat/completions \\
  -H "Authorization: Bearer $BHASKARA_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "theta",
    "messages": [{ "role": "user", "content": "Rust: borrow checker, one paragraph." }]
  }'`}</Code>
        </Step>
      </section>

      {/* Models */}
      <section className="mt-14" id="models">
        <h2 className="text-xl font-semibold">Models you can name</h2>
        <div className="mt-4 overflow-x-auto rounded-xl border border-zinc-800">
          <table className="w-full text-sm">
            <thead className="bg-zinc-900/80 text-left text-zinc-400">
              <tr>
                {["Name", "What it is", "Metered as"].map((h) => (
                  <th key={h} className="px-4 py-2 font-medium">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="text-zinc-300">
              <tr className="border-t border-zinc-800/60">
                <td className="px-4 py-2.5"><code>glm-5.3</code></td>
                <td className="px-4 py-2.5 text-zinc-400">GLM-5.3 family — router picks full vs flash variant per session, disclosed in headers</td>
                <td className="px-4 py-2.5 text-zinc-400">frontier token quota</td>
              </tr>
              <tr className="border-t border-zinc-800/60">
                <td className="px-4 py-2.5"><code>qwen-3.8</code></td>
                <td className="px-4 py-2.5 text-zinc-400">Qwen3.8 family — same session-sticky routing</td>
                <td className="px-4 py-2.5 text-zinc-400">frontier token quota</td>
              </tr>
              <tr className="border-t border-zinc-800/60">
                <td className="px-4 py-2.5"><code>theta</code></td>
                <td className="px-4 py-2.5 text-zinc-400">flat per-request endpoint — cheapest backend that can handle the turn</td>
                <td className="px-4 py-2.5 text-zinc-400">requests (5h window + monthly)</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs text-zinc-600">
          Flash variants exist upstream but are selected by our session router — you address the family name,
          never a silently substituted different family.
        </p>
      </section>

      {/* Endpoints */}
      <section className="mt-14 space-y-8" id="endpoints">
        <h2 className="text-xl font-semibold">Endpoints</h2>

        <div id="chat-completions">
          <h3 className="text-lg font-semibold"><code>POST /v1/chat/completions</code></h3>
          <p className="mt-2 text-sm text-zinc-400">
            OpenAI-compatible. Supports <code>messages</code>, <code>stream</code>,{" "}
            <code>temperature</code>, <code>max_tokens</code>, and standard <code>tools</code> / tool_choice.
            Streaming follows OpenAI SSE (<code>data:</code> chunks, <code>[DONE]</code>, usage in the final
            chunk when requested).
          </p>
          <Code lang="bash">{`curl -s $BHASKARA_BASE_URL/chat/completions \\
  -H "Authorization: Bearer $BHASKARA_API_KEY" -H "Content-Type: application/json" \\
  -d '{"model":"glm-5.3","messages":[{"role":"user","content":"explain cache-aware prompt prefixes"}]}'`}</Code>
        </div>

        <div id="messages">
          <h3 className="text-lg font-semibold"><code>POST /v1/messages</code></h3>
          <p className="mt-2 text-sm text-zinc-400">
            Anthropic-compatible: <code>system</code>, <code>messages[]</code> with content blocks,{" "}
            <code>anthropic-version</code>, <code>x-api-key</code> auth, SSE event shapes Claude Code expects.
          </p>
          <Code lang="bash">{`curl -s https://api.bhaskaralabs.com/v1/messages \\
  -H "x-api-key: $BHASKARA_API_KEY" -H "anthropic-version: 2023-06-01" \\
  -H "Content-Type: application/json" \\
  -d '{"model":"theta","max_tokens":256,"messages":[{"role":"user","content":"hi"}]}'`}</Code>
        </div>

        <div id="sdk">
          <h3 className="text-lg font-semibold">Any OpenAI SDK works unchanged</h3>
          <Code lang="python">{`from openai import OpenAI

client = OpenAI(
    base_url="https://api.bhaskaralabs.com/v1",
    api_key="sk-bhaskara-…",
)
r = client.chat.completions.create(
    model="theta",
    messages=[{"role": "user", "content": "fix my SQL window fn"}],
)
print(r.choices[0].message.content)`}</Code>
          <Code lang="typescript">{`import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({
  baseURL: "https://api.bhaskaralabs.com",
  apiKey: process.env.BHASKARA_API_KEY,
});
const msg = await anthropic.messages.create({
  model: "glm-5.3",
  max_tokens: 1024,
  messages: [{ role: "user", content: "review this diff" }],
});`}</Code>
        </div>
      </section>

      {/* Integrations */}
      <section className="mt-14" id="integrations">
        <h2 className="text-xl font-semibold">Integrate your coding agent</h2>
        <p className="mt-2 text-sm text-zinc-400">
          Verified shapes only — if a tool needs a flag we haven&apos;t listed, the tool&apos;s docs own it;
          the three values you always need are base URL, key, model name.
        </p>
        <div className="mt-6 space-y-6 text-sm">
          <div id="claude-code" className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
            <h3 className="font-semibold text-zinc-100">Claude Code</h3>
            <Code lang="bash">{`ANTHROPIC_BASE_URL=https://api.bhaskaralabs.com \\
ANTHROPIC_AUTH_TOKEN=$BHASKARA_API_KEY \\
claude --model glm-5.3`}</Code>
            <p className="mt-2 text-zinc-500">Uses the <code>/v1/messages</code> path natively. Sub-agents inherit the base URL.</p>
          </div>

          <div id="codex" className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
            <h3 className="font-semibold text-zinc-100">Codex CLI</h3>
            <p className="mt-1 text-zinc-500">~/.codex/config.toml:</p>
            <Code lang="toml">{`model = "glm-5.3"
model_provider = "bhaskara"

[model_providers.bhaskara]
name = "Bhaskara Labs"
base_url = "https://api.bhaskaralabs.com/v1"
env_key = "BHASKARA_API_KEY"
wire_api = "chat"`}</Code>
          </div>

          <div id="opencode" className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
            <h3 className="font-semibold text-zinc-100">openCode</h3>
            <p className="mt-1 text-zinc-500">opencode.json:</p>
            <Code lang="json">{`{
  "provider": {
    "bhaskara": {
      "npm": "@ai-sdk/openai-compatible",
      "options": {
        "baseURL": "https://api.bhaskaralabs.com/v1",
        "apiKey": "{env:BHASKARA_API_KEY}"
      },
      "models": {
        "glm-5.3": { "name": "GLM-5.3 (routed)" },
        "theta": { "name": "Theta" }
      }
    }
  },
  "model": "bhaskara/glm-5.3"
}`}</Code>
          </div>

          <div id="crush" className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
            <h3 className="font-semibold text-zinc-100">Crush (Charm)</h3>
            <p className="mt-2 text-zinc-500">
              Crush&apos;s provider config accepts an OpenAI-compatible override — same three values. If you
              already ran Crush against Hyper, point the base URL here and swap the key.
            </p>
          </div>

          <div id="pi-omp" className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
            <h3 className="font-semibold text-zinc-100">pi / omp</h3>
            <p className="mt-2 text-zinc-500">
              Both accept custom OpenAI-compatible providers in their model config (models.json / provider
              list). Add <code>bhaskara</code> with the base URL above, models <code>glm-5.3</code>,{" "}
              <code>qwen-3.8</code>, <code>theta</code>, and API key via env.
            </p>
          </div>
        </div>
      </section>

      {/* Caching */}
      <section className="mt-14" id="caching">
        <h2 className="text-xl font-semibold">Prompt caching: the rules that earn you money</h2>
        <div className="mt-4 space-y-3 text-sm leading-relaxed text-zinc-400">
          <p>
            <strong className="text-zinc-200">1 — Stable prefix first.</strong> Cache hits are computed on
            the request prefix. System prompt → tool definitions → long-lived context → then your varying
            turns. Byte-identical prefix = cache read; one edit mid-context invalidates everything after it.
          </p>
          <p>
            <strong className="text-zinc-200">2 — Append-only sessions.</strong> Don&apos;t rewrite history,
            don&apos;t prune the middle. Trim from the front at safe boundaries or not at all.
          </p>
          <p>
            <strong className="text-zinc-200">3 — Keep the family stable per session.</strong> Our router
            locks a session to the model variant chosen at its first request (2-hour idle TTL). Flipping
            models mid-session would wipe the provider cache and re-bill your whole prefix — so we don&apos;t.
            New session (or 2h idle) = fresh routing decision.
          </p>
          <p>
            <strong className="text-zinc-200">4 — Watch the headers.</strong>{" "}
            <code>x-ratelimit-remaining-*</code> and the dashboard cache column tell you the real hit rate.
            If it&apos;s low, your prefix ordering is the problem, not the pipe.
          </p>
        </div>
      </section>

      {/* Headers & errors */}
      <section className="mt-14" id="headers">
        <h2 className="text-xl font-semibold">Quota headers & errors</h2>
        <p className="mt-2 text-sm text-zinc-400">Every response carries your live quota state (no pricing data in headers):</p>
        <div className="mt-4 overflow-x-auto rounded-xl border border-zinc-800">
          <table className="w-full text-sm">
            <tbody className="text-zinc-300">
              {[
                ["x-quota-plan", "free | basic | advanced"],
                ["x-quota-monthly-reset", "ISO date the token quotas roll over"],
                ["x-ratelimit-{limit,remaining,reset}-tokens", "frontier: monthly token dimension; reset = seconds"],
                ["x-ratelimit-{limit,remaining,reset}-requests", "theta: the rolling 5-hour window"],
                ["x-quota-output-tokens-remaining", "frontier monthly output remainder"],
                ["Retry-After", "only on 429 — seconds to wait before the window/month resets"],
              ].map(([h, d]) => (
                <tr key={h} className="border-t border-zinc-800/60 first:border-t-0">
                  <td className="whitespace-nowrap px-4 py-2 font-mono text-xs text-amber-400/90">{h}</td>
                  <td className="px-4 py-2 text-zinc-400">{d}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-5 space-y-2 text-sm text-zinc-400">
          <p><code className="text-red-400">401</code> bad/revoked key · <code className="text-red-400">400</code> unknown model name (the allowed three are above) · <code className="text-red-400">429</code> quota — with Retry-After, never silent degrade · <code className="text-red-400">502</code> upstream failure — retryable, our error body never names providers.</p>
          <p>
            Backoff: honour <code>Retry-After</code> first, else exponential with jitter. A flat 429 storm
            with no Retry-After means you&apos;re hammering with a wrong key, not out of quota.
          </p>
        </div>
      </section>

      {/* Streaming */}
      <section className="mt-14" id="streaming">
        <h2 className="text-xl font-semibold">Streaming</h2>
        <p className="mt-2 text-sm text-zinc-400">
          <code>&quot;stream&quot;: true</code> on <code>/v1/chat/completions</code> gives OpenAI-style SSE;{" "}
          <code>&quot;stream&quot;: true</code> on <code>/v1/messages</code> gives Anthropic event types
          (<code>message_start</code>, <code>content_block_delta</code>, <code>message_stop</code>). Tool-call
          deltas stream in the same shape the native APIs use, so agent harnesses parse them without
          adapters.
        </p>
      </section>

      <p className="mt-14 text-sm text-zinc-500">
        Trouble? <a href="/faq" className="text-amber-400 underline hover:text-amber-300">FAQ</a> · billing{" "}
        <a href="/plans" className="text-amber-400 underline hover:text-amber-300">plans &amp; calculator</a> ·{" "}
        <a href="/legal/terms" className="text-amber-400 underline hover:text-amber-300">terms</a>
      </p>
    </main>
  );
}