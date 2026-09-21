import type { Metadata } from "next";
import type { ReactNode } from "react";
import Link from "next/link";
import CopyCode from "./CopyCode";

export const metadata: Metadata = {
  title: "API documentation",
  description:
    "Two drop-in endpoint families, three model names, and the caching rules that decide your bill. Base URL https://api.bhaskaralabs.com.",
};

function Code({
  lang,
  label,
  children,
}: {
  lang: string;
  label?: string;
  children: string;
}) {
  return (
    <CopyCode lang={lang} label={label}>
      {children}
    </CopyCode>
  );
}

/** A numbered step in a procedure. The number is the structure. */
function Step({
  n,
  title,
  children,
}: {
  n: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <li className="grid gap-x-6 gap-y-3 border-t border-rule pt-6 sm:grid-cols-[3rem_1fr]">
      <span className="label pt-1 text-accent-deep">{n}</span>
      <div className="min-w-0">
        <h3 className="text-[0.9375rem] font-medium text-ink">{title}</h3>
        <div className="mt-2 text-[0.875rem] leading-relaxed text-ink-soft">
          {children}
        </div>
      </div>
    </li>
  );
}

function Sub({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <h3 id={id} className="scroll-mt-20 text-[1.0625rem] font-medium text-ink">
      {children}
    </h3>
  );
}

function P({ children }: { children: ReactNode }) {
  return (
    <p className="measure text-[0.9375rem] leading-relaxed text-ink-soft">
      {children}
    </p>
  );
}

function Inline({ children }: { children: ReactNode }) {
  return <code className="font-mono text-[0.8125rem] text-ink">{children}</code>;
}

