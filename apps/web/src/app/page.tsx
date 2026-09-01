const MODELS = [
  {
    id: "glm-5.3",
    label: "GLM-5.3",
    desc: "Frontier coding intelligence, smart-routed. Heavy reasoning runs on the full model; execution on the Flash tier.",
    context: "1M context",
  },
  {
    id: "qwen-3.8",
    label: "Qwen-3.8",
    desc: "The Qwen frontier endpoint with the same routing discipline — planning gets the big model, everything else stays fast.",
    context: "1M context",
  },
  {
    id: "theta",
    label: "theta",
    desc: "Our fast tier. Today a smart-routed ensemble; evolving into our own domain-tuned small model (research in progress).",
    context: "Fast tier",
  },
];

const PILLARS = [
  {
    title: "Inference platform",
    desc: "OpenAI- and Anthropic-compatible endpoints. Point Claude Code, Crush, OpenCode, or any SDK at us and ship.",
  },
  {
    title: "Academics",
    desc: "A free, interactive series on how LLMs actually work — tokenization to KV-cache economics — built for students.",
  },
  {
    title: "Research",
    desc: "Building toward domain-specific small models for organizations that handle sensitive data — trained where the data lives.",
  },
];

export default function Home() {
  return (
    <main className="mx-auto max-w-6xl px-6">
      {/* Hero */}
      <section className="py-24 text-center">
        <p className="text-amber-500 font-mono text-sm tracking-widest uppercase mb-4">
          From the land that gave zero to the world
        </p>
        <h1 className="text-4xl sm:text-6xl font-bold tracking-tight leading-tight">
          An attempt at solving the{" "}
          <span className="text-amber-500">price-per-intelligence</span> metric.
        </h1>
        <p className="mt-6 text-lg text-zinc-400 max-w-2xl mx-auto">
          Frontier-class coding models at a fraction of direct API cost — through
          prompt-cache engineering, context management, and smart routing.
          Every technique disclosed, nothing hidden.
        </p>
        <div className="mt-10 flex gap-4 justify-center">
          <a
            href="/plans"
            className="rounded-md bg-amber-500 px-6 py-3 font-medium text-zinc-950 hover:bg-amber-400 transition-colors"
          >
            See the plans
          </a>
          <a
            href="/academics"
            className="rounded-md border border-zinc-700 px-6 py-3 font-medium hover:border-zinc-500 transition-colors"
          >
            Learn how LLMs work
          </a>
        </div>
      </section>

      {/* Models */}
      <section className="py-12">
        <h2 className="text-2xl font-semibold mb-8">Three endpoints, one API</h2>
        <div className="grid md:grid-cols-3 gap-6">
          {MODELS.map((m) => (
            <div key={m.id} className="rounded-lg border border-zinc-800 p-6 hover:border-zinc-600 transition-colors">
              <div className="flex items-baseline justify-between">
                <code className="text-amber-500 font-mono">{m.id}</code>
                <span className="text-xs text-zinc-500">{m.context}</span>
              </div>
              <h3 className="mt-3 font-semibold text-lg">{m.label}</h3>
              <p className="mt-2 text-sm text-zinc-400 leading-relaxed">{m.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Pillars */}
      <section className="py-12">
        <h2 className="text-2xl font-semibold mb-8">What we&apos;re building</h2>
        <div className="grid md:grid-cols-3 gap-6">
          {PILLARS.map((p) => (
            <div key={p.title}>
              <h3 className="font-semibold">{p.title}</h3>
              <p className="mt-2 text-sm text-zinc-400 leading-relaxed">{p.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Transparency note */}
      <section className="py-12">
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-6">
          <h3 className="font-semibold mb-2">How we keep prices this low — openly</h3>
          <p className="text-sm text-zinc-400 leading-relaxed">
            Prompt caching (we engineer prefixes so cache hits stay high), context
            management, and smart routing between model tiers. Read the full
            breakdown on the <a href="/plans" className="text-amber-500 hover:underline">plans page</a> —
            including the calculator that shows exactly what you&apos;d pay at direct
            API rates. We may use API traffic to train our own models; you can
            opt out any time from your dashboard.
          </p>
        </div>
      </section>
    </main>
  );
}