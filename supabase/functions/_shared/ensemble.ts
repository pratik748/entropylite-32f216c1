// Ensemble Consensus Engine — pure, deterministic, dependency-free.
//
// v2 (accuracy-rebuild): the previous version weighted every engine
// equally and called any 3+ agreeing engines "consensus". The flaw: most
// of those engines were correlated (5 momentum-style engines reading the
// same price tape don't give 5 independent confirmations). v2 introduces:
//
//   1. BUCKETS  — engines are assigned to one of 3 orthogonal info
//      sources (price/flow, fundamental/intel, risk/regime). We require
//      ≥2 buckets to agree before firing, not ≥3 engines.
//   2. COST HAIRCUT — expectedR subtracts a per-ticker round-trip cost.
//      Indian small-caps (150 bps) get filtered without us having to
//      think about them.
//   3. DB-LOADED CALIBRATION — α, β, γ are passed in from the caller
//      (loaded from `calibration_params` table, refit nightly). Falls
//      back to v1 constants if no caller-supplied values.
//
// References:
//   • Markowitz / Black-Litterman view blending (inverse-variance)
//   • Platt scaling (1999) for probability calibration
//   • Brier score (1950) for calibration quality
//   • Wilson (1927) lower bound for small-sample win-rate

import { bucketOf, type Bucket, type BucketVote, type BucketDecision } from "./buckets.ts";
import { cfExpectedR } from "./mathEdge.ts";

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
  /** Optional explicit bucket override (else looked up from `BUCKET_ASSIGNMENT`) */
  bucket?: Bucket;
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
  /** Per-bucket vote breakdown (new in v2) */
  bucketDecision: BucketDecision;
  /** Per-bucket directional summary for UI: { A:+1, B:-1, C:0 } */
  bucketDirs: { A: -1 | 0 | 1; B: -1 | 0 | 1; C: -1 | 0 | 1 };
  /** Cost haircut applied (decimal, e.g. 0.015 = 1.5%) */
  costHaircut: number;
  /** Cornish-Fisher tail multiplier applied to rDown (≥1 for fat left tail) */
  tailMultiplier?: number;
}

const DEFAULT_RELIABILITY = 0.55;
const MIN_ENGINES_FOR_TRADE = 3;
const MIN_CALIBRATED_PROB = 0.58;
const MIN_AGREEMENT = 0.55;
const MIN_VOTING_BUCKETS = 2;       // need ≥2 of 3 buckets to even speak
const MIN_AGREEING_BUCKETS = 2;     // need ≥2 of 3 buckets to agree on direction
const MIN_EXPECTED_R = 0.20;

