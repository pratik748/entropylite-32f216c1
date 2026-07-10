/**
 * Shared data plumbing for Foresight tools.
 *
 * Everything routes through governedInvoke, so the apiGovernor's TTL cache,
 * inflight dedup, and rate limiting apply — repeated tool calls inside one
 * plan (or across turns) never re-hit the network.
 */

import { governedInvoke } from "@/lib/apiGovernor";
import { normalizeUserTicker } from "@/lib/ticker";
import type { FactRecord, PortfolioPosition } from "../types";
import type { MetricValue } from "@/lib/analytics/types";

export interface HistorySeries {
  closes: number[];
  volumes: number[];
  timestamps: number[];
}

export async function fetchHistory(
  tickers: string[],
  range = "6mo",
): Promise<{ data: Record<string, HistorySeries>; cached: boolean }> {
  const normalized = tickers.map((t) => normalizeUserTicker(t) || t.toUpperCase());
  const { data, error, cached } = await governedInvoke<{ data: Record<string, HistorySeries> }>(
    "historical-prices",
    { tier: "slow", body: { tickers: normalized, range } },
  );
  if (error || !data?.data) throw new Error(`historical-prices failed: ${error?.message || "no data"}`);
  return { data: data.data, cached };
}

export function logReturns(closes: number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    if (closes[i - 1] > 0 && closes[i] > 0) out.push(Math.log(closes[i] / closes[i - 1]));
  }
  return out;
}

/** Align several return series to their common tail length. */
export function alignSeries(series: number[][]): number[][] {
  const minLen = Math.min(...series.map((s) => s.length));
  if (!Number.isFinite(minLen) || minLen <= 0) return [];
  return series.map((s) => s.slice(-minLen));
}

/** Current-value portfolio weights (falls back to cost basis pre-analysis). */
export function positionWeights(positions: PortfolioPosition[]): { tickers: string[]; weights: number[]; totalValue: number } {
  const values = positions.map((p) => (p.currentPrice ?? p.buyPrice) * p.quantity);
  const total = values.reduce((s, v) => s + v, 0);
  return {
    tickers: positions.map((p) => p.ticker),
    weights: total > 0 ? values.map((v) => v / total) : positions.map(() => 1 / Math.max(positions.length, 1)),
    totalValue: total,
  };
}

/** Weighted portfolio return series from aligned per-asset returns. */
export function portfolioReturns(aligned: number[][], weights: number[]): number[] {
  if (aligned.length === 0) return [];
  const T = aligned[0].length;
  const out = new Array<number>(T).fill(0);
  for (let t = 0; t < T; t++) {
    for (let i = 0; i < aligned.length; i++) out[t] += weights[i] * aligned[i][t];
  }
  return out;
}

/** OLS beta of each asset on a market series (same length). */
export function estimateBetas(assetReturns: number[][], market: number[]): Array<number | null> {
  const mMean = market.reduce((s, v) => s + v, 0) / market.length;
  let mVar = 0;
  for (const v of market) mVar += (v - mMean) ** 2;
  if (mVar <= 0) return assetReturns.map(() => null);
  return assetReturns.map((r) => {
    if (r.length !== market.length || r.length < 20) return null;
    const rMean = r.reduce((s, v) => s + v, 0) / r.length;
    let cov = 0;
    for (let i = 0; i < r.length; i++) cov += (r[i] - rMean) * (market[i] - mMean);
    return cov / mVar;
  });
}

/** Convert an analytics MetricValue into a provenance fact. */
export function metricToFact(label: string, m: MetricValue, tool: string, unit?: string): Omit<FactRecord, "id" | "recordedAt"> {
  return {
    label: `${label} (${m.provenance.calculation}, n=${m.provenance.sampleSize})`,
    value: Number(m.value.toFixed(6)),
    unit,
    tool,
    confidence: m.provenance.confidence,
  };
}

export function round(n: number, dp = 4): number {
  return Number(n.toFixed(dp));
}
