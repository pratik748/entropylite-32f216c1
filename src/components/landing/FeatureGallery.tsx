import { useState, useEffect } from "react";
import marketsImg from "@/assets/preview-markets.webp";
import geopoliticsImg from "@/assets/preview-geopolitics.webp";
import desirableImg from "@/assets/preview-desirable.webp";
import statarbImg from "@/assets/preview-statarb.webp";
import sandboxImg from "@/assets/preview-sandbox.webp";
import riskImg from "@/assets/preview-risk.webp";

type Tab = {
  id: string;
  label: string;
  title: string;
  desc: string;
  bullets: string[];
  img: string;
  alt: string;
};

const TABS: Tab[] = [
  {
    id: "markets",
    label: "Markets",
    title: "Global market state, in one quiet view.",
    desc: "Live indices across US, Europe, Asia, and India alongside an intelligence map of conflicts, capital flow, and entropy regime.",
    bullets: [
      "16 global indices with live deltas: S&P, NASDAQ, FTSE, DAX, NIKKEI, NIFTY, SENSEX",
      "VIX fear gauge, FX pairs, commodities, BTC and ETH, all normalised to your base currency",
      "Geopolitical map with active conflict tracking, regime classification, capital-flow direction",
      "Intel feed with confidence-scored events across theatres and trade corridors",
    ],
    img: marketsImg,
    alt: "Entropy Markets module showing live global indices, VIX, FX, commodities and crypto",
  },
  {
    id: "geo",
    label: "Geopolitics",
    title: "An intelligence map of the world.",
    desc: "Conflicts, exposures, and regime shifts plotted on a live world map with severity-weighted intel feed.",
    bullets: [
      "Global Risk Index with regime, capital flow, entropy, and conflict counters",
      "Map markers sized by event severity and currency-impact percentage",
      "Auto-refreshing intel feed with confidence scores per event",
      "Exposed-position flagging when a holding sits in a hot zone",
    ],
    img: geopoliticsImg,
    alt: "Entropy Geopolitics map showing live conflicts, regime, capital flow and intel feed",
  },
  {
    id: "desirable",
    label: "Discovery",
    title: "Quant-validated discovery funnel.",
    desc: "Four-stage pipeline: candidate generation, price verification, quant filter, Monte Carlo stress. Only assets that pass every gate are shown.",
    bullets: [
      "Top picks ranked by Q-score, Sharpe ratio, max drawdown, volatility, and Z-score",
      "Per-asset thesis, momentum tag, sentiment, and earnings posture",
      "Max-profit projection with confidence and stated methodology",
      "Market-regime assessment recalibrates picks: bullish, bearish, risk-on, risk-off",
    ],
    img: desirableImg,
    alt: "Entropy Desirable Assets showing ranked candidates with Sharpe, MaxDD, Vol, Z-score",
  },
  {
    id: "statarb",
    label: "Stat Arb",
    title: "Pure quantitative math, on your portfolio.",
    desc: "GBM-normalised returns, GARCH(1,1) volatility, HMM regime detection and Markowitz optimisation, across every asset you hold.",
    bullets: [
      "Portfolio-wide normalised return paths with portfolio composite overlay",
      "Per-asset price, weight, annualised vol, drift, beta and live P&L",
      "Eleven sub-modules: price dynamics, optimization, factor model, liquidity, stress test, foresight",
      "HMM regime detection running continuously to flag bull, bear and transition windows",
    ],
    img: statarbImg,
    alt: "Entropy Stat Arb showing GBM normalized returns chart and portfolio-wide quant table",
  },
  {
    id: "sandbox",
    label: "Sandbox",
    title: "Prediction and aftermath engine.",
    desc: "Thirteen modules that generate strategies, run 10,000-path simulations, model causal cascades and record every outcome.",
    bullets: [
      "Strategy Lab generates exact entry and exit plans calibrated to current regime, VIX, and conditions",
      "Causal Effects engine models first-, second-, and third-order market reactions pre-trade",
      "Aftermath Matrix simulates your own market impact: slippage, depth absorption, signal leakage",
      "Scar Memory and Outcome Gradient continuously bias the models toward what works for you",
    ],
    img: sandboxImg,
    alt: "Entropy Sandbox showing 13 simulation modules with live regime, VIX and conditions",
  },
  {
    id: "risk",
    label: "Risk",
    title: "Institutional risk math, with action.",
    desc: "VaR and CVaR at 95 and 99, liquidity-adjusted VaR, HHI concentration, identified structural risks, and an executable hedging plan.",
    bullets: [
      "Five live risk metrics: VaR 95 and 99, CVaR 95 and 99, liquidity-adjusted VaR — all in your base currency",
      "Portfolio risk score, HHI concentration index, regime-aware recalibration",
      "Identified top risks: sector valuation, FX exposure, liquidity mismatch, regulatory regime",
      "Hedging recommendations with exact instruments: put-spread collars, VIX calls, FX puts",
    ],
    img: riskImg,
    alt: "Entropy Risk module showing VaR, CVaR, liquidity VaR, identified risks and hedging recommendations",
  },
];

