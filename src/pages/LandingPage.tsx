import { useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Activity, Shield, Globe, Sparkles, Target, BarChart3,
  TrendingUp, Layers, Zap, ArrowRight, ChevronRight,
  Brain, LineChart, Cpu, Eye, GitBranch, Workflow
} from "lucide-react";
import { Button } from "@/components/ui/button";
import PublicNav from "@/components/PublicNav";
import entropyLogoFull from "@/assets/entropy-logo-full.jpeg";

const FEATURES = [
  { icon: Activity, title: "Quantitative Risk Engine", desc: "Value at Risk, CVaR, and liquidity-adjusted risk metrics at 95% and 99% confidence intervals for institutional-grade portfolio analysis." },
  { icon: Shield, title: "CLANK Constraint Detection", desc: "Structural constraint engine that identifies institutional risk boundaries and liquidity thresholds before they manifest." },
  { icon: Globe, title: "Geopolitical Intelligence", desc: "Real-time global event monitoring with market impact scoring, regime-aware recalibration, and scenario probability analysis." },
  { icon: TrendingUp, title: "Monte Carlo Simulations", desc: "10,000-path Geometric Brownian Motion simulations for probabilistic outcome modeling and projected range estimation." },
  { icon: Layers, title: "Statistical Arbitrage", desc: "Portfolio-wide quantitative engine with mean-reversion detection, co-integration analysis, and structural Z-score tracking." },
  { icon: Target, title: "Desirable Asset Discovery", desc: "Multi-stage intelligence funnel surfacing high-conviction scenarios using momentum, value, and quality factor analysis." },
  { icon: BarChart3, title: "Deep Company Intelligence", desc: "Institutional dossiers mapping 12 corporate dimensions including management DNA, capital flows, and structural risk assessment." },
  { icon: Sparkles, title: "Strategy Factory", desc: "Autonomous scenario generation with backtesting, regime-aware calibration, and paper simulation for hypothesis validation." },
  { icon: Zap, title: "Probabilistic Scenario Engine", desc: "Institutional-grade positioning insights with aftermath simulation and causal effects modeling across portfolios." },
];

const HOW_IT_WORKS = [
  { icon: Eye, step: "01", title: "Data Ingestion", desc: "EntropyLite continuously ingests real-time price feeds, macro indicators, news sentiment, geopolitical events, and institutional flow data from multiple sources. Every data point is timestamped, normalized, and fed into the intelligence pipeline." },
  { icon: Cpu, step: "02", title: "Intelligence Processing", desc: "Raw data passes through layered AI engines — including CLANK constraint detection, Monte Carlo simulations, statistical arbitrage models, and regime classification. Each engine operates independently, then results are fused into a unified intelligence view." },
  { icon: Brain, step: "03", title: "Scenario Generation", desc: "The system generates probabilistic scenarios: risk alerts when portfolio VaR breaches thresholds, structural constraints approaching activation, and high-confidence positioning insights calibrated to the current market regime." },
  { icon: GitBranch, step: "04", title: "Causal Modeling", desc: "The Causal Effects Engine simulates cascading market impacts across correlated sectors, currencies, and asset classes. It models 1st-order price effects, 2nd-order sector contagion, and 3rd-order systemic ripple effects." },
  { icon: LineChart, step: "05", title: "Scenario Mapping", desc: "The Strategy Factory generates scenario-based positioning insights with key levels, projected ranges, invalidation zones, and aftermath simulation showing expected market structure reactions." },
  { icon: Workflow, step: "06", title: "Continuous Learning", desc: "Every market outcome feeds back into the Scar Memory system and Outcome Gradient engine, continuously refining the platform's confidence calibration and scenario quality." },
];

