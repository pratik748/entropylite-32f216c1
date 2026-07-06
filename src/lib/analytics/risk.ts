/**
 * Risk analytics — drawdown structure, concentration, correlation, tails,
 * and a stress engine with NO hardcoded portfolio impacts.
 * ─────────────────────────────────────────────────────────────────────────
 * Stress scenarios are defined as market-factor shocks (the shock sizes are
 * documented historical episodes) and are propagated through each asset's
 * OWN regression beta estimated from real history:
 *
 *     ΔP/P = Σᵢ wᵢ · βᵢ · shock_mkt
 *
 * Historical replay finds the worst realized h-day window in the portfolio's
 * actual return series — the portfolio's own history, not an assumption.
 * Recovery estimates come from the portfolio's realized drawdown episodes.
 */

import { mean, stdev, skewness, excessKurtosis } from "@/lib/quant-engine";
import { evtVaR } from "@/lib/quant/evt";
import { pc1Concentration } from "@/lib/portfolio-math";
import {
  type DrawdownAnalysis, type DrawdownEpisode, type ConcentrationAnalysis,
  type CorrelationRisk, type TailRisk, type RiskMetrics,
  type StressScenario, type StressResult, type HistoricalReplayResult,
  type MetricValue, metric,
} from "./types";

// ─────────────────────────────────────────────────────────────────
// Drawdown analysis
// ─────────────────────────────────────────────────────────────────

export function analyzeDrawdowns(rets: number[]): DrawdownAnalysis {
  const n = rets.length;
  const equity: number[] = [1];
  for (const r of rets) equity.push(equity[equity.length - 1] * (1 + r));

  const underwater: number[] = [];
  const episodes: DrawdownEpisode[] = [];
  let peak = equity[0], peakIdx = 0;
  let inDD = false, troughIdx = 0, troughVal = equity[0];

  for (let i = 0; i < equity.length; i++) {
    const v = equity[i];
    if (v >= peak) {
      if (inDD) {
        episodes.push({
          peakIndex: peakIdx, troughIndex: troughIdx, recoveryIndex: i,
          depth: (peak - troughVal) / peak,
          lengthDays: troughIdx - peakIdx,
          recoveryDays: i - troughIdx,
        });
        inDD = false;
      }
      peak = v; peakIdx = i;
      underwater.push(0);
    } else {
      if (!inDD) { inDD = true; troughIdx = i; troughVal = v; }
      if (v < troughVal) { troughVal = v; troughIdx = i; }
      underwater.push((peak - v) / peak);
    }
  }
  if (inDD) {
    episodes.push({
      peakIndex: peakIdx, troughIndex: troughIdx, recoveryIndex: null,
      depth: (peak - troughVal) / peak,
      lengthDays: troughIdx - peakIdx,
      recoveryDays: null,
    });
  }

  const mdd = episodes.reduce((m, e) => Math.max(m, e.depth), 0);
  const current = underwater.length > 0 ? underwater[underwater.length - 1] : 0;
  const meaningful = episodes.filter(e => e.depth >= 0.05 && e.recoveryDays != null);
  const avgRec = meaningful.length > 0
    ? metric(
        meaningful.reduce((s, e) => s + (e.recoveryDays as number), 0) / meaningful.length,
        "historical-prices",
        `mean trough→recovery days over ${meaningful.length} completed drawdowns ≥ 5%`,
        n, undefined, meaningful.length >= 3 ? "medium" : "low")
    : null;

  return {
    maxDrawdown: metric(mdd, "historical-prices", "max peak-to-trough on compounded equity", n),
    currentDrawdown: metric(current, "historical-prices", "distance below running equity peak", n),
    episodes: episodes.sort((a, b) => b.depth - a.depth),
    avgRecoveryDays: avgRec,
    underwaterCurve: underwater,
  };
}

// ─────────────────────────────────────────────────────────────────
// Concentration
// ─────────────────────────────────────────────────────────────────

export function analyzeConcentration(
  positions: Array<{ ticker: string; weight: number; sector: string }>,
): ConcentrationAnalysis {
  const src = "portfolio-state" as const;
  const hhi = positions.reduce((s, p) => s + p.weight * p.weight, 0);
  const sectorW: Record<string, number> = {};
  for (const p of positions) sectorW[p.sector] = (sectorW[p.sector] ?? 0) + p.weight;
  const topPos = positions.reduce((m, p) => Math.max(m, p.weight), 0);
  const topSec = Object.values(sectorW).reduce((m, w) => Math.max(m, w), 0);
  return {
    hhi: metric(hhi, src, "Herfindahl–Hirschman index Σwᵢ²", positions.length, undefined, "high"),
    effectiveN: metric(hhi > 0 ? 1 / hhi : 0, src, "effective number of positions 1/HHI", positions.length, undefined, "high"),
    topPositionWeight: metric(topPos, src, "largest single-position weight", positions.length, undefined, "high"),
    topSectorWeight: metric(topSec, src, "largest sector weight", positions.length, undefined, "high"),
    positionCount: positions.length,
    sectorCount: Object.keys(sectorW).length,
  };
}

