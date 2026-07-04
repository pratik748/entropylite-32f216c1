import { useNavigate } from "react-router-dom";
import { useEffect } from "react";
import { ArrowRight, Check } from "lucide-react";
import PublicNav from "@/components/PublicNav";
import SiteFooter from "@/components/marketing/SiteFooter";
import { PageHeader, InkButton } from "@/components/marketing/Section";

const FEATURES = [
  "Full market-intelligence terminal",
  "Quantitative risk engine — VaR, CVaR, Monte Carlo",
  "CLANK structural constraint detection",
  "Geopolitical monitoring with market-impact scoring",
  "Statistical arbitrage and cointegration analysis",
  "Deep company intelligence dossiers",
  "Scenario Factory with hypothesis validation",
  "Probabilistic positioning with aftermath simulation",
  "Portfolio-wide regime detection",
  "Unlimited assets and watchlists",
];

export default function PricingPage() {
  const navigate = useNavigate();

  useEffect(() => {
    document.title = "Pricing | Entropy — Founding access";
    const meta = document.querySelector('meta[name="description"]');
    if (meta) meta.setAttribute("content", "Founding access to Entropy. Full institutional-grade market intelligence, quantitative risk analytics, and probabilistic scenario systems.");
  }, []);

  return (
    <div className="min-h-screen bg-white text-ink">
      <PublicNav />

      <PageHeader
        label="Pricing"
        title={
          <>
            One tier.
            <br />
            <span className="text-white/40">Everything included.</span>
          </>
        }
        lede="Full institutional intelligence during the founding period. Founding members keep founding terms permanently once paid tiers launch."
      />

      <main className="max-w-6xl mx-auto px-5 sm:px-6 py-16 sm:py-24">
        <div className="grid grid-cols-1 lg:grid-cols-2 border border-ink/[0.09] rounded-xl overflow-hidden">
          {/* Plan identity */}
          <div className="bg-ink text-white p-8 sm:p-12 relative overflow-hidden">
            <div className="absolute inset-0 ink-grid grid-vignette" aria-hidden="true" />
            <div className="relative">
              <p className="mkt-label text-[9px] text-capital-soft mb-6">Founding membership</p>
              <div className="flex items-baseline gap-3">
                <span className="text-5xl sm:text-6xl font-bold tracking-tight">Free</span>
                <span className="mkt-label text-[9px] text-white/40">during founding</span>
              </div>
              <p className="text-[14px] text-white/55 leading-relaxed mt-6 max-w-sm">
                Early-access terms. Pricing increases at general availability —
                founding members are grandfathered for life.
              </p>
              <div className="mt-10">
                <InkButton dark onClick={() => navigate("/dashboard")} className="w-full sm:w-auto">
                  Get founding access <ArrowRight className="h-4 w-4" />
                </InkButton>
              </div>
              <p className="mkt-label text-[9px] text-white/30 mt-5">
                No credit card · Google or email sign-in · 30-second setup
              </p>
            </div>
          </div>

          {/* Inclusions */}
          <div className="p-8 sm:p-12">
            <p className="mkt-label text-[9px] text-ink/40 mb-6">Included capability</p>
            <ul className="grid grid-cols-1 gap-0 border-t border-ink/[0.07]">
              {FEATURES.map((f) => (
                <li key={f} className="flex items-center gap-3.5 py-3.5 border-b border-ink/[0.07] text-[13.5px] tracking-tight text-ink/70">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full border border-ink/15 flex-shrink-0">
                    <Check className="h-3 w-3 text-ink/60" strokeWidth={2.25} />
                  </span>
                  {f}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <p className="text-center mkt-label text-[9px] text-ink/35 mt-10">
          No feature restrictions · No usage walls · Cancel anytime — it is free
        </p>
      </main>

      <SiteFooter />
    </div>
  );
}