export default function FeatureGallery() {
  const [active, setActive] = useState(TABS[0].id);
  const tab = TABS.find((t) => t.id === active) ?? TABS[0];

  // Prefetch the rest after first paint so tab-switch feels instant
  useEffect(() => {
    const idle = (cb: () => void) =>
      ("requestIdleCallback" in window
        ? (window as any).requestIdleCallback(cb, { timeout: 1500 })
        : setTimeout(cb, 600));
    idle(() => {
      TABS.forEach((t) => {
        const img = new Image();
        img.decoding = "async";
        img.src = t.img;
      });
    });
  }, []);

  return (
    <section className="bg-carbon-950">
      <div className="max-w-7xl mx-auto px-5 sm:px-8 py-20 sm:py-28">
        <div className="mb-12">
          <div className="flex items-center gap-3 mb-6">
            <span className="mkt-label text-[10px] text-white/30">04</span>
            <span className="h-px w-8 bg-hairline-strong" />
            <span className="mkt-label text-[10px] text-white/55">Inside the terminal</span>
          </div>
          <h2 className="mkt-display-2 text-white">
            Six core surfaces.
            <br />
            <span className="text-white/40">Real screens, real data.</span>
          </h2>
          <p className="mkt-lede mt-5 max-w-2xl text-white/50">
            Each capture below is taken from the running terminal. No mockups,
            no marketing renders.
          </p>
        </div>

        {/* Tab rail */}
        <div className="flex overflow-x-auto scrollbar-hide border-b border-hairline mb-10">
          {TABS.map((t) => {
            const isActive = t.id === active;
            return (
              <button
                key={t.id}
                onClick={() => setActive(t.id)}
                className={`relative shrink-0 px-5 h-11 text-[12.5px] tracking-tight transition-colors duration-150 ease-out ${
                  isActive ? "text-white font-medium" : "text-white/45 hover:text-white/80"
                }`}
                aria-pressed={isActive}
              >
                {t.label}
                {isActive && <span className="absolute bottom-0 left-0 right-0 h-px bg-white" />}
              </button>
            );
          })}
        </div>

        {/* Active panel */}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-8 sm:gap-10 items-start">
          <figure className="lg:col-span-3 border border-hairline bg-carbon-900">
            <div className="flex items-center justify-between px-4 h-8 border-b border-hairline-faint">
              <span className="mkt-label text-[9px] text-white/40">{tab.label} · Terminal capture</span>
              <span className="mkt-num text-[9px] text-white/25">1600 × 900</span>
            </div>
            <img
              key={tab.id}
              src={tab.img}
              alt={tab.alt}
              loading="eager"
              fetchPriority="high"
              decoding="async"
              width={1600}
              height={900}
              className="w-full h-auto block mkt-reveal"
            />
          </figure>

          <div className="lg:col-span-2 lg:pl-2">
            <p className="mkt-label text-[10px] text-white/35 mb-4">{tab.label}</p>
            <h3 className="text-xl sm:text-2xl font-semibold tracking-tight mb-3 leading-tight text-white">{tab.title}</h3>
            <p className="text-[13.5px] text-white/50 leading-relaxed mb-6">{tab.desc}</p>
            <ul className="border-t border-hairline">
              {tab.bullets.map((b, i) => (
                <li key={i} className="flex gap-4 text-[12.5px] text-white/60 leading-relaxed py-3 border-b border-hairline">
                  <span className="mkt-label text-[9px] text-white/25 mt-1 flex-shrink-0">{String(i + 1).padStart(2, "0")}</span>
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
