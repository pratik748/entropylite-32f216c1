/**
 * VENOR Architecture: Master Pipeline Orchestrator (100% Deterministic & Zero-LLM)
 * Verified Entropic Network for Orchestrated Reasoning
 */

export * from "./types";
export * from "./twrd";
export * from "./crucible";
export * from "./reasoning";
export * from "./goldDecision";

import type {
  ClaimRecord,
  WorldState,
  OrthogonalSignal,
  GoldDecision,
} from "./types";
import {
  evaluateAdmissionGate,
  computeTruthScore,
  DEFAULT_SOURCE_CREDIBILITY,
} from "./twrd";
import {
  classifyRegime,
  buildPolyhedralConstraints,
  computeFragilityIndex,
  runPolyhedralMonteCarlo,
} from "./crucible";
import {
  fuseOrthogonalEvidence,
  runAdversarialAudit,
  computeCascadeVulnerability,
} from "./reasoning";
import { synthesizeGoldDecision } from "./goldDecision";

export interface PipelineExecutionParams {
  ticker: string;
  currentPrice: number;
  prevClose?: number;
  closes?: number[];
  vix?: number;
  volume?: number;
  avgVolume?: number;
  support?: number;
  resistance?: number;
  rawClaims?: ClaimRecord[];
  signals?: OrthogonalSignal[];
}

/**
 * Executes the complete 6-Stage VENOR Architecture Pipeline deterministically.
 */
export function executeVenorPipeline(params: PipelineExecutionParams): GoldDecision {
  const {
    ticker,
    currentPrice,
    prevClose = currentPrice * 0.995,
    closes = [currentPrice * 0.98, currentPrice * 0.99, currentPrice],
    vix = 18.5,
    volume = 1000000,
    avgVolume = 1000000,
    support = currentPrice * 0.95,
    resistance = currentPrice * 1.08,
    rawClaims = [],
    signals = [],
  } = params;

  // ── STAGE 1 & 2: TWRD Ingestion & Admission ──
  const admittedClaims: ClaimRecord[] = [];
  for (const c of rawClaims) {
    const admission = evaluateAdmissionGate(c, {
      price: currentPrice,
      prevClose,
      volume,
    });
    admittedClaims.push({ ...c, admissionStatus: admission });
  }

  // Compute Epistemic Scores
  const truthScores = admittedClaims.map((c) =>
    computeTruthScore(c, DEFAULT_SOURCE_CREDIBILITY.credibilityMean)
  );

  // ── STAGE 3: Crucible Modeling & Simulation ──
  const { regime, annualizedVol } = classifyRegime(closes, vix);
  const constraints = buildPolyhedralConstraints(currentPrice, support, resistance, annualizedVol);
  const fragilityIndex = computeFragilityIndex(constraints);

  const fssResult = runPolyhedralMonteCarlo(
    {
      currentPrice,
      targetPrice: resistance,
      stopLoss: support,
      horizonDays: 21,
      annualizedVolPct: annualizedVol,
      numPaths: 4000,
      seed: 42,
    },
    constraints
  );

  // ── STAGE 4: Modeled Reality World State ──
  const worldState: WorldState = {
    ticker,
    currentPrice,
    timestamp: Date.now(),
    fragilityIndex,
    volatilityRegime: regime,
    regimeProbabilities: [0.2, 0.6, 0.2],
    activeConstraints: constraints,
    causalNetworkEdges: [],
    admittedClaims,
  };

  // ── STAGE 5: VENOR Reasoning Core (Zero-LLM) ──
  // If no external signals provided, derive default orthogonal signals from market technicals & fundamentals
  const effectiveSignals: OrthogonalSignal[] =
    signals.length > 0
      ? signals
      : [
          {
            bucket: "QUANT_STATARB",
            name: "Momentum & Volatility Z-Score",
            directionalBias: currentPrice > prevClose ? 0.4 : -0.3,
            confidence: 0.75,
            evidenceWeight: 1.0,
          },
          {
            bucket: "FUNDAMENTAL",
            name: "Enterprise Value Support Margin",
            directionalBias: 0.35,
            confidence: 0.80,
            evidenceWeight: 1.1,
          },
          {
            bucket: "MICROSTRUCTURE",
            name: "Order Flow & Gamma Concentration",
            directionalBias: volume > avgVolume * 1.1 ? 0.5 : -0.1,
            confidence: 0.70,
            evidenceWeight: 1.2,
          },
          {
            bucket: "MACRO_GEO",
            name: "Macro Liquidity & Vol Regime",
            directionalBias: vix > 25 ? -0.4 : 0.2,
            confidence: 0.65,
            evidenceWeight: 0.9,
          },
        ];

  const kishResult = fuseOrthogonalEvidence(effectiveSignals);
  const cascadeVulnerability = computeCascadeVulnerability(
    admittedClaims,
    truthScores,
    kishResult.orthogonalConsensusBias
  );

  const adversarialAudit = runAdversarialAudit({
    ticker,
    consensusBias: kishResult.orthogonalConsensusBias,
    vix,
    fragilityIndex,
    gammaPinRisk: constraints.some((c) => c.type === "GAMMA_PIN" && c.isBinding),
    liquidityRatio: avgVolume > 0 ? volume / avgVolume : 1.0,
  });

  // ── STAGE 6: Gold Decision Generation ──
  const goldDecision = synthesizeGoldDecision({
    ticker,
    currentPrice,
    fssResult,
    kishResult,
    cascadeVulnerability,
    adversarialAudit,
    constraints,
    fragilityIndex,
    volatilityRegime: regime,
    supportLevel: support,
    resistanceLevel: resistance,
  });

  return goldDecision;
}
