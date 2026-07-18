// Shared Opportunity Engine — client-side types.
//
// These mirror `supabase/functions/_shared/opportunity/types.ts`. The
// ValidatedOpportunity object is THE canonical opportunity shape for the
// whole app: Discover, Direct Profit, Desirable Assets, alerts and any
// future recommendation module consume exactly these objects from the
// shared repository — no module defines its own opportunity schema,
// scoring, or ranking.

export type AssetClass = "equity" | "etf" | "index" | "commodity" | "bond" | "crypto";

export interface CandidateOrigin {
  source: string;
  reason: string;
}

// ── Evidence Layer (mirrors _shared/opportunity/types.ts) ───────────

export type Bucket = "A" | "B" | "C";

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
  id: string;
  category: EvidenceCategory;
  bucket: Bucket;
  observation: string;
  strength: number;   // signed [−1, 1]; 0 = contextual
  freshness: number;  // 0..1
  source: string;
  confidence: number; // 0..1
  metrics: Record<string, number>;
}

// ── Market Context (mirrors _shared/opportunity/marketContext.ts) ───

export type TrendState = "trending" | "range_bound" | "unknown";
export type VolState = "high_vol" | "normal_vol" | "low_vol";
export type RiskState = "risk_on" | "neutral" | "risk_off";
export type MarketContextLabel = TrendState | VolState | RiskState;

export interface MarketContext {
  trend: TrendState;
  volatility: VolState;
  risk: RiskState;
  labels: MarketContextLabel[];
  longConfidenceMultiplier: number;
  shortConfidenceMultiplier: number;
  evidence: string[];
}

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

export interface OpportunityDiagnostics {
  accepted: true;
  reasonCodes: AcceptanceReasonCode[];
  marketContextLabels: string[];
  evidenceCount: number;
  netEvidenceStrength: number;
}

export interface ModelScore {
  id: string;
  label: string;
  direction: -1 | 0 | 1;
  confidence: number;
  score: number;
  rationale: string[];
  hasSignal: boolean;
}

export interface OpportunityConsensus {
  decision: "BUY" | "SELL" | "STAND_ASIDE";
  calibratedProb: number;
  agreement: number;
  engineCount: number;
  consensusLabel: "UNANIMOUS" | "MAJORITY" | "SPLIT";
  expectedR: number;
  bucketDirs: { A: -1 | 0 | 1; B: -1 | 0 | 1; C: -1 | 0 | 1 };
  bucketConsensus: "ALL_3" | "TWO_OF_3" | "SPLIT" | "INSUFFICIENT";
}

export interface OpportunitySizing {
  kellyFraction: number;
  fractionalKellyPct: number;
  volTargetWeightPct: number;
  suggestedWeightPct: number;
  basis: "fractional_kelly" | "vol_target";
  estMaxLossPct: number;
  suggestedQty?: number;
}

export interface PortfolioFit {
  correlation: number;
  diversificationMultiplier: number;
  note: string;
}

export interface HistoricalStats {
  sampleSize: number;
  hitRatePct: number;
  meanReturnPct: number;
  horizonDays: number;
}

export interface TradePlan {
  entryLow: number;
  entryHigh: number;
  objective: number;          // 1σ favorable move (the consensus prior)
  invalidationLevel: number;  // 1.25σ adverse — matches the invalidation conditions
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
  sector?: string;
  sparkline: number[];
  tradePlan: TradePlan;

  confidence: number;        // 0..1 model win-prob (prior Platt map, NOT an empirical frequency), capped at 0.95
  confidenceDrivers: string[];
  expectedEdgePct: number;   // decimal; sign follows direction
  downsideRiskPct: number;   // decimal, positive (95% CF-VaR over horizon)
  riskAdjustedScore: number; // |edge| × confidence / risk — the base ranking key
  portfolioAdjustedScore?: number; // × diversification multiplier when portfolio supplied
  convictionMultiplier?: number;   // ≥1 multi-factor conviction scaling for ranking

  sizing: OpportunitySizing;
  portfolioFit?: PortfolioFit;
  historicalStats?: HistoricalStats;

  models: ModelScore[];
  consensus: OpportunityConsensus;

  /** Structured Evidence Layer backing this opportunity (top items by |strength|). */
  evidence?: Evidence[];
  /** Machine-readable acceptance diagnostics. */
  diagnostics?: OpportunityDiagnostics;

  supportingEvidence: string[];
  contradictingEvidence: string[];
  recentChange: string;
  invalidation: string[];

  origin: CandidateOrigin;
  liquidityTier: string;
  costHaircutPct: number;
  avgDollarVolume20d: number;

  dataQuality: {
    priceBars: number;
    collectors: string[];
    missing: string[];
  };

  asOf: string;
}

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
  reason: string;
  details?: Record<string, number>;
}

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
  universeSources: Record<string, number>;
  evidenceCollected: number;
  scored: number;
  validated: number;
  rejections: RejectionRecord[];
  rejectionSummary: Record<string, number>;
  nearMisses: NearMiss[];
}

export interface MacroSnapshot {
  rates: { tenYearPct: number | null; threeMonthPct: number | null; curveSlopePct: number | null; tenYearChange63dPct: number | null };
  dollar: { ret63d: number | null; usdinrRet63d?: number | null };
  volatility: { vix: number | null; vixPercentile1y: number | null };
  credit: { highYieldRelStrength63d: number | null };
  sectors: { ranked: Array<{ symbol: string; sector: string; relStrength63d: number }> };
  evidence: string[];
  missing: string[];
}

export interface LearningHealth {
  calibration: { alpha: number; beta: number; gamma: number; nSamples: number; brierScore: number; fitAt: string | null };
  reputationCells: number;
  drift: "healthy" | "degrading" | "unfit";
}

export interface EngineResponse {
  asOf: string;
  executionVenue: "edge";
  regime: { label: "risk-on" | "neutral" | "risk-off"; evidence: string[] };
  /** Classified market environment (trend / volatility / risk). Influences
   *  confidence, never model direction. */
  marketContext?: MarketContext;
  macro: MacroSnapshot;
  learning: LearningHealth;
  opportunities: ValidatedOpportunity[];
  diagnostics: PipelineDiagnostics;
}

/** Filters every consumer expresses in the same vocabulary. */
export interface OpportunityFilters {
  assetClasses?: AssetClass[];
  direction?: "long" | "short";
  minConfidence?: number;
  maxResults?: number;
}

/** The user-facing message shown when the pipeline validates nothing. */
export const EMPTY_STATE_MESSAGE =
  "No validated opportunities currently meet institutional confidence thresholds.";
