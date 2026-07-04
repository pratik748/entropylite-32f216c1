import { useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { ArrowRight, Shield, Activity, Globe } from "lucide-react";
import PublicNav from "@/components/PublicNav";
import SiteFooter from "@/components/marketing/SiteFooter";
import { PageHeader, InkButton } from "@/components/marketing/Section";

const PILLARS = [
  {
    icon: Activity,
    title: "Real-time intelligence",
    desc: "Live market-structure analysis with regime-aware recalibration across your entire portfolio.",
  },
  {
    icon: Shield,
    title: "Structural risk detection",
    desc: "The CLANK engine identifies constraint boundaries and liquidity risks before they activate.",
  },
  {
    icon: Globe,
    title: "Probabilistic scenarios",
    desc: "Monte Carlo simulation, causal modelling and positioning insight for independent analysis.",
  },
];

export default function AccessPage() {
  const navigate = useNavigate();

  useEffect(() => {
    document.title = "Client access | Entropy";
    const meta = document.querySelector('meta[name="description"]');
    if (meta) meta.setAttribute("content", "Get founding access to Entropy. Institutional-grade market intelligence, probabilistic analytics, and structural scenario analysis for independent investors.");
  }, []);

  return (
    <div className="site-public min-h-screen bg-carbon-950 text-white">
      <PublicNav />

      <PageHeader
        label="Client access"
        title={
          <>
            Institutional capability,
            <br />
            <span className="text-white/40">independent hands.</span>
          </>
        }
        lede="Join independent investors using Entropy for market-structure analysis, probabilistic modelling and quantitative risk intelligence previously reserved for institutional research desks."
      />

      <main className="max-w-7xl mx-auto px-5 sm:px-8 py-16 sm:py-24">
        {/* Pillars */}
        <div className="grid grid-cols-1 sm:grid-cols-3 border-t border-l border-hairline mb-16">
          {PILLARS.map((p) => (
            <div key={p.title} className="border-b border-r border-hairline p-8 bg-carbon-900">
              <p.icon className="h-4 w-4 text-white/40 mb-5" strokeWidth={1.5} />
              <h3 className="text-[14.5px] font-semibold tracking-tight mb-2 text-white">{p.title}</h3>
              <p className="text-[13px] text-white/50 leading-relaxed">{p.desc}</p>
            </div>
          ))}
        </div>

        {/* Access panel */}
        <div className="max-w-lg mx-auto text-center">
          <div className="border border-hairline bg-carbon-900 p-8 sm:p-10">
            <p className="mkt-label text-[10px] text-white/40 mb-3">Founding access</p>
            <h2 className="text-[21px] font-semibold tracking-tight mb-2 text-white">
              Full platform access during the founding period
            </h2>
            <p className="text-[13px] text-white/45 mb-8">
              All intelligence modules. No feature restrictions.
            </p>
            <InkButton onClick={() => navigate("/dashboard")} className="w-full">
              Create account <ArrowRight className="h-4 w-4" />
            </InkButton>
          </div>
          <p className="mt-6 text-[12.5px] text-white/40">
            Already have an account?{" "}
            <button
              onClick={() => navigate("/dashboard")}
              className="inline-btn font-medium text-white underline underline-offset-4 decoration-white/25 hover:decoration-white transition-colors duration-150 ease-out"
            >
              Sign in
            </button>
          </p>
        </div>
      </main>

      <SiteFooter />
    </div>
  );
}
