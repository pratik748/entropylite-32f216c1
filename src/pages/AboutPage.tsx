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
          <div className="flex items-center gap-6">
            <button onClick={() => navigate("/pricing")} className="font-mono text-[11px] text-black/50 hover:text-black transition-colors">Pricing</button>
            <button onClick={() => navigate("/access")} className="font-mono text-[11px] text-black/50 hover:text-black transition-colors">Access</button>
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

        <div className="space-y-8 text-black/60 leading-relaxed">
          <p className="text-lg">
            Entropy Lite is a market intelligence operating system built to surface structural signals that traditional platforms miss. It combines quantitative risk analytics, regime detection, liquidity flow analysis, and predictive modeling into a single, institutional-grade terminal.
          </p>

          <div>
            <h2 className="text-xl font-semibold text-black mb-3">The Problem</h2>
            <p>
              Retail investors make decisions with incomplete data. Institutional desks operate with Bloomberg terminals, proprietary quant models, and real-time flow intelligence. The gap between these two worlds has remained unchanged for decades.
            </p>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-black mb-3">The System</h2>
            <p>
              Entropy Lite bridges this gap by delivering institutional capabilities without institutional complexity. The platform ingests real-time market data, runs Monte Carlo simulations across 10,000 paths, detects structural constraints through the CLANK engine, and generates actionable intelligence — all in real time.
            </p>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-black mb-3">Market Structure Analysis</h2>
            <p>
              Every asset exists within a web of structural forces — liquidity constraints, positioning signals, regime shifts, and geopolitical pressure. Entropy Lite maps these forces continuously, providing a predictive decision layer that adapts as market structure evolves.
            </p>
          </div>

          <div>
            <h2 className="text-xl font-semibold text-black mb-3">Built by Pratik Sehwag</h2>
            <p>
              Entropy Lite is designed and built as a research-grade intelligence system. Every module — from the statistical arbitrage engine to the causal effects simulator — is grounded in quantitative methodology and real market data.
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
