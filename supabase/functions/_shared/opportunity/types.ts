// Opportunity Engine — canonical types.
//
// This is THE single opportunity schema for the platform. Discover, Direct
// Profit, Desirable Assets, alerts and any future recommendation module all
// consume `ValidatedOpportunity` objects produced by the pipeline in this
// directory. No module defines its own opportunity shape or scoring.
//
// Pipeline:
//   CandidateGenerator → EvidenceCollectors → IndependentScoringModels
//   → ConfidenceEngine → OpportunityValidator → ranked repository output
//
// Every numeric field must be traceable to observable market data. If a
// value cannot be computed from evidence, it is omitted — never invented.

import type { Bucket, BucketDecision } from "../buckets.ts";
import type { MarketContext } from "./marketContext.ts";

export type { MarketContext } from "./marketContext.ts";

// ── Candidate universe ──────────────────────────────────────────────

export type AssetClass = "equity" | "etf" | "index" | "commodity" | "bond" | "crypto";

/** Where a candidate entered the universe — kept for full traceability. */
export interface CandidateOrigin {
  /** e.g. "screener:day_gainers", "screener:most_actives", "coverage:sector_etf" */
  source: string;
  /** Human-readable justification for why this instrument is in the universe. */
  reason: string;
}

export interface Candidate {
  symbol: string;
  name: string;
  assetClass: AssetClass;
  exchange?: string;
  currency?: string;
  origin: CandidateOrigin;
  /** Snapshot fields carried from the screener row when available. */
  snapshot?: {
    price?: number;
    changePct?: number;
    volume?: number;
    avgVolume3M?: number;
    marketCap?: number;
    fiftyTwoWeekHigh?: number;
    fiftyTwoWeekLow?: number;
    trailingPE?: number;
  };
}

// ── Evidence ────────────────────────────────────────────────────────

/** A single observable fact used by scoring models. */
export interface EvidenceItem {
  /** Which collector produced it, e.g. "price_history", "yahoo_summary", "gdelt_news". */
  collector: string;
  /** Machine key, e.g. "momentum_63d", "rsi_14", "analyst_target_upside". */
  key: string;
  /** Numeric value where applicable. */
  value?: number;
  /** Human-readable statement of the observation. */
  statement: string;
  /** ISO timestamp / date the underlying data refers to. */
  asOf: string;
}

export interface PriceFeatures {
  bars: number;                 // usable daily bars
  lastClose: number;
  currency?: string;
  ret5d: number;                // simple returns over windows (decimal)
  ret21d: number;
  ret63d: number;
  ret126d: number;
  volAnnual: number;            // annualized log-return stdev (decimal)
  volAnnualPrev: number;        // same, measured on the prior half of the window
  maxDrawdown1y: number;        // decimal, positive number (0.25 = −25% peak-to-trough)
  drawdownFromPeak: number;     // current drawdown from 1y peak (decimal, positive)
  rsi14: number;
  sma50: number;
  sma200: number | null;        // null when < 200 bars
  pctFrom52wHigh: number;       // decimal, negative below high
  pctFrom52wLow: number;        // decimal, positive above low
  zScore50d: number;            // (close − sma50) / stdev50
  volumeZ20: number;            // today volume vs 20d mean, in stdevs
  avgDollarVolume20d: number;   // price × volume, 20d mean
  skew: number;
  excessKurt: number;
  betaVsBenchmark: number | null;
  relStrength63d: number | null; // asset 63d return minus benchmark 63d return
  closes: number[];             // trailing closes (for downstream walk-forward)
}

export interface FundamentalFeatures {
  marketCap: number | null;
  trailingPE: number | null;
  forwardPE: number | null;
  pegRatio: number | null;
  priceToBook: number | null;
  profitMargins: number | null;
  returnOnEquity: number | null;
  debtToEquity: number | null;
  revenueGrowth: number | null;
  earningsGrowth: number | null;
  recommendationKey: string | null;
  numberOfAnalystOpinions: number | null;
  targetMeanPrice: number | null;
  shortPercentOfFloat: number | null;
  sector: string | null;
  industry: string | null;
}

