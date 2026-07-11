// ConfidenceEngine + OpportunityValidator + ranking.
//
// Cross-validation: the independent model votes are combined by the shared
// ensemble (`runConsensus`) which groups them into orthogonal information
// buckets and *requires agreement across buckets*. Conflicting evidence
// mechanically lowers agreement → lowers calibrated probability → fails the
// gate. Nothing here manufactures confidence: the calibration constants are
// refit nightly from realized outcomes (`calibration_params` table).
//
// Ranking objective:  |expectedEdge| × confidence / downsideRisk
// — expected risk-adjusted edge, not popularity.

import { runConsensus, type CalibrationParams, type EngineSignal } from "../ensemble.ts";
import { costHaircut, tickerClass } from "../costs.ts";
import { cornishFisherZ } from "../mathEdge.ts";
import type { MarketRegime } from "./models.ts";
import type { ChartSeries } from "./evidence.ts";
import { computePriceFeatures } from "./evidence.ts";
import type {
  EvidenceBundle,
  ModelScore,
  RejectionRecord,
  ValidatedOpportunity,
} from "./types.ts";

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

// ── Validation thresholds ───────────────────────────────────────────
// Each constant is a data-sufficiency or economic-viability floor, not a
// tuning knob:
//   MIN_PRICE_BARS   — ~6 months of dailies; anything less and vol/momentum
//                      estimates are statistically unstable.
//   LIQUIDITY_FLOOR  — average daily traded value below which a retail-size
//                      position already moves the market / can't exit cleanly.
//                      Set per currency at roughly the same economic level
//                      (~$1–2M/day equivalent).
const MIN_PRICE_BARS = 120;
const LIQUIDITY_FLOOR_BY_CCY: Record<string, number> = {
  USD: 2_000_000,
  INR: 150_000_000, // ≈ $1.8M
  EUR: 2_000_000,
  GBP: 1_500_000,
};
const DEFAULT_LIQUIDITY_FLOOR = 2_000_000;

// ── Regime detection (from benchmark evidence, not opinion) ────────

export function detectRegime(benchmark: ChartSeries | null): MarketRegime {
  if (!benchmark || benchmark.closes.length < 60) {
    return {
      label: "neutral",
      benchmarkRet21d: 0,
      benchmarkVolAnnual: 0,
      benchmarkAboveSma200: null,
      evidence: ["Benchmark history unavailable — regime treated as neutral (no synthetic regime is invented)."],
    };
  }
  const f = computePriceFeatures(benchmark, null);
  const aboveSma200 = f.sma200 != null ? f.lastClose > f.sma200 : null;
  const evidence: string[] = [
    `Benchmark 21-day return ${pct(f.ret21d)}, realized vol ${pct(f.volAnnual)} annualized.`,
    aboveSma200 == null
      ? "200-day average unavailable (short history)."
      : `Benchmark ${aboveSma200 ? "above" : "below"} its 200-day average.`,
    `Benchmark drawdown from 1y peak: ${pct(f.drawdownFromPeak)}.`,
  ];
  let label: MarketRegime["label"] = "neutral";
  // Risk-off needs CURRENT stress, not the memory of an old drawdown: a
  // benchmark that has already recovered (positive 21d, above 200-day)
  // is not risk-off however deep the past trough was.
  const riskOff =
    (aboveSma200 === false && f.ret21d < 0) ||
    (f.drawdownFromPeak > 0.12 && f.ret21d < 0) ||
    (f.volAnnual > 0.25 && f.ret21d < -0.03);
  const riskOn = aboveSma200 !== false && f.ret21d > 0.01 && f.volAnnual < 0.22 && f.drawdownFromPeak < 0.10;
  if (riskOff) label = "risk-off";
  else if (riskOn) label = "risk-on";
  return { label, benchmarkRet21d: f.ret21d, benchmarkVolAnnual: f.volAnnual, benchmarkAboveSma200: aboveSma200, evidence };
}

// ── Model → ensemble signal adapter ─────────────────────────────────

function toEngineSignals(models: ModelScore[]): EngineSignal[] {
  return models.map((m) => ({
    id: m.id,
    label: m.label,
    direction: m.direction,
    confidence: m.confidence,
    hasSignal: m.hasSignal,
  }));
}

