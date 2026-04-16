import { useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Activity, Shield, Globe, Sparkles, Target, BarChart3,
  TrendingUp, Layers, Zap, ArrowRight, ChevronRight,
  Brain, LineChart, Cpu, Eye, GitBranch, Workflow
} from "lucide-react";
import { Button } from "@/components/ui/button";
import entropyLogoFull from "@/assets/entropy-logo-full.jpeg";

const FEATURES = [
  {
    icon: Activity,
    title: "Quantitative Risk Engine",
    desc: "Value at Risk, CVaR, and liquidity-adjusted risk metrics at 95% and 99% confidence intervals for institutional-grade portfolio protection.",
  },
  {
    icon: Shield,
    title: "CLANK Constraint Detection",
    desc: "AI-powered structural constraint engine that identifies institutional risk boundaries and liquidity thresholds before they activate.",
  },
  {
    icon: Globe,
    title: "Geopolitical Intelligence",
    desc: "Real-time global event monitoring with market impact scoring, regime-aware recalibration, and positioning signal analysis.",
  },
  {
    icon: TrendingUp,
    title: "Monte Carlo Simulations",
    desc: "10,000-path Geometric Brownian Motion simulations for probabilistic outcome modeling and predictive market analysis.",
  },
  {
    icon: Layers,
    title: "Statistical Arbitrage",
    desc: "Portfolio-wide quantitative engine with mean-reversion detection, co-integration analysis, and structural Z-score tracking.",
  },
  {
    icon: Target,
    title: "Desirable Asset Discovery",
    desc: "Multi-stage intelligence funnel identifying high-conviction opportunities using momentum, value, and quality factor analysis.",
  },
  {
    icon: BarChart3,
    title: "Deep Company Intelligence",
    desc: "Institutional dossiers mapping 12 corporate dimensions including management DNA, capital flows, and structural risk assessment.",
  },
  {
    icon: Sparkles,
    title: "Strategy Factory",
    desc: "Autonomous strategy generation with backtesting, regime-aware calibration, and paper trading simulation for decision validation.",
  },
  {
    icon: Zap,
    title: "Real-Time Execution Layer",
    desc: "Institutional-grade order management with live execution, aftermath simulation, and causal effects modeling across portfolios.",
  },
];

const HOW_IT_WORKS = [
  {
    icon: Eye,
    step: "01",
    title: "Data Ingestion",
    desc: "Entropy Lite continuously ingests real-time price feeds, macro indicators, news sentiment, geopolitical events, and institutional flow data from multiple sources. Every data point is timestamped, normalized, and fed into the intelligence pipeline.",
  },
  {
    icon: Cpu,
    step: "02",
    title: "Intelligence Processing",
    desc: "Raw data passes through layered AI engines — including CLANK constraint detection, Monte Carlo simulations, statistical arbitrage models, and regime classification. Each engine operates independently, then results are fused into a unified intelligence view.",
  },
  {
    icon: Brain,
    step: "03",
    title: "Signal Generation",
    desc: "The system generates actionable signals: risk alerts when portfolio VaR breaches thresholds, structural constraints approaching activation, desirable assets passing multi-factor screening, and strategy recommendations calibrated to the current market regime.",
  },
  {
    icon: GitBranch,
    step: "04",
    title: "Causal Modeling",
    desc: "Before any decision, the Causal Effects Engine simulates cascading market impacts across correlated sectors, currencies, and asset classes. It models 1st-order price effects, 2nd-order sector contagion, and 3rd-order systemic ripple effects.",
  },
  {
    icon: LineChart,
    step: "05",
    title: "Decision & Execution",
    desc: "The Strategy Factory generates executable trade plans with precise entry/exit levels, position sizing based on portfolio risk, and aftermath simulation showing expected market impact. Paper trading validates strategies before live execution.",
  },
  {
    icon: Workflow,
    step: "06",
    title: "Continuous Learning",
    desc: "Every trade outcome feeds back into the Scar Memory system and Outcome Gradient engine, continuously refining the platform's predictive accuracy. The system learns from its own history to improve future signal quality.",
  },
];

