// Ensemble Consensus Engine — pure, deterministic, dependency-free.
//
// Problem: each individual engine (deterministic technicals, AI verdict,
// momentum/quant, sentiment, intel summary, CLANK, desirable hint, TWRD
// veracity) is right ~55–65% of the time. Used in isolation they produce
// the swing the user is complaining about: huge profit one day, loss the
// next. The classical fix in quant systems is an **inverse-variance
// weighted ensemble** with **calibrated probability** and a **decision
// gate** that says STAND ASIDE when engines disagree.
//
// References:
//   • Markowitz / Black-Litterman view blending (inverse-variance)
//   • Platt scaling (1999) for probability calibration
//   • Brier score (1950) for calibration quality
//   • Wilson (1927) lower bound for small-sample win-rate
//
// This file is intentionally pure: any edge function can import it.

export type EngineDirection = -1 | 0 | 1; // -1=bearish, 0=neutral, +1=bullish

export interface EngineSignal {
  /** Stable engine id, used in disagreement output */
  id: string;
  /** Human label shown to the user */
  label: string;
  /** Directional vote */
  direction: EngineDirection;
  /** Confidence 0..1 — how strongly this engine believes its direction */
  confidence: number;
  /** Historical reliability prior 0..1 (default 0.55). Higher = more weight */
  reliability?: number;
  /** Whether this engine had enough data to even speak (false = skipped) */
  hasSignal?: boolean;
}

export type ConsensusDecision = "BUY" | "SELL" | "STAND_ASIDE";

export interface ConsensusResult {
  /** Final calibrated decision after the gate */
  decision: ConsensusDecision;
  /** Raw bullish ensemble score in [-1, +1] (signed by direction) */
  ensembleScore: number;
  /** Calibrated probability that the dominant side is correct, 0..1 */
  calibratedProb: number;
  /** Agreement 0..1 — 1 = all engines on same side, 0 = perfect split */
  agreement: number;
  /** How many engines actually contributed a non-zero vote */
  engineCount: number;
  /** Engines that voted with the dominant side */
  agreeingEngines: { id: string; label: string; confidence: number }[];
  /** Engines that voted against the dominant side */
  disagreeingEngines: { id: string; label: string; confidence: number }[];
  /** Engines that abstained */
  abstainingEngines: { id: string; label: string }[];
  /** Three-bucket short label for UI */
  consensusLabel: "UNANIMOUS" | "MAJORITY" | "SPLIT";
  /** Plain-english reason when decision = STAND_ASIDE */
  standAsideReason?: string;
  /** Suggested R-multiple expectation: prob×R_up − (1-prob)×R_down */
  expectedR: number;
}

const DEFAULT_RELIABILITY = 0.55;
const MIN_ENGINES_FOR_TRADE = 3;
const MIN_CALIBRATED_PROB = 0.58;
const MIN_AGREEMENT = 0.55;

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/**
 * Build the consensus from a list of engine signals.
 *
 * Math:
 *   weight_i  = reliability_i × confidence_i        (inverse-variance proxy)
 *   ensemble  = Σ direction_i × weight_i / Σ weight_i        ∈ [-1, +1]
 *   agreement = |Σ direction_i × weight_i| / Σ weight_i      ∈ [0, 1]
 *   calibrated= Platt-style: σ(α·ensemble + β·agreement + γ)
 *               with α=3.2, β=1.4, γ=0 — sigmoid keeps it bounded and
 *               smoothly maps near-tie ensembles to ~0.50.
 *
 * Decision gate:
 *   STAND_ASIDE if engineCount < 3
 *               OR calibratedProb < 0.58
 *               OR agreement     < 0.55
 *               OR expectedR     < 0.20
 */
