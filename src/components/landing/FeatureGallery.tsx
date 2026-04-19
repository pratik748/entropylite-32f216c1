import { useState } from "react";
import { Globe, Map, Sparkles, ScatterChart, Zap, Shield } from "lucide-react";
import marketsImg from "@/assets/preview-markets.png";
import geopoliticsImg from "@/assets/preview-geopolitics.png";
import desirableImg from "@/assets/preview-desirable.png";
import statarbImg from "@/assets/preview-statarb.png";
import sandboxImg from "@/assets/preview-sandbox.png";
import riskImg from "@/assets/preview-risk.png";

type Tab = {
  id: string;
  label: string;
  icon: typeof Globe;
  title: string;
  desc: string;
  bullets: string[];
  img: string;
  alt: string;
};

const TABS: Tab[] = [
  {
    id: "markets",
    label: "Markets + Geopolitics",
    icon: Globe,
    title: "Global market state, in one quiet view.",
    desc: "Live indices across US, Europe, Asia, and India alongside an intelligence map of conflicts, capital flow, and entropy regime.",
    bullets: [
      "16 global indices with live deltas — S&P, NASDAQ, FTSE, DAX, NIKKEI, NIFTY, SENSEX",
      "VIX fear gauge, FX pairs, commodities, BTC/ETH — all normalized to your base currency",
      "Geopolitical map with active conflict tracking, regime classification, capital-flow direction",
      "Intel feed with confidence-scored events: South China Sea, Russia-Ukraine, US-China trade",
    ],
    img: marketsImg,
    alt: "Entropy Lite Markets module showing live global indices, VIX, FX, commodities and crypto",
  },
  {
    id: "geo",
    label: "Geopolitics",
    icon: Map,
    title: "God's Eye intelligence map.",
    desc: "Conflicts, exposures, and regime shifts plotted on a live world map with severity-weighted intel feed.",
    bullets: [
      "Global Risk Index (75/100 CRITICAL) with regime, capital flow, entropy, and conflict counters",
      "Map markers sized by event severity and currency-impact percentage",
      "Auto-refreshing intel feed with confidence scores per event",
      "Exposed-position flagging when a holding sits in a hot zone",
    ],
    img: geopoliticsImg,
    alt: "Entropy Lite Geopolitics map showing live conflicts, regime, capital flow and intel feed",
  },
  {
    id: "desirable",
    label: "Desirable Assets",
    icon: Sparkles,
    title: "Quant-validated discovery funnel.",
    desc: "Four-stage pipeline — AI candidates → price verify → quant filter → Monte Carlo stress — surfaces only assets that pass every gate.",
    bullets: [
      "Top picks ranked by Q-score, Sharpe ratio, max drawdown, volatility, and Z-score",
      "Per-asset thesis, momentum tag, sentiment, and earnings posture",
      "Quant Max Profit projection with confidence and methodology (drift + resistance + Fibonacci)",
      "Market regime assessment recalibrates picks — bullish, bearish, risk-on, risk-off",
    ],
    img: desirableImg,
    alt: "Entropy Lite Desirable Assets showing CHTR Q70 and IMVT Q67 with Sharpe, MaxDD, Vol, Z-score",
  },
  {
    id: "statarb",
    label: "Stat Arb",
    icon: ScatterChart,
    title: "Pure quantitative math, on your portfolio.",
    desc: "GBM normalized returns, GARCH(1,1) volatility, HMM regime detection, and Markowitz optimization — across every asset you hold.",
    bullets: [
      "Portfolio-wide normalized return paths with portfolio composite overlay",
      "Per-asset price, weight, annualized vol, drift, beta, and live P&L",
      "Eleven sub-modules: Price Dynamics, Optimization, Factor Model, Liquidity, Stress Test, Foresight",
      "HMM regime detection running continuously to flag bull/bear/transition windows",
    ],
    img: statarbImg,
    alt: "Entropy Lite Stat Arb showing GBM normalized returns chart and portfolio-wide quant table",
  },
  {
    id: "sandbox",
    label: "Sandbox",
    icon: Zap,
    title: "Prediction + Aftermath engine.",
    desc: "Thirteen modules to generate strategies, run 10K-path simulations, model causal cascades, and remember every scar.",
    bullets: [
      "Strategy Lab generates exact BUY/SELL plans calibrated to current regime, VIX, and mood",
      "Causal Effects Engine models 1st, 2nd, and 3rd order market reactions before you commit capital",
      "Aftermath Matrix simulates your own market impact — slippage, depth absorption, signal leakage",
      "Scar Memory + Outcome Gradient continuously bias the AI toward what works for you",
    ],
    img: sandboxImg,
    alt: "Entropy Lite Sandbox showing 13 simulation modules with live regime, VIX, mood, and conditions",
  },
  {
    id: "risk",
    label: "Risk + Hedging",
    icon: Shield,
    title: "Institutional risk math, with action.",
    desc: "VaR and CVaR at 95/99, liquidity-adjusted VaR, HHI concentration, AI-identified risks — and a hedging plan you can execute.",
    bullets: [
      "Five live risk metrics: VaR 95/99, CVaR 95/99, Liquidity-adjusted VaR — all in your base currency",
      "Portfolio Risk Score, HHI concentration index, regime-aware recalibration",
      "AI-identified top risks: sector valuation, FX exposure, liquidity mismatch, regulatory regime",
      "AI hedging recommendations with exact instruments — put spread collars, VIX calls, USDINR puts",
    ],
    img: riskImg,
    alt: "Entropy Lite Risk module showing VaR, CVaR, Liquidity VaR, AI-identified risks and hedging recommendations",
  },
];

