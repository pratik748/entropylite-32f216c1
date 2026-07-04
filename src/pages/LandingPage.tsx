import { useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Activity, Shield, Globe, Sparkles, Target, BarChart3,
  TrendingUp, Layers, Zap, ArrowRight, ArrowUpRight, Plus,
  Lock, Clock, Infinity as InfinityIcon,
} from "lucide-react";
import PublicNav from "@/components/PublicNav";
import SiteFooter from "@/components/marketing/SiteFooter";
import { SectionIntro, InkButton, LineButton } from "@/components/marketing/Section";
import FeatureGallery from "@/components/landing/FeatureGallery";
import MathResearch from "@/components/landing/MathResearch";
import dashboardPreview from "@/assets/dashboard-preview.png";

const STATS = [
  { value: "10,000", label: "Monte Carlo paths per asset" },
  { value: "12", label: "Analytical engines in parallel" },
  { value: "95 / 99", label: "VaR & CVaR confidence levels" },
  { value: "24 / 7", label: "Background scenario scan" },
];

const METHODS = [
  "Monte Carlo · GBM",
  "VaR / CVaR",
  "Merton 1974",
  "Ornstein–Uhlenbeck",
  "Cointegration",
  "Shannon entropy",
  "Bayesian priors",
  "CLANK constraints",
];

const PRINCIPLES = [
  {
    n: "01",
    title: "Forecasts are fiction. Distributions are real.",
    desc: "The system never predicts the next print. It computes the range of plausible outcomes and the probability attached to each, then keeps both honest against realized data.",
  },
  {
    n: "02",
    title: "Structure moves price. Narrative explains it later.",
    desc: "Liquidity, positioning and constraint thresholds move markets. Headlines arrive after. The engines watch the cause, not the commentary.",
  },
  {
    n: "03",
    title: "The system learns from you, not the crowd.",
    desc: "Every outcome you log adjusts the weights — biasing future analysis toward the patterns that worked for your book and away from the ones that did not.",
  },
  {
    n: "04",
    title: "Twelve engines. One quiet surface.",
    desc: "Twelve layers run underneath. One surface sits on top. The mathematics stays out of the way until the moment you ask for it.",
  },
];

const CAPABILITIES = [
  { icon: Activity, title: "Quantitative risk engine", desc: "VaR and CVaR at 95% and 99% confidence, liquidity-adjusted, recomputed live for every position held." },
  { icon: Shield, title: "CLANK constraint detection", desc: "Flags structural limits in liquidity, positioning and dealer gamma as they begin to bend — before price reacts." },
  { icon: Globe, title: "Geopolitical intelligence", desc: "A live read on global events with a market-impact score and a regime label that recalibrates the rest of the stack." },
  { icon: TrendingUp, title: "Probabilistic simulation", desc: "10,000-path Monte Carlo on every holding, run on realized volatility, reported as profit probability and tail risk." },
  { icon: Layers, title: "Statistical arbitrage", desc: "Mean-reversion candidates, cointegrated pairs and Z-score drift measured across the whole book, not a single ticker." },
  { icon: Target, title: "Asset discovery", desc: "A daily shortlist of setups scored on momentum, quality and interaction with your existing exposure." },
  { icon: BarChart3, title: "Company dossiers", desc: "A twelve-dimension read on any company: management, capital flows, narrative, structural risk and beyond." },
  { icon: Sparkles, title: "Strategy factory", desc: "Spin up a scenario, calibrate it to the current regime, and paper-test the hypothesis before risking capital." },
  { icon: Zap, title: "Causal cascade modelling", desc: "First-, second- and third-order effects propagated across sectors, currencies and asset classes — pre-trade." },
];

const PIPELINE = [
  { step: "01", title: "Ingest", desc: "Live prices, geopolitics, multi-source news, FX and institutional flow signals stream in continuously — timestamped, normalized to your base currency." },
  { step: "02", title: "Quantify", desc: "Volatility, drift, correlation, covariance, VaR, CVaR and distance-to-default computed per holding, live." },
  { step: "03", title: "Constrain", desc: "CLANK overlays structural limits — gamma walls, rebalance flows, liquidity vacuums — onto the probabilistic read." },
  { step: "04", title: "Simulate", desc: "10,000-path Monte Carlo and causal cascades resolve each event into a distribution of outcomes with attached probabilities." },
  { step: "05", title: "Decide", desc: "The strategy layer emits concrete positioning — entry levels, projected ranges, invalidation zones, risk-budgeted size." },
  { step: "06", title: "Learn", desc: "Every logged outcome feeds Scar Memory and the Outcome Gradient, sharpening the next read against your realized results." },
];

