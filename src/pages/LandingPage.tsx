import { useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Activity, Shield, Globe, Sparkles, Target, BarChart3,
  TrendingUp, Layers, Zap, ArrowRight, ChevronRight,
  Brain, LineChart, Cpu, Eye, GitBranch, Workflow,
  Lock, Clock, Infinity as InfinityIcon
} from "lucide-react";
import { Button } from "@/components/ui/button";
import PublicNav from "@/components/PublicNav";
import entropyLogoFull from "@/assets/entropy-logo-full.jpeg";

const STATS = [
  { value: "10,000", label: "Monte Carlo paths / asset" },
  { value: "12", label: "Intelligence layers" },
  { value: "<2s", label: "Median scenario latency" },
  { value: "24/7", label: "Continuous market scan" },
];

const PRINCIPLES = [
  { title: "Probability over prediction", desc: "Every scenario is expressed as a distribution, not a forecast. You see the range of outcomes and the confidence behind them." },
  { title: "Structure over noise", desc: "We model the constraints, liquidity, and flows that move markets — not the headlines that follow." },
  { title: "Calibration over conviction", desc: "The system continuously refines itself against your outcomes. It learns the patterns that work for you." },
  { title: "Clarity over complexity", desc: "Twelve intelligence layers, one composed view. Decisions stay yours; the math stays out of the way." },
];

const FEATURES = [
  { icon: Activity, title: "Quantitative Risk Engine", desc: "VaR, CVaR, and liquidity-adjusted risk at 95% and 99% confidence — institutional-grade exposure analysis on every position." },
  { icon: Shield, title: "CLANK Constraint Detection", desc: "Identifies structural risk boundaries and liquidity thresholds before they manifest in price." },
  { icon: Globe, title: "Geopolitical Intelligence", desc: "Real-time global event monitoring with market-impact scoring and regime-aware recalibration." },
  { icon: TrendingUp, title: "10,000-Path Monte Carlo", desc: "Geometric Brownian Motion simulations for probabilistic outcome modeling on every holding." },
  { icon: Layers, title: "Statistical Arbitrage", desc: "Mean-reversion detection, co-integration, and structural Z-score tracking across your full book." },
  { icon: Target, title: "Desirable Asset Discovery", desc: "Multi-stage funnel surfacing high-conviction setups via momentum, value, and quality factors." },
  { icon: BarChart3, title: "Deep Company Dossiers", desc: "12-dimension institutional intelligence: management DNA, capital flows, structural risk." },
  { icon: Sparkles, title: "Strategy Factory", desc: "Autonomous scenario generation, regime calibration, and paper simulation for hypothesis validation." },
  { icon: Zap, title: "Causal Effects Simulator", desc: "Pre-trade aftermath modeling: see the cascade before you commit capital." },
];

const HOW_IT_WORKS = [
  { icon: Eye, step: "01", title: "Data Ingestion", desc: "Real-time price feeds, macro indicators, news sentiment, geopolitical events, and institutional flow data — timestamped and normalized." },
  { icon: Cpu, step: "02", title: "Intelligence Processing", desc: "CLANK constraint detection, Monte Carlo, statistical arbitrage, and regime classification run in parallel and fuse into one view." },
  { icon: Brain, step: "03", title: "Scenario Generation", desc: "Probabilistic alerts the moment portfolio VaR breaches thresholds or structural constraints approach activation." },
  { icon: GitBranch, step: "04", title: "Causal Modeling", desc: "Cascading market impacts across correlated sectors, currencies, and asset classes — 1st, 2nd, and 3rd order." },
  { icon: LineChart, step: "05", title: "Scenario Mapping", desc: "Strategy Factory produces positioning insights with key levels, projected ranges, and invalidation zones." },
  { icon: Workflow, step: "06", title: "Continuous Learning", desc: "Every outcome feeds Scar Memory and the Outcome Gradient — the system gets sharper with every trade you log." },
];

const FAQS = [
  { q: "Do I need a credit card to start?", a: "No. Sign in with Google or email and the full intelligence terminal is available immediately. No card, no trial countdown, no friction." },
  { q: "Is this investment advice?", a: "No. Entropy Lite is a research and scenario-modeling platform. All outputs are observations and probabilities — you make every decision." },
  { q: "What markets does it cover?", a: "US equities and ETFs, NSE/BSE Indian equities, FX, crypto, and commodities. India-Only mode locks the entire stack to NSE/BSE." },
  { q: "How is this different from a broker app?", a: "Brokers show you prices and orders. Entropy Lite shows you the probability distribution behind those prices, the structural constraints shaping them, and the cascade that follows an event — composed for the independent thinker." },
  { q: "Will my data be used to train models?", a: "Your portfolio and trade history bias only your own AI context (Outcome Gradient). It never leaves your account." },
];

