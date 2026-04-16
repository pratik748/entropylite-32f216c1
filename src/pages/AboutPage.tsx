import { useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";
import entropyLogoFull from "@/assets/entropy-logo-full.jpeg";

export default function AboutPage() {
  const navigate = useNavigate();

  useEffect(() => {
    document.title = "About — Entropy Lite | Market Intelligence Operating System";
    const meta = document.querySelector('meta[name="description"]');
    if (meta) meta.setAttribute("content", "Entropy Lite is an institutional-grade market intelligence operating system. Built for structural market analysis, liquidity flow detection, and predictive decision modeling.");
  }, []);

  return (
    <div className="min-h-screen bg-white text-black">
      <nav className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-black/5">
        <div className="max-w-6xl mx-auto flex items-center justify-between px-6 h-14">
          <button onClick={() => navigate("/")} className="flex items-center">
            <img src={entropyLogoFull} alt="Entropy Lite" className="h-8 object-contain" />
          </button>
          <div className="flex items-center gap-3 sm:gap-6">
            <button onClick={() => navigate("/pricing")} className="font-mono text-[11px] text-black/50 hover:text-black transition-colors">Pricing</button>
            <button onClick={() => navigate("/access")} className="font-mono text-[11px] text-black/50 hover:text-black transition-colors">Access</button>
            <span className="font-mono text-[9px] text-black/35 tracking-wide">by Pratik Sehwag</span>
            <Button size="sm" className="bg-black text-white hover:bg-black/85 font-mono text-xs" onClick={() => navigate("/dashboard")}>
              Sign In
            </Button>
          </div>
        </div>
      </nav>

      <main className="max-w-3xl mx-auto px-6 py-20">
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight mb-8">
          The Intelligence Layer<br />
          <span className="text-black/50">Markets Were Missing</span>
        </h1>

        <div className="space-y-10 text-black/60 leading-relaxed">
          <p className="text-lg">
            Entropy Lite is a market intelligence operating system built to surface structural signals that traditional platforms miss. It combines quantitative risk analytics, regime detection, liquidity flow analysis, and predictive modeling into a single, institutional-grade terminal.
          </p>

          <div>
            <h2 className="text-xl font-semibold text-black mb-3">The Problem</h2>
            <p>
              Retail investors make decisions with incomplete data. Institutional desks operate with Bloomberg terminals, proprietary quant models, and real-time flow intelligence. The gap between these two worlds has remained unchanged for decades. Most retail platforms offer charts and basic indicators — none provide the structural analysis, constraint detection, or predictive simulation that professional traders rely on daily.
            </p>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-black mb-3">The System</h2>
            <p className="mb-3">
              Entropy Lite bridges this gap by delivering institutional capabilities without institutional complexity. The platform ingests real-time market data from multiple sources, runs Monte Carlo simulations across 10,000 paths, detects structural constraints through the CLANK engine, and generates actionable intelligence — all in real time.
            </p>
            <p>
              The system is organized into interconnected intelligence modules, each handling a specific analytical domain: risk quantification, statistical arbitrage, geopolitical monitoring, regime classification, causal chain modeling, and autonomous strategy generation. These modules share data and context, creating a unified intelligence picture that adapts continuously.
            </p>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-black mb-3">Market Structure Analysis</h2>
            <p className="mb-3">
              Every asset exists within a web of structural forces — liquidity constraints, positioning signals, regime shifts, and geopolitical pressure. Entropy Lite maps these forces continuously, providing a predictive decision layer that adapts as market structure evolves.
            </p>
            <p>
              The CLANK engine (Constraint, Liquidity, Accumulation, Narrative, Kinetic) monitors five structural dimensions simultaneously, generating alerts when any dimension approaches a critical threshold. This allows you to anticipate market movements rather than react to them.
            </p>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-black mb-3">Quantitative Risk Framework</h2>
            <p>
              The risk engine calculates Value at Risk (VaR) and Conditional VaR (Expected Shortfall) at both 95% and 99% confidence levels. Liquidity-adjusted VaR accounts for position-size-dependent slippage. Portfolio-wide stress testing simulates how your holdings would perform under historical crisis scenarios (2008 GFC, 2020 COVID crash, 2022 rate shock). Every metric updates in real time as market conditions change.
            </p>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-black mb-3">Predictive Intelligence</h2>
            <p>
              Monte Carlo simulations model 10,000 possible future price paths for each asset using Geometric Brownian Motion calibrated to current volatility and drift. The Causal Effects Engine models how a single event cascades through correlated sectors, currencies, and asset classes across three orders of impact. The Future Graph Machine projects probable price trajectories with confidence bands.
            </p>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-black mb-3">Strategy & Execution</h2>
            <p>
              The Strategy Factory autonomously generates trade strategies calibrated to current market regime, your portfolio composition, and identified opportunities. Each strategy includes precise entry/exit levels, risk-based position sizing, and backtested performance metrics. Paper trading validates strategies in real-time simulation before live execution through integrated brokerage connectivity.
            </p>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-black mb-3">Continuous Learning</h2>
            <p>
              The Scar Memory system records every trade outcome, market prediction, and signal accuracy. The Outcome Gradient engine uses this historical record to continuously improve signal quality and model calibration. Over time, the platform learns from its own performance — biasing toward patterns and strategies that have demonstrated accuracy in your specific market context.
            </p>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-black mb-3">Built by Pratik Sehwag</h2>
            <p>
              Entropy Lite is designed and built as a research-grade intelligence system. Every module — from the statistical arbitrage engine to the causal effects simulator — is grounded in quantitative methodology and real market data. The goal is to make institutional-grade intelligence accessible to every serious investor.
            </p>
          </div>
        </div>

        <div className="mt-16 text-center">
          <Button
            size="lg"
            className="bg-black text-white hover:bg-black/85 font-mono text-xs px-8 h-12"
            onClick={() => navigate("/access")}
          >
            Get Access <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </main>

      <footer className="border-t border-black/5 py-8">
        <div className="max-w-6xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="font-mono text-[10px] text-black/30">© {new Date().getFullYear()} Entropy Lite. All rights reserved.</p>
          <div className="flex items-center gap-6">
            <button onClick={() => navigate("/")} className="font-mono text-[10px] text-black/30 hover:text-black/60">Home</button>
            <button onClick={() => navigate("/pricing")} className="font-mono text-[10px] text-black/30 hover:text-black/60">Pricing</button>
            <button onClick={() => navigate("/access")} className="font-mono text-[10px] text-black/30 hover:text-black/60">Access</button>
          </div>
        </div>
      </footer>
    </div>
  );
}