export default function LandingPage() {
  const navigate = useNavigate();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    document.title = "Entropy Lite — Market Intelligence Operating System";
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        navigate("/dashboard", { replace: true });
      }
      setChecking(false);
    });
  }, [navigate]);

  if (checking) return null;

  return (
    <div className="min-h-screen bg-white text-black">
      {/* Nav */}
      <nav className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-black/5">
        <div className="max-w-6xl mx-auto flex items-center justify-between px-6 h-14">
          <img src={entropyLogoFull} alt="Entropy Lite — Market Intelligence System" className="h-8 object-contain" />
          <div className="flex items-center gap-3 sm:gap-6">
            <button onClick={() => navigate("/about")} className="font-mono text-[11px] text-black/50 hover:text-black transition-colors hidden sm:block">About</button>
            <button onClick={() => navigate("/pricing")} className="font-mono text-[11px] text-black/50 hover:text-black transition-colors hidden sm:block">Pricing</button>
            <span className="font-mono text-[9px] text-black/35 tracking-wide">by Pratik Sehwag</span>
            <Button
              size="sm"
              className="bg-black text-white hover:bg-black/85 font-mono text-xs tracking-wide"
              onClick={() => navigate("/dashboard")}
            >
              Sign In <ArrowRight className="ml-1 h-3 w-3" />
            </Button>
          </div>
        </div>
      </nav>

      {/* Hero */}
      <header className="relative overflow-hidden">
        <div className="max-w-4xl mx-auto px-6 pt-16 pb-20 text-center">
          <img src={entropyLogoFull} alt="Entropy Lite" className="h-28 sm:h-36 object-contain mx-auto mb-8" />
          <p className="font-mono text-[10px] tracking-[0.3em] uppercase text-black/40 mb-6">
            Market Intelligence Operating System
          </p>
          <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold tracking-tight leading-[1.1] mb-6">
            Structural Market Intelligence
            <br />
            <span className="text-black/60">for Serious Investors</span>
          </h1>
          <p className="text-lg sm:text-xl text-black/55 max-w-2xl mx-auto mb-10 leading-relaxed">
            Predictive market analysis, liquidity flow detection, and real-time intelligence layers — 
            the institutional trading insights platform built for precision decision-making.
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
      <section className="max-w-6xl mx-auto px-6 pb-28">
        <div className="text-center mb-16">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight mb-3">
            Institutional-Grade Capabilities
          </h2>
          <p className="text-black/50 max-w-xl mx-auto">
            Market structure analysis, trading signals, and predictive decision systems — 
            every module a professional terminal offers, unified in one platform.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {FEATURES.map((f) => (
            <article
              key={f.title}
              className="group rounded-lg border border-black/5 bg-white p-6 hover:shadow-md transition-shadow"
            >
              <f.icon className="h-5 w-5 text-black/40 mb-4 group-hover:text-black/70 transition-colors" />
              <h3 className="font-semibold text-sm mb-2">{f.title}</h3>
              <p className="text-sm text-black/50 leading-relaxed">{f.desc}</p>
            </article>
          ))}
        </div>
      </section>

      {/* How It Works */}
      <section className="border-t border-black/5 bg-black/[0.015]">
        <div className="max-w-5xl mx-auto px-6 py-24">
          <div className="text-center mb-16">
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight mb-3">
              How Entropy Lite Works
            </h2>
            <p className="text-black/50 max-w-2xl mx-auto">
              From raw market data to actionable intelligence — a six-stage pipeline that continuously processes, 
              analyzes, and learns from global financial markets in real time.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8">
            {HOW_IT_WORKS.map((step) => (
              <div key={step.step} className="flex gap-5">
                <div className="flex-shrink-0">
                  <div className="w-10 h-10 rounded-full border border-black/10 flex items-center justify-center">
                    <span className="font-mono text-[10px] font-bold text-black/40">{step.step}</span>
                  </div>
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <step.icon className="h-4 w-4 text-black/40" />
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
      <section className="max-w-5xl mx-auto px-6 py-24">
        <div className="text-center mb-16">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight mb-3">
            Inside the Intelligence Engine
          </h2>
          <p className="text-black/50 max-w-2xl mx-auto">
            Each module in Entropy Lite is purpose-built to solve a specific intelligence gap 
            that retail investors face when competing with institutional desks.
          </p>
        </div>

        <div className="space-y-16">
          <div className="grid md:grid-cols-2 gap-8 items-start">
            <div>
              <h3 className="text-lg font-bold mb-3">CLANK Structural Constraint Engine</h3>
              <p className="text-sm text-black/55 leading-relaxed mb-3">
                CLANK stands for Constraint, Liquidity, Accumulation, Narrative, and Kinetic — five structural forces 
                that define how markets behave at critical inflection points. The engine continuously monitors these 
                dimensions across your entire portfolio.
              </p>
              <p className="text-sm text-black/55 leading-relaxed">
                When a structural constraint approaches its activation threshold — such as a liquidity cliff, 
                institutional positioning limit, or regulatory boundary — CLANK generates pre-emptive alerts 
                with probability scores and expected impact magnitude.
              </p>
            </div>
            <div>
              <h3 className="text-lg font-bold mb-3">Monte Carlo Probability Engine</h3>
              <p className="text-sm text-black/55 leading-relaxed mb-3">
                The system runs 10,000-path Geometric Brownian Motion (GBM) simulations for every asset in your 
                portfolio. Each simulation path models price evolution using calibrated volatility, drift, and 
                correlation parameters derived from real market data.
              </p>
              <p className="text-sm text-black/55 leading-relaxed">
                Results are presented as probability distributions showing the likelihood of reaching specific 
                price targets, maximum drawdown estimates, and time-weighted expected returns across multiple 
                confidence intervals (50th, 75th, 90th, 95th percentiles).
              </p>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-8 items-start">
            <div>
              <h3 className="text-lg font-bold mb-3">Statistical Arbitrage & Co-Integration</h3>
              <p className="text-sm text-black/55 leading-relaxed mb-3">
                The StatArb engine analyzes your portfolio for mean-reversion opportunities by computing 
                co-integration relationships between asset pairs. It uses the Augmented Dickey-Fuller test 
                to identify stationary spread relationships.
              </p>
              <p className="text-sm text-black/55 leading-relaxed">
                Z-scores track how far each spread has deviated from its historical mean, generating 
                entry and exit signals when spreads reach statistically significant levels. The Future 
                Graph Machine then projects probable convergence timelines.
              </p>
            </div>
            <div>
              <h3 className="text-lg font-bold mb-3">Geopolitical & Regime Intelligence</h3>
              <p className="text-sm text-black/55 leading-relaxed mb-3">
                A continuous monitoring system tracks global geopolitical events — sanctions, conflicts, 
                policy changes, central bank decisions — and scores their expected market impact across 
                asset classes, sectors, and currencies.
              </p>
              <p className="text-sm text-black/55 leading-relaxed">
                The Regime Detection engine classifies current market conditions (trending, mean-reverting, 
                high-volatility, crisis) and automatically recalibrates all intelligence modules to match 
                the prevailing regime, ensuring signals remain contextually accurate.
              </p>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-8 items-start">
            <div>
              <h3 className="text-lg font-bold mb-3">Causal Effects Simulator</h3>
              <p className="text-sm text-black/55 leading-relaxed mb-3">
                Before executing any trade or responding to a market event, the Causal Effects Engine 
                models cascading impacts across three orders: direct price and volatility effects (1st order), 
                correlated sector contagion (2nd order), and systemic ripple effects across the broader market (3rd order).
              </p>
              <p className="text-sm text-black/55 leading-relaxed">
                This gives you a complete picture of how a single event — like a rate decision or earnings 
                miss — propagates through the financial system and affects your portfolio.
              </p>
            </div>
            <div>
              <h3 className="text-lg font-bold mb-3">Strategy Factory & Backtesting</h3>
              <p className="text-sm text-black/55 leading-relaxed mb-3">
                The Strategy Factory autonomously generates trade strategies based on current market conditions, 
                your portfolio composition, and identified opportunities. Each strategy includes exact entry/exit 
                levels, position sizing, and risk parameters.
              </p>
              <p className="text-sm text-black/55 leading-relaxed">
                Strategies are backtested against historical data, then validated through paper trading simulation 
                before any live execution. The Aftermath Matrix previews expected market reaction to each trade, 
                including slippage and liquidity impact estimates.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="border-t border-black/5 bg-black/[0.02]">
        <div className="max-w-3xl mx-auto px-6 py-20 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight mb-4">
            Intelligence that was previously institutional-only
          </h2>
          <p className="text-black/50 mb-8 max-w-lg mx-auto">
            Full market intelligence terminal with structural analysis, predictive modeling, 
            and real-time liquidity signals — available during founding access.
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
        <div className="max-w-6xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
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
