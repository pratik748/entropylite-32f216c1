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
    <div className="min-h-screen bg-white text-ink">
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

      <main className="max-w-6xl mx-auto px-5 sm:px-6 py-16 sm:py-24">
        {/* Pillars */}
        <div className="grid grid-cols-1 sm:grid-cols-3 border-t border-l border-ink/[0.07] mb-16">
          {PILLARS.map((p) => (
            <div key={p.title} className="border-b border-r border-ink/[0.07] p-8">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-ink/10 mb-5">
                <p.icon className="h-4 w-4 text-ink/60" strokeWidth={1.75} />
              </div>
              <h3 className="text-[15px] font-semibold tracking-tight mb-2">{p.title}</h3>
              <p className="text-[13px] text-ink/55 leading-relaxed">{p.desc}</p>
            </div>
          ))}
        </div>

        {/* Access card */}
        <div className="max-w-lg mx-auto text-center">
          <div className="border border-ink/[0.09] rounded-xl p-8 sm:p-10">
            <p className="mkt-label text-[9px] text-ink/40 mb-3">Founding access</p>
            <h2 className="text-[22px] font-bold tracking-tight mb-2">
              Full platform access during the founding period
            </h2>
            <p className="text-[13px] text-ink/50 mb-8">
              All intelligence modules. No feature restrictions.
            </p>
            <InkButton onClick={() => navigate("/dashboard")} className="w-full">
              Create account <ArrowRight className="h-4 w-4" />
            </InkButton>
          </div>
          <p className="mt-6 text-[12.5px] text-ink/45">
            Already have an account?{" "}
            <button
              onClick={() => navigate("/dashboard")}
              className="inline-btn font-semibold text-ink underline underline-offset-4 decoration-ink/25 hover:decoration-ink"
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
