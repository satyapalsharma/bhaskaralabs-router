import { LegalPage, Section } from "../legal/legal";

export const metadata = { title: "FAQ — Bhaskara Labs" };

function Q({ q, children }: { q: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-sm font-semibold text-zinc-200">{q}</h3>
      <div className="mt-1.5 space-y-2 text-sm leading-relaxed text-zinc-400">{children}</div>
    </div>
  );
}

export default function FaqPage() {
  return (
    <LegalPage title="FAQ" effective="1 September 2026">
      <Section heading="Endpoints & models">
        <Q q="Which endpoints can I call?">
          <p>
            <code>POST /v1/chat/completions</code> (OpenAI-compatible) and <code>POST /v1/messages</code>{" "}
            (Anthropic-compatible). Authenticate with <code>Authorization: Bearer sk-bhaskara-…</code>{" "}
            (Anthropic-style <code>x-api-key</code> works on <code>/v1/messages</code>). Models you can
            name: <code>glm-5.3</code>, <code>qwen-3.8</code>, <code>theta</code>. The{" "}
            <em>flash</em> variants of the frontier families exist upstream — our router selects them
            per-session; you address them through the two frontier endpoint names.
          </p>
        </Q>
        <Q q="What exactly is theta?">
          <p>
            A flat per-request endpoint — you stop counting tokens, we absorb the variance. It routes your
            turn to the cheapest backend that can handle it: routine turns to flash-tier capacity, turns our
            classifier flags as heavy reasoning to a stronger backend. If your agent is chatty and
            context-heavy, theta is usually the cheaper bill.
          </p>
        </Q>
        <Q q="Do you swap models behind my back?">
          <p>
            Never silently. A request naming <code>glm-5.3</code> is answered by the GLM-5.3 family. Which
            variant — full or flash — is the router&apos;s session-level decision, disclosed in the
            response and headers (see the sticky lock below). You always know which endpoint you called and
            which tier answered.
          </p>
        </Q>
      </Section>

      <Section heading="Routing & caching">
        <Q q="What is the session-sticky model lock?">
          <p>
            Provider prompt caches are keyed to a stable request prefix <em>and model</em>. If we flipped
            your session between a full model and its flash variant turn to turn, every flip would wipe the
            cache and re-bill your prefix. So the first request of a session gets routed by task difficulty
            — and the tier chosen for that session then sticks (2-hour idle TTL) regardless of later turns.
            Fresh sessions get fresh decisions.
          </p>
        </Q>
        <Q q="How do I get high cache-hit rates?">
          <p>
            Put the stable stuff first: system prompt, tool definitions, long-lived context. Append only at
            the end. Any mid-context edits invalidate everything after them. Watch{" "}
            <code>x-ratelimit-remaining-*</code> and your dashboard cache column; we publish the exact
            prefix rules the router assumes.
          </p>
        </Q>
        <Q q="Which headers tell me my quota state?">
          <p>
            Every successful response: <code>x-quota-plan</code>, <code>x-quota-monthly-reset</code>; theta
            responses add <code>x-ratelimit-limit-requests</code> / <code>-remaining-requests</code>;
            frontier responses add <code>x-ratelimit-limit-tokens</code> / <code>-remaining-tokens</code>{" "}
            and <code>x-quota-output-tokens-remaining</code>. On 429 you additionally get{" "}
            <code>Retry-After</code> in seconds. No pricing data is ever in headers — costs live in the
            dashboard.
          </p>
        </Q>
      </Section>

      <Section heading="Quotas & plans">
        <Q q="Which limits apply, and when do they reset?">
          <p>
            Frontier endpoints count prompt and completion tokens separately against monthly caps (reset
            00:00 UTC on the 1st). Theta counts requests in a rolling five-hour window plus a monthly
            ceiling. Exceed anything and you get a clean 429 with the reset time — never a silent degrade.
          </p>
        </Q>
        <Q q="What happens when quota is exhausted mid-session?">
          <p>
            Rejected with 429 and a dashboard deep-link; the sticky lock for that session stays locked —
            after reset, your session resumes on the same model with the cache still warm.
          </p>
        </Q>
        <Q q="Why is signup sometimes closed?">
          <p>
            Cohorts of 100. New users land on the waitlist while a cohort review is running so existing
            users keep stable capacity; the gate is automatic and admin-dialled.
          </p>
        </Q>
      </Section>

      <Section heading="Privacy & training">
        <Q q="Do you train on my prompts?">
          <p>
            Only while your dashboard &quot;Train on my traffic&quot; switch is on — flip it and the very
            next request stops being stored. Full mechanics in the{" "}
            <a href="/legal/training" className="text-amber-400 underline hover:text-amber-300">
              training disclosure
            </a>
            . The honest limit of opt-out (gradients don&apos;t unlearn) is stated there too.
          </p>
        </Q>
        <Q q="Where is my data?">
          <p>
            India-hosted primary store, encrypted at rest; upstream inference providers see the live request
            only and are contractually zero-retention for pass-through traffic. Details in the{" "}
            <a href="/legal/privacy" className="text-amber-400 underline hover:text-amber-300">
              privacy policy
            </a>
            .
          </p>
        </Q>
      </Section>

      <Section heading="Billing">
        <Q q="Why do you show a savings number against &quot;direct API rates&quot;?">
          <p>
            Because it is the only honest comparison: the same uncached prompt at full list price of the
            frontier family, no cache discounts. It is an estimate, labelled as one —{" "}
            <a href="/plans" className="text-amber-400 underline hover:text-amber-300">
              calculator
            </a>{" "}
            is public, and we disclose the three engineering choices (cache engineering, context
            management, routing) that make our prices possible.
          </p>
        </Q>
        <Q q="Refunds?">
          <p>
            7-day full refund on a first paid cycle; pro-rata on downtime &gt; 24h and billing errors — see
            the{" "}
            <a href="/legal/refunds" className="text-amber-400 underline hover:text-amber-300">
              refund policy
            </a>
            .
          </p>
        </Q>
      </Section>

      <Section heading="Legal">
        <p>
          <a href="/legal/terms" className="text-amber-400 underline hover:text-amber-300">Terms of Service</a>{" "}
          ·{" "}
          <a href="/legal/privacy" className="text-amber-400 underline hover:text-amber-300">Privacy Policy</a>{" "}
          ·{" "}
          <a href="/legal/training" className="text-amber-400 underline hover:text-amber-300">
            Training data disclosure
          </a>{" "}
          ·{" "}
          <a href="/legal/refunds" className="text-amber-400 underline hover:text-amber-300">
            Refund policy
          </a>
        </p>
      </Section>
    </LegalPage>
  );
}