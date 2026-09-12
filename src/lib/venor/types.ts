/**
 * VENOR: Verified Entropic Network for Orchestrated Reasoning
 * Core Domain Types & Data Contracts
 * ──────────────────────────────────────────────────────────────────────────
 */

export type RealitySourceType =
  | "market_data"
  | "financial_filings"
  | "macro_economic"
  | "news_sentiment"
  | "alternative_data"
  | "regulatory"
  | "geopolitical";

export interface RawRealityInput {
  id: string;
  source: RealitySourceType;
  timestamp: number;
  payload: Record<string, any>;
  rawConfidence: number; // [0, 1]
  publisherOrFeed: string;
}

export interface TruthWeightedFact {
  id: string;
  source: RealitySourceType;
  timestamp: number;
  provenance: {
    origin: string;
    verified: boolean;
    verificationHash: string;
    historicalReliability: number; // [0, 1]
  };
  confidence: number; // [0, 1]
  epistemicUncertainty: number; // [0, 1] - model uncertainty
  aleatoricUncertainty: number; // [0, 1] - data noise
  content: Record<string, any>;
}

export interface ModeledRealityState {
  timestamp: number;
  activeRegime: {
    id: number;
    name: string;
    probability: number;
    entropy: number;
  };
  spectralState: {
    vonNeumannEntropy: number;
    diversificationRatio: number;
    dominantAbsorptionRatio: number;
    spectralGap: number;
  };
  covarianceMatrix: number[][];
  cleanedCorrelationMatrix: number[][];
  tailRiskState: {
    xiShape: number;
    betaScale: number;
    var99: number;
    cvar99: number;
    leptokurtosisDetected: boolean;
  };
  causalFlows: {
    source: string;
    target: string;
    transferEntropy: number;
  }[];
}

export interface VerifiedHypothesis {
  id: string;
  claim: string;
  mathematicalProofOrBound: string;
  passedVerification: boolean;
  violationDegree: number;
  confidence: number;
}

export interface EvidentialWeight {
  hypothesisId: string;
  beliefMass: number; // [0, 1]
  plausibility: number; // [0, 1]
  conflictDegree: number; // [0, 1]
}

export interface GoldDecision {
  decisionId: string;
  timestamp: number;
  actionableTarget: {
    assetOrStrategy: string;
    targetWeights: number[];
    recommendedPosition: "ACCUMULATE" | "TRIM" | "HEDGE" | "NEUTRALIZE" | "HOLD";
    optimalAllocationPct: number;
  };
  confidenceScore: number; // [0, 100]%
  expectedOutcome: {
    expectedReturnPct: number;
    worstCaseLossBound99Pct: number;
    halfLifeReversionPeriods: number;
    sharpeEstimate: number;
  };
  executionPlan: {
    method: "ALMGREN_CHRISS_OPTIMAL" | "TWAP_LINEAR" | "SNIPER_LIMIT";
    halfLifeDecayPeriods: number;
    expectedCostBps: number;
    urgencyScore: number;
  };
  verifiedEvidenceSpine: {
    totalFactsEvaluated: number;
    truthWeightedConfidence: number;
    dominantCausalMechanism: string;
  };
  counterargumentsAndFalsification: {
    falsificationTrigger: string;
    stressLossPotentialPct: number;
    opposingViewpoint: string;
  };
  humanExplanation: {
    executiveSummary: string;
    mathematicalRationale: string;
    actionableDirectives: string[];
  };
}
