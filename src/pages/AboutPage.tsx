import { useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import PublicNav from "@/components/PublicNav";

export default function AboutPage() {
  const navigate = useNavigate();

  useEffect(() => {
    document.title = "About | Entropy Lite - The Operating System of Finance";
    const meta = document.querySelector('meta[name="description"]');
    if (meta) meta.setAttribute("content", "Entropy Lite is an institutional-grade market intelligence operating system. Built for structural market analysis, liquidity flow detection, and predictive decision modeling.");
  }, []);

  return (
    <div className="min-h-screen bg-white text-black">
      <PublicNav />

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-12 sm:py-20">
        <h1 className="text-3xl sm:text-5xl font-bold tracking-tight mb-6 sm:mb-8">
          The Intelligence Layer<br />
          <span className="text-black/50">Markets Were Missing</span>
        </h1>

        <div className="space-y-8 sm:space-y-10 text-black/60 leading-relaxed">
          <p className="text-base sm:text-lg">
            EntropyLite is a market intelligence engine built to surface structural scenarios that traditional platforms miss. It combines quantitative risk analytics, regime detection, liquidity flow analysis, and probabilistic modeling into a single, institutional-grade research terminal.
          </p>

          <div>
            <h2 className="text-lg sm:text-xl font-semibold text-black mb-3">The Problem</h2>
            <p className="text-sm sm:text-base">
              Retail investors make decisions with incomplete data. Institutional desks operate with Bloomberg terminals, proprietary quant models, and real-time flow intelligence. The gap between these two worlds has remained unchanged for decades. Most retail platforms offer charts and basic indicators — none provide the structural analysis, constraint detection, or predictive simulation that professional traders rely on daily.
            </p>
          </div>

          <div>
            <h2 className="text-lg sm:text-xl font-semibold text-black mb-3">The System</h2>
            <p className="text-sm sm:text-base mb-3">
              EntropyLite bridges this gap by delivering institutional-grade research capabilities without institutional complexity. The platform ingests real-time market data from multiple sources, runs Monte Carlo simulations across 10,000 paths, detects structural constraints through the CLANK engine, and generates probabilistic intelligence — all in real time.
            </p>
            <p className="text-sm sm:text-base">
              The system is organized into interconnected intelligence modules, each handling a specific analytical domain: risk quantification, statistical arbitrage, geopolitical monitoring, regime classification, causal chain modeling, and autonomous strategy generation.
            </p>
          </div>

          <div>
            <h2 className="text-lg sm:text-xl font-semibold text-black mb-3">Market Structure Analysis</h2>
            <p className="text-sm sm:text-base mb-3">
              Every asset exists within a web of structural forces — liquidity constraints, positioning patterns, regime shifts, and geopolitical pressure. EntropyLite maps these forces continuously, providing a probabilistic intelligence layer that adapts as market structure evolves.
            </p>
            <p className="text-sm sm:text-base">
              The CLANK engine (Constraint, Liquidity, Accumulation, Narrative, Kinetic) monitors five structural dimensions simultaneously, generating alerts when any dimension approaches a critical threshold.
            </p>
          </div>

          <div>
            <h2 className="text-lg sm:text-xl font-semibold text-black mb-3">Quantitative Risk Framework</h2>
            <p className="text-sm sm:text-base">
              The risk engine calculates Value at Risk (VaR) and Conditional VaR (Expected Shortfall) at both 95% and 99% confidence levels. Liquidity-adjusted VaR accounts for position-size-dependent slippage. Portfolio-wide stress testing simulates how your holdings would perform under historical crisis scenarios. Every metric updates in real time.
            </p>
          </div>

          <div>
            <h2 className="text-lg sm:text-xl font-semibold text-black mb-3">Predictive Intelligence</h2>
            <p className="text-sm sm:text-base">
              Monte Carlo simulations model 10,000 possible future price paths for each asset using Geometric Brownian Motion calibrated to current volatility and drift. The Causal Effects Engine models how a single event cascades through correlated sectors, currencies, and asset classes across three orders of impact.
            </p>
          </div>

          <div>
            <h2 className="text-lg sm:text-xl font-semibold text-black mb-3">Scenario Intelligence & Hypothesis Testing</h2>
            <p className="text-sm sm:text-base">
              The Strategy Factory autonomously generates scenario-based positioning hypotheses calibrated to current market regime, portfolio composition, and identified structural patterns. Each scenario includes key levels, projected ranges, and risk-based sizing metrics. Paper simulation validates hypotheses before any live positioning.
            </p>
          </div>

          <div>
            <h2 className="text-lg sm:text-xl font-semibold text-black mb-3">Continuous Learning</h2>
            <p className="text-sm sm:text-base">
              The Scar Memory system records every market outcome and scenario accuracy. The Outcome Gradient engine uses this historical record to continuously improve confidence calibration and model quality.
            </p>
          </div>

          <div>
            <h2 className="text-lg sm:text-xl font-semibold text-black mb-3">Built by Pratik Sehwag</h2>
            <p className="text-sm sm:text-base">
              EntropyLite is designed and built as a research-grade intelligence system. Every module — from the statistical arbitrage engine to the causal effects simulator — is grounded in quantitative methodology and real market data. The platform provides intelligence, not advice — all investment decisions remain with the user.
            </p>
          </div>
        </div>

        <div className="mt-12 sm:mt-16 text-center">
          <Button
            size="lg"
            className="bg-black text-white hover:bg-black/85 font-mono text-xs px-8 h-12 w-full sm:w-auto"
            onClick={() => navigate("/access")}
          >
            Get Access <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </main>

      <footer className="border-t border-black/5 py-6">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <p className="font-mono text-[9px] text-black/25 leading-relaxed mb-4 max-w-4xl">
            EntropyLite is a market intelligence and probabilistic scenario engine. It does not provide investment advice. All outputs are research-based observations. Users make independent decisions at their own risk.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="font-mono text-[10px] text-black/30">© {new Date().getFullYear()} EntropyLite. All rights reserved.</p>
            <div className="flex items-center gap-6">
              <button onClick={() => navigate("/")} className="font-mono text-[10px] text-black/30 hover:text-black/60">Home</button>
              <button onClick={() => navigate("/pricing")} className="font-mono text-[10px] text-black/30 hover:text-black/60">Pricing</button>
              <button onClick={() => navigate("/access")} className="font-mono text-[10px] text-black/30 hover:text-black/60">Access</button>
              <button onClick={() => navigate("/disclaimer")} className="font-mono text-[10px] text-black/30 hover:text-black/60">Disclaimer</button>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