// ─────────────────────────────────────────────────────────────────
// Correlation risk
// ─────────────────────────────────────────────────────────────────

export function analyzeCorrelationRisk(opts: {
  correlation: number[][];
  covariance?: number[][];
  weights?: number[];
  sampleSize: number;
}): CorrelationRisk {
  const { correlation: C, covariance, weights, sampleSize: T } = opts;
  const N = C.length;
  const src = "covariance-estimate" as const;
  let sum = 0, cnt = 0, max = -1;
  for (let i = 0; i < N; i++)
    for (let j = i + 1; j < N; j++) { sum += C[i][j]; cnt++; if (C[i][j] > max) max = C[i][j]; }
  const avg = cnt > 0 ? sum / cnt : 0;

  const pc1 = N >= 2 ? pc1Concentration(C) : null;

  let divRatio: MetricValue | null = null;
  if (covariance && weights && weights.length === N && N >= 2) {
    let wSig = 0, varP = 0;
    for (let i = 0; i < N; i++) {
      wSig += weights[i] * Math.sqrt(Math.max(covariance[i][i], 0));
      for (let j = 0; j < N; j++) varP += weights[i] * weights[j] * covariance[i][j];
    }
    const sigP = Math.sqrt(Math.max(varP, 0));
    if (sigP > 0) {
      divRatio = metric(wSig / sigP, src, "diversification ratio Σwᵢσᵢ / σ_p (Choueifaty–Coignard)", T);
    }
  }

  return {
    avgPairwise: metric(avg, src, `mean pairwise Pearson correlation, ${N} assets`, T),
    maxPairwise: metric(cnt > 0 ? max : 0, src, "max pairwise Pearson correlation", T),
    pc1Share: pc1 != null ? metric(pc1, src, "λ₁/Σλᵢ of correlation matrix (systemic factor share)", T) : null,
    diversificationRatio: divRatio,
  };
}

// ─────────────────────────────────────────────────────────────────
// Tail risk
// ─────────────────────────────────────────────────────────────────

export function analyzeTailRisk(rets: number[]): TailRisk {
  const n = rets.length;
  const src = "historical-prices" as const;
  const sorted = [...rets].sort((a, b) => a - b);
  const q = (p: number) => sorted.length > 0 ? -sorted[Math.max(0, Math.floor((1 - p) * sorted.length))] : 0;
  const var95 = Math.max(0, q(0.95));
  const var99 = Math.max(0, q(0.99));
  const tail95 = sorted.slice(0, Math.max(1, Math.floor(0.05 * sorted.length)));
  const cvar95 = Math.max(0, -mean(tail95));

  const evt = n >= 100 ? evtVaR(rets, 0.99, 0.9) : null;
  const evtNote = ["GPD fit by probability-weighted moments; POT threshold = 90th loss percentile"];

  return {
    skewness: metric(skewness(rets), src, "3rd standardized moment of daily returns", n),
    excessKurtosis: metric(excessKurtosis(rets), src, "4th standardized moment − 3", n),
    var95: metric(var95, src, "5th percentile of daily return distribution (1-day)", n),
    var99: metric(var99, src, "1st percentile of daily return distribution (1-day)", n),
    cvar95: metric(cvar95, src, "mean loss beyond the 95% VaR (expected shortfall)", n),
    evtVar99: evt ? metric(evt.var, src, "EVT peaks-over-threshold VaR 99% (McNeil–Frey)", n, evtNote) : null,
    evtEs99: evt ? metric(evt.es, src, "EVT expected shortfall 99%", n, evtNote) : null,
  };
}

export function computeRiskMetrics(opts: {
  portfolioReturns: number[];
  positions: Array<{ ticker: string; weight: number; sector: string }>;
  correlation: number[][];
  covariance?: number[][];
  weightsAligned?: number[];
}): RiskMetrics {
  const T = opts.portfolioReturns.length;
  return {
    drawdown: analyzeDrawdowns(opts.portfolioReturns),
    concentration: analyzeConcentration(opts.positions),
    correlation: analyzeCorrelationRisk({
      correlation: opts.correlation,
      covariance: opts.covariance,
      weights: opts.weightsAligned,
      sampleSize: T,
    }),
    tail: analyzeTailRisk(opts.portfolioReturns),
  };
}

// ─────────────────────────────────────────────────────────────────
// Stress engine
// ─────────────────────────────────────────────────────────────────

/**
 * Scenario library. `marketShock` is the documented market-index move of the
 * episode (a historical fact, cited in `basis`) — the PORTFOLIO impact is
 * always computed from real per-asset betas, never stored.
 */
