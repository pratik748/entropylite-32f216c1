/**
 * VENOR Architecture: Verified Entropic Network for Orchestrated Reasoning
 * Core Mathematical & Structural Types (100% Deterministic / Zero-LLM)
 */

export type ClaimAdmissionStatus = 0 | 1; // 0 = Rejected by Physical Conservation Gate, 1 = Admitted

/**
 * 7-Tuple Claim Record Primitive:
 * ⟨Entity, Relation, Object, Source, Timestamp, Prior Confidence, Admission Status⟩
 */
export interface ClaimRecord {
  id: string;
  entity: string;
  relation: string;
  objectValue: string | number;
  source: string;
  timestamp: number;
  piHatPrior: number; // Prior confidence ∈ [0, 1]
  admissionStatus: ClaimAdmissionStatus;
  category?: "FUNDAMENTAL" | "MACRO" | "MICROSTRUCTURE" | "ALTERNATIVE" | "GEOPOLITICAL" | "NEWS";
  provenanceDetails?: string;
  metadata?: Record<string, unknown>;
}

export interface TruthScoreResult {
  claimId: string;
  score: number; // T(x,t) ∈ [0, 1]
  sourceCredibility: number; // S(x,t)
  agreementScore: number; // A(x,t)
  evidenceDepth: number; // D(x,t)
  sourceBias: number; // B(x,t)
  contradictionWeight: number; // C(x,t)
  epistemicMomentum: number; // μ(x,t) = ∂T/∂t
  sybilClusterSize: number;
  rawLogit: number;
}

export interface SourceCredibility {
  sourceId: string;
  alpha: number;
  beta: number;
  lambda: number; // Decay factor (default 0.98)
  credibilityMean: number;
  sampleCount: number;
}

export interface PolyhedralConstraint {
  id: string;
  name: string;
  type: "CIRCUIT_BREAKER" | "LIQUIDITY_FLOOR" | "GAMMA_PIN" | "ENTERPRISE_VALUE" | "MARGIN_LIMIT" | "VOL_CEILING";
  expression: string;
  threshold: number;
  isBinding: boolean;
  distanceToBinding: number; // Normalized distance ∈ [0, 1]
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
}

export interface CrucibleSimulationPath {
  pathIndex: number;
  trajectory: number[];
  finalReturn: number;
  maxDrawdown: number;
  isPolyhedralFeasible: boolean;
  hitTargetFirst: boolean;
  hitStopFirst: boolean;
}

export interface FutureSurvivalScoreResult {
  totalPaths: number;
  polyhedralFeasiblePaths: number;
  feasibleFraction: number; // Fraction of paths respecting P_K
  targetHitPaths: number;
  stopHitPaths: number;
  fss: number; // Future Survival Score ∈ [0, 1]
  expectedShortfall95: number;
  asymmetryOmega: number;
  deflatedSharpeRatio: number;
}

export interface CausalEdge {
  sourceTicker: string;
  targetTicker: string;
  edgeType: "SUPPLY_CHAIN" | "COINTEGRATION" | "LEAD_LAG" | "MACRO_FACTOR";
  weight: number; // [0, 1]
  lagPeriods: number; // In trading days or intervals
  pValue: number;
  fdrSignificant: boolean; // True if survives Benjamini-Hochberg at q = 0.05
}

export interface WorldState {
  ticker: string;
  currentPrice: number;
  timestamp: number;
  fragilityIndex: number; // κ_K(s) ∈ [0, 1]
  volatilityRegime: "LOW_VOL_TREND" | "MEAN_REVERTING" | "HIGH_VOL_CRISIS";
  regimeProbabilities: [number, number, number]; // [P(Regime 1), P(Regime 2), P(Regime 3)]
  activeConstraints: PolyhedralConstraint[];
  causalNetworkEdges: CausalEdge[];
  admittedClaims: ClaimRecord[];
}

export interface OrthogonalSignal {
  bucket: "QUANT_STATARB" | "FUNDAMENTAL" | "MICROSTRUCTURE" | "MACRO_GEO";
  name: string;
  directionalBias: number; // [-1.0 (strong sell), +1.0 (strong buy)]
  confidence: number; // [0, 1]
  evidenceWeight: number;
}

export interface KishWeightingResult {
  signals: OrthogonalSignal[];
  rawSignalCount: number;
  kishEffectiveN: number; // N_eff = (∑ w_i)² / ∑ w_i²
  orthogonalConsensusBias: number; // Composite net directional score ∈ [-1, 1]
  bucketRepresentation: Record<string, number>;
}

export interface CascadeVulnerability {
  loadBearingClaimId: string;
  loadBearingClaimDescription: string;
  truthScore: number;
  sensitivityDelta: number; // |∂Verdict / ∂T|
  vulnerabilityScore: number; // CV(a) = (1 - T) * |∂Verdict / ∂T|
  preMortemInvalidationScenario: string;
}

export interface AdversarialAudit {
  passed: boolean;
  falsificationTestsRun: number;
  testsFailed: number;
  fdrControlPassed: boolean;
  counterThesis: string;
  stressShockImpactPct: number;
}

export interface ScarMemoryRecord {
  id: string;
  ticker: string;
  timestamp: number;
  contextRegime: string;
  predictedDirection: "UP" | "DOWN" | "FLAT";
  realizedPnLError: number;
  scarScore: number; // Sc(m) = α·impact² + β·infoDensity − δ·decay
  lessonExtracted: string;
}

export interface GoldDecision {
  ticker: string;
  timestamp: number;
  action: "STRONG_LONG" | "ACCUMULATE" | "NEUTRAL" | "HEDGE" | "EXIT";
  direction: "UP" | "DOWN" | "SIDEWAYS";
  confidence: number; // Calibrated percentage [0, 100]
  quantScore: number; // Institutional ranking score [0, 100]

  entryLow: number;
  entryHigh: number;
  targetPrice: number;
  stopLoss: number;
  riskRewardRatio: number;
  timeframe: string;

  positionSizing: {
    fractionalKelly: number; // Sizing fraction ∈ [0, 0.25]
    capitalAllocationPct: string;
    maxRiskExposure: number;
  };

  futureSurvivalScore: number;
  deflatedSharpeRatio: number;
  fragilityIndex: number;

  cascadeVulnerability: CascadeVulnerability;
  adversarialAudit: AdversarialAudit;
  orthogonalEvidence: KishWeightingResult;
  preMortemTriggers: string[];

  proofCard: {
    proofId: string;
    deterministicHash: string;
    epistemicScore: number;
    regime: string;
    fss: number;
    kishN: number;
    auditTrail: string[];
  };
}
