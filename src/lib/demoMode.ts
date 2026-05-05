import { useEffect, useState, useCallback } from "react";
import type { PortfolioStock } from "@/components/PortfolioPanel";

/**
 * Demo Mode — frozen institutional showcase snapshot.
 *
 * Persisted in localStorage. When ON, every module receives a curated,
 * deterministic set of fully-analyzed positions so the terminal renders
 * fully-populated for investors / first-time viewers without firing any
 * backend calls.
 */

export const DEMO_FLAG_KEY = "entropy_demo_v1";
const DEMO_EVENT = "entropy:demo-changed";

export function isDemoOn(): boolean {
  try {
    return localStorage.getItem(DEMO_FLAG_KEY) === "1";
  } catch {
    return false;
  }
}

export function setDemoOn(on: boolean) {
  try {
    if (on) localStorage.setItem(DEMO_FLAG_KEY, "1");
    else localStorage.removeItem(DEMO_FLAG_KEY);
  } catch {}
  window.dispatchEvent(new CustomEvent(DEMO_EVENT, { detail: on }));
}

export function useDemoMode() {
  const [on, setOn] = useState<boolean>(() => isDemoOn());
  useEffect(() => {
    const handler = (e: Event) => setOn(!!(e as CustomEvent).detail);
    const storage = (e: StorageEvent) => {
      if (e.key === DEMO_FLAG_KEY) setOn(isDemoOn());
    };
    window.addEventListener(DEMO_EVENT, handler);
    window.addEventListener("storage", storage);
    return () => {
      window.removeEventListener(DEMO_EVENT, handler);
      window.removeEventListener("storage", storage);
    };
  }, []);
  const toggle = useCallback(() => setDemoOn(!isDemoOn()), []);
  return { on, toggle, set: setDemoOn };
}

/**
 * Build a single frozen analysis object that satisfies the dashboard
 * panes (StockSummary, MonteCarloChart, NewsImpactTable, SimulationTable,
 * Recommendation, RiskIndicator) and the downstream modules that read
 * `stock.analysis.*` (Risk, Fortress, Desirable, Sandbox, Augment, Brief).
 */
function makeAnalysis(opts: {
  ticker: string;
  currentPrice: number;
  buyPrice: number;
  quantity: number;
  currency: string;
  riskLevel: "Low" | "Medium" | "High";
  suggestion: "Buy" | "Hold" | "Sell";
  confidence: number;
  bull: [number, number];
  neutral: [number, number];
  bear: [number, number];
  summary: string;
  keyRisks: string[];
  sentiment: number;
  pressure: number;
  momentum: number;
  volatility: number;
  regime: string;
  news: Array<{
    headline: string;
    category: "Company" | "Macro" | "Sector" | "Competitor";
    sentiment: number;
    shortTermImpact: number;
    longTermImpact: number;
    confidence: number;
    explanation: string;
  }>;
}) {
  return {
    ticker: opts.ticker,
    currentPrice: opts.currentPrice,
    buyPrice: opts.buyPrice,
    quantity: opts.quantity,
    currency: opts.currency,
    riskLevel: opts.riskLevel,
    suggestion: opts.suggestion,
    confidence: opts.confidence,
    confidenceReasoning:
      "Composite score across momentum, flow, sentiment, and regime alignment. Demo snapshot.",
    bullRange: opts.bull,
    neutralRange: opts.neutral,
    bearRange: opts.bear,
    summary: opts.summary,
    keyRisks: opts.keyRisks,
    macroFactors: ["Rates", "USD", "Crude", "Liquidity", "Earnings", "Geopolitics"],
    overallSentiment: opts.sentiment,
    totalPressure: opts.pressure,
    momentum: opts.momentum,
    volatility: opts.volatility,
    sentiment: opts.sentiment / 100,
    regime: opts.regime,
    news: opts.news,
    verdict: opts.suggestion,
    hedgeStrategy:
      opts.riskLevel === "High"
        ? "Pair with 0.3% PUT collar, 30D, 5% OTM"
        : "Vol-targeted exposure, rebalance weekly",
    analyzedAt: new Date("2026-05-05T09:30:00Z").toISOString(),
  };
}

let cached: PortfolioStock[] | null = null;