export interface CalibrationParams {
  alpha: number;
  beta: number;
  gamma: number;
}
const DEFAULT_CALIBRATION: CalibrationParams = { alpha: 3.2, beta: 1.4, gamma: -0.7 };

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
  opts?: {
    rUp?: number;
    rDown?: number;
    /** Round-trip cost as decimal (0.015 = 1.5%); subtracted from expectedR */
    costHaircut?: number;
    /** Platt scaling params; defaults to v1 constants if absent */
    calibration?: CalibrationParams;
    /** Realised daily-return skew of the underlying; enables CF-adjusted rDown */
    skew?: number;
    /** Realised daily-return excess kurtosis; enables CF-adjusted rDown */
    excessKurt?: number;
  },
): ConsensusResult {
  const active = signals.filter((s) => s.hasSignal !== false && s.direction !== 0);
  const abstaining = signals.filter((s) => s.hasSignal === false || s.direction === 0);

  const rUp = clamp(opts?.rUp ?? 2.0, 0.5, 6);
  const rDown = clamp(opts?.rDown ?? 1.0, 0.2, 4);
  const haircut = clamp(opts?.costHaircut ?? 0, 0, 0.05);
  const cal = opts?.calibration ?? DEFAULT_CALIBRATION;

  const emptyBuckets: BucketDecision = {
    buckets: [],
    votingBuckets: 0,
    agreeingBuckets: 0,
    consensus: "INSUFFICIENT",
  };
  const emptyBucketDirs = { A: 0 as const, B: 0 as const, C: 0 as const };

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
      bucketDecision: emptyBuckets,
      bucketDirs: emptyBucketDirs,
      costHaircut: haircut,
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

  // Platt-style logistic calibration. Constants come from `calibration_params`
  // table (refit nightly from realised outcomes) so the displayed
  // probability actually corresponds to historical hit-rate.
  const z = cal.alpha * Math.abs(ensembleScore) + cal.beta * agreement + cal.gamma;
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

  // Expected R-multiple AFTER round-trip cost. Indian small-caps with
  // 1.5% haircut will routinely fall below threshold here — that is the
  // feature. Cost in R-units = haircut/avgLoss% ≈ haircut/(0.02) for a
  // typical 2% stop.
  const haircutInR = haircut > 0 ? haircut / 0.02 : 0;
  // Cornish-Fisher fat-tail aware expected R.  When skew is negative or
  // kurtosis is fat (small caps with crash risk) the rDown leg is scaled
  // up so the trade no longer fires on raw mean-revert math.
  const cf = cfExpectedR({
    p: calibratedProb,
    rUp,
    rDown,
    skew: Number.isFinite(opts?.skew as number) ? (opts!.skew as number) : 0,
    excessKurt: Number.isFinite(opts?.excessKurt as number) ? (opts!.excessKurt as number) : 0,
    haircutInR,
    conf: 0.95,
  });
  const expectedR = cf.expectedR;
  const tailMultiplier = cf.tailMultiplier;

  // ── Bucket aggregation (decorrelation layer) ─────────────────
  const bucketMap = new Map<Bucket, { signed: number; weight: number; engines: number }>();
  for (const s of active) {
    const b = s.bucket ?? bucketOf(s.id);
    const w = clamp(s.reliability ?? DEFAULT_RELIABILITY, 0.2, 0.95) * clamp(s.confidence, 0.05, 1);
    const cur = bucketMap.get(b) ?? { signed: 0, weight: 0, engines: 0 };
    cur.signed += s.direction * w;
    cur.weight += w;
    cur.engines += 1;
    bucketMap.set(b, cur);
  }
  const buckets: BucketVote[] = (["A","B","C"] as Bucket[]).map((b) => {
    const v = bucketMap.get(b);
    if (!v || v.weight === 0) {
      return { bucket: b, direction: 0 as EngineDirection, agreement: 0, weight: 0, engines: 0 };
    }
    const dir: EngineDirection = v.signed === 0 ? 0 : v.signed > 0 ? 1 : -1;
    return {
      bucket: b,
      direction: dir,
      agreement: Number((Math.abs(v.signed) / v.weight).toFixed(2)),
      weight: Number(v.weight.toFixed(3)),
      engines: v.engines,
    };
  });
  const votingBuckets = buckets.filter((b) => b.direction !== 0).length;
  const agreeingBuckets = buckets.filter((b) => b.direction === dominant).length;
  const bucketConsensus: BucketDecision["consensus"] =
    votingBuckets < MIN_VOTING_BUCKETS ? "INSUFFICIENT"
      : agreeingBuckets === 3 ? "ALL_3"
      : agreeingBuckets === 2 ? "TWO_OF_3"
      : "SPLIT";
  const bucketDecision: BucketDecision = { buckets, votingBuckets, agreeingBuckets, consensus: bucketConsensus };
  const bucketDirs = {
    A: (buckets.find((b) => b.bucket === "A")?.direction ?? 0) as -1 | 0 | 1,
    B: (buckets.find((b) => b.bucket === "B")?.direction ?? 0) as -1 | 0 | 1,
    C: (buckets.find((b) => b.bucket === "C")?.direction ?? 0) as -1 | 0 | 1,
  };

  // ── Decision gate ────────────────────────────────────────────
  let decision: ConsensusDecision = dominant === 1 ? "BUY" : "SELL";
  let standAsideReason: string | undefined;

  if (active.length < MIN_ENGINES_FOR_TRADE) {
    decision = "STAND_ASIDE";
    standAsideReason = `Only ${active.length} engine${active.length === 1 ? "" : "s"} have a view (need ${MIN_ENGINES_FOR_TRADE}+).`;
  } else if (votingBuckets < MIN_VOTING_BUCKETS) {
    decision = "STAND_ASIDE";
    standAsideReason = `Only ${votingBuckets} of 3 info-buckets fired (need ${MIN_VOTING_BUCKETS}+: price-flow, fundamental, regime).`;
  } else if (agreeingBuckets < MIN_AGREEING_BUCKETS) {
    decision = "STAND_ASIDE";
    standAsideReason = `Buckets disagree — only ${agreeingBuckets} of ${votingBuckets} support ${dominant === 1 ? "BUY" : "SELL"}.`;
  } else if (calibratedProb < MIN_CALIBRATED_PROB) {
    decision = "STAND_ASIDE";
    standAsideReason = `Calibrated win-probability only ${(calibratedProb * 100).toFixed(0)}% (need ≥${(MIN_CALIBRATED_PROB * 100).toFixed(0)}%).`;
  } else if (agreement < MIN_AGREEMENT) {
    decision = "STAND_ASIDE";
    standAsideReason = `Engine agreement only ${(agreement * 100).toFixed(0)}% — too split to trade.`;
  } else if (expectedR < MIN_EXPECTED_R) {
    decision = "STAND_ASIDE";
    standAsideReason = haircut > 0.005
      ? `Expected R after costs only ${expectedR.toFixed(2)} — ${(haircut * 100).toFixed(2)}% round-trip cost eats the edge.`
      : `Expected R-multiple ${expectedR.toFixed(2)} below threshold — risk/reward insufficient.`;
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
    bucketDecision,
    bucketDirs,
    costHaircut: haircut,
    tailMultiplier: Number(tailMultiplier.toFixed(2)),
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