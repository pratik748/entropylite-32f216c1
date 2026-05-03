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
import FeatureGallery from "@/components/landing/FeatureGallery";
import MathResearch from "@/components/landing/MathResearch";
import entropyLogoFull from "@/assets/entropy-logo-full.jpeg";
import dashboardPreview from "@/assets/dashboard-preview.png";

const STATS = [
  { value: "10,000", label: "Monte Carlo paths per asset" },
  { value: "12", label: "Intelligence layers" },
  { value: "Real time", label: "Price and news feeds" },
  { value: "Always on", label: "Background scenario scan" },
];

const PRINCIPLES = [
  { title: "Forecasts are fiction. Distributions are real.", desc: "We do not predict the next print. We show the range of plausible outcomes and the probability attached to each." },
  { title: "Structure moves price. Narrative explains it later.", desc: "Liquidity, positioning and constraint thresholds move markets. Headlines arrive after. The model watches the cause." },
  { title: "The system learns from you, not the crowd.", desc: "Every outcome you log adjusts the weights, biasing future analysis toward the patterns that worked and away from the ones that did not." },
  { title: "Twelve engines. One quiet surface.", desc: "Twelve layers run underneath. One surface sits on top. The math stays out of the way until you ask for it." },
];

const FEATURES = [
  { icon: Activity, title: "Quantitative risk engine", desc: "VaR and CVaR at 95% and 99%, liquidity adjusted, recomputed live for every position you hold." },
  { icon: Shield, title: "CLANK constraint detection", desc: "Warns when structural limits in liquidity, positioning or derivatives gamma start to bend, before price reacts." },
  { icon: Globe, title: "Geopolitical intelligence", desc: "A live read on global events with a market impact score and a regime label that adjusts the rest of the stack." },
  { icon: TrendingUp, title: "10,000 path Monte Carlo", desc: "A probabilistic outcome distribution on every holding, run on real volatility, reported as profit probability and tail risk." },
  { icon: Layers, title: "Statistical arbitrage", desc: "Mean reversion candidates, cointegrated pairs and Z score drift across the whole book, not a single ticker." },
  { icon: Target, title: "Desirable asset discovery", desc: "A daily shortlist of setups scored on momentum, quality and how they would interact with your existing exposure." },
  { icon: BarChart3, title: "Deep company dossiers", desc: "A twelve dimension read on any company: management, capital flows, narrative, structural risk and the rest." },
  { icon: Sparkles, title: "Strategy factory", desc: "Spin up a scenario, calibrate to the current regime and paper test a hypothesis before risking real capital." },
  { icon: Zap, title: "Causal effects simulator", desc: "First, second and third order cascade modelled before you place the trade, not after." },
];

const HOW_IT_WORKS = [
  { icon: Eye, step: "01", title: "Live data in", desc: "Yahoo Finance prices, GDELT geopolitics, multi source news, FX and institutional flow signals stream in continuously, timestamped and normalised to your base currency." },
  { icon: Cpu, step: "02", title: "Twelve engines run in parallel", desc: "CLANK, Monte Carlo, statistical arbitrage, regime classifier and the rest run side by side and resolve into a single composed view." },
  { icon: Brain, step: "03", title: "Probabilistic alerts", desc: "Notified the moment portfolio VaR breaches your threshold, or a structural constraint moves close to activation." },
  { icon: GitBranch, step: "04", title: "Causal cascade modelling", desc: "Each event is propagated across correlated sectors, currencies and asset classes through first, second and third order effects." },
  { icon: LineChart, step: "05", title: "Strategy mapping", desc: "Strategy Factory turns the read into a concrete positioning idea with entry levels, projected ranges and an invalidation zone." },
  { icon: Workflow, step: "06", title: "It learns from your outcomes", desc: "Every trade you log feeds Scar Memory and the Outcome Gradient, so the system biases toward your winners and away from your repeated losses." },
];

const FAQS = [
  { q: "Do I need a credit card to start?", a: "No. Sign in with Google or email and the full terminal opens. No card, no trial timer, no upsell wall." },
  { q: "Is this investment advice?", a: "No. Entropy Lite is a research and scenario modelling tool. Every output is an observation or a probability. Every decision is yours." },
  { q: "What markets does it cover?", a: "US equities and ETFs, NSE and BSE Indian equities, FX, crypto and commodities. India Only mode locks the entire stack to NSE and BSE." },
  { q: "How is this different from a broker app?", a: "Brokers show the price and the order ticket. Entropy Lite shows the distribution behind the price, the structural constraints shaping it and the cascade that follows an event." },
  { q: "Will my data be used to train models?", a: "No. Your portfolio and trade history bias only your own AI context through the Outcome Gradient. It never leaves your account." },
];

