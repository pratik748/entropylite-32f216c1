/**
 * SASHA (Structural Analysis & Synthesis Heuristic Agent)
 * Tier-1 Institutional Quantitative Voice & Terminal Intelligence Types
 *
 * Core architectural principle: Direct mathematical execution with zero hallucination.
 * Quantitative queries resolve through EntropyLite's real mathematical engines;
 * responses pair a concise 1-2 sentence spoken punchline with high-density
 * parallel visual diagrams, interactive SVG DAG causal flowcharts, and verified proof-of-work receipts.
 */

import type { PortfolioPosition } from "@/foresight/types";
import type { GoogleGroundingResult } from "./googleSearchProxy";

export type SashaIntentType =
  | "single_stock"
  | "subset_risk"
  | "stock_comparison"
  | "news_impact"
  | "stress_test"
  | "llm_fallback";

export interface SingleStockIntent {
  type: "single_stock";
  rawQuery: string;
  ticker: string;
  benchmark?: string;
  range?: "1mo" | "3mo" | "6mo" | "1y" | "2y";
}

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
  | SingleStockIntent
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

// ── Causal Transmission DAG ──────────────────────────────────────────────────

export interface CausalDAGNode {
  id: string;
  label: string;
  sublabel?: string;
  stage: "macro" | "transmission" | "sector" | "asset";
  deltaPct?: number;
  deltaValueBase?: number;
  tone: "gain" | "loss" | "neutral";
}

export interface CausalDAGEdge {
  from: string;
  to: string;
  label?: string;
  strength?: number; // 0 to 1
}

export interface CausalTransmissionDAG {
  nodes: CausalDAGNode[];
  edges: CausalDAGEdge[];
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
  pValue: number;
  criticalValues: { "1%": number; "5%": number; "10%": number };
  halfLifeDays: number;
  reversionSpeed: number; // theta in dS = theta*(mu - S)*dt
  currentZScore: number;
  spreadVerdict: "mean_reverting" | "diverging" | "random_walk" | "equilibrium";
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
  narrativeDivergencePct: number;
  dominantHeadwindOrTailwind: string;
  firstOrderMacro: string;
  secondOrderTransmission: string;
  exposedPositionsInPortfolio: Array<{
    ticker: string;
    exposureWeightPct: number;
    estimatedSensitivity: "high" | "medium" | "low";
  }>;
  articles: NewsImpactItem[];
  dag?: CausalTransmissionDAG;
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
    tenor?: string;
    rationale?: string;
  };
  dag?: CausalTransmissionDAG;
}

export interface SingleStockData {
  ticker: string;
  name: string;
  sector: string;
  currency: string;
  lastPrice: number;
  periodReturnPct: number;
  range: string;
  benchmark: string;
  betaRegression: {
    beta: number;
    alphaAnnualPct: number;
    rSquared: number;
    correlation: number;
  };
  volatilityAnnualPct: number;
  fundamentals: {
    marketCapBln: number;
    peRatio: number;
    forwardPe: number;
    evToEbitda: number;
    grossMarginPct: number;
    operatingMarginPct: number;
    revenueGrowthYoyPct: number;
    returnOnEquityPct: number;
    debtToEquity: number;
    freeCashFlowYieldPct: number;
  };
  news: {
    sentiment: "bullish" | "bearish" | "neutral";
    veracityScore: number;
    headlines: string[];
  };
  sparkline: number[];
}

export interface GeneralQuantData {
  headline: string;
  summary: string;
  metrics: Array<{ label: string; value: string | number; tone?: "gain" | "loss" | "neutral" }>;
  breakdown?: Array<{ name: string; sharePct: number; note?: string }>;
}

export type SashaVisualCardType =
  | "single_stock"
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
    | SingleStockData
    | SubsetRiskData
    | StockComparisonData
    | NewsImpactData
    | StressTestData
    | GeneralQuantData;
  executionTimeMs: number;
  receipts: SashaReceipt[];
  googleGrounding?: GoogleGroundingResult;
  source: string;
  facts: Array<{ label: string; value: string | number; unit?: string }>;
  timestamp: number;
}

// ── Multi-Turn Conversation Message ─────────────────────────────────────────

export interface SashaMessage {
  id: string;
  role: "user" | "sasha";
  text: string;
  result?: SashaResult;
  timestamp: number;
}

// ── Voice & Context State ───────────────────────────────────────────────────

export type SashaVoiceState = "idle" | "listening" | "processing" | "speaking" | "error";

export interface SashaContextValue {
  voiceState: SashaVoiceState;
  isListening: boolean;
  isSpeaking: boolean;
  isWakeWordActive: boolean;
  isVoiceMuted: boolean;
  audioEnergy: number;
  activeResult: SashaResult | null;
  history: SashaResult[];
  messages: SashaMessage[];
  isOpen: boolean;
  queryInput: string;
  setQueryInput: (val: string) => void;
  setIsOpen: (open: boolean) => void;
  setWakeWordActive: (active: boolean) => void;
  setVoiceMuted: (muted: boolean) => void;
  startListening: () => void;
  stopListening: () => void;
  submitQuery: (query: string) => Promise<SashaResult>;
  cancelSpeech: () => void;
  clearHistory: () => void;
  handleAction: (actionType: "risk_lab" | "workstation" | "fortress" | "screener", payload?: any) => void;
}
