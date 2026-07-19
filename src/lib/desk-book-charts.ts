/**
 * Data preparation for the Desk Book charts — pure, deterministic, tested.
 * ─────────────────────────────────────────────────────────────────────────
 * Chart components stay thin JSX; every transform that could be wrong lives
 * here where it can be unit-tested. Conventions:
 *  - series are tail-aligned (same convention as the covariance engine);
 *  - growth curves are indexed to a common base of 1.0 (never two axes);
 *  - drawdown is ≤ 0 by construction;
 *  - nothing is interpolated or smoothed — gaps stay gaps.
 */

import type { BookDirective } from "@/lib/desk-book";
import type { PositionLiquidity } from "@/lib/quant/liquidity";

const TRADING_DAYS = 252;

export interface GrowthPoint {
  /** Session index within the aligned window (0 = start). */
  i: number;
  /** Book growth of 1.0 (e.g. 1.12 = +12%). */
  book: number;
  /** Benchmark growth of 1.0, null when no benchmark series. */
  bench: number | null;
  /** Book drawdown from running peak, ≤ 0 (e.g. −0.08). */
  drawdown: number;
}

/**
 * Growth-of-1 curves from daily LOG returns, benchmark tail-aligned to the
 * book window and indexed to the same 1.0 base so the two lines share one
 * axis honestly.
 */
export function buildGrowthSeries(
  bookRets: number[],
  benchRets: number[] | null,
): GrowthPoint[] {
  const n = bookRets.length;
  if (n < 2) return [];
  const bench = benchRets && benchRets.length >= 2 ? benchRets.slice(-n) : null;
  const bOffset = bench ? n - bench.length : 0;

  const out: GrowthPoint[] = [];
  let cumBook = 0;
  let cumBench = 0;
  let peak = 1;
  for (let t = 0; t < n; t++) {
    cumBook += bookRets[t];
    const book = Math.exp(cumBook);
    if (book > peak) peak = book;
    let benchV: number | null = null;
    if (bench && t >= bOffset) {
      cumBench += bench[t - bOffset];
      benchV = Math.exp(cumBench);
    }
    out.push({ i: t, book, bench: benchV, drawdown: Math.min(0, book / peak - 1) });
  }
  return out;
}

export interface RollingVolPoint { i: number; volPct: number }

/** Trailing-window annualized volatility (%), from daily log returns. */
export function rollingVolSeries(rets: number[], window = 60): RollingVolPoint[] {
  const n = rets.length;
  if (n < window + 2) return [];
  const out: RollingVolPoint[] = [];
  for (let end = window; end <= n; end++) {
    let mean = 0;
    for (let t = end - window; t < end; t++) mean += rets[t];
    mean /= window;
    let acc = 0;
    for (let t = end - window; t < end; t++) acc += (rets[t] - mean) ** 2;
    const sd = Math.sqrt(acc / (window - 1));
    out.push({ i: end, volPct: sd * Math.sqrt(TRADING_DAYS) * 100 });
  }
  return out;
}

export interface RiskWeightRow {
  ticker: string;
  /** Capital weight, %. */
  weightPct: number;
  /** Euler risk contribution, % of portfolio variance. */
  riskPct: number;
}

/**
 * Capital vs risk rows — the risk-parity diagnostic. Sorted by risk
 * contribution so the top of the chart is the top of the problem.
 */
export function riskWeightRows(
  positions: Array<{ ticker: string; weight: number; riskContributionPct: number | null }>,
  maxRows = 12,
): RiskWeightRow[] {
  return positions
    .filter((p) => p.riskContributionPct != null)
    .map((p) => ({
      ticker: p.ticker,
      weightPct: p.weight * 100,
      riskPct: (p.riskContributionPct as number) * 100,
    }))
    .sort((a, b) => b.riskPct - a.riskPct)
    .slice(0, maxRows);
}

export interface DriftRow {
  ticker: string;
  currentPct: number;
  targetPct: number;
}

/** Current vs optimizer-target weights for every directive that has a target. */
export function driftRows(directives: BookDirective[], maxRows = 12): DriftRow[] {
  return directives
    .filter((d) => d.targetWeight != null)
    .map((d) => ({
      ticker: d.ticker,
      currentPct: d.currentWeight * 100,
      targetPct: (d.targetWeight as number) * 100,
    }))
    .sort((a, b) => Math.abs(b.targetPct - b.currentPct) - Math.abs(a.targetPct - a.currentPct))
    .slice(0, maxRows);
}

export interface LadderPoint {
  /** Trading days. */
  day: number;
  /** Cumulative share of volume-covered value exitable, %. */
  cumPct: number;
}

/**
 * Liquidation ladder: share of volume-covered book value exitable within d
 * trading days at the profile's participation cap. Step data — the curve
 * only moves when a position clears.
 */
export function liquidityLadderPoints(perPosition: PositionLiquidity[]): LadderPoint[] {
  const covered = perPosition.filter((p) => p.daysToExit != null && p.valueBase > 0);
  const coveredValue = covered.reduce((s, p) => s + p.valueBase, 0);
  if (coveredValue <= 0) return [];
  const grid = [0.25, 0.5, 1, 2, 3, 5, 10, 15, 20, 30];
  const maxDay = Math.max(...covered.map((p) => p.daysToExit as number));
  return grid
    .filter((d, idx) => idx === 0 || grid[idx - 1] < maxDay * 1.5 || d <= 1)
    .map((day) => ({
      day,
      cumPct:
        (covered.reduce((s, p) => s + ((p.daysToExit as number) <= day ? p.valueBase : 0), 0) /
          coveredValue) * 100,
    }));
}

export interface BetaPoint { i: number; beta: number }

export function betaSeriesPoints(rolling: number[]): BetaPoint[] {
  return rolling.map((beta, i) => ({ i, beta }));
}

export interface FactorBarRow {
  label: string;
  beta: number;
}

/** Signed factor-exposure rows, largest |β| first. */
export function factorBarRows(
  factors: Array<{ id: string; label: string }>,
  exposures: Record<string, number>,
  maxRows = 8,
): FactorBarRow[] {
  return factors
    .map((f) => ({ label: f.label, beta: exposures[f.id] ?? 0 }))
    .sort((a, b) => Math.abs(b.beta) - Math.abs(a.beta))
    .slice(0, maxRows);
}