// ── Explainability ──────────────────────────────────────────────────

function buildRecentChange(b: EvidenceBundle): string {
  const p = b.price;
  if (!p) return "No recent price data.";
  const parts: string[] = [`${pct(p.ret5d)} over the last 5 sessions`];
  if (Math.abs(p.volumeZ20) >= 2) parts.push(`volume ${p.volumeZ20.toFixed(1)}σ above its 20-day norm`);
  if (p.volAnnualPrev > 0) {
    const volChange = p.volAnnual / p.volAnnualPrev - 1;
    if (Math.abs(volChange) > 0.25) parts.push(`realized volatility ${volChange > 0 ? "expanded" : "compressed"} ${pct(Math.abs(volChange))} vs the prior half-year`);
  }
  if (b.sentiment?.topHeadline) parts.push(`latest headline: "${b.sentiment.topHeadline}"`);
  return parts.join("; ") + ".";
}

function buildInvalidation(b: EvidenceBundle, direction: "long" | "short", horizonDays: number): string[] {
  const p = b.price;
  const out: string[] = [];
  if (p) {
    const sigmaH = p.volAnnual * Math.sqrt(horizonDays / 252);
    const adverse = direction === "long" ? p.lastClose * (1 - 1.25 * sigmaH) : p.lastClose * (1 + 1.25 * sigmaH);
    out.push(
      `${direction === "long" ? "A close below" : "A close above"} ${adverse.toFixed(2)} (1.25× the expected ${horizonDays}-day volatility against the position).`,
    );
    if (direction === "long" && p.lastClose > p.sma50) out.push(`Loss of the 50-day average at ${p.sma50.toFixed(2)}.`);
    if (direction === "short" && p.lastClose < p.sma50) out.push(`Reclaim of the 50-day average at ${p.sma50.toFixed(2)}.`);
    out.push("Average daily traded value falling below the liquidity floor.");
  }
  out.push("Any information bucket (price/flow, fundamental, risk/regime) flipping against the position — the consensus gate would then fail on re-evaluation.");
  return out;
}

// ── ConfidenceEngine + Validator ────────────────────────────────────

export interface EvaluationInput {
  bundle: EvidenceBundle;
  models: ModelScore[];
  regime: MarketRegime;
  horizonDays: number;
  calibration: CalibrationParams;
}

export type EvaluationResult =
  | { ok: true; opportunity: ValidatedOpportunity }
  | { ok: false; rejection: RejectionRecord };

/**
 * Turn a scored candidate into a validated opportunity — or an explicit,
 * reasoned rejection. This is the only place opportunities are minted.
 */
