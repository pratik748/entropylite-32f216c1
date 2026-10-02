/**
 * SASHA (Structural Analysis & Synthesis Heuristic Agent)
 * 
 * Institutional Quantitative Voice Copilot Architecture
 * Defines intent models, mathematical calculation contracts, visual HUD state, and tool definitions.
 */

import type { PortfolioStock } from "@/components/PortfolioPanel";

export type SashaState = 
  | "dormant"       // Voice activation listening passively for "Hey Sasha"
  | "listening"     // Active speech input stream
  | "computing"     // Executing quantitative models / API synthesis
  | "speaking"      // Transmitting audio response
  | "error";        // Execution fault

export type SashaIntentType =
  | "PORTFOLIO_SUBSET_RISK"       // "Analyze my tech holdings", "Stress test my banking subset"
  | "STOCK_COMPARISON_PAIRS"      // "Compare NVDA vs AMD", "Is Reliance cointegrated with Nifty?"
  | "CAUSAL_SCENARIO_STRESS"      // "What if oil spikes 15%?", "Stress test a 5% market drop"
  | "RAW_NEWS_VERACITY"           // "Is the news on Apple noise or signal?", "What's moving energy?"
  | "OPPORTUNITY_ALPHA_SCAN"      // "Find me the highest edge setup today", "Where is the best asymmetric risk?"
  | "POSITION_AUDIT"              // "How is my Tesla position doing?", "Should I trim my winners?"
  | "GENERAL_QUANT_QUERY";        // Arbitrary macro / structural inquiry

export interface SashaSubsetMetrics {
  title: string;
  tickers: string[];
  totalValue: number;
  weightInPortfolio: number;      // e.g. 0.58 (58%)
  annualizedVol: number;          // e.g. 0.245 (24.5%)
  var95_1d: number;               // 1-day Value at Risk (currency)
  var95_1d_pct: number;           // VaR as % of subset value
  cvar95_1d: number;              // Expected Shortfall (currency)
  sharpeRatio: number;
  maxDrawdown: number;
  topRiskContributor: {
    ticker: string;
    riskSharePct: number;         // e.g. 62%
    marginalVaR: number;
  };
  clankWarnings: Array<{
    ticker: string;
    dimension: string;
    severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
    note: string;
  }>;
}

export interface SashaPairsMetrics {
  tickerA: string;
  tickerB: string;
  correlation: number;            // Pearson r (-1 to +1)
  beta: number;                   // Slope of regression A on B
  alpha: number;                  // Intercept annualized
  spreadZScore: number;           // Current deviation from cointegrated mean (std devs)
  isCointegrated: boolean;        // Engle-Granger p-value < 0.05
  cointegrationPValue: number;
  halfLifeDays: number;           // Mean-reversion speed in days
  relativeMomentum: {
    leader: string;
    laggard: string;
    gapPct: number;
  };
  verdict: "A_OVERVALUED_VS_B" | "B_OVERVALUED_VS_A" | "FAIR_VALUE" | "DIVERGING_BREAK";
  verdictRationale: string;
}

export interface SashaScenarioImpact {
  scenarioName: string;
  shockDescription: string;
  estimatedPortfolioPnL: number;
  estimatedPortfolioPnLPct: number;
  mostVulnerableAsset: {
    ticker: string;
    estimatedDropPct: number;
    transmissionReason: string;
  };
  mostResilientAsset: {
    ticker: string;
    estimatedPnLPct: number;
    transmissionReason: string;
  };
  recommendedHedge: string;
}

export interface SashaNewsVeracityAnalysis {
  tickerOrTopic: string;
  veracityScore: number;          // 0-100 (promotional noise vs. verified institutional signal)
  consensusSentiment: "BULLISH" | "BEARISH" | "NEUTRAL" | "HIGH_NOISE";
  narrativeVelocity: number;      // 0-100
  divergenceFromPriceAction: string;
  firstOrderImpact: string;
  secondOrderConsequence: string;
  keyCatalystDate?: string;
}

export interface SashaExecutionReceipt {
  step: string;
  durationMs: number;
  source: "quant_engine" | "live_feed" | "clank_layer" | "math_kernel" | "llm_synthesis";
  proof: string;
}

export interface SashaResponse {
  query: string;
  intent: SashaIntentType;
  spokenSummary: string;          // Ultra-concise institutional voice punchline (1-2 sentences)
  fullTechnicalReport?: string;   // Optional detailed mathematical breakdown
  executionReceipts: SashaExecutionReceipt[];
  cards: {
    subsetRisk?: SashaSubsetMetrics;
    pairsCompare?: SashaPairsMetrics;
    scenarioStress?: SashaScenarioImpact;
    newsVeracity?: SashaNewsVeracityAnalysis;
  };
  actionSuggestions: Array<{
    label: string;
    actionType: "NAVIGATE" | "OPEN_WORKSTATION" | "DIRECT_PROFIT" | "EXECUTE_REBALANCE";
    payload?: any;
  }>;
}