function Rows({
  rows,
  head,
}: {
  rows: [string, string][];
  head: [string, string];
}) {
  return (
    <div className="mt-4 overflow-x-auto">
      <table className="w-full min-w-[34rem] border-collapse text-left">
        <thead>
          <tr className="border-b border-ink">
            <th scope="col" className="label pb-3 pr-6 font-medium text-ink-faint">
              {head[0]}
            </th>
            <th scope="col" className="label pb-3 font-medium text-ink-faint">
              {head[1]}
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([k, v]) => (
            <tr key={k} className="border-b border-rule last:border-b-0">
              <th
                scope="row"
                className="whitespace-nowrap py-3.5 pr-6 align-top font-mono text-[0.75rem] font-normal text-accent-deep"
              >
                {k}
              </th>
              <td className="py-3.5 align-top text-[0.875rem] text-ink-soft">
                {v}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** An aside. A rule on the leading edge, no box. */
function Note({ children }: { children: ReactNode }) {
  return (
    <aside className="my-5 border-l-2 border-accent bg-accent-soft py-3.5 pl-4 pr-4">
      <p className="text-[0.875rem] leading-relaxed text-ink-soft">{children}</p>
    </aside>
  );
}

const SECTIONS = [
  ["quickstart", "Quick start"],
  ["models", "Model names"],
  ["endpoints", "Endpoints"],
  ["integrations", "Integrations"],
  ["caching", "Caching rules"],
  ["headers", "Quotas & errors"],
  ["streaming", "Streaming"],
  ["terse", "Terse mode"],
] as const;

const INTEGRATIONS = [
  {
    name: "Claude Code",
    note: "Uses the /v1/messages path natively, and sub-agents inherit the base URL.",
    code: `ANTHROPIC_BASE_URL=https://api.bhaskaralabs.com \\
ANTHROPIC_AUTH_TOKEN=$BHASKARA_API_KEY \\
claude --model glm-5.3`,
  },
  {
    name: "Codex CLI",
    note: "~/.codex/config.toml",
    code: `model = "glm-5.3"
model_provider = "bhaskara"

[model_providers.bhaskara]
name = "Bhaskara Labs"
base_url = "https://api.bhaskaralabs.com/v1"
env_key = "BHASKARA_API_KEY"
wire_api = "chat"`,
  },
  {
    name: "openCode",
    note: "opencode.json",
    code: `{
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
}`,
  },
  {
    name: "Crush",
    note: "Crush's provider config takes an OpenAI-compatible override — the same three values. If you already point it at another provider, change the base URL and swap the key.",
    code: `# the same three values as everywhere else
BHASKARA_BASE_URL="https://api.bhaskaralabs.com/v1"
BHASKARA_API_KEY="sk-bhaskara-…"`,
  },
  {
    name: "pi / omp",
    note: "Both accept custom OpenAI-compatible providers in their model config. Add bhaskara with the base URL above and the three model names, with the key supplied through the environment.",
    code: `BHASKARA_BASE_URL="https://api.bhaskaralabs.com/v1"
BHASKARA_API_KEY="sk-bhaskara-…"`,
  },
];

const CACHE_RULES = [
  {
    t: "Stable prefix first",
    b: "Cache reads are computed on the request prefix, so order it: system prompt, then tool definitions, then long-lived context, then your varying turns. A byte-identical prefix is billed at the cache rate; one edit mid-context invalidates everything after it.",
  },
  {
    t: "Append only",
    b: "Do not rewrite history and do not prune the middle. Trim from the front at a safe boundary, or do not trim at all.",
  },
  {
    t: "Keep the family stable across a session",
    b: "Our router locks a session to the variant chosen on its first request, with a two-hour idle TTL. Flipping variants mid-session wipes the provider cache and re-bills the whole prefix, so we do not do it. One priced exception exists: a genuinely hard turn in a flash-locked session can upgrade once to the full model, and only while the cache-wipe penalty stays under budget and your weekly full-model share has headroom. Downgrades never happen mid-session.",
  },
  {
    t: "Watch the headers, not your intuition",
    b: "x-ratelimit-remaining-* and the cache column in your dashboard report the real hit rate. If it is low, the prefix ordering is the problem, not the pipe.",
  },
];

export default function DocsPage() {
  return (
    <main className="mx-auto max-w-6xl px-5 sm:px-6">
      <div className="grid gap-14 py-14 sm:py-20 lg:grid-cols-[15rem_1fr] lg:gap-16">
        {/* ── Contents ─────────────────────────────────────────── */}
        <nav aria-label="On this page" className="hidden lg:block">
          <div className="sticky top-24">
            <p className="label text-ink-faint">Contents</p>
            <ol className="mt-4 space-y-2.5 border-l border-rule">
              {SECTIONS.map(([id, label], i) => (
                <li key={id}>
                  <a
                    href={`#${id}`}
                    className="flex gap-2 border-l-2 border-transparent pl-3 text-[0.8125rem] text-ink-mute transition-colors hover:border-accent hover:text-ink"
                  >
                    <span className="font-mono text-[0.6875rem] text-ink-faint">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    {label}
                  </a>
                </li>
              ))}
            </ol>
          </div>
        </nav>

        {/* ── Body ─────────────────────────────────────────────── */}
        <div className="min-w-0">
          <header>
            <p className="label text-accent-deep">Documentation</p>
            <h1 className="display mt-6">API documentation</h1>
            <p className="lede measure mt-5">
              Two drop-in endpoint families, three model names, and one set of
              caching rules. If it speaks OpenAI or Anthropic, it speaks to us
              after a base URL and a key.
            </p>
            <dl className="mt-8 flex flex-wrap gap-x-10 gap-y-4 border-t border-rule pt-5">
              <div>
                <dt className="label text-ink-faint">Base URL</dt>
                <dd className="mt-2 font-mono text-[0.8125rem] text-ink-soft">
                  https://api.bhaskaralabs.com
                </dd>
              </div>
              <div>
                <dt className="label text-ink-faint">Auth</dt>
                <dd className="mt-2 font-mono text-[0.8125rem] text-ink-soft">
                  Bearer · x-api-key
                </dd>
              </div>
            </dl>
          </header>

          <div className="mt-20 space-y-20">
            {/* 01 Quick start */}
            <section className="scroll-mt-20" id="quickstart">
              <div className="border-t border-ink pt-5">
                <p className="label text-accent-deep">01 Quick start</p>
                <h2 className="claim mt-5">Three steps to a working request.</h2>
              </div>
              <ol className="mt-9 space-y-6">
                <Step n="01" title="Get a key">
                  <p>
                    <Link href="/login" className="prose-link">
                      Sign in with GitHub
                    </Link>
                    , open the dashboard, and create one. It is shown once and
                    stored hashed; revoke it from the same screen.
                  </p>
                </Step>
                <Step n="02" title="Point one environment variable">
                  <p>
                    Every mainstream agent accepts a custom OpenAI- or
                    Anthropic-compatible base URL.
                  </p>
                  <Code lang="bash" label="environment">{`BHASKARA_API_KEY="sk-bhaskara-…"
BHASKARA_BASE_URL="https://api.bhaskaralabs.com/v1"`}</Code>
                </Step>
                <Step n="03" title="Send a request">
                  <Code lang="bash" label="curl">{`curl -s $BHASKARA_BASE_URL/chat/completions \\
  -H "Authorization: Bearer $BHASKARA_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{
    "model": "theta",
    "messages": [{ "role": "user", "content": "Rust borrow checker, one paragraph." }]
  }'`}</Code>
                </Step>
              </ol>
            </section>

            {/* 02 Models */}
            <section className="scroll-mt-20" id="models">
              <div className="border-t border-ink pt-5">
                <p className="label text-accent-deep">02 Model names</p>
                <h2 className="claim mt-5">
                  You name a family, never a substituted one.
                </h2>
              </div>
              <div className="mt-9">
                <Rows
                  head={["Name", "What answers, and how it is metered"]}
                  rows={[
                    [
                      "glm-5.3",
                      "The GLM-5.3 family on a one-million-token context. A capability-and-cost objective picks the full or flash variant per turn and holds it for the session, so the provider cache stays warm. The full model is capped at a quarter of your glm calls. Metered per request, with a token budget on the same window.",
                    ],
                    [
                      "theta",
                      "Our own model, on a 200K context. Built and served by us end to end: the inference stack, the routing between its backends and the tuning are ours. Metered per request in a rolling five-hour window, so the price does not move with the prompt.",
                    ],
                  ]}
                />
              </div>
              <Note>
                Flash variants exist upstream but are selected by our session
                router. You address the family name. Every response tells you
                which tier answered.
              </Note>
            </section>

            {/* 03 Endpoints */}
            <section className="scroll-mt-20" id="endpoints">
              <div className="border-t border-ink pt-5">
                <p className="label text-accent-deep">03 Endpoints</p>
                <h2 className="claim mt-5">Two shapes, both drop-in.</h2>
              </div>

              <div className="mt-9 space-y-10">
                <div>
                  <Sub id="chat-completions">POST /v1/chat/completions</Sub>
                  <div className="mt-3 space-y-3">
                    <P>
                      OpenAI-compatible. Accepts <Inline>messages</Inline>,{" "}
                      <Inline>stream</Inline>, <Inline>temperature</Inline>,{" "}
                      <Inline>max_tokens</Inline> and standard tool calling.
                      Streaming follows the OpenAI SSE shape:{" "}
                      <Inline>data:</Inline> chunks, a terminating{" "}
                      <Inline>[DONE]</Inline>, and usage in the final chunk when
                      requested.
                    </P>
                    <Code lang="bash" label="curl">{`curl -s $BHASKARA_BASE_URL/chat/completions \\
  -H "Authorization: Bearer $BHASKARA_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"model":"glm-5.3","messages":[{"role":"user","content":"explain cache-aware prompt prefixes"}]}'`}</Code>
                  </div>
                </div>

                <div>
                  <Sub id="messages">POST /v1/messages</Sub>
                  <div className="mt-3 space-y-3">
                    <P>
                      Anthropic-compatible: <Inline>system</Inline>,{" "}
                      <Inline>messages[]</Inline> with content blocks,{" "}
                      <Inline>anthropic-version</Inline> and{" "}
                      <Inline>x-api-key</Inline> auth. The SSE event shapes are
                      the ones Claude Code already parses:{" "}
                      <Inline>message_start</Inline>,{" "}
                      <Inline>content_block_delta</Inline>,{" "}
                      <Inline>message_stop</Inline>.
                    </P>
                  </div>
                </div>

                <div>
                  <Sub id="sdk">Any OpenAI or Anthropic SDK, unchanged</Sub>
                  <p className="measure mt-3 text-[0.875rem] leading-relaxed text-ink-soft">
                    The only two values that change are the base URL and the key.
                  </p>
                  <Code lang="python" label="python">{`from openai import OpenAI

client = OpenAI(
    base_url="https://api.bhaskaralabs.com/v1",
    api_key="sk-bhaskara-…",
)
r = client.chat.completions.create(
    model="theta",
    messages=[{"role": "user", "content": "fix my SQL window fn"}],
)
print(r.choices[0].message.content)`}</Code>
                  <Code lang="typescript" label="typescript">{`import Anthropic from "@anthropic-ai/sdk";

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
              </div>
            </section>

            {/* 04 Integrations */}
            <section className="scroll-mt-20" id="integrations">
              <div className="border-t border-ink pt-5">
                <p className="label text-accent-deep">04 Integrations</p>
                <h2 className="claim mt-5">
                  Base URL, key, model name. That is the whole contract.
                </h2>
              </div>

              <div className="mt-9">
                {INTEGRATIONS.map((tool) => (
                  <div key={tool.name} className="border-t border-rule pt-6">
                    <h3 className="text-[0.9375rem] font-medium text-ink">
                      {tool.name}
                    </h3>
                    <p className="measure mt-2 text-[0.8125rem] leading-relaxed text-ink-mute">
                      {tool.note}
                    </p>
                    <Code lang={tool.name} label={tool.name.toLowerCase()}>
                      {tool.code}
                    </Code>
                  </div>
                ))}
              </div>

              <Note>
                Verified shapes only. If a tool needs a flag that is not listed
                here, its own documentation is the authority — the three values
                above are all we require.
              </Note>
            </section>

            {/* 05 Caching */}
            <section className="scroll-mt-20" id="caching">
              <div className="border-t border-ink pt-5">
                <p className="label text-accent-deep">05 Caching rules</p>
                <h2 className="claim mt-5">
                  Four rules decide what your session costs.
                </h2>
              </div>
              <ol className="mt-9 space-y-6">
                {CACHE_RULES.map((rule, i) => (
                  <li
                    key={rule.t}
                    className="grid gap-x-6 gap-y-2 border-t border-rule pt-5 sm:grid-cols-[3rem_1fr]"
                  >
                    <span className="label pt-1 text-accent-deep">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <div>
                      <h3 className="text-[0.9375rem] font-medium text-ink">
                        {rule.t}
                      </h3>
                      <p className="measure mt-2 text-[0.875rem] leading-relaxed text-ink-soft">
                        {rule.b}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            </section>

            {/* 06 Headers */}
            <section className="scroll-mt-20" id="headers">
              <div className="border-t border-ink pt-5">
                <p className="label text-accent-deep">06 Quotas & errors</p>
                <h2 className="claim mt-5">
                  Every response carries your live quota state.
                </h2>
              </div>
              <div className="mt-9">
                <Rows
                  head={["Header", "Meaning"]}
                  rows={[
                    ["x-quota-plan", "trial, starter or pro."],
                    [
                      "x-quota-monthly-reset",
                      "ISO date the token quotas roll over.",
                    ],
                    [
                      "x-ratelimit-*-tokens",
                      "Frontier: the monthly token dimension, with reset in seconds.",
                    ],
                    ["x-ratelimit-*-requests", "theta: the rolling five-hour window."],
                    [
                      "x-quota-output-tokens-remaining",
                      "Frontier monthly output remainder.",
                    ],
                    [
                      "Retry-After",
                      "On 429 only — seconds until the window or month resets.",
                    ],
                  ]}
                />
              </div>

              <div className="mt-8 space-y-3">
                {[
                  ["401", "Bad or revoked key."],
                  ["400", "Unknown model name. The allowed three are listed above."],
                  [
                    "429",
                    "Quota exhausted, with Retry-After. Never a silent degrade.",
                  ],
                  [
                    "502",
                    "Upstream failure. Retryable; our error body never names providers.",
                  ],
                ].map(([code, body]) => (
                  <div
                    key={code}
                    className="flex gap-5 border-b border-rule pb-3 last:border-b-0"
                  >
                    <span className="num w-12 shrink-0 font-mono text-[0.875rem] text-danger">
                      {code}
                    </span>
                    <span className="text-[0.875rem] leading-relaxed text-ink-soft">
                      {body}
                    </span>
                  </div>
                ))}
              </div>

              <Note>
                Back off by honouring Retry-After first, then exponential with
                jitter. A flat 429 storm with no Retry-After usually means a
                wrong key is being retried, not an exhausted quota. No pricing
                data ever appears in a header — costs live in the dashboard.
              </Note>
            </section>

            {/* 07 Streaming */}
            <section className="scroll-mt-20" id="streaming">
              <div className="border-t border-ink pt-5">
                <p className="label text-accent-deep">07 Streaming</p>
                <h2 className="claim mt-5">Long generations stay connected.</h2>
              </div>
              <div className="mt-9 space-y-3">
                <P>
                  <Inline>&quot;stream&quot;: true</Inline> on{" "}
                  <Inline>/v1/chat/completions</Inline> gives OpenAI-style SSE.
                  On <Inline>/v1/messages</Inline> it gives Anthropic event
                  types. Tool-call deltas stream in the same shape the native
                  APIs use, so agent harnesses parse them without an adapter.
                </P>
                <P>
                  The gateway runs on infrastructure without a platform request
                  timeout, precisely so a frontier generation with long reasoning
                  is not cut off mid-stream.
                </P>
              </div>
            </section>

            {/* 08 Terse */}
            <section className="scroll-mt-20" id="terse">
              <div className="border-t border-ink pt-5">
                <p className="label text-accent-deep">08 Terse mode</p>
                <h2 className="claim mt-5">
                  Output compression, on request and off by default.
                </h2>
              </div>
              <div className="mt-9 space-y-3">
                <P>
                  Send <Inline>x-bhaskara-terse: 1</Inline> on either endpoint
                  and replies come back as compressed engineer-speak: no
                  preamble, no restatement, no closing summary. Code, commands
                  and file paths stay byte-exact. Safety-relevant replies are
                  exempted by instruction.
                </P>
                <Code lang="bash" label="curl">{`curl -s $BHASKARA_BASE_URL/chat/completions \\
  -H "Authorization: Bearer $BHASKARA_API_KEY" \\
  -H "x-bhaskara-terse: 1" \\
  -H "Content-Type: application/json" \\
  -d '{"model":"glm-5.3","messages":[…]}'`}</Code>
                <Note>
                  Cache note: the discipline block lives in your system prompt,
                  so it changes the prefix exactly once when you enable it and
                  then stays byte-stable. Keep the header on every request of a
                  session. Reported output savings are our own measurements, not
                  a third party&apos;s.
                </Note>
              </div>
            </section>
          </div>

          <p className="mt-20 border-t border-rule pt-6 text-[0.875rem] text-ink-mute">
            Stuck? The <Link href="/faq" className="prose-link">FAQ</Link> covers
            quotas and billing, and the{" "}
            <Link href="/plans#calculator" className="prose-link">
              calculator
            </Link>{" "}
            covers the arithmetic.
          </p>
        </div>
      </div>
    </main>
  );
}