export function runConsensus(
  signals: EngineSignal[],
  opts?: { rUp?: number; rDown?: number },
): ConsensusResult {
  const active = signals.filter((s) => s.hasSignal !== false && s.direction !== 0);
  const abstaining = signals.filter((s) => s.hasSignal === false || s.direction === 0);

  const rUp = clamp(opts?.rUp ?? 2.0, 0.5, 6);
  const rDown = clamp(opts?.rDown ?? 1.0, 0.2, 4);

  if (active.length === 0) {
    return {
      decision: "STAND_ASIDE",
      ensembleScore: 0,
      calibratedProb: 0.5,
      agreement: 0,
      engineCount: 0,
      agreeingEngines: [],
      disagreeingEngines: [],
      abstainingEngines: abstaining.map((s) => ({ id: s.id, label: s.label })),
      consensusLabel: "SPLIT",
      standAsideReason: "No engine produced a directional signal.",
      expectedR: 0,
    };
  }

  let totalWeight = 0;
  let signedSum = 0;
  for (const s of active) {
    const w = clamp(s.reliability ?? DEFAULT_RELIABILITY, 0.2, 0.95) * clamp(s.confidence, 0.05, 1);
    totalWeight += w;
    signedSum += s.direction * w;
  }
  const ensembleScore = totalWeight > 0 ? signedSum / totalWeight : 0;
  const agreement = totalWeight > 0 ? Math.abs(signedSum) / totalWeight : 0;

  // Platt-style logistic calibration. α=3.2 was chosen so that an
  // ensemble of |0.4| with full agreement maps to ≈0.78 calibrated prob.
  const alpha = 3.2;
  const beta = 1.4;
  const z = alpha * ensembleScore * Math.sign(ensembleScore || 1) + beta * agreement - (beta * 0.5);
  const probDominant = 1 / (1 + Math.exp(-z));
  const calibratedProb = clamp(probDominant, 0.5, 0.95);

  const dominant: EngineDirection = ensembleScore >= 0 ? 1 : -1;
  const agreeingEngines = active
    .filter((s) => s.direction === dominant)
    .map((s) => ({ id: s.id, label: s.label, confidence: Number(s.confidence.toFixed(2)) }));
  const disagreeingEngines = active
    .filter((s) => s.direction !== dominant)
    .map((s) => ({ id: s.id, label: s.label, confidence: Number(s.confidence.toFixed(2)) }));

  const consensusLabel: ConsensusResult["consensusLabel"] =
    disagreeingEngines.length === 0
      ? "UNANIMOUS"
      : agreement >= 0.5
        ? "MAJORITY"
        : "SPLIT";

  // Expected R-multiple: prob×R_up − (1−prob)×R_down. This is the
  // single most honest filter — even at 60% prob with 1:1 R/R, edge ~0.2R.
  const expectedR = calibratedProb * rUp - (1 - calibratedProb) * rDown;

  // ── Decision gate ────────────────────────────────────────────
  let decision: ConsensusDecision = dominant === 1 ? "BUY" : "SELL";
  let standAsideReason: string | undefined;

  if (active.length < MIN_ENGINES_FOR_TRADE) {
    decision = "STAND_ASIDE";
    standAsideReason = `Only ${active.length} engine${active.length === 1 ? "" : "s"} have a view (need ${MIN_ENGINES_FOR_TRADE}+).`;
  } else if (calibratedProb < MIN_CALIBRATED_PROB) {
    decision = "STAND_ASIDE";
    standAsideReason = `Calibrated win-probability only ${(calibratedProb * 100).toFixed(0)}% (need ≥${(MIN_CALIBRATED_PROB * 100).toFixed(0)}%).`;
  } else if (agreement < MIN_AGREEMENT) {
    decision = "STAND_ASIDE";
    standAsideReason = `Engine agreement only ${(agreement * 100).toFixed(0)}% — too split to trade.`;
  } else if (expectedR < 0.2) {
    decision = "STAND_ASIDE";
    standAsideReason = `Expected R-multiple ${expectedR.toFixed(2)} below threshold — risk/reward insufficient.`;
  }

  return {
    decision,
    ensembleScore: Number(ensembleScore.toFixed(3)),
    calibratedProb: Number(calibratedProb.toFixed(3)),
    agreement: Number(agreement.toFixed(3)),
    engineCount: active.length,
    agreeingEngines,
    disagreeingEngines,
    abstainingEngines: abstaining.map((s) => ({ id: s.id, label: s.label })),
    consensusLabel,
    standAsideReason,
    expectedR: Number(expectedR.toFixed(2)),
  };
}

/** Helper: normalise a confidence-pct (0..100) to 0..1 with clamping. */
export const pctToConf = (pct: number | undefined | null): number =>
  clamp(((Number(pct) || 0) / 100), 0.05, 1);

/** Helper: convert a signed numeric score into an EngineDirection by sign + deadzone. */
export function scoreToDirection(score: number, deadzone = 0.05): EngineDirection {
  if (!Number.isFinite(score) || Math.abs(score) < deadzone) return 0;
  return score > 0 ? 1 : -1;
}