export default function LandingPage() {
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    document.title = "Entropy Lite — Market Intelligence Operating System";
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) navigate("/dashboard", { replace: true });
      setChecking(false);
    });
  }, [navigate]);

  if (checking) return null;

  return (
    <div className="min-h-screen bg-white text-black">
      <PublicNav />

      {/* Hero */}
      <header className="relative overflow-hidden">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 pt-10 sm:pt-16 pb-14 sm:pb-20 text-center">
          <img
            src={entropyLogoFull}
            alt="Entropy Lite"
            className="h-20 sm:h-36 object-contain mx-auto mb-5 sm:mb-8"
            loading="eager"
          />
          <p className="font-mono text-[10px] tracking-[0.3em] uppercase text-black/40 mb-4 sm:mb-6">
            Probabilistic Market Intelligence Engine
          </p>
          <h1 className="text-3xl sm:text-5xl md:text-6xl font-bold tracking-tight leading-[1.1] mb-4 sm:mb-6">
            Market Structure Intelligence
            <br />
            <span className="text-black/60">for Independent Thinkers</span>
          </h1>
          <p className="text-base sm:text-xl text-black/55 max-w-2xl mx-auto mb-8 sm:mb-10 leading-relaxed">
            Probabilistic scenario analysis, liquidity flow detection, and real-time intelligence layers — 
            an institutional-grade research platform for data-driven market understanding.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4">
            <Button
              size="lg"
              className="bg-black text-white hover:bg-black/85 font-mono text-xs tracking-wide px-8 h-12 w-full sm:w-auto"
              onClick={() => navigate("/access")}
            >
              Get Access <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
            <button
              className="font-mono text-xs tracking-wide px-8 h-12 rounded-md border border-black/15 bg-white text-black hover:bg-black/[0.03] transition-colors w-full sm:w-auto"
              onClick={() => navigate("/pricing")}
            >
              View Pricing
            </button>
          </div>
        </div>
      </header>

      {/* Features Grid */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 pb-16 sm:pb-28">
        <div className="text-center mb-10 sm:mb-16">
          <h2 className="text-xl sm:text-3xl font-bold tracking-tight mb-3">
            Institutional-Grade Capabilities
          </h2>
          <p className="text-sm sm:text-base text-black/50 max-w-xl mx-auto">
            Market structure analysis, probabilistic scenarios, and quantitative decision intelligence — 
            every module a professional terminal offers, unified in one platform.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
          {FEATURES.map((f) => (
            <article
              key={f.title}
              className="group rounded-lg border border-black/5 bg-white p-5 sm:p-6 hover:shadow-md active:bg-black/[0.02] transition-all"
            >
              <f.icon className="h-5 w-5 text-black/40 mb-3 sm:mb-4 group-hover:text-black/70 transition-colors" />
              <h3 className="font-semibold text-sm mb-1.5 sm:mb-2">{f.title}</h3>
              <p className="text-sm text-black/50 leading-relaxed">{f.desc}</p>
            </article>
          ))}
        </div>
      </section>

      {/* How It Works */}
      <section className="border-t border-black/5 bg-black/[0.015]">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-14 sm:py-24">
          <div className="text-center mb-10 sm:mb-16">
            <h2 className="text-xl sm:text-3xl font-bold tracking-tight mb-3">
              How Entropy Lite Works
            </h2>
            <p className="text-sm sm:text-base text-black/50 max-w-2xl mx-auto">
              From raw market data to probabilistic intelligence — a six-stage pipeline that continuously processes, 
              analyzes, and models global financial markets in real time.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-8">
            {HOW_IT_WORKS.map((step) => (
              <div key={step.step} className="flex gap-4 sm:gap-5">
                <div className="flex-shrink-0">
                  <div className="w-10 h-10 rounded-full border border-black/10 flex items-center justify-center">
                    <span className="font-mono text-[10px] font-bold text-black/40">{step.step}</span>
                  </div>
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 mb-2">
                    <step.icon className="h-4 w-4 text-black/40 flex-shrink-0" />
                    <h3 className="font-semibold text-sm">{step.title}</h3>
                  </div>
                  <p className="text-sm text-black/50 leading-relaxed">{step.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Deep Dive: Key Modules */}
      <section className="max-w-5xl mx-auto px-4 sm:px-6 py-14 sm:py-24">
        <div className="text-center mb-10 sm:mb-16">
          <h2 className="text-xl sm:text-3xl font-bold tracking-tight mb-3">
            Inside the Intelligence Engine
          </h2>
          <p className="text-sm sm:text-base text-black/50 max-w-2xl mx-auto">
            Each module in Entropy Lite is purpose-built to solve a specific intelligence gap 
            that retail investors face when competing with institutional desks.
          </p>
        </div>

        <div className="space-y-10 sm:space-y-16">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-8 items-start">
            <div>
              <h3 className="text-base sm:text-lg font-bold mb-2 sm:mb-3">CLANK Structural Constraint Engine</h3>
              <p className="text-sm text-black/55 leading-relaxed mb-3">
                CLANK stands for Constraint, Liquidity, Accumulation, Narrative, and Kinetic — five structural forces 
                that define how markets behave at critical inflection points.
              </p>
              <p className="text-sm text-black/55 leading-relaxed">
                When a structural constraint approaches its activation threshold — such as a liquidity cliff, 
                institutional positioning limit, or regulatory boundary — CLANK generates pre-emptive alerts 
                with probability scores and expected impact magnitude.
              </p>
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-bold mb-2 sm:mb-3">Monte Carlo Probability Engine</h3>
              <p className="text-sm text-black/55 leading-relaxed mb-3">
                The system runs 10,000-path Geometric Brownian Motion (GBM) simulations for every asset in your 
                portfolio. Each simulation path models price evolution using calibrated volatility, drift, and 
                correlation parameters derived from real market data.
              </p>
              <p className="text-sm text-black/55 leading-relaxed">
                Results are presented as probability distributions showing the likelihood of reaching specific 
                price targets, maximum drawdown estimates, and time-weighted expected returns across multiple 
                confidence intervals.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-8 items-start">
            <div>
              <h3 className="text-base sm:text-lg font-bold mb-2 sm:mb-3">Statistical Arbitrage & Co-Integration</h3>
              <p className="text-sm text-black/55 leading-relaxed mb-3">
                The StatArb engine analyzes your portfolio for mean-reversion opportunities by computing 
                co-integration relationships between asset pairs using the Augmented Dickey-Fuller test.
              </p>
              <p className="text-sm text-black/55 leading-relaxed">
                Z-scores track how far each spread has deviated from its historical mean, generating 
                entry and exit signals when spreads reach statistically significant levels.
              </p>
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-bold mb-2 sm:mb-3">Geopolitical & Regime Intelligence</h3>
              <p className="text-sm text-black/55 leading-relaxed mb-3">
                A continuous monitoring system tracks global geopolitical events — sanctions, conflicts, 
                policy changes, central bank decisions — and scores their expected market impact.
              </p>
              <p className="text-sm text-black/55 leading-relaxed">
                The Regime Detection engine classifies current market conditions and automatically recalibrates 
                all intelligence modules to match the prevailing regime.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-8 items-start">
            <div>
              <h3 className="text-base sm:text-lg font-bold mb-2 sm:mb-3">Causal Effects Simulator</h3>
              <p className="text-sm text-black/55 leading-relaxed mb-3">
                Before executing any trade, the Causal Effects Engine models cascading impacts across three orders: 
                direct price and volatility effects, correlated sector contagion, and systemic ripple effects.
              </p>
              <p className="text-sm text-black/55 leading-relaxed">
                This gives you a complete picture of how a single event propagates through the financial system 
                and affects your portfolio.
              </p>
            </div>
            <div>
              <h3 className="text-base sm:text-lg font-bold mb-2 sm:mb-3">Strategy Factory & Backtesting</h3>
              <p className="text-sm text-black/55 leading-relaxed mb-3">
                The Strategy Factory autonomously generates trade strategies based on current market conditions, 
                your portfolio composition, and identified opportunities.
              </p>
              <p className="text-sm text-black/55 leading-relaxed">
                Strategies are backtested against historical data, then validated through paper trading simulation 
                before any live execution. The Aftermath Matrix previews expected market reaction.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-black/5 bg-black/[0.02]">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-14 sm:py-20 text-center">
          <h2 className="text-xl sm:text-3xl font-bold tracking-tight mb-4">
            Intelligence that was previously institutional-only
          </h2>
          <p className="text-sm sm:text-base text-black/50 mb-8 max-w-lg mx-auto">
            Full market intelligence terminal with structural analysis, probabilistic modeling, 
            and real-time liquidity scenario mapping — available during founding access.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 sm:gap-4">
            <Button
              size="lg"
              className="bg-black text-white hover:bg-black/85 font-mono text-xs tracking-wide px-8 h-12 w-full sm:w-auto"
              onClick={() => navigate("/access")}
            >
              Get Founding Access <ArrowRight className="ml-1 h-4 w-4" />
            </Button>
            <button
              className="font-mono text-xs tracking-wide px-8 h-12 rounded-md border border-black/15 bg-white text-black hover:bg-black/[0.03] transition-colors w-full sm:w-auto"
              onClick={() => navigate("/about")}
            >
              Learn More
            </button>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-black/5 py-8">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="font-mono text-[10px] text-black/30 tracking-wider">
            © {new Date().getFullYear()} Entropy Lite. All rights reserved.
          </p>
          <div className="flex items-center gap-6">
            <button onClick={() => navigate("/about")} className="font-mono text-[10px] text-black/30 hover:text-black/60">About</button>
            <button onClick={() => navigate("/pricing")} className="font-mono text-[10px] text-black/30 hover:text-black/60">Pricing</button>
            <button onClick={() => navigate("/access")} className="font-mono text-[10px] text-black/30 hover:text-black/60">Access</button>
          </div>
        </div>
      </footer>
    </div>
  );
}
