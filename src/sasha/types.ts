/**
 * SASHA (Structural Analysis & Synthesis Heuristic Agent)
 * Tier-1 Institutional Voice Quant Copilot Types
 *
 * Core architectural principle: Direct engine orchestration with zero hallucination.
 * Quantitative queries resolve through EntropyLite's real mathematical engines;
 * responses pair a concise 1-2 sentence spoken punchline with a high-density
 * parallel visual card and verified proof-of-work receipts.
 */

import type { PortfolioPosition } from "@/foresight/types";

export type SashaIntentType =
  | "subset_risk"
  | "stock_comparison"
  | "news_impact"
  | "stress_test"
  | "llm_fallback";

export interface SubsetRiskIntent {
  type: "subset_risk";
  rawQuery: string;
  subsetFilter: {
    sector?: string;
    betaThreshold?: "high" | "low";
    pnlStatus?: "gainers" | "losers";
    customTickers?: string[];
  };
  range: "3mo" | "6mo" | "1y" | "2y";
}

export interface StockComparisonIntent {
  type: "stock_comparison";
  rawQuery: string;
  tickerA: string;
  tickerB: string;
  range: "3mo" | "6mo" | "1y" | "2y";
}

export interface NewsImpactIntent {
  type: "news_impact";
  rawQuery: string;
  topicOrSector: string;
  ticker?: string;
}

export interface StressTestIntent {
  type: "stress_test";
  rawQuery: string;
  shockDescription: string;
  marketShockPct?: number;
  commodityShockPct?: { commodity: string; shockPct: number };
  vixShockPct?: number;
  interestRateShockBps?: number;
  benchmark?: string;
}

export interface LLMFallbackIntent {
  type: "llm_fallback";
  rawQuery: string;
}

export type SashaParsedIntent =
  | SubsetRiskIntent
  | StockComparisonIntent
  | NewsImpactIntent
  | StressTestIntent
  | LLMFallbackIntent;

// ── Proof-of-Work Receipt Item ───────────────────────────────────────────────

export interface SashaReceipt {
  id: string;
  label: string;
  elapsedMs: number;
  badge: string;
  status: "success" | "warning" | "neutral";
}

// ── Card Data Models ────────────────────────────────────────────────────────

export interface EulerRiskShare {
  ticker: string;
  weightPct: number;
  volatilityPct: number;
  marginalRiskPct: number;
  eulerRiskSharePct: number;
  sector: string;
}

export interface ClankConstraintFlag {
  id: string;
  label: string;
  severity: "low" | "medium" | "high";
  detail: string;
  metricValue: string;
}

export interface SubsetRiskData {
  subsetName: string;
  count: number;
  tickers: string[];
  weights: number[];
  totalValueBase: number;
  annualizedVolPct: number;
  sharpeRatio: number;
  var95DailyPct: number;
  cvar95DailyPct: number; // 1D Expected Shortfall (CVaR95)
  maxDrawdownPct: number;
  covarianceMatrix: number[][];
  correlationMatrix: number[][];
  eulerRiskShares: EulerRiskShare[];
  dominantRiskTicker: string;
  dominantRiskSharePct: number;
  clankConstraints: ClankConstraintFlag[];
}

export interface CointegrationStats {
  isCointegrated: boolean;
  adfStat: number;
  criticalValues: { p1: number; p5: number; p10: number };
  pValue: number;
  hedgeRatio: number; // Beta (OLS / EG)
  halfLifeDays: number; // Ornstein-Uhlenbeck tau
  spreadZScore: number;
  stationarityConfidencePct: number;
  spreadVerdict: "long_b_short_a" | "long_a_short_b" | "equilibrium";
  spreadVerdictText: string;
}

export interface StockComparisonData {
  tickerA: string;
  tickerB: string;
  nameA: string;
  nameB: string;
  lastPriceA: number;
  lastPriceB: number;
  currencyA: string;
  currencyB: string;
  correlation: number;
  betaRegression: {
    beta: number;
    alphaAnnualPct: number;
    rSquared: number;
  };
  momentum: {
    return1mPctA: number;
    return1mPctB: number;
    return3mPctA: number;
    return3mPctB: number;
    return6mPctA: number;
    return6mPctB: number;
    volatilityAnnualPctA: number;
    volatilityAnnualPctB: number;
  };
  valuationSpread: {
    currentRatio: number;
    meanRatio: number;
    spreadZScore: number;
    percentileRank: number;
  };
  cointegration: CointegrationStats;
  spreadSparkline: number[];
}