export function evaluateCandidate(input: EvaluationInput): EvaluationResult {
  const { bundle, models, regime, horizonDays, calibration } = input;
  const { candidate } = bundle;
  const symbol = candidate.symbol;
  const p = bundle.price;

  // Gate 0: data sufficiency. We refuse to score what we can't measure.
  if (!p) {
    return { ok: false, rejection: { symbol, stage: "evidence", reason: "no_price_history" } };
  }
  if (p.bars < MIN_PRICE_BARS) {
    return { ok: false, rejection: { symbol, stage: "evidence", reason: "insufficient_history" } };
  }
  if (!Number.isFinite(p.lastClose) || p.lastClose <= 0) {
    return { ok: false, rejection: { symbol, stage: "evidence", reason: "invalid_price" } };
  }

  // Gate 1: liquidity floor (economic viability).
  const ccy = p.currency ?? candidate.currency ?? "USD";
  const floor = LIQUIDITY_FLOOR_BY_CCY[ccy] ?? DEFAULT_LIQUIDITY_FLOOR;
  if (p.avgDollarVolume20d < floor) {
    return { ok: false, rejection: { symbol, stage: "validation", reason: "below_liquidity_floor" } };
  }

  // Cross-validation: orthogonal-bucket consensus over independent models.
  // rUp/rDown are expressed in horizon-sigma units (symmetric prior; the
  // fat-tail Cornish-Fisher adjustment inside runConsensus then inflates
  // the adverse leg for negatively-skewed names).
  const haircut = costHaircut(symbol);
  const consensus = runConsensus(toEngineSignals(models), {
    rUp: 1.0,
    rDown: 1.0,
    costHaircut: haircut,
    calibration,
    skew: p.skew,
    excessKurt: p.excessKurt,
  });

  if (consensus.decision === "STAND_ASIDE") {
    return {
      ok: false,
      rejection: {
        symbol,
        stage: "validation",
        reason: consensus.standAsideReason ?? "consensus_stand_aside",
      },
    };
  }

  const direction: "long" | "short" = consensus.decision === "BUY" ? "long" : "short";

  // Confidence / edge / risk — all from measured quantities:
  //   sigmaH        = realized vol scaled to the horizon
  //   expectedEdge  = expectedR (σ-units, post cost + fat-tail) × sigmaH
  //   downsideRisk  = 95% Cornish-Fisher VaR over the horizon
  const sigmaH = p.volAnnual * Math.sqrt(horizonDays / 252);
  const confidence = consensus.calibratedProb;
  const expectedEdgePct = consensus.expectedR * sigmaH * (direction === "long" ? 1 : -1);
  const zCF = Math.abs(cornishFisherZ(0.95, direction === "long" ? p.skew : -p.skew, p.excessKurt));
  const downsideRiskPct = Math.max(sigmaH * zCF, 0.005);

  if (Math.abs(expectedEdgePct) <= 0) {
    return { ok: false, rejection: { symbol, stage: "validation", reason: "non_positive_expected_edge" } };
  }

  const riskAdjustedScore = (Math.abs(expectedEdgePct) * confidence) / downsideRiskPct;
  if (!Number.isFinite(riskAdjustedScore) || riskAdjustedScore <= 0) {
    return { ok: false, rejection: { symbol, stage: "validation", reason: "non_positive_risk_adjusted_edge" } };
  }

  // Explainability: evidence for, against, what changed, what kills it.
  const dominantDir = direction === "long" ? 1 : -1;
  const supporting = models
    .filter((m) => m.hasSignal && m.direction === dominantDir)
    .flatMap((m) => m.rationale.slice(0, 2).map((r) => `${m.label}: ${r}`));
  const contradicting = models
    .filter((m) => m.hasSignal && m.direction === -dominantDir)
    .flatMap((m) => m.rationale.slice(0, 2).map((r) => `${m.label}: ${r}`));

  const collectors = Array.from(new Set(bundle.items.map((i) => i.collector)));

  const opportunity: ValidatedOpportunity = {
    symbol,
    name: candidate.name,
    assetClass: candidate.assetClass,
    exchange: candidate.exchange,
    currency: ccy,
    price: p.lastClose,
    direction,
    horizonDays,
    confidence: Number(confidence.toFixed(3)),
    expectedEdgePct: Number(expectedEdgePct.toFixed(4)),
    downsideRiskPct: Number(downsideRiskPct.toFixed(4)),
    riskAdjustedScore: Number(riskAdjustedScore.toFixed(3)),
    models,
    consensus: {
      decision: consensus.decision,
      calibratedProb: consensus.calibratedProb,
      agreement: consensus.agreement,
      engineCount: consensus.engineCount,
      consensusLabel: consensus.consensusLabel,
      expectedR: consensus.expectedR,
      bucketDirs: consensus.bucketDirs,
      bucketConsensus: consensus.bucketDecision.consensus,
    },
    supportingEvidence: supporting,
    contradictingEvidence: contradicting,
    recentChange: buildRecentChange(bundle),
    invalidation: buildInvalidation(bundle, direction, horizonDays),
    origin: candidate.origin,
    liquidityTier: tickerClass(symbol),
    costHaircutPct: Number((haircut * 100).toFixed(2)),
    avgDollarVolume20d: Math.round(p.avgDollarVolume20d),
    dataQuality: {
      priceBars: p.bars,
      collectors,
      missing: bundle.missing,
    },
    asOf: new Date().toISOString(),
  };

  return { ok: true, opportunity };
}

/** Rank by expected risk-adjusted edge — the single ranking used everywhere. */
export function rankOpportunities(opps: ValidatedOpportunity[]): ValidatedOpportunity[] {
  return [...opps].sort((a, b) => b.riskAdjustedScore - a.riskAdjustedScore);
}
