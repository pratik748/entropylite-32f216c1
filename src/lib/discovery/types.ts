// Discovery v2 — shared types.
// Pure data shapes; no runtime code. See docs/DISCOVERY_V2_IMPLEMENTATION.md.

/** One engine's return forecast over a common horizon. */
export interface EngineForecast {
  /** expected excess log-return over the horizon */
  mu: number;
  /** forecast variance (uncertainty of mu, not asset variance) */
  s2: number;
  /** stable engine id (matches _shared/buckets.ts ids where applicable) */
  engineId?: string;
}

/** Multiplicative factors of the Opportunity Score. All bounded (see scoring.ts). */
export interface OpportunityFactors {
  /** expected edge net of costs, in return units; gate: must be > 0 */
  eNet: number;
  /** P(real) × FSS ∈ [0,1] */
  robustness: number;
  /** model P(direction correct) ∈ [0,1] — prior Platt map, audited nightly, not an empirical frequency */
  conviction: number;
  /** payoff asymmetry 2Ω/(1+Ω) ∈ [0,2]; 1 = symmetric */
  asymmetry: number;
  /** freshness exp(−λ·age) ∈ (0,1] */
  timeliness: number;
  /** capacity min(1, ADV$/ref) ∈ (0,1] */
  liquidity: number;
  /** 1 − crowding ∈ [0,1] */
  novelty: number;
  /** uncertainty haircut 1/(1 + CIwidth/|eNet|) ∈ (0,1] */
  confidence: number;
}

export interface OpportunityScoreResult {
  /** ranking statistic (NOT a return forecast) */
  os: number;
  logOs: number;
  factors: OpportunityFactors;
  /** the multiplicative factor costing the most score (excludes eNet) */
  bottleneck: { factor: keyof OpportunityFactors; value: number; logCost: number };
}

export interface PublishDecision {
  publish: boolean;
  reasons: string[];
}

/** Typed edge of the asset graph (mirrors public.asset_graph_edges). */
export interface AssetEdge {
  src: string;
  dst: string;
  type: "sector_member" | "supply_chain" | "cointegrated" | "lead_lag" | "claim_link";
  /** confidence/strength ∈ [0,1] */
  weight: number;
}

export interface PropagatedImpact {
  symbol: string;
  /** signed impact ∈ [−1, 1] */
  impact: number;
  /** hop distance from nearest seed */
  hops: number;
}

/** Decayed-Beta reliability cell (mirrors public.engine_regime_stats). */
export interface ReliabilityCell {
  alpha: number;
  beta: number;
  n: number;
}

/** Result of a data-admission check (bars or claims). */
export interface AdmissionResult {
  admitted: boolean;
  reasons: string[];
}

export interface OHLCVBar {
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

/** Point on a claim's TWRD score history. */
export interface TruthPoint {
  /** epoch ms */
  t: number;
  /** TWRD score ∈ [0,1] */
  T: number;
}