export function getDemoStocks(): PortfolioStock[] {
  if (cached) return cached;
  cached = [
    {
      id: "demo-aapl",
      ticker: "AAPL",
      buyPrice: 178.42,
      quantity: 120,
      isLoading: false,
      createdAt: "2026-04-12T14:00:00Z",
      analysis: makeAnalysis({
        ticker: "AAPL",
        currentPrice: 214.86,
        buyPrice: 178.42,
        quantity: 120,
        currency: "USD",
        riskLevel: "Low",
        suggestion: "Hold",
        confidence: 78,
        bull: [225, 248],
        neutral: [205, 225],
        bear: [185, 205],
        sentiment: 64,
        pressure: 2.4,
        momentum: 0.62,
        volatility: 0.21,
        regime: "risk-on",
        summary:
          "Apple holds upper band of fair value. Services margin expansion + iPhone 17 cycle support hold. Watch China demand and DOJ headlines.",
        keyRisks: [
          "China consumer softness drags Greater China revenue",
          "DOJ antitrust overhang on App Store economics",
          "USD strength compresses reported revenue",
        ],
        news: [
          { headline: "Apple Services revenue tops $26B, gross margin at record 74%", category: "Company", sentiment: 78, shortTermImpact: 1.8, longTermImpact: 3.4, confidence: 88, explanation: "Services scale offsets hardware cyclicality, supports multiple expansion." },
          { headline: "Fed signals two cuts before year-end", category: "Macro", sentiment: 55, shortTermImpact: 1.1, longTermImpact: 2.0, confidence: 72, explanation: "Lower discount rate lifts long-duration mega-cap multiples." },
          { headline: "Smartphone TAM softens in Greater China — IDC", category: "Sector", sentiment: -22, shortTermImpact: -0.8, longTermImpact: -1.4, confidence: 68, explanation: "Regional demand pressure on iPhone units in H2." },
        ],
      }),
    },
    {
      id: "demo-nvda",
      ticker: "NVDA",
      buyPrice: 612.30,
      quantity: 40,
      isLoading: false,
      createdAt: "2026-03-02T15:30:00Z",
      analysis: makeAnalysis({
        ticker: "NVDA",
        currentPrice: 1184.55,
        buyPrice: 612.30,
        quantity: 40,
        currency: "USD",
        riskLevel: "High",
        suggestion: "Hold",
        confidence: 71,
        bull: [1280, 1450],
        neutral: [1100, 1280],
        bear: [880, 1100],
        sentiment: 71,
        pressure: 4.6,
        momentum: 0.84,
        volatility: 0.48,
        regime: "momentum",
        summary:
          "NVDA remains the AI capex beneficiary. Blackwell cycle + sovereign demand intact. Position is concentrated — trim into strength, hold core.",
        keyRisks: [
          "Hyperscaler digestion phase post Q3",
          "China export-control tightening",
          "Concentration risk: single-name >25% of growth sleeve",
        ],
        news: [
          { headline: "Microsoft, Meta reaffirm 2026 AI capex above $90B each", category: "Sector", sentiment: 82, shortTermImpact: 3.1, longTermImpact: 4.2, confidence: 86, explanation: "Demand visibility extends through CY26 for Blackwell + Rubin." },
          { headline: "BIS weighs new H20 export restrictions", category: "Macro", sentiment: -45, shortTermImpact: -2.4, longTermImpact: -1.6, confidence: 64, explanation: "China revenue at risk; partially priced in." },
          { headline: "AMD MI350 ramp slips one quarter", category: "Competitor", sentiment: 38, shortTermImpact: 1.2, longTermImpact: 0.8, confidence: 70, explanation: "Competitive window stays open longer for NVDA." },
        ],
      }),
    },
    {
      id: "demo-reliance",
      ticker: "RELIANCE.NS",
      buyPrice: 2480,
      quantity: 200,
      isLoading: false,
      createdAt: "2026-02-18T05:00:00Z",
      analysis: makeAnalysis({
        ticker: "RELIANCE.NS",
        currentPrice: 2912.40,
        buyPrice: 2480,
        quantity: 200,
        currency: "INR",
        riskLevel: "Medium",
        suggestion: "Buy",
        confidence: 74,
        bull: [3150, 3380],
        neutral: [2820, 3100],
        bear: [2550, 2820],
        sentiment: 58,
        pressure: 2.1,
        momentum: 0.48,
        volatility: 0.27,
        regime: "rotation-into-india",
        summary:
          "Jio ARPU expansion + Retail SSSG re-acceleration justify a tactical add. Refining margins remain the swing factor.",
        keyRisks: [
          "GRMs compress on OPEC+ supply add",
          "SEBI scrutiny on group-co transactions",
          "INR weakness on import bill",
        ],
        news: [
          { headline: "Jio crosses 500M subs, ARPU at ₹208", category: "Company", sentiment: 72, shortTermImpact: 2.0, longTermImpact: 3.6, confidence: 84, explanation: "Telecom segment rerates on density + tariff hike." },
          { headline: "RBI maintains repo at 6.50%, dovish tilt", category: "Macro", sentiment: 48, shortTermImpact: 1.0, longTermImpact: 1.8, confidence: 76, explanation: "Supportive for capex-heavy conglomerates." },
          { headline: "Brent slides 6% on OPEC+ supply hike", category: "Sector", sentiment: 30, shortTermImpact: 1.1, longTermImpact: 2.4, confidence: 70, explanation: "Lower feedstock cost, refining margin watch." },
        ],
      }),
    },
    {
      id: "demo-btc",
      ticker: "BTC-USD",
      buyPrice: 64200,
      quantity: 0.85,
      isLoading: false,
      createdAt: "2026-01-20T12:00:00Z",
      analysis: makeAnalysis({
        ticker: "BTC-USD",
        currentPrice: 96420,
        buyPrice: 64200,
        quantity: 0.85,
        currency: "USD",
        riskLevel: "High",
        suggestion: "Hold",
        confidence: 66,
        bull: [108000, 124000],
        neutral: [88000, 108000],
        bear: [72000, 88000],
        sentiment: 62,
        pressure: 3.2,
        momentum: 0.71,
        volatility: 0.62,
        regime: "risk-on",
        summary:
          "Spot ETF flows remain net positive 4 of last 5 weeks. Halving supply shock fully digested; macro liquidity is the next driver.",
        keyRisks: [
          "ETF outflow week if DXY breaks 107",
          "Regulatory headlines around stablecoin reserves",
          "Realized vol expansion reduces Sharpe",
        ],
        news: [
          { headline: "Spot BTC ETFs net +$1.4B inflow this week", category: "Sector", sentiment: 80, shortTermImpact: 3.4, longTermImpact: 2.1, confidence: 82, explanation: "Persistent allocator demand from RIAs + family offices." },
          { headline: "DXY rebounds to 105.6 on hot CPI print", category: "Macro", sentiment: -28, shortTermImpact: -1.4, longTermImpact: -0.6, confidence: 66, explanation: "Strong dollar typically headwind for BTC short-term." },
        ],
      }),
    },
    {
      id: "demo-tsla",
      ticker: "TSLA",
      buyPrice: 248.10,
      quantity: 60,
      isLoading: false,
      createdAt: "2026-04-01T19:00:00Z",
      analysis: makeAnalysis({
        ticker: "TSLA",
        currentPrice: 232.74,
        buyPrice: 248.10,
        quantity: 60,
        currency: "USD",
        riskLevel: "High",
        suggestion: "Sell",
        confidence: 69,
        bull: [260, 295],
        neutral: [225, 260],
        bear: [180, 225],
        sentiment: -18,
        pressure: -1.6,
        momentum: -0.32,
        volatility: 0.55,
        regime: "deleveraging",
        summary:
          "Delivery growth has stalled and ASPs are still under pressure. Robotaxi optionality keeps the bull case alive but not at 70x earnings.",
        keyRisks: [
          "China BYD price war compresses gross margin",
          "Robotaxi launch slips beyond 2026",
          "Insider selling resumes after lock-up",
        ],
        news: [
          { headline: "BYD undercuts Model Y in three EU markets", category: "Competitor", sentiment: -52, shortTermImpact: -2.6, longTermImpact: -2.0, confidence: 78, explanation: "Direct margin pressure on the volume SKU." },
          { headline: "Tesla cuts Shanghai output 15% in May", category: "Company", sentiment: -38, shortTermImpact: -1.8, longTermImpact: -1.0, confidence: 72, explanation: "Demand-side cut, not supply constraint." },
        ],
      }),
    },
  ];
  return cached;
}

export const DEMO_TICKERS = ["AAPL", "NVDA", "RELIANCE.NS", "BTC-USD", "TSLA"];
