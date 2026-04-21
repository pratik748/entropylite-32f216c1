import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowRight, Cpu, Database, Network, Shield, GitBranch, Zap, FileText, Download } from "lucide-react";
import PublicNav from "@/components/PublicNav";
import MathResearch from "@/components/landing/MathResearch";

const STACK = [
  {
    icon: Cpu,
    title: "Quantitative Engine",
    items: [
      "log-returns, σ, μ, skew, kurtosis, jump detection",
      "Pearson ρ, true covariance Σ, portfolio σ = √(wᵀΣw)",
      "parametric / historical VaR, CVaR (Expected Shortfall)",
      "rolling 60-day VaR backtest (Kupiec-style breach count)",
      "Sharpe, Sortino, beta, Merton 1974 distance-to-default",
    ],
    file: "src/lib/quant-engine.ts",
  },
  {
    icon: Network,
    title: "Intelligence Layer",
    items: [
      "Triple-provider parallel AI (callAIParallel) with race-to-first-valid",
      "Cloudflare Workers AI · Mistral · OpenAI gateway",
      "Hardened JSON resilience (safeParseJSON) for malformed model output",
      "Dossier path uses single-provider streaming for high-token reliability",
    ],
    file: "supabase/functions/_shared/callAI.ts",
  },
  {
    icon: Database,
    title: "Data Pipeline",
    items: [
      "Yahoo Finance v8 → v6 → v10 multi-endpoint fallback",
      "Alpha Vantage as secondary OHLC source",
      "Default 1-year daily history per holding (was 3mo)",
      "FX normalization layer (useFX) — every monetary value rendered in user currency",
      "API Governor: tiered cache (frequent / standard / slow) to avoid rate-limits",
    ],
    file: "supabase/functions/_shared/liveData.ts",
  },
  {
    icon: Shield,
    title: "Risk & Constraints",
    items: [
      "CLANK Structural Constraint Engine — institutional pressure detection",
      "Fortress Mode — hard-stop liquidation discipline",
      "Causal Effects Engine (1st / 2nd / 3rd order cascade modeling)",
      "Aftermath Matrix — pre-trade impact, slippage, regret simulation",
    ],
    file: "src/lib/clank-engine.ts · src/lib/fortress-engine.ts",
  },
  {
    icon: GitBranch,
    title: "Strategy & Memory",
    items: [
      "Strategy Lab — regime-aware executable plans (BUY/SELL/HOLD with exact levels)",
      "Strategy Factory — autonomous background hypothesis generation",
      "Future Graph Machine — probabilistic forecasting pipeline",
      "Scar Memory — every loss recorded; biases future model selection",
      "Outcome-Driven Gradient System — per-account persistent profit gradient",
    ],
    file: "src/lib/future-graph-machine.ts · src/hooks/useStrategyMemory.ts",
  },
  {
    icon: Zap,
    title: "Execution & Persistence",
    items: [
      "Alpaca paper trading integration (pre-live validation layer)",
      "Supabase-backed portfolio persistence with permissive RLS",
      "Realtime subscriptions for cross-device sync",
      "Edge Functions (Deno) for AI orchestration, market data, simulations",
      "JWT auth gate on every backend function (requireAuth shared util)",
    ],
    file: "supabase/functions/alpaca-trading/index.ts",
  },
];

const PIPELINE = [
  { step: "01", label: "Ingest", body: "Real-time prices, fundamentals, news, geopolitics, FX." },
  { step: "02", label: "Normalize", body: "Tickers resolved · currency converted · log-returns computed." },
  { step: "03", label: "Quantify", body: "σ, μ, ρ, Σ, VaR, CVaR, Merton DD per holding — live." },
  { step: "04", label: "Reason", body: "Parallel AI providers race; structural constraints (CLANK) overlay." },
  { step: "05", label: "Simulate", body: "10,000-path Monte Carlo · causal cascades · aftermath matrix." },
  { step: "06", label: "Decide", body: "Strategy Lab emits BUY/SELL/HOLD with exact levels & sizing." },
  { step: "07", label: "Learn", body: "Scar Memory + Outcome Gradient bias future model choice." },
];