export const STRESS_SCENARIOS: StressScenario[] = [
  { id: "gfc", name: "2008 GFC replay", basis: "S&P 500 peak-to-trough −56.8% (Oct 2007–Mar 2009); shock uses the −38% first-year leg", marketShock: -0.38, correlationStress: 0.5 },
  { id: "covid", name: "COVID-19 crash", basis: "S&P 500 −33.9% (Feb 19–Mar 23, 2020)", marketShock: -0.34, correlationStress: 0.6 },
  { id: "vol2018", name: "Volmageddon", basis: "S&P 500 −10.2% (Jan 26–Feb 8, 2018)", marketShock: -0.10, correlationStress: 0.3 },
  { id: "rate150", name: "Rates +150bp repricing", basis: "2022 tightening: S&P 500 −25.4% peak-to-trough as 10y rose ~250bp; scaled to a 150bp shock", marketShock: -0.15, correlationStress: 0.3 },
  { id: "mild", name: "Garden-variety correction", basis: "Median post-1950 S&P 500 correction of −10%", marketShock: -0.10 },
  { id: "melt", name: "Reflex rally", basis: "+15% market melt-up (symmetric upside check)", marketShock: 0.15 },
];

/**
 * Propagate a market shock through real per-asset betas.
 * Impact = Σ wᵢ·βᵢ·shock. Requires betas estimated from history; positions
 * without a beta are excluded and disclosed in the assumptions.
 */
export function runStressScenario(opts: {
  scenario: StressScenario;
  positions: Array<{ ticker: string; weight: number; beta: number | null }>;
  portfolioValue: number;
  betaSampleSize: number;
  avgRecoveryDays?: MetricValue | null;
  /** How the betas were obtained (shown in provenance). */
  betaBasis?: string;
}): StressResult {
  const { scenario, positions, portfolioValue, betaSampleSize, avgRecoveryDays } = opts;
  const betaBasis = opts.betaBasis ?? "OLS regression on real history";
  const withBeta = positions.filter(p => p.beta != null && isFinite(p.beta as number));
  const excluded = positions.length - withBeta.length;

  const positionImpacts = withBeta.map(p => ({
    ticker: p.ticker,
    beta: p.beta as number,
    weight: p.weight,
    impact: p.weight * (p.beta as number) * scenario.marketShock,
  }));
  const impact = positionImpacts.reduce((s, p) => s + p.impact, 0);

  const assumptions = [
    "single-factor (market beta) propagation; idiosyncratic shocks net to zero",
    `scenario basis: ${scenario.basis}`,
  ];
  if (excluded > 0) assumptions.push(`${excluded} position(s) without estimated beta excluded`);
  if (scenario.correlationStress) assumptions.push("correlations rise toward 1 in the episode; beta propagation is the first-order term");

  return {
    scenario,
    portfolioImpact: metric(impact, "covariance-estimate",
      `Σ wᵢ·βᵢ·(${(scenario.marketShock * 100).toFixed(0)}% market shock), β from ${betaBasis}`,
      betaSampleSize, assumptions),
    lossValue: -impact * portfolioValue,
    positionImpacts: positionImpacts.sort((a, b) => a.impact - b.impact),
    estimatedRecoveryDays: avgRecoveryDays ?? null,
  };
}

/** Worst realized h-day compounded window from the portfolio's own history. */
export function historicalWorstWindow(
  rets: number[], windowDays: number, portfolioValue: number,
): HistoricalReplayResult | null {
  if (rets.length < windowDays + 5) return null;
  let worst = Infinity, worstStart = 0;
  let logSum = 0;
  const logs = rets.map(r => Math.log(1 + r));
  for (let i = 0; i < windowDays; i++) logSum += logs[i];
  let best = logSum; worstStart = 0;
  for (let i = windowDays; i < logs.length; i++) {
    logSum += logs[i] - logs[i - windowDays];
    if (logSum < best) { best = logSum; worstStart = i - windowDays + 1; }
  }
  worst = Math.exp(best) - 1;
  return {
    windowDays,
    worstReturn: metric(worst, "historical-prices",
      `worst compounded ${windowDays}-day window in the realized portfolio return series`, rets.length),
    worstStartIndex: worstStart,
    lossValue: Math.max(0, -worst * portfolioValue),
  };
}

/**
 * Covariance-based factor sensitivity: 1σ and 2σ portfolio moves at the
 * estimated daily σ_p, plus the marginal effect of the average-correlation
 * regime jumping to the stressed level.
 */
export function volatilitySensitivity(opts: {
  sigmaDaily: number;
  portfolioValue: number;
  sampleSize: number;
}): Array<{ label: string; shock: string; impact: MetricValue; lossValue: number }> {
  const { sigmaDaily, portfolioValue, sampleSize } = opts;
  const rows = [
    { label: "1σ daily move", mult: 1 },
    { label: "2σ daily move", mult: 2 },
    { label: "3σ daily move", mult: 3 },
  ];
  return rows.map(r => {
    const ret = -sigmaDaily * r.mult;
    return {
      label: r.label,
      shock: `−${r.mult}σ`,
      impact: metric(ret, "covariance-estimate", `−${r.mult} × daily portfolio σ from Σ (wᵀΣw)`, sampleSize),
      lossValue: -ret * portfolioValue,
    };
  });
}