export interface SentimentFeatures {
  articleCount: number;
  avgTone: number;          // GDELT tone, roughly −10..+10
  lexicalScore: number;     // keyword-based headline score
  topHeadline: string | null;
}

export interface EvidenceBundle {
  candidate: Candidate;
  price: PriceFeatures | null;
  fundamentals: FundamentalFeatures | null;
  sentiment: SentimentFeatures | null;
  items: EvidenceItem[];
  /** Collectors that ran but returned nothing (data honesty — shown in dataQuality). */
  missing: string[];
}

// ── Evidence objects (the normalized Evidence Layer) ────────────────
//
// The uniform, self-describing representation the Confidence Engine,
// diagnostics and explainability all consume — derived ONCE per candidate
// from the collected bundle (see evidenceLayer.ts). Categories map onto the
// three orthogonal consensus buckets so evidence and model votes speak the
// same language.

export type EvidenceCategory =
  | "momentum"
  | "trend"
  | "mean_reversion"
  | "volume"
  | "walkforward"
  | "liquidity"
  | "tail_risk"
  | "valuation"
  | "quality"
  | "growth"
  | "analyst"
  | "sentiment"
  | "macro";

export interface Evidence {
  /** Stable id, unique within a bundle; also determines the bucket. */
  id: string;
  category: EvidenceCategory;
  /** Consensus bucket (A price/flow, B fundamental/intel, C risk/regime). */
  bucket: Bucket;
  /** Self-describing statement of what was observed. */
  observation: string;
  /** Signed directional strength in [−1, 1]; 0 = contextual, non-directional. */
  strength: number;
  /** How recent the underlying datum is, 0..1. */
  freshness: number;
  /** Collector the observation came from, e.g. "price_history". */
  source: string;
  /** Reliability of THIS observation, 0..1 (before direction). */
  confidence: number;
  /** The measured numbers behind the observation. */
  metrics: Record<string, number>;
}

// ── Independent scoring models ──────────────────────────────────────

export interface ModelScore {
  /** Stable id; also used for bucket assignment (see _shared/buckets.ts). */
  id: string;
  label: string;
  /** −1 bearish, 0 neutral/abstain, +1 bullish. */
  direction: -1 | 0 | 1;
  /** 0..1 conviction in the direction. */
  confidence: number;
  /** Signed score in [−1, 1] before thresholding into direction. */
  score: number;
  /** Every model must explain itself from observable inputs. */
  rationale: string[];
  /** False when the model lacked the data to form any view. */
  hasSignal: boolean;
}

// ── Validated opportunity (the object every module consumes) ────────

export interface OpportunityConsensus {
  decision: "BUY" | "SELL" | "STAND_ASIDE";
  calibratedProb: number;   // 0..1
  agreement: number;        // 0..1
  engineCount: number;
  consensusLabel: "UNANIMOUS" | "MAJORITY" | "SPLIT";
  expectedR: number;        // after cost + fat-tail haircut
  bucketDirs: { A: -1 | 0 | 1; B: -1 | 0 | 1; C: -1 | 0 | 1 };
  bucketConsensus: BucketDecision["consensus"];
}

/** Position-sizing guidance derived from the same measured quantities. */
export interface OpportunitySizing {
  /** Raw Kelly fraction from calibrated probability and payoff asymmetry. */
  kellyFraction: number;
  /** 0.25× fractional Kelly, percent of capital. */
  fractionalKellyPct: number;
  /** Weight that budgets ~2% annual portfolio vol to this position, percent. */
  volTargetWeightPct: number;
  /** min(fractional Kelly, vol target) — the conservative binding constraint. */
  suggestedWeightPct: number;
  /** Which constraint bound the size. */
  basis: "fractional_kelly" | "vol_target";
  /** Estimated loss at the 95% horizon VaR for the suggested weight, percent of capital. */
  estMaxLossPct: number;
  /** Whole units at suggested weight — only when the caller supplied portfolio value. */
  suggestedQty?: number;
}

