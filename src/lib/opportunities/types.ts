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

export interface ValidatedOpportunity {
  symbol: string;
  name: string;
  assetClass: AssetClass;
  exchange?: string;
  currency: string;
  price: number;
  direction: "long" | "short";
  horizonDays: number;

  confidence: number;        // 0..1 calibrated probability, capped at 0.95 — never certainty
  expectedEdgePct: number;   // decimal; sign follows direction
  downsideRiskPct: number;   // decimal, positive (95% CF-VaR over horizon)
  riskAdjustedScore: number; // |edge| × confidence / risk — the ranking key

  models: ModelScore[];
  consensus: OpportunityConsensus;

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

export interface RejectionRecord {
  symbol: string;
  stage: "evidence" | "validation";
  reason: string;
}

export interface PipelineDiagnostics {
  universeSize: number;
  universeSources: Record<string, number>;
  evidenceCollected: number;
  scored: number;
  validated: number;
  rejections: RejectionRecord[];
  rejectionSummary: Record<string, number>;
}

export interface EngineResponse {
  asOf: string;
  regime: { label: "risk-on" | "neutral" | "risk-off"; evidence: string[] };
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
