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
    <div className="site-public min-h-screen bg-carbon-950 text-white">
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

      <main className="max-w-7xl mx-auto px-5 sm:px-8 py-16 sm:py-24">
        <div className="grid grid-cols-1 lg:grid-cols-2 border border-hairline">
          {/* Plan identity */}
          <div className="bg-carbon-900 p-8 sm:p-12 lg:border-r border-hairline max-lg:border-b">
            <p className="mkt-label text-[10px] text-white/55 mb-6">Founding membership</p>
            <div className="flex items-baseline gap-3">
              <span className="mkt-num text-5xl sm:text-6xl text-white">0.00</span>
              <span className="mkt-label text-[9px] text-white/35">USD / month · founding period</span>
            </div>
            <p className="text-[13.5px] text-white/50 leading-relaxed mt-6 max-w-sm">
              Early-access terms. Pricing increases at general availability —
              founding members are grandfathered for life.
            </p>
            <div className="mt-10">
              <InkButton onClick={() => navigate("/dashboard")} className="w-full sm:w-auto">
                Get founding access <ArrowRight className="h-4 w-4" />
              </InkButton>
            </div>
            <p className="mkt-label text-[9px] text-white/25 mt-5">
              No credit card · Google or email sign-in · 30-second setup
            </p>
          </div>

          {/* Inclusions */}
          <div className="p-8 sm:p-12 bg-carbon-950">
            <p className="mkt-label text-[10px] text-white/35 mb-6">Included capability</p>
            <ul className="grid grid-cols-1 gap-0 border-t border-hairline">
              {FEATURES.map((f) => (
                <li key={f} className="flex items-center gap-3.5 py-3.5 border-b border-hairline text-[13px] tracking-tight text-white/65">
                  <Check className="h-3.5 w-3.5 text-white/40 flex-shrink-0" strokeWidth={2} />
                  {f}
                </li>
              ))}
            </ul>
          </div>
        </div>

        <p className="text-center mkt-label text-[9px] text-white/30 mt-10">
          No feature restrictions · No usage walls · Cancel anytime
        </p>
      </main>

      <SiteFooter />
    </div>
  );
}