export interface NewsImpactItem {
  id: string;
  headline: string;
  source: string;
  timeAgo: string;
  sentiment: "bullish" | "bearish" | "neutral";
  signalStrength: number; // 0 to 1
  noiseRatio: number; // 0 to 1
  veracityScore: number; // 0 to 100
  firstOrderImpact: string;
  secondOrderTransmission: string;
  affectedTickers: string[];
}

export interface NewsImpactData {
  topicOrSector: string;
  sentimentScore: number; // -1 to +1
  signalToNoiseScore: number; // 0 to 100
  veracityScore: number; // 0 to 100
  narrativeDivergencePct: number; // Divergence between velocity & price
  dominantHeadwindOrTailwind: string;
  firstOrderMacro: string;
  secondOrderTransmission: string;
  exposedPositionsInPortfolio: Array<{
    ticker: string;
    exposureWeightPct: number;
    estimatedSensitivity: "high" | "medium" | "low";
  }>;
  articles: NewsImpactItem[];
}

export interface StressAssetImpact {
  ticker: string;
  weightPct: number;
  beta: number;
  shockImpactPct: number;
  lossValueBase: number;
  lossSharePct: number;
}

export interface StressTestData {
  scenarioName: string;
  shockDescription: string;
  totalPortfolioValueBase: number;
  portfolioDrawdownPct: number;
  estimatedLossBase: number;
  worstHitAssets: StressAssetImpact[];
  resilientAssets: StressAssetImpact[];
  resilienceGrade: "Fortress (A)" | "Guarded (B)" | "Exposed (C)" | "Vulnerable (D)";
  rebalanceSuggestion: string;
  recommendedHedge: {
    structure: string;
    targetTicker: string;
    protectionCoveragePct: number;
    estCostBps: number;
  };
}

export interface GeneralQuantData {
  headline: string;
  summary: string;
  metrics: Array<{ label: string; value: string | number; change?: string; tone?: "gain" | "loss" | "neutral" }>;
  breakdown?: Array<{ name: string; sharePct: number; note?: string }>;
}

export type SashaVisualCardType =
  | "subset_risk"
  | "stock_comparison"
  | "news_impact"
  | "stress_test"
  | "general_quant";

export interface SashaResult {
  id: string;
  intent: SashaParsedIntent;
  spokenPunchline: string;
  phoneticSpokenText: string;
  headline: string;
  cardType: SashaVisualCardType;
  cardData:
    | SubsetRiskData
    | StockComparisonData
    | NewsImpactData
    | StressTestData
    | GeneralQuantData;
  executionTimeMs: number;
  receipts: SashaReceipt[];
  source: string;
  facts: Array<{ label: string; value: string | number; unit?: string }>;
  timestamp: number;
}

export type SashaVoiceState =
  | "idle"
  | "listening"
  | "processing"
  | "speaking"
  | "error";

export interface SashaContextValue {
  voiceState: SashaVoiceState;
  isListening: boolean;
  isSpeaking: boolean;
  isWakeWordActive: boolean;
  isVoiceMuted: boolean;
  audioEnergy: number; // 0 to 1 for waveform
  activeResult: SashaResult | null;
  history: SashaResult[];
  isOpen: boolean;
  queryInput: string;
  setQueryInput: (s: string) => void;
  setIsOpen: (b: boolean) => void;
  setWakeWordActive: (b: boolean) => void;
  setVoiceMuted: (b: boolean) => void;
  startListening: () => void;
  stopListening: () => void;
  submitQuery: (query: string) => Promise<SashaResult>;
  cancelSpeech: () => void;
  clearHistory: () => void;
  handleAction: (actionType: "risk_lab" | "workstation" | "fortress" | "screener", payload?: any) => void;
}
