import { useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { ArrowRight, Check } from "lucide-react";
import PublicNav from "@/components/PublicNav";

const FEATURES = [
  "Full market intelligence terminal",
  "Quantitative risk engine (VaR, CVaR, Monte Carlo)",
  "CLANK structural constraint detection",
  "Geopolitical event monitoring with market impact scoring",
  "Statistical arbitrage and co-integration analysis",
  "Deep company intelligence dossiers",
  "Scenario Factory with hypothesis validation",
  "Probabilistic positioning insights with aftermath simulation",
  "Portfolio-wide regime detection",
  "Unlimited assets and watchlists",
];

export default function PricingPage() {
  const navigate = useNavigate();

  useEffect(() => {
    document.title = "Pricing | EntropyLite - Founding Access";
    const meta = document.querySelector('meta[name="description"]');
    if (meta) meta.setAttribute("content", "Founding access to EntropyLite. Full institutional-grade market intelligence, quantitative risk analytics, and probabilistic scenario systems.");
  }, []);

  return (
    <div className="min-h-screen bg-white text-black">
      <PublicNav />

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-12 sm:py-20">
        <h1 className="text-3xl sm:text-5xl font-bold tracking-tight text-center mb-4">
          Founding Access
        </h1>
        <p className="text-center text-sm sm:text-base text-black/50 max-w-lg mx-auto mb-10 sm:mb-16">
          One plan. Full institutional intelligence. Lock in the founding rate before general availability.
        </p>

        <div className="border border-black/10 rounded-xl p-6 sm:p-12 max-w-lg mx-auto">
          <div className="flex items-baseline gap-1 mb-1">
            <span className="text-3xl sm:text-5xl font-bold">Founding</span>
          </div>
          <p className="text-black/40 font-mono text-[11px] mb-6 sm:mb-8">Early access rate. Price will increase at general availability.</p>

          <ul className="space-y-3 mb-8 sm:mb-10">
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

      <footer className="border-t border-black/5 py-6">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <p className="font-mono text-[9px] text-black/25 leading-relaxed mb-4 max-w-4xl">
            EntropyLite provides probabilistic market intelligence, not investment advice. All decisions are made independently by users.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="font-mono text-[10px] text-black/30">© {new Date().getFullYear()} EntropyLite. All rights reserved.</p>
            <div className="flex items-center gap-6">
              <button onClick={() => navigate("/")} className="font-mono text-[10px] text-black/30 hover:text-black/60">Home</button>
              <button onClick={() => navigate("/about")} className="font-mono text-[10px] text-black/30 hover:text-black/60">About</button>
              <button onClick={() => navigate("/access")} className="font-mono text-[10px] text-black/30 hover:text-black/60">Access</button>
              <button onClick={() => navigate("/disclaimer")} className="font-mono text-[10px] text-black/30 hover:text-black/60">Disclaimer</button>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
