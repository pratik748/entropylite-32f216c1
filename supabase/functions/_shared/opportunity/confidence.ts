// ConfidenceEngine + OpportunityValidator + ranking.
//
// Cross-validation: the independent model votes are combined by the shared
// ensemble (`runConsensus`) which groups them into orthogonal information
// buckets and *requires agreement across buckets*. Conflicting evidence
// mechanically lowers agreement → lowers calibrated probability → fails the
// gate. Nothing here manufactures confidence:
//
//   • Platt constants are refit nightly from realized outcomes
//     (`calibration_params`).
//   • Per-model reliabilities come from settled T+5 outcomes
//     (`engine_reliability`), keyed by (model, ticker-class, regime) — a
//     model that stops working loses influence automatically.
//   • Missing evidence collectors shrink confidence toward 0.50 — an
//     opinion built on partial data is worth less, and says so.
//
// Ranking objective:  |expectedEdge| × confidence / downsideRisk
// (× a diversification multiplier when the caller supplied a portfolio) —
// expected risk-adjusted portfolio contribution, not popularity.

import { runConsensus, CONSENSUS_GATES, type CalibrationParams, type EngineSignal } from "../ensemble.ts";
import { costHaircut, tickerClass } from "../costs.ts";
import { cornishFisherZ, walkForwardEdge } from "../mathEdge.ts";
import type { MarketRegime } from "./models.ts";
import type { ChartSeries } from "./evidence.ts";
import { computePriceFeatures } from "./evidence.ts";
import { deriveEvidence, summarizeEvidence } from "./evidenceLayer.ts";
import { contextConfidenceMultiplier, type MarketContext } from "./marketContext.ts";
import type { MacroContext } from "./macro.ts";
import type { ReputationBook } from "./reputationCore.ts";
import type {
  AcceptanceReasonCode,
  EvidenceBundle,
  ModelScore,
  NearMiss,
  OpportunityDiagnostics,
  OpportunitySizing,
  PortfolioFit,
  RejectionCode,
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
//   MAX_DOWNSIDE_RISK — a horizon 95% CF-VaR above this is uninvestable tail
//                       risk regardless of edge; the position can lose an
//                       outsized fraction of itself over the holding period.
//                       Set high (75%) so it only ever bites genuinely
//                       extreme names (deep-vol crypto / small-caps at long
//                       horizons) — normal equities sit far below it.
const MAX_DOWNSIDE_RISK = 0.75;
const LIQUIDITY_FLOOR_BY_CCY: Record<string, number> = {
  USD: 2_000_000,
  INR: 150_000_000, // ≈ $1.8M
  EUR: 2_000_000,
  GBP: 1_500_000,
};
const DEFAULT_LIQUIDITY_FLOOR = 2_000_000;

// Sizing constants:
//   KELLY_FRACTION    — 0.25× Kelly, the standard survivability discount.
//   KELLY_CAP         — no single idea exceeds 10% of capital on Kelly math.
//   VOL_BUDGET_ANNUAL — each position is budgeted ~2% annualized portfolio
//                       vol contribution (weight = budget / asset vol).
//   VOL_WEIGHT_CAP    — vol-target weight ceiling, 15%.
const KELLY_FRACTION = 0.25;
const KELLY_CAP = 0.10;
const VOL_BUDGET_ANNUAL = 0.02;
const VOL_WEIGHT_CAP = 0.15;

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

// ── Model → ensemble signal adapter (reputation-weighted) ───────────

function toEngineSignals(
  models: ModelScore[],
  reputation: ReputationBook,
  cls: string,
  regimeLabel: string,
): { signals: EngineSignal[]; reputationNotes: string[] } {
  const notes: string[] = [];
  const signals = models.map((m) => {
    const rel = reputation.lookup(m.id, cls, regimeLabel);
    if (rel != null && m.direction !== 0 && m.hasSignal && Math.abs(rel - 0.55) >= 0.03) {
      notes.push(`${m.label}: settled-outcome reliability ${(rel * 100).toFixed(0)}% in this context (default 55%).`);
    }
    return {
      id: m.id,
      label: m.label,
      direction: m.direction,
      confidence: m.confidence,
      hasSignal: m.hasSignal,
      ...(rel != null ? { reliability: rel } : {}),
    };
  });
  return { signals, reputationNotes: notes.slice(0, 4) };
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

// ── Portfolio interaction ───────────────────────────────────────────

function correlation(a: number[], b: number[]): number | null {
  const n = Math.min(a.length, b.length);
  if (n < 40) return null;
  const xa = a.slice(-n), xb = b.slice(-n);
  const ma = xa.reduce((s, v) => s + v, 0) / n;
  const mb = xb.reduce((s, v) => s + v, 0) / n;
  let cov = 0, va = 0, vb = 0;
  for (let i = 0; i < n; i++) {
    cov += (xa[i] - ma) * (xb[i] - mb);
    va += (xa[i] - ma) ** 2;
    vb += (xb[i] - mb) ** 2;
  }
  const denom = Math.sqrt(va * vb);
  return denom > 0 ? cov / denom : null;
}

function logReturns(closes: number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    if (closes[i - 1] > 0 && closes[i] > 0) out.push(Math.log(closes[i] / closes[i - 1]));
  }
  return out;
}

/**
 * Weighted composite daily-return series for the caller's holdings —
 * the reference stream candidates are correlated against.
 */
export function buildPortfolioReturns(holdings: Array<{ series: ChartSeries; weight: number }>): number[] | null {
  const usable = holdings.filter((h) => h.series.closes.length >= 60 && h.weight > 0);
  if (usable.length === 0) return null;
  const rets = usable.map((h) => ({ r: logReturns(h.series.closes), w: h.weight }));
  const len = Math.min(...rets.map((x) => x.r.length));
  if (len < 40) return null;
  const totalW = rets.reduce((s, x) => s + x.w, 0);
  const out: number[] = new Array(len).fill(0);
  for (const { r, w } of rets) {
    const tail = r.slice(-len);
    for (let i = 0; i < len; i++) out[i] += (w / totalW) * tail[i];
  }
  return out;
}

// ── ConfidenceEngine + Validator ────────────────────────────────────

export interface EvaluationInput {
  bundle: EvidenceBundle;
  models: ModelScore[];
  regime: MarketRegime;
  horizonDays: number;
  calibration: CalibrationParams;
  reputation: ReputationBook;
  /** Measured macro context — feeds the Evidence Layer's macro/regime objects. */
  macro?: MacroContext | null;
  /** Classified market environment — nudges confidence, never model direction. */
  marketContext?: MarketContext | null;
  /** Weighted daily-return composite of the caller's holdings, if provided. */
  portfolioReturns?: number[] | null;
  /** Caller's portfolio value for qty sizing, denominated in portfolioCurrency. */
  portfolioValue?: number | null;
  /** Currency of portfolioValue (e.g. "INR" for India-mode users). Whole-unit
   *  qty is only quoted when it matches the candidate's trading currency —
   *  never by dividing rupees by a dollar price. */
  portfolioCurrency?: string | null;
}

export type EvaluationResult =
  | { ok: true; opportunity: ValidatedOpportunity }
  | { ok: false; rejection: RejectionRecord; nearMiss?: NearMiss };

function reject(
  symbol: string,
  stage: RejectionRecord["stage"],
  code: RejectionCode,
  reason: string,
  details?: Record<string, number>,
): EvaluationResult {
  return { ok: false, rejection: { symbol, stage, code, reason, details } };
}

/** Classify a STAND_ASIDE with the exact gate constants the ensemble used. */
function standAsideCode(c: ReturnType<typeof runConsensus>): RejectionCode {
  if (c.engineCount < CONSENSUS_GATES.minEngines) return "too_few_models";
  if (c.bucketDecision.votingBuckets < CONSENSUS_GATES.minVotingBuckets) return "insufficient_bucket_coverage";
  if (c.bucketDecision.agreeingBuckets < CONSENSUS_GATES.minAgreeingBuckets) return "bucket_disagreement";
  if (c.calibratedProb < CONSENSUS_GATES.minCalibratedProb) return "confidence_below_threshold";
  if (c.agreement < CONSENSUS_GATES.minAgreement) return "agreement_below_threshold";
  return "insufficient_expected_r";
}

/**
 * Turn a scored candidate into a validated opportunity — or an explicit,
 * reasoned rejection. This is the only place opportunities are minted.
 */
export function evaluateCandidate(input: EvaluationInput): EvaluationResult {
  const { bundle, models, horizonDays, calibration, reputation, regime } = input;
  const { candidate } = bundle;
  const symbol = candidate.symbol;
  const p = bundle.price;

  // Gate 0: data sufficiency. We refuse to score what we can't measure.
  if (!p) return reject(symbol, "evidence", "no_price_history", "No usable daily price history.");
  if (p.bars < MIN_PRICE_BARS) {
    return reject(symbol, "evidence", "insufficient_history", `Only ${p.bars} daily bars (need ${MIN_PRICE_BARS}+).`, { bars: p.bars, required: MIN_PRICE_BARS });
  }
  if (!Number.isFinite(p.lastClose) || p.lastClose <= 0) {
    return reject(symbol, "evidence", "invalid_price", "Last close is not a valid positive price.");
  }

  // Gate 1: liquidity floor (economic viability).
  // Currency resolution: chart metadata → candidate → listing suffix
  // (.NS/.BO trade in INR) → USD. The suffix fallback matters for the
  // local venue, whose data proxy doesn't return chart currency.
  const ccy = p.currency
    ?? candidate.currency
    ?? (/\.(NS|BO)$/i.test(symbol) ? "INR" : "USD");
  const floor = LIQUIDITY_FLOOR_BY_CCY[ccy] ?? DEFAULT_LIQUIDITY_FLOOR;
  if (p.avgDollarVolume20d < floor) {
    return reject(symbol, "validation", "below_liquidity_floor",
      `20-day average traded value ${Math.round(p.avgDollarVolume20d).toLocaleString()} ${ccy} is below the ${floor.toLocaleString()} ${ccy} floor.`,
      { avgDollarVolume20d: Math.round(p.avgDollarVolume20d), floor });
  }

  // Cross-validation: orthogonal-bucket consensus over independent models,
  // with per-model reliabilities loaded from settled outcomes.
  const cls = tickerClass(symbol);
  const haircut = costHaircut(symbol);
  const { signals, reputationNotes } = toEngineSignals(models, reputation, cls, regime.label);
  const consensus = runConsensus(signals, {
    rUp: 1.0,
    rDown: 1.0,
    costHaircut: haircut,
    calibration,
    skew: p.skew,
    excessKurt: p.excessKurt,
  });

  if (consensus.decision === "STAND_ASIDE") {
    const code = standAsideCode(consensus);
    const dominant = consensus.ensembleScore > 0 ? "long" : consensus.ensembleScore < 0 ? "short" : "none";
    return {
      ok: false,
      rejection: {
        symbol,
        stage: "validation",
        code,
        reason: consensus.standAsideReason ?? "Consensus gate failed.",
        details: {
          calibratedProb: consensus.calibratedProb,
          agreement: consensus.agreement,
          expectedR: consensus.expectedR,
          engineCount: consensus.engineCount,
          agreeingBuckets: consensus.bucketDecision.agreeingBuckets,
        },
      },
      nearMiss: {
        symbol,
        name: candidate.name,
        direction: dominant,
        code,
        calibratedProb: consensus.calibratedProb,
        agreement: consensus.agreement,
        bucketDirs: consensus.bucketDirs,
      },
    };
  }

  const direction: "long" | "short" = consensus.decision === "BUY" ? "long" : "short";

  // ── Dynamic confidence ───────────────────────────────────────────
  // Start from the calibrated bucket-consensus probability, then shrink
  // toward 0.50 by the square root of evidence completeness: an opinion
  // formed on 3 of 4 collectors is explicitly worth less than one formed
  // on all 4, and the drivers record why.
  const collectors = Array.from(new Set(bundle.items.map((i) => i.collector)));
  const completeness = collectors.length / Math.max(1, collectors.length + bundle.missing.length);
  const completenessConfidence = clamp(0.5 + (consensus.calibratedProb - 0.5) * Math.sqrt(completeness), 0.5, 0.95);
  let confidence = completenessConfidence;
  const confidenceDrivers: string[] = [
    `Bucket-consensus calibrated probability ${(consensus.calibratedProb * 100).toFixed(0)}% (${consensus.bucketDecision.agreeingBuckets}/${consensus.bucketDecision.votingBuckets} buckets agree, engine agreement ${(consensus.agreement * 100).toFixed(0)}%).`,
    completeness < 1
      ? `Evidence completeness ${(completeness * 100).toFixed(0)}% (missing: ${bundle.missing.join(", ")}) shrinks confidence to ${(completenessConfidence * 100).toFixed(0)}%.`
      : "All evidence collectors returned data — no completeness discount.",
    ...reputationNotes,
  ];

  // Market context nudges conviction WITHOUT touching model direction or the
  // consensus decision (both already settled). The multiplier is bounded and
  // 1.0 in a neutral/normal environment, so ranking is unchanged when the
  // macro backdrop is uninformative.
  const ctxMult = input.marketContext ? contextConfidenceMultiplier(input.marketContext, direction) : 1;
  if (ctxMult !== 1) {
    const adjusted = clamp(confidence * ctxMult, 0.5, 0.95);
    if (adjusted !== confidence) {
      confidenceDrivers.push(
        `Market context (${input.marketContext!.labels.join(", ")}) ${ctxMult >= 1 ? "supports" : "tempers"} a ${direction} here — confidence ${ctxMult >= 1 ? "lifted" : "trimmed"} to ${(adjusted * 100).toFixed(0)}%.`,
      );
      confidence = adjusted;
    }
  }

  // Edge / risk — all from measured quantities:
  //   sigmaH        = realized vol scaled to the horizon
  //   expectedEdge  = expectedR (σ-units, post cost + fat-tail) × sigmaH
  //   downsideRisk  = 95% Cornish-Fisher VaR over the horizon
  const sigmaH = p.volAnnual * Math.sqrt(horizonDays / 252);
  const expectedEdgePct = consensus.expectedR * sigmaH * (direction === "long" ? 1 : -1);
  const zCF = Math.abs(cornishFisherZ(0.95, direction === "long" ? p.skew : -p.skew, p.excessKurt));
  const downsideRiskPct = Math.max(sigmaH * zCF, 0.005);

  // Gate 2: tail-risk ceiling. Even a strong edge is uninvestable when the
  // horizon 95% downside is a large fraction of the position — the honest,
  // machine-readable reason is "excessive downside risk", not silence.
  if (downsideRiskPct > MAX_DOWNSIDE_RISK) {
    return reject(symbol, "validation", "excessive_downside_risk",
      `Horizon 95% downside risk ${pct(downsideRiskPct)} exceeds the ${pct(MAX_DOWNSIDE_RISK)} ceiling — tail risk is uninvestable at this horizon.`,
      { downsideRiskPct: Number(downsideRiskPct.toFixed(3)), ceiling: MAX_DOWNSIDE_RISK });
  }

  if (Math.abs(expectedEdgePct) <= 0) {
    return reject(symbol, "validation", "non_positive_expected_edge", "Expected edge after costs is not positive.");
  }

  const riskAdjustedScore = (Math.abs(expectedEdgePct) * confidence) / downsideRiskPct;
  if (!Number.isFinite(riskAdjustedScore) || riskAdjustedScore <= 0) {
    return reject(symbol, "validation", "non_positive_risk_adjusted_edge", "Risk-adjusted edge is not positive.");
  }

  // ── Capital allocation (fractional Kelly ∧ vol budget) ──────────
  const tailMult = consensus.tailMultiplier && consensus.tailMultiplier > 0 ? consensus.tailMultiplier : 1;
  const payoffRatio = 1 / tailMult; // rUp=1σ vs fat-tail-adjusted rDown=tailMult σ
  const rawKelly = confidence - (1 - confidence) / Math.max(payoffRatio, 0.01);
  const fractionalKelly = clamp(rawKelly * KELLY_FRACTION, 0, KELLY_CAP);
  const volTargetWeight = clamp(VOL_BUDGET_ANNUAL / Math.max(p.volAnnual, 0.05), 0, VOL_WEIGHT_CAP);
  const suggestedWeight = Math.min(fractionalKelly, volTargetWeight);
  const sizing: OpportunitySizing = {
    kellyFraction: Number(rawKelly.toFixed(4)),
    fractionalKellyPct: Number((fractionalKelly * 100).toFixed(2)),
    volTargetWeightPct: Number((volTargetWeight * 100).toFixed(2)),
    suggestedWeightPct: Number((suggestedWeight * 100).toFixed(2)),
    basis: fractionalKelly <= volTargetWeight ? "fractional_kelly" : "vol_target",
    estMaxLossPct: Number((suggestedWeight * downsideRiskPct * 100).toFixed(3)),
    // Whole-unit qty only when the portfolio value's currency matches the
    // candidate's trading currency (INR budget ÷ USD price is meaningless;
    // the % weight remains valid either way and the client converts).
    ...(input.portfolioValue && input.portfolioValue > 0 && (input.portfolioCurrency ?? "USD") === ccy
      ? { suggestedQty: Math.max(0, Math.floor((input.portfolioValue * suggestedWeight) / p.lastClose)) }
      : {}),
  };

  // ── Portfolio interaction ────────────────────────────────────────
  let portfolioFit: PortfolioFit | undefined;
  let portfolioAdjustedScore: number | undefined;
  if (input.portfolioReturns && input.portfolioReturns.length >= 40) {
    const corr = correlation(logReturns(p.closes), input.portfolioReturns);
    if (corr != null) {
      const mult = 1 - 0.3 * Math.max(0, corr);
      portfolioFit = {
        correlation: Number(corr.toFixed(3)),
        diversificationMultiplier: Number(mult.toFixed(3)),
        note: corr > 0.5
          ? `Highly correlated (ρ=${corr.toFixed(2)}) with existing holdings — adds concentration, ranking penalized.`
          : corr < 0
            ? `Negatively correlated (ρ=${corr.toFixed(2)}) with existing holdings — genuine diversification.`
            : `Moderate correlation (ρ=${corr.toFixed(2)}) with existing holdings.`,
      };
      portfolioAdjustedScore = Number((riskAdjustedScore * mult).toFixed(3));
    }
  }

  // ── Historical base rates for this setup ─────────────────────────
  const wf = walkForwardEdge(p.closes, horizonDays);
  const historicalStats = wf.n >= 40
    ? {
      sampleSize: wf.n,
      hitRatePct: Number(((direction === "long" ? wf.hitRate : 1 - wf.hitRate) * 100).toFixed(1)),
      meanReturnPct: Number(((direction === "long" ? wf.meanFwd : -wf.meanFwd) * 100).toFixed(2)),
      horizonDays,
    }
    : undefined;

  // Explainability: evidence for, against, what changed, what kills it.
  const dominantDir = direction === "long" ? 1 : -1;
  const supporting = models
    .filter((m) => m.hasSignal && m.direction === dominantDir)
    .flatMap((m) => m.rationale.slice(0, 2).map((r) => `${m.label}: ${r}`));
  const contradicting = models
    .filter((m) => m.hasSignal && m.direction === -dominantDir)
    .flatMap((m) => m.rationale.slice(0, 2).map((r) => `${m.label}: ${r}`));

  // Display trade levels, all in horizon-sigma units of the measured vol:
  // entry band ±0.25σ, objective = the 1σ favorable prior, invalidation =
  // the 1.25σ adverse level already quoted in the invalidation conditions.
  const dirSign = direction === "long" ? 1 : -1;
  const tradePlan = {
    entryLow: Number((p.lastClose * (1 - 0.25 * sigmaH)).toFixed(4)),
    entryHigh: Number((p.lastClose * (1 + 0.25 * sigmaH)).toFixed(4)),
    objective: Number((p.lastClose * (1 + dirSign * sigmaH)).toFixed(4)),
    invalidationLevel: Number((p.lastClose * (1 - dirSign * 1.25 * sigmaH)).toFixed(4)),
  };

  // Sparkline: decimate trailing closes to ≤60 points for the UI.
  const tail = p.closes.slice(-120);
  const step = Math.max(1, Math.ceil(tail.length / 60));
  const sparkline = tail.filter((_, i) => i % step === 0 || i === tail.length - 1).map((v) => Number(v.toFixed(4)));

  // ── Evidence Layer + machine-readable acceptance diagnostics ─────
  // Derived once from the bundle we already collected; reused for the
  // structured `evidence` surface and the diagnostics roll-up (no recompute).
  const evidence = deriveEvidence(bundle, input.macro ?? null, regime, horizonDays);
  const evidenceSummary = summarizeEvidence(evidence);
  const reasonCodes: AcceptanceReasonCode[] = ["bucket_consensus_met"];
  reasonCodes.push(consensus.bucketDecision.consensus === "ALL_3" ? "all_buckets_agree" : "majority_buckets_agree");
  reasonCodes.push(completeness >= 1 ? "full_evidence" : "partial_evidence");
  reasonCodes.push(historicalStats ? "historical_base_rate_available" : "insufficient_history_context");
  if (input.marketContext) {
    reasonCodes.push(input.marketContext.risk === "risk_on" ? "context_risk_on" : input.marketContext.risk === "risk_off" ? "context_risk_off" : "context_neutral");
    if (ctxMult > 1) reasonCodes.push("context_supports_direction");
    else if (ctxMult < 1) reasonCodes.push("context_tempers_direction");
  }
  const diagnostics: OpportunityDiagnostics = {
    accepted: true,
    reasonCodes,
    marketContextLabels: input.marketContext?.labels ?? [],
    evidenceCount: evidence.length,
    netEvidenceStrength: evidenceSummary.netStrength,
  };
  // Surface the strongest evidence objects (compact — keeps the payload lean).
  const topEvidence = [...evidence].sort((a, b) => Math.abs(b.strength) - Math.abs(a.strength)).slice(0, 8);

  // ── Conviction multiplier (ranking refinement) ───────────────────
  // Beyond raw risk-adjusted edge, promote the setups where INDEPENDENT
  // model factors genuinely corroborate each other — the "great asset"
  // signal. Every term is measured, bounded and explained; nothing is an
  // LLM opinion. Neutral inputs leave it at 1.0 (ranking unchanged).
  const convDrivers: string[] = [];
  let conviction = 1;
  if (consensus.bucketDecision.consensus === "ALL_3") { conviction += 0.15; convDrivers.push("all three orthogonal info-buckets agree"); }
  else if (consensus.bucketDecision.consensus === "TWO_OF_3") { conviction += 0.05; convDrivers.push("two of three info-buckets agree"); }
  if (historicalStats && historicalStats.sampleSize >= 40 && historicalStats.hitRatePct > 52) {
    const hb = clamp((historicalStats.hitRatePct - 52) / 100, 0, 0.12);
    conviction += hb;
    convDrivers.push(`historical hit-rate ${historicalStats.hitRatePct}% over ${historicalStats.sampleSize} ${horizonDays}d windows`);
  }
  const netAligned = evidenceSummary.netStrength * (direction === "long" ? 1 : -1);
  if (netAligned > 0) {
    conviction += clamp(netAligned * 0.15, 0, 0.1);
    convDrivers.push(`evidence net strength aligned with the ${direction}`);
  }
  const convictionMultiplier = Number(clamp(conviction, 1, 1.4).toFixed(3));
  if (convictionMultiplier > 1) {
    confidenceDrivers.push(`Conviction ${((convictionMultiplier - 1) * 100).toFixed(0)}% ranking boost — ${convDrivers.join("; ")}.`);
  }

  const opportunity: ValidatedOpportunity = {
    symbol,
    name: candidate.name,
    assetClass: candidate.assetClass,
    exchange: candidate.exchange,
    currency: ccy,
    price: p.lastClose,
    direction,
    horizonDays,
    ...(bundle.fundamentals?.sector ? { sector: bundle.fundamentals.sector } : {}),
    sparkline,
    tradePlan,
    confidence: Number(confidence.toFixed(3)),
    confidenceDrivers,
    expectedEdgePct: Number(expectedEdgePct.toFixed(4)),
    downsideRiskPct: Number(downsideRiskPct.toFixed(4)),
    riskAdjustedScore: Number(riskAdjustedScore.toFixed(3)),
    ...(portfolioAdjustedScore != null ? { portfolioAdjustedScore } : {}),
    convictionMultiplier,
    sizing,
    ...(portfolioFit ? { portfolioFit } : {}),
    ...(historicalStats ? { historicalStats } : {}),
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
    evidence: topEvidence,
    diagnostics,
    supportingEvidence: supporting,
    contradictingEvidence: contradicting,
    recentChange: buildRecentChange(bundle),
    invalidation: buildInvalidation(bundle, direction, horizonDays),
    origin: candidate.origin,
    liquidityTier: cls,
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

/**
 * Rank by expected risk-adjusted edge, refined by measured conviction — the
 * single ranking used everywhere. Base key is the portfolio-adjusted score
 * (edge × confidence / risk × diversification) when a portfolio was supplied,
 * else the risk-adjusted score; both are then scaled by the conviction
 * multiplier so setups where independent model factors corroborate each
 * other rise to the top. A mediocre but uncorrelated idea can still outrank a
 * brilliant redundant one; a strongly-corroborated idea outranks a marginal one.
 */
export function rankingScore(o: ValidatedOpportunity): number {
  return (o.portfolioAdjustedScore ?? o.riskAdjustedScore) * (o.convictionMultiplier ?? 1);
}

export function rankOpportunities(opps: ValidatedOpportunity[]): ValidatedOpportunity[] {
  return [...opps].sort((a, b) => rankingScore(b) - rankingScore(a));
}
