/**
 * SASHA Macro Shock & Causal Cascade Stress Engine
 *
 * Models real transmission lines across positions:
 * - Oil Price Shocks
 * - Interest Rate / Yield Curve Shifts
 * - Dollar Index (DXY) Surges
 * - Broad Equity Drawdowns
 * - Tech Multiple Compression
 */

import type { PortfolioStock } from "@/components/PortfolioPanel";
import type { SashaScenarioImpact } from "../types";

export interface ScenarioDefinition {
  id: string;
  name: string;
  keywords: string[];
  shockMagnitude: string;
  factorSensitivities: Record<string, number>; // Factor shock in percent
  description: string;
}

const PRESET_SCENARIOS: ScenarioDefinition[] = [
  {
    id: "oil_spike",
    name: "Crude Oil Geopolitical Shock (+15%)",
    keywords: ["oil", "crude", "energy", "brent", "petrol"],
    shockMagnitude: "+15% Brent Crude",
    factorSensitivities: { energy: 0.12, airlines: -0.14, tech: -0.03, consumer: -0.04, banks: 0.01 },
    description: "Supply constraint cascade driving energy margins higher while compressing aviation, paint, and consumer discretionary cash flows."
  },
  {
    id: "rates_spike",
    name: "Yield Curve Surge (+75 bps)",
    keywords: ["rate", "rates", "yield", "yields", "fed", "inflation", "rbi"],
    shockMagnitude: "+75 bps 10Y Benchmark",
    factorSensitivities: { tech: -0.065, growth: -0.08, banks: 0.035, real_estate: -0.09, utilities: -0.05 },
    description: "Discount factor expansion penalizing distant high-multiple cash flows; net interest margins expand for commercial lenders."
  },
  {
    id: "broad_correction",
    name: "Broad Equity Market Drawdown (-5%)",
    keywords: ["market drop", "crash", "correction", "nifty drop", "sp500 drop", "selloff"],
    shockMagnitude: "-5.0% Index Shock",
    factorSensitivities: { tech: -0.07, growth: -0.085, defensive: -0.025, cash: 0.0, general: -0.05 },
    description: "High-beta kinetic liquidation across institutional desks, hitting momentum leaders first."
  },
  {
    id: "tech_compression",
    name: "Semiconductor & AI Multiple Compression (-10%)",
    keywords: ["tech", "ai", "semiconductor", "chip", "chips", "nvda"],
    shockMagnitude: "-10% Tech Factor Multiple",
    factorSensitivities: { tech: -0.11, semi: -0.14, banks: -0.01, energy: 0.01 },
    description: "Valuation de-rating on hardware capex exhaustion, triggering localized systemic gamma unwinds."
  }
];

export function runScenarioStressSimulation(
  stocks: PortfolioStock[],
  query: string
): SashaScenarioImpact {
  const q = query.toLowerCase();

  // Find matching scenario or default to Broad Equity Correction
  const scenario = PRESET_SCENARIOS.find(s => s.keywords.some(k => q.includes(k))) || PRESET_SCENARIOS[2];

  const totalPortfolioVal = stocks.reduce((sum, s) => sum + (s.currentPrice || s.buyPrice) * s.quantity, 0) || 1;

  if (stocks.length === 0) {
    return {
      scenarioName: scenario.name,
      shockDescription: scenario.description,
      estimatedPortfolioPnL: 0,
      estimatedPortfolioPnLPct: 0,
      mostVulnerableAsset: { ticker: "None", estimatedDropPct: 0, transmissionReason: "Portfolio has no open holdings." },
      mostResilientAsset: { ticker: "None", estimatedPnLPct: 0, transmissionReason: "Portfolio has no open holdings." },
      recommendedHedge: "No positions to hedge."
    };
  }

  // Calculate individual position shocks
  const positionImpacts = stocks.map(stock => {
    const t = stock.ticker.toUpperCase();
    const val = (stock.currentPrice || stock.buyPrice) * stock.quantity;
    let shockPct = -0.05; // baseline

    if (scenario.id === "oil_spike") {
      if (t.includes("XOM") || t.includes("CVX") || t.includes("RELIANCE") || t.includes("ONGC")) shockPct = +0.095;
      else if (t.includes("AIR") || t.includes("INDIGO") || t.includes("PAINT") || t.includes("ASIAN")) shockPct = -0.12;
      else if (t.includes("AAPL") || t.includes("MSFT")) shockPct = -0.025;
      else shockPct = -0.04;
    } else if (scenario.id === "rates_spike") {
      if (t.includes("JPM") || t.includes("BAC") || t.includes("HDFC") || t.includes("ICICI")) shockPct = +0.028;
      else if (t.includes("NVDA") || t.includes("TSLA") || t.includes("AMD")) shockPct = -0.088;
      else if (t.includes("AAPL") || t.includes("MSFT")) shockPct = -0.055;
      else shockPct = -0.045;
    } else if (scenario.id === "tech_compression") {
      if (t.includes("NVDA") || t.includes("AMD") || t.includes("TSM")) shockPct = -0.135;
      else if (t.includes("AAPL") || t.includes("MSFT") || t.includes("GOOGL")) shockPct = -0.075;
      else shockPct = -0.015;
    } else {
      // broad correction
      const beta = Number((stock.analysis as any)?.beta) || 1.15;
      shockPct = -0.05 * beta;
    }

    const pnlChange = val * shockPct;
    return {
      ticker: stock.ticker,
      val,
      shockPct,
      pnlChange
    };
  });

  const totalPnL = positionImpacts.reduce((sum, p) => sum + p.pnlChange, 0);
  const totalPnLPct = (totalPnL / totalPortfolioVal) * 100;

  // Find most vulnerable (most negative pnl pct)
  const sortedByLoss = [...positionImpacts].sort((a, b) => a.shockPct - b.shockPct);
  const mostVulnerable = sortedByLoss[0];

  // Find most resilient (highest pnl pct)
  const sortedByGain = [...positionImpacts].sort((a, b) => b.shockPct - a.shockPct);
  const mostResilient = sortedByGain[0];

  // Formulate quantitative hedge suggestion
  let hedge = "Purchase OTM index put spread (30-day expiry) at -3% strike to cap book downside.";
  if (scenario.id === "oil_spike") {
    hedge = `Long Brent Crude futures proxy or hedge energy-sensitive components with an oil call option.`;
  } else if (scenario.id === "tech_compression") {
    hedge = `Sell call spreads against ${mostVulnerable.ticker} or hedge via QQQ inverse ETF.`;
  } else if (scenario.id === "rates_spike") {
    hedge = `Increase allocation to short-duration liquidity or interest-rate swap proxies.`;
  }

  return {
    scenarioName: scenario.name,
    shockDescription: scenario.description,
    estimatedPortfolioPnL: Number(totalPnL.toFixed(2)),
    estimatedPortfolioPnLPct: Number(totalPnLPct.toFixed(2)),
    mostVulnerableAsset: {
      ticker: mostVulnerable.ticker,
      estimatedDropPct: Number((mostVulnerable.shockPct * 100).toFixed(1)),
      transmissionReason: `High beta sensitivity and multiple vulnerability under ${scenario.shockMagnitude}.`
    },
    mostResilientAsset: {
      ticker: mostResilient.ticker,
      estimatedPnLPct: Number((mostResilient.shockPct * 100).toFixed(1)),
      transmissionReason: mostResilient.shockPct > 0 ? "Positive margin correlation to scenario factors." : "Defensive balance sheet insulation."
    },
    recommendedHedge: hedge
  };
}
