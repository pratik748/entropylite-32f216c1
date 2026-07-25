import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowRight, Cpu, Database, Network, Shield, GitBranch, Zap, FileText, Download } from "lucide-react";
import PublicNav from "@/components/PublicNav";
import SiteFooter from "@/components/marketing/SiteFooter";
import { PageHeader, SectionIntro, LineButton } from "@/components/marketing/Section";
import MathResearch from "@/components/landing/MathResearch";

const STACK = [
  {
    icon: Cpu,
    title: "Quantitative engine",
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
    title: "Intelligence layer",
    items: [
      "Triple-provider parallel AI (callAIParallel) with race-to-first-valid",
      "Proprietary foundation models · Cloudflare Workers AI · Mistral gateway",
      "Hardened JSON resilience (safeParseJSON) for malformed model output",
      "Dossier path uses single-provider streaming for high-token reliability",
    ],
    file: "supabase/functions/_shared/callAI.ts",
  },
  {
    icon: Database,
    title: "Data pipeline",
    items: [
      "Multi-source market ingest with provider-agnostic normalization",
      "Unified asset registry with smart identifier resolution",
      "Temporal persistence layer with history-optimized storage",
      "Global currency normalization with real-time FX translation",
      "Self-regulating flow control with adaptive throttling",
    ],
    file: "supabase/functions/_shared/liveData.ts",
  },
  {
    icon: Shield,
    title: "Risk & constraints",
    items: [
      "CLANK structural constraint engine — institutional pressure detection",
      "Fortress Mode — hard-stop liquidation discipline",
      "Causal Effects engine (1st / 2nd / 3rd order cascade modelling)",
      "Aftermath Matrix — pre-trade impact, slippage, regret simulation",
    ],
    file: "src/lib/clank-engine.ts · src/lib/fortress-engine.ts",
  },
  {
    icon: GitBranch,
    title: "Strategy & memory",
    items: [
      "Strategy Lab — regime-aware executable plans with exact levels",
      "Strategy Factory — autonomous background hypothesis generation",
      "Future Graph Machine — probabilistic forecasting pipeline",
      "Scar Memory — every loss recorded, biasing future model selection",
      "Outcome-Driven Gradient System — per-account persistent profit gradient",
    ],
    file: "src/lib/future-graph-machine.ts · src/hooks/useStrategyMemory.ts",
  },
  {
    icon: Zap,
    title: "Execution & persistence",
    items: [
      "Alpaca paper-trading integration (pre-live validation layer)",
      "Supabase-backed portfolio persistence with permissive RLS",
      "Realtime subscriptions for cross-device sync",
      "Edge Functions (Deno) for AI orchestration, market data, simulation",
      "JWT auth gate on every backend function (requireAuth shared util)",
    ],
    file: "supabase/functions/alpaca-trading/index.ts",
  },
];

const PIPELINE = [
  { step: "01", label: "Ingest", body: "Real-time prices, fundamentals, news, geopolitics, FX." },
  { step: "02", label: "Normalize", body: "Tickers resolved · currency converted · log-returns computed." },
  { step: "03", label: "Quantify", body: "σ, μ, ρ, Σ, VaR, CVaR, Merton DD per holding — live." },
  { step: "04", label: "Reason", body: "Parallel AI providers race; CLANK constraints overlay." },
  { step: "05", label: "Simulate", body: "10,000-path Monte Carlo · causal cascades · aftermath matrix." },
  { step: "06", label: "Decide", body: "Strategy Lab emits BUY / SELL / HOLD with exact levels & sizing." },
  { step: "07", label: "Learn", body: "Scar Memory + Outcome Gradient bias future model choice." },
];

