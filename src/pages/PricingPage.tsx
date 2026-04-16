import { useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { ArrowRight, Check } from "lucide-react";
import entropyLogoFull from "@/assets/entropy-logo-full.jpeg";

const FEATURES = [
  "Full market intelligence terminal",
  "Quantitative risk engine (VaR, CVaR, Monte Carlo)",
  "CLANK structural constraint detection",
  "Geopolitical event monitoring with market impact scoring",
  "Statistical arbitrage and co-integration analysis",
  "Deep company intelligence dossiers",
  "Strategy Factory with backtesting",
  "Real-time execution with Alpaca integration",
  "Portfolio-wide regime detection",
  "Unlimited assets and watchlists",
];

export default function PricingPage() {
  const navigate = useNavigate();

  useEffect(() => {
    document.title = "Pricing — Entropy Lite | Founding Access at ₹999";
    const meta = document.querySelector('meta[name="description"]');
    if (meta) meta.setAttribute("content", "Founding access to Entropy Lite at ₹999. Full institutional-grade market intelligence, quantitative risk analytics, and predictive decision systems.");
  }, []);

  return (
    <div className="min-h-screen bg-white text-black">
      <nav className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-black/5">
        <div className="max-w-6xl mx-auto flex items-center justify-between px-6 h-14">
          <button onClick={() => navigate("/")} className="flex items-center">
            <img src={entropyLogoFull} alt="Entropy Lite" className="h-8 object-contain" />
          </button>
          <div className="flex items-center gap-6">
            <button onClick={() => navigate("/about")} className="font-mono text-[11px] text-black/50 hover:text-black transition-colors">About</button>
            <button onClick={() => navigate("/access")} className="font-mono text-[11px] text-black/50 hover:text-black transition-colors">Access</button>
            <Button size="sm" className="bg-black text-white hover:bg-black/85 font-mono text-xs" onClick={() => navigate("/dashboard")}>
              Sign In
            </Button>
          </div>
        </div>
      </nav>

      <main className="max-w-3xl mx-auto px-6 py-20">
        <h1 className="text-4xl sm:text-5xl font-bold tracking-tight text-center mb-4">
          Founding Access
        </h1>
        <p className="text-center text-black/50 max-w-lg mx-auto mb-16">
          One plan. Full institutional intelligence. Lock in the founding rate before general availability.
        </p>

        <div className="border border-black/10 rounded-xl p-8 sm:p-12 max-w-lg mx-auto">
          <div className="flex items-baseline gap-1 mb-1">
            <span className="text-5xl font-bold">₹999</span>
            <span className="text-black/40 font-mono text-sm">/month</span>
          </div>
          <p className="text-black/40 font-mono text-[11px] mb-8">Founding member rate. Price will increase.</p>

          <ul className="space-y-3 mb-10">
            {FEATURES.map((f) => (
              <li key={f} className="flex items-start gap-3 text-sm text-black/70">
                <Check className="h-4 w-4 text-black/40 mt-0.5 flex-shrink-0" />
                {f}
              </li>
            ))}
          </ul>

          <Button
            className="w-full bg-black text-white hover:bg-black/85 font-mono text-xs h-12"
            onClick={() => navigate("/access")}
          >
            Get Founding Access <ArrowRight className="ml-2 h-4 w-4" />
          </Button>
        </div>
      </main>

      <footer className="border-t border-black/5 py-8">
        <div className="max-w-6xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <p className="font-mono text-[10px] text-black/30">© {new Date().getFullYear()} Entropy Lite. All rights reserved.</p>
          <div className="flex items-center gap-6">
            <button onClick={() => navigate("/")} className="font-mono text-[10px] text-black/30 hover:text-black/60">Home</button>
            <button onClick={() => navigate("/about")} className="font-mono text-[10px] text-black/30 hover:text-black/60">About</button>
            <button onClick={() => navigate("/access")} className="font-mono text-[10px] text-black/30 hover:text-black/60">Access</button>
          </div>
        </div>
      </footer>
    </div>
  );
}
