import { useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { ArrowRight, Shield, Activity, Globe } from "lucide-react";
import PublicNav from "@/components/PublicNav";

export default function AccessPage() {
  const navigate = useNavigate();

  useEffect(() => {
    document.title = "Get Access — EntropyLite | Market Intelligence Platform";
    const meta = document.querySelector('meta[name="description"]');
    if (meta) meta.setAttribute("content", "Get founding access to EntropyLite. Institutional-grade market intelligence, probabilistic analytics, and structural scenario analysis for independent investors.");
  }, []);

  return (
    <div className="min-h-screen bg-white text-black">
      <PublicNav />

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-12 sm:py-20">
        <div className="text-center mb-10 sm:mb-16">
          <h1 className="text-3xl sm:text-5xl font-bold tracking-tight mb-4">
            Access Institutional Intelligence
          </h1>
          <p className="text-black/50 max-w-xl mx-auto text-base sm:text-lg">
            Join independent investors using EntropyLite for market structure analysis, probabilistic modeling, and quantitative risk intelligence previously available only to institutional research desks.
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6 mb-10 sm:mb-16">
          <div className="border border-black/5 rounded-lg p-5 sm:p-6 text-center">
            <Activity className="h-6 w-6 mx-auto text-black/40 mb-3 sm:mb-4" />
            <h3 className="font-semibold text-sm mb-2">Real-Time Intelligence</h3>
            <p className="text-[13px] text-black/50">Live market structure analysis with regime-aware recalibration across your portfolio.</p>
          </div>
          <div className="border border-black/5 rounded-lg p-5 sm:p-6 text-center">
            <Shield className="h-6 w-6 mx-auto text-black/40 mb-3 sm:mb-4" />
            <h3 className="font-semibold text-sm mb-2">Structural Risk Detection</h3>
            <p className="text-[13px] text-black/50">CLANK engine identifies constraint boundaries and liquidity risks before they activate.</p>
          </div>
          <div className="border border-black/5 rounded-lg p-5 sm:p-6 text-center">
            <Globe className="h-6 w-6 mx-auto text-black/40 mb-3 sm:mb-4" />
            <h3 className="font-semibold text-sm mb-2">Probabilistic Scenario Engine</h3>
            <p className="text-[13px] text-black/50">Monte Carlo simulations, causal modeling, and positioning insights for informed independent analysis.</p>
          </div>
        </div>

        <div className="max-w-md mx-auto text-center">
          <div className="border border-black/10 rounded-xl p-6 sm:p-8 mb-6">
            <p className="font-mono text-[11px] text-black/40 tracking-wider uppercase mb-2">Founding Access</p>
            <p className="text-base sm:text-lg font-semibold mb-4">Full platform access during founding period</p>
            <p className="text-[13px] text-black/40 mb-6">All intelligence modules. No feature restrictions.</p>
            <Button
              className="w-full bg-black text-white hover:bg-black/85 font-mono text-xs h-12"
              onClick={() => navigate("/dashboard")}
            >
              Create Account <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          </div>
          <p className="font-mono text-[10px] text-black/30">
            Already have an account?{" "}
            <button onClick={() => navigate("/dashboard")} className="underline hover:text-black/60 inline-btn">Sign in</button>
          </p>
        </div>
      </main>

      <footer className="border-t border-black/5 py-6">
        <div className="max-w-6xl mx-auto px-4 sm:px-6">
          <p className="font-mono text-[9px] text-black/25 leading-relaxed mb-4 max-w-4xl">
            EntropyLite provides probabilistic market intelligence — not investment advice. All decisions are made independently by users.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4">
            <p className="font-mono text-[10px] text-black/30">© {new Date().getFullYear()} EntropyLite. All rights reserved.</p>
            <div className="flex items-center gap-6">
              <button onClick={() => navigate("/")} className="font-mono text-[10px] text-black/30 hover:text-black/60">Home</button>
              <button onClick={() => navigate("/pricing")} className="font-mono text-[10px] text-black/30 hover:text-black/60">Pricing</button>
              <button onClick={() => navigate("/about")} className="font-mono text-[10px] text-black/30 hover:text-black/60">About</button>
              <button onClick={() => navigate("/disclaimer")} className="font-mono text-[10px] text-black/30 hover:text-black/60">Disclaimer</button>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