export default function FeatureGallery() {
  const [active, setActive] = useState(TABS[0].id);
  const tab = TABS.find((t) => t.id === active) ?? TABS[0];

  return (
    <section className="border-t border-black/5 bg-black/[0.015]">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-14 sm:py-20">
        <div className="text-center mb-8 sm:mb-12">
          <p className="font-mono text-[10px] tracking-[0.3em] uppercase text-black/40 mb-3">Inside the terminal</p>
          <h2 className="text-2xl sm:text-4xl font-bold tracking-tight mb-3">
            Six core surfaces. Real screens. Real data.
          </h2>
          <p className="text-sm sm:text-base text-black/55 max-w-2xl mx-auto">
            Each tab is a live capture from the running terminal — no mockups, no marketing renders.
          </p>
        </div>

        {/* Tab strip */}
        <div className="flex flex-wrap justify-center gap-1.5 sm:gap-2 mb-6 sm:mb-8">
          {TABS.map((t) => {
            const Icon = t.icon;
            const isActive = t.id === active;
            return (
              <button
                key={t.id}
                onClick={() => setActive(t.id)}
                className={`inline-flex items-center gap-1.5 px-3 sm:px-4 h-9 rounded-full font-mono text-[10px] sm:text-xs tracking-wide transition-all border ${
                  isActive
                    ? "bg-black text-white border-black shadow-sm"
                    : "bg-white text-black/60 border-black/10 hover:border-black/30 hover:text-black"
                }`}
                aria-pressed={isActive}
              >
                <Icon className="h-3.5 w-3.5" />
                {t.label}
              </button>
            );
          })}
        </div>

        {/* Active panel */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6 sm:gap-8 items-start">
          <figure className="lg:col-span-3 rounded-xl overflow-hidden border border-black/10 shadow-2xl shadow-black/15 bg-white">
            <img
              key={tab.id}
              src={tab.img}
              alt={tab.alt}
              loading="lazy"
              width={1536}
              height={864}
              className="w-full h-auto block animate-fade-in"
            />
          </figure>

          <div className="lg:col-span-2 lg:pl-2">
            <p className="font-mono text-[10px] tracking-[0.25em] uppercase text-black/40 mb-3">{tab.label}</p>
            <h3 className="text-xl sm:text-2xl font-bold tracking-tight mb-3 leading-tight">{tab.title}</h3>
            <p className="text-sm sm:text-base text-black/60 leading-relaxed mb-5">{tab.desc}</p>
            <ul className="space-y-2.5">
              {tab.bullets.map((b, i) => (
                <li key={i} className="flex gap-3 text-sm text-black/70 leading-snug">
                  <span className="font-mono text-[10px] text-black/30 mt-1 flex-shrink-0">— {String(i + 1).padStart(2, "0")}</span>
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