export default function LandingPage() {
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    document.title = "Entropy Lite | The Operating System of Finance";
    const meta = document.querySelector('meta[name="description"]');
    if (meta) meta.setAttribute("content", "Probabilistic scenario analysis, structural constraint detection, and continuous market intelligence. Free during founding access.");

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) navigate("/dashboard", { replace: true });
      setChecking(false);
    });
  }, [navigate]);

  if (checking) return null;

  const goSignup = () => navigate("/dashboard");

  return (
    <div className="min-h-screen bg-white text-black pb-20 sm:pb-0">
      <PublicNav />

      {/* HERO */}
      <header className="relative overflow-hidden">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 pt-10 sm:pt-16 pb-10 sm:pb-14 text-center">
          <img
            src={entropyLogoFull}
            alt="Entropy Lite"
            className="h-16 sm:h-28 object-contain mx-auto mb-5 sm:mb-7"
            loading="eager"
          />

          {/* Trust badge */}
          <div className="inline-flex items-center gap-2 mb-5 sm:mb-6 px-3 py-1.5 rounded-full border border-black/10 bg-black/[0.02]">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="font-mono text-[10px] tracking-wide text-black/60">Free during founding access · No credit card</span>
          </div>

          <h1 className="text-3xl sm:text-5xl md:text-6xl font-bold tracking-tight leading-[1.05] mb-5 sm:mb-6">
            Market structure intelligence,
            <br />
            <span className="text-black/55">refined for the independent thinker.</span>
          </h1>

          <p className="text-base sm:text-xl text-black/60 max-w-2xl mx-auto mb-8 sm:mb-10 leading-relaxed">
            Probabilistic scenario analysis, structural constraint detection, and continuous market intelligence —
            <span className="text-black font-semibold"> composed into a single, quiet terminal</span>.
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-3 mb-4">
            <Button
              size="lg"
              className="bg-black text-white hover:bg-black/85 font-mono text-xs tracking-wide px-8 h-12 w-full sm:w-auto shadow-lg shadow-black/20"
              onClick={goSignup}
            >
              Sign In Free <ArrowRight className="ml-1 h-4 w-4" />
            </Button>
            <button
              className="font-mono text-xs tracking-wide px-8 h-12 rounded-md border border-black/15 bg-white text-black hover:bg-black/[0.03] transition-colors w-full sm:w-auto"
              onClick={() => navigate("/about")}
            >
              See What's Inside
            </button>
          </div>

          <p className="font-mono text-[10px] text-black/35 tracking-wide">
            Google sign-in · 30-second setup · Cancel anytime (it's free)
          </p>

          {/* Stats strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 sm:gap-8 mt-12 sm:mt-16 pt-8 sm:pt-10 border-t border-black/5">
            {STATS.map((s) => (
              <div key={s.label} className="text-center">
                <div className="text-xl sm:text-3xl font-bold tracking-tight">{s.value}</div>
                <div className="font-mono text-[9px] sm:text-[10px] uppercase tracking-wider text-black/40 mt-1">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </header>

      {/* PRINCIPLES — quiet, classy positioning */}
      <section className="border-t border-black/5 bg-black/[0.015]">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-14 sm:py-24">
          <div className="text-center mb-10 sm:mb-14">
            <p className="font-mono text-[10px] tracking-[0.3em] uppercase text-black/40 mb-3">Principles</p>
            <h2 className="text-2xl sm:text-4xl font-bold tracking-tight mb-3">
              A different way of looking at markets.
            </h2>
            <p className="text-sm sm:text-base text-black/55 max-w-2xl mx-auto">
              Entropy Lite is built around four ideas. They shape every layer of the system.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-px bg-black/5 rounded-xl overflow-hidden border border-black/10">
            {PRINCIPLES.map((p, i) => (
              <div key={p.title} className="bg-white p-6 sm:p-8">
                <p className="font-mono text-[10px] tracking-wider text-black/35 mb-3">— {String(i + 1).padStart(2, "0")}</p>
                <h3 className="text-base sm:text-lg font-semibold tracking-tight mb-2">{p.title}</h3>
                <p className="text-sm text-black/55 leading-relaxed">{p.desc}</p>
              </div>
            ))}
          </div>

          <div className="text-center mt-10 sm:mt-12">
            <Button
              size="lg"
              className="bg-black text-white hover:bg-black/85 font-mono text-xs tracking-wide px-8 h-12"
              onClick={goSignup}
            >
              Begin — Sign In Free <ArrowRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        </div>
      </section>

      {/* FEATURES GRID */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-14 sm:py-20">
        <div className="text-center mb-10 sm:mb-14">
          <p className="font-mono text-[10px] tracking-[0.3em] uppercase text-black/40 mb-3">The stack</p>
          <h2 className="text-2xl sm:text-4xl font-bold tracking-tight mb-3">
            Twelve intelligence layers. One terminal.
          </h2>
          <p className="text-sm sm:text-base text-black/55 max-w-xl mx-auto">
            Every module a professional desk runs — unified, AI-fused, and live.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
          {FEATURES.map((f) => (
            <article
              key={f.title}
              className="group rounded-lg border border-black/5 bg-white p-5 sm:p-6 hover:shadow-md hover:border-black/15 active:bg-black/[0.02] transition-all"
            >
              <f.icon className="h-5 w-5 text-black/40 mb-3 sm:mb-4 group-hover:text-black/80 transition-colors" />
              <h3 className="font-semibold text-sm mb-1.5 sm:mb-2">{f.title}</h3>
              <p className="text-sm text-black/55 leading-relaxed">{f.desc}</p>
            </article>
          ))}
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="border-t border-black/5 bg-black/[0.015]">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-14 sm:py-20">
          <div className="text-center mb-10 sm:mb-14">
            <p className="font-mono text-[10px] tracking-[0.3em] uppercase text-black/40 mb-3">The pipeline</p>
            <h2 className="text-2xl sm:text-4xl font-bold tracking-tight mb-3">
              From raw data to probabilistic intelligence
            </h2>
            <p className="text-sm sm:text-base text-black/55 max-w-2xl mx-auto">
              A six-stage pipeline that continuously processes global financial markets in real time.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-8">
            {HOW_IT_WORKS.map((step) => (
              <div key={step.step} className="flex gap-4 sm:gap-5">
                <div className="flex-shrink-0">
                  <div className="w-10 h-10 rounded-full border border-black/10 bg-white flex items-center justify-center">
                    <span className="font-mono text-[10px] font-bold text-black/50">{step.step}</span>
                  </div>
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-2">
                    <step.icon className="h-4 w-4 text-black/40 flex-shrink-0" />
                    <h3 className="font-semibold text-sm">{step.title}</h3>
                  </div>
                  <p className="text-sm text-black/55 leading-relaxed">{step.desc}</p>
                </div>
              </div>
            ))}
          </div>

          <div className="text-center mt-12">
            <Button
              size="lg"
              className="bg-black text-white hover:bg-black/85 font-mono text-xs tracking-wide px-8 h-12"
              onClick={goSignup}
            >
              Run it on your portfolio <ArrowRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        </div>
      </section>

      {/* WHY NOW — risk reversal */}
      <section className="max-w-4xl mx-auto px-4 sm:px-6 py-14 sm:py-20">
        <div className="rounded-2xl border border-black/10 bg-gradient-to-br from-black/[0.02] to-transparent p-6 sm:p-10">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 sm:gap-8 mb-8">
            <div className="flex flex-col items-center text-center">
              <div className="w-10 h-10 rounded-full bg-black/5 flex items-center justify-center mb-3">
                <Lock className="h-4 w-4 text-black/60" />
              </div>
              <p className="font-semibold text-sm mb-1">No credit card</p>
              <p className="text-xs text-black/50 leading-relaxed">Sign in with Google or email. Full terminal unlocked instantly.</p>
            </div>
            <div className="flex flex-col items-center text-center">
              <div className="w-10 h-10 rounded-full bg-black/5 flex items-center justify-center mb-3">
                <Clock className="h-4 w-4 text-black/60" />
              </div>
              <p className="font-semibold text-sm mb-1">30-second setup</p>
              <p className="text-xs text-black/50 leading-relaxed">Add your tickers, set your base currency, and you're running.</p>
            </div>
            <div className="flex flex-col items-center text-center">
              <div className="w-10 h-10 rounded-full bg-black/5 flex items-center justify-center mb-3">
                <InfinityIcon className="h-4 w-4 text-black/60" />
              </div>
              <p className="font-semibold text-sm mb-1">Free during founding</p>
              <p className="text-xs text-black/50 leading-relaxed">Founding members keep founding pricing forever when paid tiers launch.</p>
            </div>
          </div>

          <div className="text-center">
            <h3 className="text-xl sm:text-2xl font-bold tracking-tight mb-3">
              Every day without it is a day institutions price you out of.
            </h3>
            <p className="text-sm text-black/55 mb-6 max-w-lg mx-auto">
              The platform gets sharper the longer you use it. Your trade history biases the AI toward your profitable patterns.
            </p>
            <Button
              size="lg"
              className="bg-black text-white hover:bg-black/85 font-mono text-xs tracking-wide px-8 h-12 shadow-lg shadow-black/20"
              onClick={goSignup}
            >
              Start free now <ArrowRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        </div>
      </section>

      {/* FAQ — kill objections */}
      <section className="border-t border-black/5">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-14 sm:py-20">
          <div className="text-center mb-10 sm:mb-12">
            <p className="font-mono text-[10px] tracking-[0.3em] uppercase text-black/40 mb-3">Last questions</p>
            <h2 className="text-2xl sm:text-4xl font-bold tracking-tight">
              Before you sign in
            </h2>
          </div>

          <div className="space-y-3">
            {FAQS.map((f) => (
              <details key={f.q} className="group rounded-lg border border-black/5 bg-white p-4 sm:p-5 open:border-black/15 transition-colors">
                <summary className="flex items-center justify-between cursor-pointer list-none">
                  <span className="font-semibold text-sm pr-4">{f.q}</span>
                  <ChevronRight className="h-4 w-4 text-black/40 flex-shrink-0 group-open:rotate-90 transition-transform" />
                </summary>
                <p className="text-sm text-black/55 leading-relaxed mt-3">{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="border-t border-black/5 bg-black text-white">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-16 sm:py-24 text-center">
          <h2 className="text-2xl sm:text-4xl font-bold tracking-tight mb-4">
            The terminal institutions don't want you to have.
          </h2>
          <p className="text-sm sm:text-base text-white/60 mb-8 max-w-lg mx-auto">
            Free during founding access. No card. No trial timer. Sign in and start running scenarios in under a minute.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mb-4">
            <Button
              size="lg"
              className="bg-white text-black hover:bg-white/90 font-mono text-xs tracking-wide px-8 h-12 w-full sm:w-auto shadow-xl"
              onClick={goSignup}
            >
              Sign In Free <ArrowRight className="ml-1 h-4 w-4" />
            </Button>
            <button
              className="font-mono text-xs tracking-wide px-8 h-12 rounded-md border border-white/20 text-white hover:bg-white/5 transition-colors w-full sm:w-auto"
              onClick={() => navigate("/pricing")}
            >
              View Pricing
            </button>
          </div>
          <p className="font-mono text-[10px] text-white/35 tracking-wide">
            Founding members lock in founding pricing forever
          </p>
        </div>
      </section>

      <footer className="border-t border-black/5 py-6">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <p className="font-mono text-[9px] text-black/25 leading-relaxed mb-4 max-w-4xl">
            EntropyLite is a market intelligence and probabilistic scenario engine. It does not provide investment advice, trading recommendations, or portfolio management services. All outputs are research-based observations and scenario projections. Users make independent investment decisions at their own risk.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="font-mono text-[10px] text-black/30 tracking-wider">
              © {new Date().getFullYear()} EntropyLite. All rights reserved.
            </p>
            <div className="flex items-center gap-6">
              <button onClick={() => navigate("/about")} className="font-mono text-[10px] text-black/30 hover:text-black/60">About</button>
              <button onClick={() => navigate("/pricing")} className="font-mono text-[10px] text-black/30 hover:text-black/60">Pricing</button>
              <button onClick={() => navigate("/access")} className="font-mono text-[10px] text-black/30 hover:text-black/60">Access</button>
              <button onClick={() => navigate("/disclaimer")} className="font-mono text-[10px] text-black/30 hover:text-black/60">Disclaimer</button>
            </div>
          </div>
        </div>
      </footer>

      {/* STICKY MOBILE CTA — always one tap from signup */}
      <div className="sm:hidden fixed bottom-0 inset-x-0 z-50 bg-white/95 backdrop-blur-md border-t border-black/10 px-4 py-3 shadow-[0_-4px_20px_rgba(0,0,0,0.08)]">
        <Button
          className="w-full bg-black text-white hover:bg-black/85 font-mono text-xs tracking-wide h-11"
          onClick={goSignup}
        >
          Sign In Free — No Card Required <ArrowRight className="ml-1 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