export default function BackbonePage() {
  const navigate = useNavigate();

  useEffect(() => {
    document.title = "Backbone | Entropy — research, math & engineering";
    const meta = document.querySelector('meta[name="description"]');
    if (meta)
      meta.setAttribute(
        "content",
        "The research, mathematics and engineering stack behind Entropy — quant engine, AI orchestration, data pipeline, CLANK theory and the full SSRN manuscript.",
      );
  }, []);

  return (
    <div className="site-public min-h-screen bg-carbon-950 text-white">
      <PublicNav />

      <PageHeader
        label="The Backbone"
        title={
          <>
            The research the terminal
            <br />
            <span className="text-white/40">sits on top of.</span>
          </>
        }
        lede="Entropy is not a wrapper around a chatbot. Every screen in the terminal traces back to a specific paper, a specific formula, and a specific data pipeline. This page is the audit trail."
      >
        {/* Stats band inside the header */}
        <div className="grid grid-cols-2 lg:grid-cols-4 border-t border-hairline mt-12">
          {[
            { k: "Models implemented", v: "30+" },
            { k: "Backend functions", v: "30+" },
            { k: "Daily history / asset", v: "1 yr" },
            { k: "MC paths / simulation", v: "10,000" },
          ].map((s, i) => (
            <div
              key={s.k}
              className={`py-6 pr-6 ${i > 0 ? "lg:border-l lg:border-hairline lg:pl-8" : ""} ${i % 2 === 1 ? "border-l border-hairline pl-6 lg:pl-8" : ""}`}
            >
              <div className="mkt-num text-2xl text-white">{s.v}</div>
              <div className="mkt-label text-[9px] text-white/35 mt-2">{s.k}</div>
            </div>
          ))}
        </div>
      </PageHeader>

      {/* Pipeline */}
      <section className="border-b border-hairline">
        <div className="max-w-7xl mx-auto px-5 sm:px-8 py-16 sm:py-24">
          <SectionIntro
            index="01"
            label="End-to-end pipeline"
            title={<>From raw signal to executable decision.</>}
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 mt-12 border-t border-l border-hairline">
            {PIPELINE.map((p) => (
              <div key={p.step} className="border-b border-r border-hairline p-6 hover:bg-carbon-900 transition-colors duration-150 ease-out">
                <div className="flex items-baseline gap-2.5 mb-3">
                  <span className="mkt-label text-[10px] text-white/30">{p.step}</span>
                  <span className="text-[13px] font-semibold tracking-tight text-white">{p.label}</span>
                </div>
                <p className="text-[12.5px] text-white/50 leading-relaxed">{p.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Engineering stack */}
      <section className="border-b border-hairline bg-carbon-900">
        <div className="max-w-7xl mx-auto px-5 sm:px-8 py-16 sm:py-24">
          <SectionIntro
            index="02"
            label="Engineering stack"
            title={<>Six subsystems, one terminal.</>}
          />
          <div className="grid grid-cols-1 md:grid-cols-2 mt-12 border-t border-l border-hairline">
            {STACK.map((s) => (
              <article key={s.title} className="border-b border-r border-hairline bg-carbon-950 p-7 sm:p-8">
                <div className="flex items-center gap-3 mb-5">
                  <s.icon className="h-4 w-4 text-white/40" strokeWidth={1.5} />
                  <h3 className="text-[14.5px] font-semibold tracking-tight text-white">{s.title}</h3>
                </div>
                <ul className="space-y-2 mb-5">
                  {s.items.map((it) => (
                    <li key={it} className="text-[12.5px] text-white/55 leading-relaxed flex gap-2.5">
                      <span className="text-white/20 mt-px">—</span>
                      <span>{it}</span>
                    </li>
                  ))}
                </ul>
                <p className="mkt-num text-[10px] text-white/30 border-t border-hairline pt-3">
                  {s.file}
                </p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* Math + research (shared component, full graphs + embedded PDF) */}
      <MathResearch />

      {/* Manuscript CTA */}
      <section className="bg-carbon-900 border-t border-hairline">
        <div className="max-w-7xl mx-auto px-5 sm:px-8 py-16 sm:py-24 grid grid-cols-1 md:grid-cols-2 gap-10 items-center">
          <div>
            <div className="flex items-center gap-3 mb-6">
              <FileText className="h-4 w-4 text-white/45" />
              <p className="mkt-label text-[10px] text-white/55">The full manuscript</p>
            </div>
            <h2 className="mkt-display-2 mb-4 text-white">
              Read every page of the research that powers the system.
            </h2>
            <p className="text-[13.5px] text-white/50 leading-relaxed max-w-md">
              30 pages. Structural lock manifold, reflexivity paradox, latency &amp; yield
              strength, failure-modes catalogue. Every section maps to a working module
              in the terminal.
            </p>
          </div>
          <div className="flex flex-col gap-3 md:max-w-sm md:ml-auto w-full">
            <a
              href="/research/clank-theory-sehwag-2026.pdf"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-11 items-center justify-center gap-2 bg-white text-carbon-950 text-[13px] font-semibold tracking-tight hover:bg-white/85 transition-colors duration-150 ease-out"
            >
              <Download className="h-4 w-4" />
              Download the full PDF
            </a>
            <a
              href="https://papers.ssrn.com/sol3/papers.cfm?abstract_id=6464440"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-11 items-center justify-center gap-2 border border-hairline-strong text-white/75 text-[13px] font-medium tracking-tight hover:border-white/40 hover:text-white transition-colors duration-150 ease-out"
            >
              View citation on SSRN
            </a>
            <LineButton onClick={() => navigate("/access")}>
              Get access to the terminal <ArrowRight className="h-4 w-4" />
            </LineButton>
          </div>
        </div>
      </section>

      <SiteFooter />
    </div>
  );
}