/** How the candidate interacts with the caller's existing portfolio. */
export interface PortfolioFit {
  /** Daily-return correlation vs the weighted portfolio composite. */
  correlation: number;
  /** Multiplier applied to the ranking score: 1 − 0.3 × max(0, correlation). */
  diversificationMultiplier: number;
  note: string;
}

/** Walk-forward base rates for this setup's horizon on this symbol. */
export interface HistoricalStats {
  sampleSize: number;      // overlapping horizon windows evaluated
  hitRatePct: number;      // % of windows that ended favorably for this direction
  meanReturnPct: number;   // mean forward return per window, direction-adjusted
  horizonDays: number;
}

/** Volatility-derived trade levels for display. Not predictions: the entry
 *  band is ±0.25× the horizon sigma, the objective is the 1-sigma favorable
 *  move (the consensus prior), and the invalidation level is the 1.25-sigma
 *  adverse move used in the invalidation conditions. */
export interface TradePlan {
  entryLow: number;
  entryHigh: number;
  objective: number;
  invalidationLevel: number;
}

/** Machine-readable reasons an opportunity was accepted — never vague prose.
 *  The rejection side uses `RejectionCode`; this is the acceptance vocabulary. */
export type AcceptanceReasonCode =
  | "bucket_consensus_met"
  | "all_buckets_agree"
  | "majority_buckets_agree"
  | "full_evidence"
  | "partial_evidence"
  | "historical_base_rate_available"
  | "insufficient_history_context"
  | "context_risk_on"
  | "context_neutral"
  | "context_risk_off"
  | "context_supports_direction"
  | "context_tempers_direction";

/** Per-opportunity, machine-readable acceptance diagnostics. */
export interface OpportunityDiagnostics {
  accepted: true;
  reasonCodes: AcceptanceReasonCode[];
  /** Market-context labels active for this run (trend / vol / risk). */
  marketContextLabels: string[];
  /** Number of Evidence objects backing this opportunity. */
  evidenceCount: number;
  /** Confidence-weighted net directional strength of the evidence, [−1, 1]. */
  netEvidenceStrength: number;
}

export interface ValidatedOpportunity {
  symbol: string;
  name: string;
  assetClass: AssetClass;
  exchange?: string;
  currency: string;
  price: number;
  direction: "long" | "short";
  horizonDays: number;
  /** Yahoo sector name when fundamentals were available. */
  sector?: string;
  /** Trailing closes (≤60 points) for sparkline rendering. */
  sparkline: number[];
  tradePlan: TradePlan;

  /** 0..1 — calibrated probability the thesis is right, capped at 0.95 (never certainty). */
  confidence: number;
  /** What produced this confidence (agreement, reputation, completeness) — auditable. */
  confidenceDrivers: string[];
  /** Expected move over the horizon, decimal (0.04 = +4%). Sign follows direction. */
  expectedEdgePct: number;
  /** 95% CF-VaR style adverse move over the horizon, decimal, positive. */
  downsideRiskPct: number;
  /** Ranking objective: |expectedEdgePct| × confidence / downsideRiskPct. */
  riskAdjustedScore: number;
  /** riskAdjustedScore × diversificationMultiplier; present when a portfolio was supplied. */
  portfolioAdjustedScore?: number;
  /** Measured multi-factor conviction (≥1). Scales the ranking score so
   *  setups where independent model buckets, historical base rates and the
   *  evidence layer corroborate each other rise to the top. */
  convictionMultiplier?: number;

  sizing: OpportunitySizing;
  portfolioFit?: PortfolioFit;
  historicalStats?: HistoricalStats;

  models: ModelScore[];
  consensus: OpportunityConsensus;