export default function BackbonePage() {
  const navigate = useNavigate();

  useEffect(() => {
    document.title = "Backbone | Entropy Lite — Research, Math & Engineering";
    const meta = document.querySelector('meta[name="description"]');
    if (meta)
      meta.setAttribute(
        "content",
        "The research, mathematics and engineering stack behind Entropy Lite — quant engine, AI orchestration, data pipeline, CLANK theory and the full SSRN manuscript.",
      );
  }, []);

  return (
    <div className="min-h-screen bg-white text-black">
      <PublicNav />

      {/* Hero */}
      <header className="border-b border-black/5">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12 sm:py-20">
          <p className="font-mono text-[10px] tracking-[0.3em] uppercase text-black/40 mb-4">
            The Backbone
          </p>
          <h1 className="text-3xl sm:text-5xl font-bold tracking-tight mb-5 leading-tight">
            The research, math and engineering<br />
            <span className="text-black/50">that the terminal sits on top of.</span>
          </h1>
          <p className="text-sm sm:text-base text-black/60 max-w-2xl leading-relaxed">
            Entropy Lite is not a wrapper around a chatbot. Every screen in the terminal traces back to a
            specific paper, a specific formula, and a specific data pipeline. This page is the audit trail.
          </p>

          <div className="mt-8 grid grid-cols-2 sm:grid-cols-4 gap-px bg-black/5 rounded-xl overflow-hidden border border-black/10">
            {[
              { k: "Models implemented", v: "30+" },
              { k: "Backend functions", v: "30+" },
              { k: "Daily history / asset", v: "1 yr" },
              { k: "MC paths / simulation", v: "10,000" },
            ].map((s) => (
              <div key={s.k} className="bg-white p-4 sm:p-5">
                <p className="font-mono text-[9px] tracking-[0.2em] uppercase text-black/40 mb-1.5">
                  {s.k}
                </p>
                <p className="text-xl sm:text-2xl font-bold tracking-tight">{s.v}</p>
              </div>
            ))}
          </div>
        </div>
      </header>

      {/* Pipeline diagram */}
      <section className="border-b border-black/5">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
          <p className="font-mono text-[10px] tracking-[0.3em] uppercase text-black/40 mb-3">
            End-to-end pipeline
          </p>
          <h2 className="text-xl sm:text-3xl font-bold tracking-tight mb-8">
            From raw market signal to executable decision.
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-px bg-black/5 rounded-xl overflow-hidden border border-black/10">
            {PIPELINE.map((p) => (
              <div key={p.step} className="bg-white p-4 sm:p-5">
                <div className="flex items-baseline gap-2 mb-2">
                  <span className="font-mono text-[10px] text-black/35">{p.step}</span>
                  <span className="font-mono text-[10px] tracking-[0.18em] uppercase text-black/55 font-semibold">
                    {p.label}
                  </span>
                </div>
                <p className="text-[12px] text-black/65 leading-relaxed">{p.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Engineering stack */}
      <section className="border-b border-black/5">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
          <p className="font-mono text-[10px] tracking-[0.3em] uppercase text-black/40 mb-3">
            Engineering stack
          </p>
          <h2 className="text-xl sm:text-3xl font-bold tracking-tight mb-8">
            Six subsystems, one terminal.
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-5">
            {STACK.map((s) => (
              <article
                key={s.title}
                className="rounded-xl border border-black/10 bg-white p-5 sm:p-6 hover:border-black/25 transition-colors"
              >
                <div className="flex items-center gap-2.5 mb-3">
                  <s.icon className="h-4 w-4 text-black/55" />
                  <h3 className="font-semibold text-sm sm:text-base">{s.title}</h3>
                </div>
                <ul className="space-y-1.5 mb-3">
                  {s.items.map((it) => (
                    <li key={it} className="text-[12px] text-black/65 leading-relaxed flex gap-2">
                      <span className="text-black/25 mt-0.5">▸</span>
                      <span>{it}</span>
                    </li>
                  ))}
                </ul>
                <p className="font-mono text-[10px] text-black/35 border-t border-black/5 pt-2.5 mt-3">
                  {s.file}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* Math + research (reuse landing component with full graphs + embedded PDF) */}
      <MathResearch />

      {/* Direct PDF download CTA */}
      <section className="border-t border-black/5 bg-black text-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12 sm:py-16 grid grid-cols-1 md:grid-cols-2 gap-8 items-center">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <FileText className="h-4 w-4 text-white/55" />
              <p className="font-mono text-[10px] tracking-[0.3em] uppercase text-white/55">
                The full manuscript
              </p>
            </div>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight mb-3">
              Read every page of the research that powers the system.
            </h2>
            <p className="text-sm text-white/60 leading-relaxed">
              30 pages. Structural lock manifold, reflexivity paradox, latency &amp; yield strength,
              failure modes catalogue. Every section maps to a working module in the terminal.
            </p>
          </div>
          <div className="flex flex-col gap-3">
            <a
              href="/research/clank-theory-sehwag-2026.pdf"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 px-5 py-3 bg-white text-black text-xs font-semibold tracking-wide rounded-md hover:bg-white/90 transition-colors"
            >
              <Download className="h-3.5 w-3.5" />
              Download the full PDF
            </a>
            <a
              href="https://papers.ssrn.com/sol3/papers.cfm?abstract_id=6464440"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 px-5 py-3 border border-white/20 text-white/85 text-xs font-semibold tracking-wide rounded-md hover:border-white/50 hover:text-white transition-colors"
            >
              View citation on SSRN
            </a>
            <Button
              size="lg"
              variant="ghost"
              className="text-white/70 hover:text-white hover:bg-white/5 font-mono text-xs"
              onClick={() => navigate("/access")}
            >
              Get access to the terminal <ArrowRight className="ml-2 h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </section>

      <footer className="border-t border-black/5 py-6 bg-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <p className="font-mono text-[9px] text-black/25 leading-relaxed mb-4 max-w-4xl">
            EntropyLite is a market intelligence and probabilistic scenario engine. It does not provide
            investment advice. All outputs are research-based observations. Users make independent
            decisions at their own risk.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="font-mono text-[10px] text-black/30">
              © {new Date().getFullYear()} EntropyLite. All rights reserved.
            </p>
            <div className="flex items-center gap-6">
              <button onClick={() => navigate("/")} className="font-mono text-[10px] text-black/30 hover:text-black/60">Home</button>
              <button onClick={() => navigate("/about")} className="font-mono text-[10px] text-black/30 hover:text-black/60">About</button>
              <button onClick={() => navigate("/pricing")} className="font-mono text-[10px] text-black/30 hover:text-black/60">Pricing</button>
              <button onClick={() => navigate("/disclaimer")} className="font-mono text-[10px] text-black/30 hover:text-black/60">Disclaimer</button>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