export default function LandingPage() {
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    document.title = "EntropyLite | See what the market hasn't decided yet";
    const meta = document.querySelector('meta[name="description"]');
    if (meta) meta.setAttribute("content", "EntropyLite shows you what can happen — before the market decides. Probabilistic scenarios, structural constraints, twelve engines, one terminal.");

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) navigate("/dashboard", { replace: true });
      setChecking(false);
    });
  }, [navigate]);

  // Note: we intentionally render the page even while checking auth so SEO crawlers
  // and slow connections always see the full content. Authed users are redirected via the effect.

  const goSignup = () => navigate("/dashboard");

  return (
    <div className="min-h-screen bg-white text-black pb-20 sm:pb-0">
      <PublicNav />

      {/* HERO */}
      <header className="relative overflow-hidden">
        <div className="max-w-4xl mx-auto px-5 sm:px-6 pt-10 sm:pt-20 pb-12 sm:pb-20 text-center">
          <img
            src={entropyLogoFull}
            alt="Entropy Lite"
            className="h-20 sm:h-36 lg:h-40 object-contain mx-auto mb-6 sm:mb-8"
            loading="eager"
          />

          {/* Trust badge */}
          <div className="inline-flex items-center gap-2 mb-5 sm:mb-7 px-3.5 py-1.5 rounded-full border border-black/[0.08] bg-black/[0.015]">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            <span className="font-mono text-[10px] tracking-wide text-black/60">Free during founding access · No credit card</span>
          </div>

          <h1 className="text-[2.5rem] sm:text-6xl md:text-7xl font-bold tracking-tighter leading-[1] sm:leading-[1.02] mb-5 sm:mb-7">
            Every trade you've taken
            <br />
            <span className="text-black/45">was already too late.</span>
          </h1>

          <div className="text-[16px] sm:text-xl text-black/60 max-w-xl mx-auto mb-6 sm:mb-8 leading-relaxed space-y-1">
            <p>Markets move before you act.</p>
            <p>Information arrives delayed.</p>
            <p>Retail reacts. Institutions position.</p>
          </div>

          <p className="text-[15px] sm:text-lg text-black max-w-2xl mx-auto mb-8 sm:mb-12 leading-relaxed font-medium">
            EntropyLite doesn't tell you what will happen.<br className="hidden sm:block" />
            <span className="text-black/55"> It shows you what </span><em className="not-italic text-black">can</em><span className="text-black/55"> happen — before the market decides.</span>
          </p>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mb-4">
            <Button
              size="lg"
              className="bg-black text-white hover:bg-black/85 font-mono text-xs tracking-wide px-8 h-12 w-full sm:w-auto shadow-lg shadow-black/20 rounded-full"
              onClick={goSignup}
            >
              Enter the Terminal <ArrowRight className="ml-1 h-4 w-4" />
            </Button>
            <button
              className="font-mono text-xs tracking-wide px-8 h-12 rounded-full border border-black/15 bg-white text-black hover:bg-black/[0.03] hover:border-black/25 transition-all w-full sm:w-auto"
              onClick={() => navigate("/about")}
            >
              See what is inside
            </button>
          </div>

          <p className="font-mono text-[10px] text-black/35 tracking-[0.1em]">
            Google sign in · 30 second setup · Cancel anytime, it is free
          </p>

          {/* Stats strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-5 sm:gap-8 mt-12 sm:mt-20 pt-8 sm:pt-12 border-t border-black/[0.06]">
            {STATS.map((s) => (
              <div key={s.label} className="text-center">
                <div className="text-2xl sm:text-3xl font-bold tracking-tight">{s.value}</div>
                <div className="font-mono text-[9px] sm:text-[10px] uppercase tracking-[0.15em] text-black/40 mt-1.5">{s.label}</div>
              </div>
            ))}
          </div>
        </div>
      </header>

      {/* PRINCIPLES, quiet, classy positioning */}
      <section className="border-t border-black/5 bg-black/[0.015]">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-16 sm:py-28">
          <div className="text-center mb-10 sm:mb-14">
            <p className="font-mono text-[10px] tracking-[0.3em] uppercase text-black/40 mb-3">The shift</p>
            <h2 className="text-3xl sm:text-5xl font-bold tracking-tight mb-5 leading-[1.05]">
              You were taught to predict.
            </h2>
            <div className="text-base sm:text-lg text-black/60 max-w-2xl mx-auto leading-relaxed space-y-1">
              <p>But markets don't move on predictions.</p>
              <p className="text-black">They move on pressure. On positioning. On constraints.</p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-px bg-black/5 rounded-xl overflow-hidden border border-black/10">
            {PRINCIPLES.map((p, i) => (
              <div key={p.title} className="bg-white p-6 sm:p-8">
                <p className="font-mono text-[10px] tracking-wider text-black/35 mb-3">{String(i + 1).padStart(2, "0")}</p>
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
              Step inside <ArrowRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        </div>
      </section>

      {/* PRODUCT PREVIEW, real terminal screenshot */}
      <section className="border-t border-black/5 bg-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-24">
          <div className="text-center mb-8 sm:mb-12">
            <p className="font-mono text-[10px] tracking-[0.3em] uppercase text-black/40 mb-3">The experience</p>
            <h2 className="text-2xl sm:text-4xl font-bold tracking-tight mb-3">
              This is what you see when you stop guessing.
            </h2>
            <p className="text-sm sm:text-base text-black/55 max-w-2xl mx-auto">
              Four layers of perception, surfaced at once.
            </p>
          </div>

          <figure className="rounded-xl overflow-hidden border border-black/10 shadow-2xl shadow-black/15 bg-black">
            <img
              src={dashboardPreview}
              alt="Entropy Lite terminal: live portfolio with SMH analysis, Monte Carlo Engine 10,000 paths, VaR 95% -17.1%, CVaR 99% -28.1%, Sharpe 0.36, multi-source intel feed, institutional flow detection radar"
              loading="lazy"
              width={1920}
              height={1290}
              className="w-full h-auto block"
            />
          </figure>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 sm:gap-6 mt-8 sm:mt-10 pt-8 border-t border-black/5">
            <div>
              <p className="font-mono text-[9px] tracking-wider text-black/40 uppercase mb-1">Layer 01 · Position</p>
              <p className="text-sm text-black/70 leading-snug">Multi currency and multi exchange, normalised to your base currency.</p>
            </div>
            <div>
              <p className="font-mono text-[9px] tracking-wider text-black/40 uppercase mb-1">Layer 02 · Probability</p>
              <p className="text-sm text-black/70 leading-snug">10,000 GBM paths, 252 day horizon, with profit probability and tail risk.</p>
            </div>
            <div>
              <p className="font-mono text-[9px] tracking-wider text-black/40 uppercase mb-1">Layer 03 · Risk surface</p>
              <p className="text-sm text-black/70 leading-snug">VaR and CVaR at 95% and 99% confidence, recomputed live per asset.</p>
            </div>
            <div>
              <p className="font-mono text-[9px] tracking-wider text-black/40 uppercase mb-1">Layer 04 · Flow</p>
              <p className="text-sm text-black/70 leading-snug">An institutional flow read across ETF rebalances, gamma and dark pools.</p>
            </div>
          </div>

          <div className="text-center mt-10 sm:mt-12">
            <Button
              size="lg"
              className="bg-black text-white hover:bg-black/85 font-mono text-xs tracking-wide px-8 h-12"
              onClick={goSignup}
            >
              Open the terminal <ArrowRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        </div>
      </section>

      {/* TABBED GALLERY, real screen captures of every core surface */}
      <FeatureGallery />

      {/* UNDER THE HOOD — proof intro band */}
      <section className="border-t border-black/5 bg-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 pt-16 sm:pt-24 pb-4 text-center">
          <p className="font-mono text-[10px] tracking-[0.3em] uppercase text-black/40 mb-3">Proof</p>
          <h2 className="text-2xl sm:text-4xl font-bold tracking-tight mb-3">
            This isn't opinion. This is math.
          </h2>
          <p className="text-sm sm:text-base text-black/55 max-w-2xl mx-auto">
            Monte Carlo. VaR / CVaR. Merton. Ornstein–Uhlenbeck. Run on real history, not vibes.
          </p>
        </div>
      </section>
      <MathResearch />

      {/* CLANK — the weapon */}
      <section className="border-t border-black/5 bg-black text-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-20 sm:py-32">
          <p className="font-mono text-[10px] tracking-[0.3em] uppercase text-white/40 mb-6 text-center">CLANK</p>
          <h2 className="text-3xl sm:text-5xl font-bold tracking-tight text-center leading-[1.05] mb-4">
            Sometimes markets stop being probabilistic.
          </h2>
          <p className="text-4xl sm:text-6xl font-bold tracking-tighter text-center text-white/35 mb-14 sm:mb-20">
            They lock.
          </p>

          <div className="max-w-2xl mx-auto space-y-5 sm:space-y-6 text-center">
            <p className="text-base sm:text-lg text-white/85 leading-relaxed">CLANK detects deterministic windows.</p>
            <p className="text-base sm:text-lg text-white/85 leading-relaxed">Structural inevitabilities — gamma walls, ETF rebalances, liquidity vacuums.</p>
            <p className="text-base sm:text-lg text-white leading-relaxed font-medium">When the math collapses to one outcome, you see it first.</p>
          </div>

          <p className="font-mono text-[10px] text-white/30 tracking-wider text-center mt-12 sm:mt-14">
            Constraint detection across liquidity, positioning and dealer gamma.
          </p>

          <div className="text-center mt-10 sm:mt-12">
            <Button
              size="lg"
              className="bg-white text-black hover:bg-white/90 font-mono text-xs tracking-wide px-8 h-12"
              onClick={goSignup}
            >
              See CLANK live <ArrowRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        </div>
      </section>

      {/* FEATURES GRID */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 py-16 sm:py-24">
        <div className="text-center mb-10 sm:mb-14">

          <p className="font-mono text-[10px] tracking-[0.3em] uppercase text-black/40 mb-3">The stack</p>
          <h2 className="text-2xl sm:text-4xl font-bold tracking-tight mb-3">
            While you're looking at one chart,<br className="hidden sm:block" /> twelve systems are already running.
          </h2>
          <p className="text-sm sm:text-base text-black/55 max-w-xl mx-auto">
            Each one a separate engine. Composed into one read.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5">
          {FEATURES.map((f) => (
            <article
              key={f.title}
              className="group rounded-2xl border border-black/[0.06] bg-white p-6 sm:p-7 hover:shadow-soft hover:border-black/15 active:bg-black/[0.02] transition-all"
            >
              <div className="w-9 h-9 rounded-xl bg-black/[0.04] flex items-center justify-center mb-4 group-hover:bg-black/[0.08] transition-colors">
                <f.icon className="h-4 w-4 text-black/60 group-hover:text-black transition-colors" />
              </div>
              <h3 className="font-semibold text-[15px] tracking-tight mb-2">{f.title}</h3>
              <p className="text-sm text-black/55 leading-relaxed">{f.desc}</p>
            </article>
          ))}
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section className="border-t border-black/5 bg-black/[0.015]">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-16 sm:py-24">
          <div className="text-center mb-10 sm:mb-14">
            <p className="font-mono text-[10px] tracking-[0.3em] uppercase text-black/40 mb-3">The pipeline</p>
            <h2 className="text-2xl sm:text-4xl font-bold tracking-tight mb-3">
              From chaos. To decision.
            </h2>
            <p className="text-sm sm:text-base text-black/55 max-w-2xl mx-auto">
              Six stages. Always running. You see only the conclusion.
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

      {/* WHY NOW, risk reversal */}
      <section className="max-w-4xl mx-auto px-4 sm:px-6 py-16 sm:py-24">
        <div className="rounded-2xl border border-black/10 bg-gradient-to-br from-black/[0.02] to-transparent p-6 sm:p-10">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 sm:gap-8 mb-8">
            <div className="flex flex-col items-center text-center">
              <div className="w-10 h-10 rounded-full bg-black/5 flex items-center justify-center mb-3">
                <Lock className="h-4 w-4 text-black/60" />
              </div>
              <p className="font-semibold text-sm mb-1">No credit card</p>
              <p className="text-xs text-black/50 leading-relaxed">Sign in with Google or email and the full terminal opens.</p>
            </div>
            <div className="flex flex-col items-center text-center">
              <div className="w-10 h-10 rounded-full bg-black/5 flex items-center justify-center mb-3">
                <Clock className="h-4 w-4 text-black/60" />
              </div>
              <p className="font-semibold text-sm mb-1">Thirty second setup</p>
              <p className="text-xs text-black/50 leading-relaxed">Add your tickers, set a base currency, and you are running.</p>
            </div>
            <div className="flex flex-col items-center text-center">
              <div className="w-10 h-10 rounded-full bg-black/5 flex items-center justify-center mb-3">
                <InfinityIcon className="h-4 w-4 text-black/60" />
              </div>
              <p className="font-semibold text-sm mb-1">Free during founding</p>
              <p className="text-xs text-black/50 leading-relaxed">Founding members keep founding pricing for life once paid tiers launch.</p>
            </div>
          </div>

          <div className="text-center">
            <h3 className="text-xl sm:text-2xl font-bold tracking-tight mb-3">
              The terminal sharpens with every decision you make
            </h3>
            <p className="text-sm text-black/55 mb-6 max-w-lg mx-auto">
              Your trade history quietly biases the AI toward the patterns that worked, and away from the ones that did not.
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

      {/* IDENTITY SHIFT */}
      <section className="border-t border-black/5 bg-white">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-24 sm:py-36 text-center">
          <h2 className="text-3xl sm:text-5xl font-bold tracking-tighter leading-[1.05]">
            You're not trading anymore.
          </h2>
          <p className="text-3xl sm:text-5xl font-bold tracking-tighter leading-[1.05] text-black/35 mt-2">
            You're operating.
          </p>
        </div>
      </section>

      {/* FAQ, kill objections */}
      <section className="border-t border-black/5">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-16 sm:py-24">
          <div className="text-center mb-10 sm:mb-12">
            <p className="font-mono text-[10px] tracking-[0.3em] uppercase text-black/40 mb-3">Last questions</p>
            <h2 className="text-2xl sm:text-4xl font-bold tracking-tight">
              Before you sign in
            </h2>
          </div>

          <div className="space-y-3">
            {FAQS.map((f) => (
              <details key={f.q} className="group rounded-2xl border border-black/[0.06] bg-white p-5 sm:p-6 open:border-black/15 hover:border-black/12 transition-all">
                <summary className="flex items-center justify-between cursor-pointer list-none">
                  <span className="font-semibold text-[15px] tracking-tight pr-4">{f.q}</span>
                  <ChevronRight className="h-4 w-4 text-black/40 flex-shrink-0 group-open:rotate-90 transition-transform" />
                </summary>
                <p className="text-sm text-black/55 leading-relaxed mt-4">{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* FINAL CTA */}
      <section className="border-t border-black/5 bg-black text-white">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-16 sm:py-24 text-center">
          <h2 className="text-3xl sm:text-5xl font-bold tracking-tight mb-3 leading-[1.05]">
            Most people will keep reacting.
          </h2>
          <p className="text-2xl sm:text-3xl text-white/55 mb-10 font-semibold tracking-tight">
            You don't have to.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mb-4">
            <Button
              size="lg"
              className="bg-white text-black hover:bg-white/90 font-mono text-xs tracking-wide px-8 h-12 w-full sm:w-auto shadow-xl"
              onClick={goSignup}
            >
              Enter EntropyLite <ArrowRight className="ml-1 h-4 w-4" />
            </Button>
            <button
              className="font-mono text-xs tracking-wide px-8 h-12 rounded-md border border-white/20 text-white hover:bg-white/5 transition-colors w-full sm:w-auto"
              onClick={() => navigate("/pricing")}
            >
              View Pricing
            </button>
          </div>
          <p className="font-mono text-[10px] text-white/35 tracking-wide">
            Founding members lock in founding pricing for life
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

      {/* STICKY MOBILE CTA, always one tap from signup */}
      <div className="sm:hidden fixed bottom-0 inset-x-0 z-50 bg-white/95 backdrop-blur-xl border-t border-black/[0.08] px-4 py-3 shadow-[0_-4px_24px_rgba(0,0,0,0.08)]">
        <Button
          className="w-full bg-black text-white hover:bg-black/85 font-mono text-xs tracking-wide h-12 rounded-full"
          onClick={goSignup}
        >
          Enter the Terminal <ArrowRight className="ml-1 h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