  /** Structured Evidence Layer backing this opportunity (top items by
   *  |strength|). Additive/optional — legacy consumers read the string
   *  arrays below; new consumers can render the self-describing objects. */
  evidence?: Evidence[];
  /** Machine-readable acceptance diagnostics (never vague explanations). */
  diagnostics?: OpportunityDiagnostics;

  supportingEvidence: string[];
  contradictingEvidence: string[];
  /** What changed recently that makes this actionable now. */
  recentChange: string;
  /** Concrete observable conditions that would kill the thesis. */
  invalidation: string[];

  origin: CandidateOrigin;
  liquidityTier: string;
  costHaircutPct: number;      // round-trip, percent (1.5 = 1.5%)
  avgDollarVolume20d: number;

  dataQuality: {
    priceBars: number;
    collectors: string[];      // collectors that returned data
    missing: string[];         // collectors that returned nothing
  };

  asOf: string;                // ISO timestamp of evaluation
}

// ── Pipeline diagnostics ────────────────────────────────────────────

/** Machine-readable rejection codes — the audit vocabulary. */
export type RejectionCode =
  | "no_price_history"
  | "insufficient_history"
  | "invalid_price"
  | "below_liquidity_floor"
  | "preliminary_signal_too_weak"
  | "too_few_models"
  | "insufficient_bucket_coverage"
  | "bucket_disagreement"
  | "confidence_below_threshold"
  | "agreement_below_threshold"
  | "insufficient_expected_r"
  | "non_positive_expected_edge"
  | "non_positive_risk_adjusted_edge"
  | "excessive_downside_risk";

export interface RejectionRecord {
  symbol: string;
  stage: "evidence" | "validation";
  code: RejectionCode;
  reason: string;                       // human-readable expansion
  details?: Record<string, number>;     // the numbers behind the decision
}

/** A finalist that failed validation — kept visible so the funnel is auditable. */
export interface NearMiss {
  symbol: string;
  name: string;
  direction: "long" | "short" | "none";
  code: RejectionCode;
  calibratedProb: number;
  agreement: number;
  bucketDirs: { A: -1 | 0 | 1; B: -1 | 0 | 1; C: -1 | 0 | 1 };
}

export interface PipelineDiagnostics {
  universeSize: number;
  universeSources: Record<string, number>;   // origin.source → count
  evidenceCollected: number;                 // candidates with usable evidence
  scored: number;                            // candidates that reached consensus stage
  validated: number;
  rejections: RejectionRecord[];
  rejectionSummary: Record<string, number>;  // code → count
  nearMisses: NearMiss[];
}

export interface EngineResponse {
  asOf: string;
  /** Where the pipeline ran. Always the edge function — there is no
   *  client-side fallback venue. */
  executionVenue: "edge";
  regime: { label: "risk-on" | "neutral" | "risk-off"; evidence: string[] };
  /** Classified market environment (trend / volatility / risk axes). Influences
   *  confidence, never model direction. Present from the Market Context module. */
  marketContext?: MarketContext;
  /** Measured macro environment (rates, curve, dollar, vol, credit, sectors). */
  macro: {
    rates: { tenYearPct: number | null; threeMonthPct: number | null; curveSlopePct: number | null; tenYearChange63dPct: number | null };
    dollar: { ret63d: number | null; usdinrRet63d?: number | null };
    volatility: { vix: number | null; vixPercentile1y: number | null };
    credit: { highYieldRelStrength63d: number | null };
    sectors: { ranked: Array<{ symbol: string; sector: string; relStrength63d: number }> };
    evidence: string[];
    missing: string[];
  };
  /** Online-learning health: calibration fit quality and reputation coverage. */
  learning: {
    calibration: { alpha: number; beta: number; gamma: number; nSamples: number; brierScore: number; fitAt: string | null };
    reputationCells: number;
    drift: "healthy" | "degrading" | "unfit";
  };
  opportunities: ValidatedOpportunity[];
  diagnostics: PipelineDiagnostics;
}