const FAQS = [
  { q: "Do I need a credit card to start?", a: "No. Sign in with Google or email and the full terminal opens. No card, no trial timer, no upsell wall." },
  { q: "Is this investment advice?", a: "No. Entropy is a research and scenario-modelling instrument. Every output is an observation or a probability. Every decision is yours." },
  { q: "What markets does it cover?", a: "US equities and ETFs, NSE and BSE Indian equities, FX, crypto and commodities. India-only mode locks the entire stack to NSE and BSE." },
  { q: "How is this different from a broker app?", a: "Brokers show the price and the order ticket. Entropy shows the distribution behind the price, the structural constraints shaping it, and the cascade that follows an event." },
  { q: "Will my data be used to train models?", a: "No. Your portfolio and trade history bias only your own analytical context through the Outcome Gradient. It never leaves your account." },
];

export default function LandingPage() {
  const navigate = useNavigate();

  useEffect(() => {
    document.title = "Entropy — Institutional market intelligence";
    const meta = document.querySelector('meta[name="description"]');
    if (meta) meta.setAttribute("content", "Entropy is a probabilistic market-intelligence terminal. Twelve analytical engines — risk, constraint detection, simulation, flow — composed into one operational surface.");

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) navigate("/dashboard", { replace: true });
    });
  }, [navigate]);

  const goSignup = () => navigate("/dashboard");

  return (
    <div className="min-h-screen bg-white text-ink pb-20 sm:pb-0">
      <PublicNav />

      {/* ── HERO · deep ink, engineering grid, terminal in a frame ── */}
      <header className="relative overflow-hidden bg-ink text-white">
        <div className="absolute inset-0 ink-grid grid-vignette" aria-hidden="true" />
        <div
          className="absolute -top-40 left-1/2 -translate-x-1/2 h-[480px] w-[900px] rounded-full opacity-25 blur-3xl pointer-events-none"
          style={{ background: "radial-gradient(closest-side, rgba(255,255,255,0.16) 0%, transparent 70%)" }}
          aria-hidden="true"
        />

        <div className="relative max-w-6xl mx-auto px-5 sm:px-6 pt-16 sm:pt-24 pb-0">
          <div className="max-w-3xl">
            <div className="flex items-center gap-3 mb-7">
              <span className="mkt-label text-[9px] text-white/40">Est. for operators</span>
              <span className="h-px w-8 bg-white/25" />
              <span className="mkt-label text-[9px] text-white/60">Probabilistic market infrastructure</span>
            </div>

            <h1 className="mkt-display text-white">
              The market is a distribution.
              <br />
              <span className="text-white/40">Operate it like one.</span>
            </h1>

            <p className="mkt-lede text-white/55 max-w-xl mt-7">
              Entropy composes twelve analytical engines — risk, structural
              constraints, simulation, flow — into one terminal. Not what will
              happen. What <em className="not-italic text-white font-medium">can</em> happen,
              and with what probability.
            </p>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 mt-9">
              <InkButton dark onClick={goSignup}>
                Open the Terminal
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
              </InkButton>
              <LineButton dark onClick={() => navigate("/backbone")}>
                Examine the mathematics
              </LineButton>
            </div>

            <p className="mkt-label text-[9px] text-white/30 mt-5">
              Google sign-in · 30-second setup · Free during the founding period
            </p>
          </div>

          {/* Stats band */}
          <div className="grid grid-cols-2 lg:grid-cols-4 border-t border-white/10 mt-14">
            {STATS.map((s, i) => (
              <div
                key={s.label}
                className={`py-7 pr-6 ${i > 0 ? "lg:border-l lg:border-white/10 lg:pl-8" : ""} ${i % 2 === 1 ? "border-l border-white/10 pl-6 lg:pl-8" : ""}`}
              >
                <div className="text-2xl sm:text-[28px] font-bold tracking-tight tabular-nums">{s.value}</div>
                <div className="mkt-label text-[9px] text-white/40 mt-2">{s.label}</div>
              </div>
            ))}
          </div>

          {/* Terminal frame — bleeds into the next section */}
          <figure className="relative mt-4 translate-y-14 sm:translate-y-20">
            <div className="rounded-xl border border-white/[0.12] bg-ink-800/80 backdrop-blur-xl p-1.5 shadow-[0_40px_120px_-20px_rgba(0,0,0,0.8)]">
              <div className="flex items-center gap-2 px-3 py-2">
                <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
                <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
                <span className="h-2.5 w-2.5 rounded-full bg-white/15" />
                <span className="mkt-label text-[8px] text-white/35 ml-2">entropy · live session</span>
                <span className="ml-auto flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
                  <span className="mkt-label text-[8px] text-white/35">Streaming</span>
                </span>
              </div>
              <img
                src={dashboardPreview}
                alt="Entropy terminal: live portfolio with Monte Carlo engine at 10,000 paths, VaR and CVaR risk surface, multi-source intelligence feed and institutional flow detection"
                loading="eager"
                width={1920}
                height={1290}
                className="w-full h-auto block rounded-lg"
              />
            </div>
          </figure>
        </div>
      </header>

      {/* Spacer that receives the overhanging terminal frame */}
      <div className="h-14 sm:h-20 bg-white" />

      {/* ── METHODS STRIP ── */}
      <section className="border-b border-ink/[0.07]">
        <div className="max-w-6xl mx-auto px-5 sm:px-6 py-6 flex flex-wrap items-center gap-x-8 gap-y-3 justify-center">
          {METHODS.map((m) => (
            <span key={m} className="mkt-label text-[9px] text-ink/35 whitespace-nowrap">{m}</span>
          ))}
        </div>
      </section>

      {/* ── 01 · DOCTRINE ── */}
      <section className="border-b border-ink/[0.07]">
        <div className="max-w-6xl mx-auto px-5 sm:px-6 py-20 sm:py-28">
          <SectionIntro
            index="01"
            label="Doctrine"
            title={
              <>
                You were taught to predict.
                <br />
                <span className="text-ink/40">Markets move on pressure.</span>
              </>
            }
            lede="Four operating principles govern every engine in the stack. They are not slogans — each one is enforced in code."
          />

          <div className="grid grid-cols-1 md:grid-cols-2 mt-14 border-t border-l border-ink/[0.07]">
            {PRINCIPLES.map((p) => (
              <article key={p.n} className="border-b border-r border-ink/[0.07] p-8 sm:p-10 group hover:bg-ink/[0.015] transition-colors">
                <p className="mkt-label text-[9px] text-ink/30 mb-5">{p.n}</p>
                <h3 className="text-[17px] sm:text-[19px] font-semibold tracking-tight leading-snug mb-3">{p.title}</h3>
                <p className="text-[14px] text-ink/55 leading-relaxed">{p.desc}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ── 02 · THE SURFACE ── */}
      <section className="border-b border-ink/[0.07] bg-[#FAFBFC]">
        <div className="max-w-6xl mx-auto px-5 sm:px-6 py-20 sm:py-28">
          <SectionIntro
            index="02"
            label="The surface"
            title={
              <>
                Four layers of perception,
                <br />
                <span className="text-ink/40">surfaced at once.</span>
              </>
            }
          />

          <div className="grid grid-cols-2 lg:grid-cols-4 mt-12 border-t border-l border-ink/[0.07] bg-white">
            {[
              { n: "Layer 01", t: "Position", d: "Multi-currency, multi-exchange — normalized to your base currency in real time." },
              { n: "Layer 02", t: "Probability", d: "10,000 GBM paths over a 252-day horizon, with profit probability and tail risk." },
              { n: "Layer 03", t: "Risk surface", d: "VaR and CVaR at 95% and 99% confidence, recomputed live per asset." },
              { n: "Layer 04", t: "Flow", d: "An institutional flow read across ETF rebalances, dealer gamma and dark pools." },
            ].map((l) => (
              <div key={l.n} className="border-b border-r border-ink/[0.07] p-6 sm:p-7">
                <p className="mkt-label text-[9px] text-ink/30 mb-3">{l.n}</p>
                <h3 className="text-[14px] font-semibold tracking-tight mb-2">{l.t}</h3>
                <p className="text-[12.5px] text-ink/55 leading-relaxed">{l.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── 03 · MODULES (screenshots gallery) ── */}
      <FeatureGallery />

      {/* ── 04 · CAPABILITIES ── */}
      <section className="border-t border-b border-ink/[0.07]">
        <div className="max-w-6xl mx-auto px-5 sm:px-6 py-20 sm:py-28">
          <SectionIntro
            index="04"
            label="Capabilities"
            title={
              <>
                While you read one chart,
                <br />
                <span className="text-ink/40">twelve systems are already running.</span>
              </>
            }
            lede="Each capability is a separate engine with its own mathematics. All of them resolve into a single composed read."
          />

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 mt-14 border-t border-l border-ink/[0.07]">
            {CAPABILITIES.map((f) => (
              <article
                key={f.title}
                className="group border-b border-r border-ink/[0.07] p-7 sm:p-8 hover:bg-ink/[0.015] transition-colors"
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-lg border border-ink/10 bg-white mb-5 group-hover:border-ink/25 transition-colors">
                  <f.icon className="h-4 w-4 text-ink/60" strokeWidth={1.75} />
                </div>
                <h3 className="text-[15px] font-semibold tracking-tight mb-2">{f.title}</h3>
                <p className="text-[13px] text-ink/55 leading-relaxed">{f.desc}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      {/* ── 05 · ARCHITECTURE ── */}
      <section className="border-b border-ink/[0.07] bg-[#FAFBFC]">
        <div className="max-w-6xl mx-auto px-5 sm:px-6 py-20 sm:py-28">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
            <div className="lg:col-span-4">
              <SectionIntro
                index="05"
                label="Architecture"
                title={
                  <>
                    From raw signal
                    <br />
                    <span className="text-ink/40">to sized decision.</span>
                  </>
                }
                lede="Six stages, always running. You see only the conclusion — the pipeline is there when you want to audit it."
              />
              <div className="mt-8">
                <LineButton onClick={() => navigate("/backbone")}>
                  Read the full backbone <ArrowUpRight className="h-3.5 w-3.5" />
                </LineButton>
              </div>
            </div>

            <div className="lg:col-span-8">
              <ol className="border-t border-ink/[0.07]">
                {PIPELINE.map((s) => (
                  <li key={s.step} className="grid grid-cols-[64px_140px_1fr] max-sm:grid-cols-[48px_1fr] items-baseline gap-x-4 border-b border-ink/[0.07] py-6 group hover:bg-white transition-colors px-2 -mx-2">
                    <span className="mkt-label text-[9px] text-ink/30">{s.step}</span>
                    <span className="text-[15px] font-semibold tracking-tight max-sm:block">{s.title}</span>
                    <p className="text-[13.5px] text-ink/55 leading-relaxed max-sm:col-span-2 max-sm:col-start-2 max-sm:mt-1.5">{s.desc}</p>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </div>
      </section>

      {/* ── 06 · CLANK — the constraint engine ── */}
      <section className="relative overflow-hidden bg-ink text-white">
        <div className="absolute inset-0 ink-grid grid-vignette" aria-hidden="true" />
        <div className="relative max-w-6xl mx-auto px-5 sm:px-6 py-24 sm:py-36">
          <div className="flex items-center gap-3 mb-8">
            <span className="mkt-label text-[9px] text-white/40">06</span>
            <span className="h-px w-8 bg-white/25" />
            <span className="mkt-label text-[9px] text-white/60">CLANK · Constraint detection</span>
          </div>

          <h2 className="mkt-display max-w-4xl">
            Sometimes markets stop being probabilistic.
            <br />
            <span className="text-white/35">They lock.</span>
          </h2>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-px bg-white/10 border border-white/10 rounded-xl overflow-hidden mt-14 max-w-4xl">
            {[
              { t: "Gamma walls", d: "Dealer hedging pins price into a corridor. The corridor is computable." },
              { t: "Rebalance flows", d: "Index and ETF rebalances create forced, calendar-known order flow." },
              { t: "Liquidity vacuums", d: "Thin books turn small orders into large moves. Depth is measurable." },
            ].map((c) => (
              <div key={c.t} className="bg-ink p-7">
                <h3 className="text-[14px] font-semibold tracking-tight mb-2 text-white">{c.t}</h3>
                <p className="text-[12.5px] text-white/50 leading-relaxed">{c.d}</p>
              </div>
            ))}
          </div>

          <p className="mkt-lede text-white/55 max-w-xl mt-12">
            CLANK monitors these deterministic windows continuously. When the
            mathematics collapses to one outcome, you see it first.
          </p>

          <div className="mt-9">
            <InkButton dark onClick={goSignup}>
              See CLANK live <ArrowRight className="h-4 w-4" />
            </InkButton>
          </div>
        </div>
      </section>

      {/* ── 07 · PROOF ── */}
      <section className="border-b border-ink/[0.07]">
        <div className="max-w-6xl mx-auto px-5 sm:px-6 pt-20 sm:pt-28 pb-4">
          <SectionIntro
            index="07"
            label="Proof"
            align="center"
            title={<>This is not opinion. This is mathematics.</>}
            lede="Monte Carlo. VaR and CVaR. Merton. Ornstein–Uhlenbeck. Run on real history — every figure below is reproducible."
          />
        </div>
      </section>
      <MathResearch />

      {/* ── 08 · ACCESS ── */}
      <section className="border-t border-b border-ink/[0.07] bg-[#FAFBFC]">
        <div className="max-w-6xl mx-auto px-5 sm:px-6 py-20 sm:py-28">
          <SectionIntro
            index="08"
            label="Access"
            align="center"
            title={<>Institutional capability. Founding terms.</>}
          />

          <div className="grid grid-cols-1 sm:grid-cols-3 mt-14 border-t border-l border-ink/[0.07] bg-white max-w-4xl mx-auto">
            {[
              { icon: Lock, t: "No credit card", d: "Sign in with Google or email and the full terminal opens. Nothing is withheld." },
              { icon: Clock, t: "Thirty-second setup", d: "Add your tickers, set a base currency, and the engines begin their first pass." },
              { icon: InfinityIcon, t: "Founding pricing, for life", d: "Founding members keep founding terms permanently once paid tiers launch." },
            ].map((c) => (
              <div key={c.t} className="border-b border-r border-ink/[0.07] p-8 text-center">
                <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-lg border border-ink/10 mb-5">
                  <c.icon className="h-4 w-4 text-ink/60" strokeWidth={1.75} />
                </div>
                <h3 className="text-[14px] font-semibold tracking-tight mb-2">{c.t}</h3>
                <p className="text-[12.5px] text-ink/55 leading-relaxed">{c.d}</p>
              </div>
            ))}
          </div>

          <div className="text-center mt-12">
            <InkButton onClick={goSignup}>
              Begin now <ArrowRight className="h-4 w-4" />
            </InkButton>
            <p className="mkt-label text-[9px] text-ink/35 mt-4">
              The terminal sharpens with every decision you log
            </p>
          </div>
        </div>
      </section>

      {/* ── 09 · FAQ ── */}
      <section className="border-b border-ink/[0.07]">
        <div className="max-w-3xl mx-auto px-5 sm:px-6 py-20 sm:py-28">
          <SectionIntro
            index="09"
            label="Before you sign in"
            title={<>Last questions.</>}
          />

          <div className="mt-12 border-t border-ink/[0.07]">
            {FAQS.map((f) => (
              <details key={f.q} className="group border-b border-ink/[0.07]">
                <summary className="flex items-center justify-between cursor-pointer list-none py-6 gap-4">
                  <span className="text-[15px] font-semibold tracking-tight">{f.q}</span>
                  <Plus className="h-4 w-4 text-ink/40 flex-shrink-0 transition-transform duration-200 group-open:rotate-45" />
                </summary>
                <p className="text-[14px] text-ink/55 leading-relaxed pb-6 max-w-xl">{f.a}</p>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* ── FINAL STATEMENT ── */}
      <section className="relative overflow-hidden bg-ink text-white">
        <div className="absolute inset-0 ink-grid grid-vignette" aria-hidden="true" />
        <div className="relative max-w-4xl mx-auto px-5 sm:px-6 py-24 sm:py-36 text-center">
          <h2 className="mkt-display">
            Most people will keep reacting.
            <br />
            <span className="text-white/35">You don't have to.</span>
          </h2>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 mt-12">
            <InkButton dark onClick={goSignup}>
              Open the Terminal <ArrowRight className="h-4 w-4" />
            </InkButton>
            <LineButton dark onClick={() => navigate("/pricing")}>
              View pricing
            </LineButton>
          </div>
          <p className="mkt-label text-[9px] text-white/30 mt-6">
            Founding members lock in founding terms for life
          </p>
        </div>
      </section>

      <SiteFooter />

      {/* Sticky mobile CTA — always one tap from the terminal */}
      <div className="sm:hidden fixed bottom-0 inset-x-0 z-40 bg-white/92 backdrop-blur-xl border-t border-ink/[0.08] px-4 py-3">
        <button
          onClick={goSignup}
          className="flex w-full h-12 items-center justify-center gap-2 rounded-lg bg-ink text-white text-[14px] font-semibold tracking-tight"
        >
          Open the Terminal <ArrowRight className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
