// TWRD shared types — Truth-Weighted Reality Database

export type TwrdDomain = "financial" | "news" | "social" | "geo" | "scientific";

export interface ClaimTriple {
  subject: string;
  relation: string;
  object: string;
}

export interface ClaimEvidence {
  source_id: string;
  raw_text?: string;
  ts: string; // ISO
}

export interface RawClaim extends ClaimTriple {
  domain: TwrdDomain;
  evidence: ClaimEvidence[];
  // bias signal in [0,1] from cleaner; default 0
  biasHat?: number;
  // π̂ cap from cleaner (e.g. 0.45 for speculative, 0.85 for factual news)
  piHatCap?: number;
}

export interface SourcePosterior {
  id: string;
  domain: TwrdDomain;
  alpha: number;
  beta: number;
}

export interface TruthFactors {
  S: number;       // source credibility (mean θ over evidence)
  A: number;       // noisy-OR agreement
  D: number;       // temporal decay
  B: number;       // bias penalty
  C: number;       // contradiction penalty
}

export interface Weights {
  w1: number; w2: number; w3: number; w4: number; w5: number; b: number;
}

export interface TruthScore {
  T: number;             // sigmoid output
  factors: TruthFactors;
  thetas: number[];      // per-source credibility used
  kIndependent: number;  // independent corroborators after dedup
  piHatCap?: number;     // cap from cleaner, applied last
  domain: TwrdDomain;
}

export interface VeracityMeta {
  T: number;
  S: number;
  A: number;
  contradictionRisk: number;
  falseConsensus: boolean;
  staleFact: boolean;
  adversarialSpike: boolean;
  kIndependent: number;
  meanTheta: number;
}

export interface RawSignal {
  id: string;
  value: number;                     // signed signal strength (any scale)
  claim: ClaimTriple;
  domain: TwrdDomain;
  evidence?: ClaimEvidence[];        // optional inline evidence
  biasHat?: number;
}

export interface WeightedSignal extends RawSignal {
  T: number;
  weighted: number;                  // value * T
  meta: VeracityMeta;
}

export const DEFAULT_WEIGHTS: Weights = {
  w1: 1.2, w2: 1.0, w3: 0.8, w4: 1.1, w5: 1.3, b: -0.5,
};

// Domain-specific half-lives (seconds) → λ_d = ln2 / half-life
export const HALF_LIFE_SECONDS: Record<TwrdDomain, number> = {
  financial:  7  * 86400,   // 7 days
  news:       14 * 86400,   // 14 days
  social:     2  * 86400,   // 2 days
  geo:        60 * 86400,   // 60 days
  scientific: 365 * 86400,  // 365 days
};