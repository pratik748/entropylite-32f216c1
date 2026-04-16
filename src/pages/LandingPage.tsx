import { useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  Activity, Shield, Globe, Sparkles, Target, BarChart3,
  TrendingUp, Layers, Zap, ArrowRight, ChevronRight
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
          <div className="flex items-center gap-4 sm:gap-6">
            <button onClick={() => navigate("/about")} className="font-mono text-[11px] text-black/50 hover:text-black transition-colors hidden sm:block">About</button>
            <button onClick={() => navigate("/pricing")} className="font-mono text-[11px] text-black/50 hover:text-black transition-colors hidden sm:block">Pricing</button>
            <span className="font-mono text-[9px] text-black/35 tracking-wide hidden md:block">by Pratik Sehwag</span>
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
          <div className="flex items-center justify-center gap-4">
            <Button
              size="lg"
              className="bg-black text-white hover:bg-black/85 font-mono text-xs tracking-wide px-8 h-12"
              onClick={() => navigate("/access")}
            >
              Get Access <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="font-mono text-xs tracking-wide px-8 h-12 border-black/10 hover:bg-black/[0.02]"
              onClick={() => navigate("/pricing")}
            >
              View Pricing
            </Button>
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

      {/* CTA */}
      <section className="border-t border-black/5 bg-black/[0.02]">
        <div className="max-w-3xl mx-auto px-6 py-20 text-center">
          <h2 className="text-2xl sm:text-3xl font-bold tracking-tight mb-4">
            Intelligence that was previously institutional-only
          </h2>
          <p className="text-black/50 mb-8 max-w-lg mx-auto">
            Founding access at ₹999/month. Full market intelligence terminal with 
            structural analysis, predictive modeling, and real-time liquidity signals.
          </p>
          <div className="flex items-center justify-center gap-4 flex-wrap">
            <Button
              size="lg"
              className="bg-black text-white hover:bg-black/85 font-mono text-xs tracking-wide px-8 h-12"
              onClick={() => navigate("/access")}
            >
              Start Now — ₹999/mo <ArrowRight className="ml-1 h-4 w-4" />
            </Button>
            <Button
              size="lg"
              variant="outline"
              className="font-mono text-xs tracking-wide px-8 h-12 border-black/10"
              onClick={() => navigate("/about")}
            >
              Learn More
            </Button>
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
