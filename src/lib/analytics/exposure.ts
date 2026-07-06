/**
 * Exposure analytics — sector, currency, style, and market-beta exposures
 * from real portfolio state and (where available) real return history.
 * ────────────────────────────────────────────────────────────────────────
 * Style buckets are realized-statistic terciles of the portfolio's own
 * universe (volatility from history, momentum = trailing compounded return)
 * — measurable facts, not vendor style boxes.
 */

import { type ExposureAnalysis, type ExposureBucket, metric } from "./types";

export interface ExposurePosition {
  ticker: string;
  value: number;      // base-currency market value
  sector: string;
  currency: string;
  beta: number | null;          // regression beta when history exists
  sigmaAnnual: number | null;   // realized annualized vol
  trailingReturn: number | null; // compounded return over the lookback
}

function bucketize(
  positions: ExposurePosition[],
  totalValue: number,
  key: (p: ExposurePosition) => string,
): ExposureBucket[] {
  const map: Record<string, { value: number; count: number }> = {};
  for (const p of positions) {
    const k = key(p);
    if (!map[k]) map[k] = { value: 0, count: 0 };
    map[k].value += p.value;
    map[k].count += 1;
  }
  return Object.entries(map)
    .map(([label, d]) => ({
      label,
      weight: totalValue > 0 ? d.value / totalValue : 0,
      value: d.value,
      count: d.count,
    }))
    .sort((a, b) => b.weight - a.weight);
}

/** Tercile buckets over a realized statistic; null if < 3 positions have it. */
function tercileBuckets(
  positions: ExposurePosition[],
  totalValue: number,
  stat: (p: ExposurePosition) => number | null,
  labels: [string, string, string],
): ExposureBucket[] | null {
  const withStat = positions.filter(p => stat(p) != null && isFinite(stat(p) as number));
  if (withStat.length < 3) return null;
  const sorted = [...withStat].sort((a, b) => (stat(a) as number) - (stat(b) as number));
  const t1 = stat(sorted[Math.floor(sorted.length / 3)]) as number;
  const t2 = stat(sorted[Math.floor((2 * sorted.length) / 3)]) as number;
  return bucketize(withStat, totalValue, p => {
    const v = stat(p) as number;
    if (v <= t1) return labels[0];
    if (v <= t2) return labels[1];
    return labels[2];
  });
}

export function computeExposure(opts: {
  positions: ExposurePosition[];
  totalValue: number;
  betaSampleSize: number;
}): ExposureAnalysis {
  const { positions, totalValue, betaSampleSize } = opts;

  const withBeta = positions.filter(p => p.beta != null && isFinite(p.beta as number));
  const betaValue = withBeta.reduce((s, p) => s + p.value, 0);
  const marketBeta = withBeta.length > 0 && betaValue > 0
    ? metric(
        withBeta.reduce((s, p) => s + (p.value / betaValue) * (p.beta as number), 0),
        "covariance-estimate",
        `value-weighted mean of per-asset regression betas (${withBeta.length}/${positions.length} positions)`,
        betaSampleSize,
        withBeta.length < positions.length
          ? [`${positions.length - withBeta.length} position(s) without beta excluded`]
          : undefined)
    : null;

  return {
    sector: bucketize(positions, totalValue, p => p.sector || "Unknown"),
    currency: bucketize(positions, totalValue, p => p.currency || "USD"),
    volatilityStyle: tercileBuckets(positions, totalValue, p => p.sigmaAnnual,
      ["Low Volatility", "Mid Volatility", "High Volatility"]),
    momentumStyle: tercileBuckets(positions, totalValue, p => p.trailingReturn,
      ["Laggards", "Neutral", "Momentum Leaders"]),
    marketBeta,
  };
}
