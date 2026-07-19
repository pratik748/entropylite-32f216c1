import { useEffect, useMemo } from "react";
import { useHistoricalPrices } from "./useHistoricalPrices";
import { useNormalizedPortfolio } from "./useNormalizedPortfolio";
import {
  computeAssetStats, type AssetStats,
  logReturns, correlationMatrix, covarianceMatrix,
  portfolioReturns, portfolioSigma,
  parametricVaR, historicalVaR, historicalCVaR, rollingHistoricalVaR,
  sharpe, sortino, mertonDistanceToDefault,
} from "@/lib/quant-engine";
import type { PortfolioStock } from "@/components/PortfolioPanel";

export interface QuantSnapshot {
  ready: boolean;
  loading: boolean;
  asOf: number;
  lookbackDays: number;
  source: "historical" | "insufficient";
  totalValue: number;
  weights: Record<string, number>;
  assetStats: Record<string, AssetStats>;
  portfolio: {
    sigmaDaily: number;
    sigmaAnnual: number;
    muDaily: number;
    muAnnual: number;
    sharpe: number;
    sortino: number;
    var95: number;
    var99: number;
    cvar95: number;
    paramVar95: number;
    paramVar99: number;
    rollingVar: { day: string; var: number; cvar: number }[];
    returns: number[];
  };
  correlation: { tickers: string[]; matrix: number[][] };
  covariance: { tickers: string[]; matrix: number[][]; sigmas: number[] };
  /** Per-asset daily log-return series (full history per ticker). */
  returnsByTicker: Record<string, number[]>;
  /** Per-asset daily share volumes (oldest→newest) for liquidity analytics. */
  volumesByTicker: Record<string, number[]>;
}

const EMPTY: QuantSnapshot = {
  ready: false, loading: false, asOf: 0, lookbackDays: 0, source: "insufficient",
  totalValue: 0, weights: {}, assetStats: {},
  portfolio: {
    sigmaDaily: 0, sigmaAnnual: 0, muDaily: 0, muAnnual: 0, sharpe: 0, sortino: 0,
    var95: 0, var99: 0, cvar95: 0, paramVar95: 0, paramVar99: 0, rollingVar: [], returns: [],
  },
  correlation: { tickers: [], matrix: [] },
  covariance: { tickers: [], matrix: [], sigmas: [] },
  returnsByTicker: {},
  volumesByTicker: {},
};

/**
 * Single source of truth for institutional quant analytics.
 * Pulls 1-year daily history for every holding and computes
 * real μ, σ, correlation, covariance, VaR, CVaR, Sharpe, Sortino.
 */
export function useQuantSnapshot(stocks: PortfolioStock[]): QuantSnapshot {
  const { totalValue, holdings } = useNormalizedPortfolio(stocks);
  const { prices, loading, fetchHistorical } = useHistoricalPrices();

  const tickers = useMemo(() => holdings.map(h => h.ticker), [holdings]);

  useEffect(() => {
    if (tickers.length > 0) fetchHistorical(tickers, "1y");
  }, [tickers.join(","), fetchHistorical]);

  return useMemo<QuantSnapshot>(() => {
    if (holdings.length === 0) return EMPTY;

    // Build per-asset stats from real history
    const assetStats: Record<string, AssetStats> = {};
    const seriesByT: Record<string, { closes: number[] }> = {};
    const volumesByTicker: Record<string, number[]> = {};
    let minLen = Infinity;
    for (const h of holdings) {
      const series = prices[h.ticker];
      if (!series || series.closes.length < 30) continue;
      const stats = computeAssetStats(h.ticker, series);
      if (!stats) continue;
      assetStats[h.ticker] = stats;
      seriesByT[h.ticker] = { closes: series.closes };
      if (Array.isArray(series.volumes)) volumesByTicker[h.ticker] = series.volumes;
      if (series.closes.length < minLen) minLen = series.closes.length;
    }

    const validTickers = Object.keys(assetStats);
    if (validTickers.length === 0) {
      return { ...EMPTY, loading, totalValue };
    }

    // Weights from market value
    const weights: Record<string, number> = {};
    const sumValid = validTickers.reduce((s, t) => s + (holdings.find(h => h.ticker === t)?.value || 0), 0);
    for (const t of validTickers) {
      const h = holdings.find(h => h.ticker === t)!;
      weights[t] = sumValid > 0 ? h.value / sumValid : 0;
    }

    // Correlation & covariance
    const correlation = correlationMatrix(seriesByT);
    const covariance = covarianceMatrix(seriesByT);

    // Per-asset returns aligned
    const retsByT: Record<string, number[]> = {};
    for (const t of validTickers) retsByT[t] = logReturns(seriesByT[t].closes);

    // Portfolio return series + statistics
    const pRets = portfolioReturns(retsByT, weights);
    const wVec = covariance.tickers.map(t => weights[t] ?? 0);
    const sigmaDaily = portfolioSigma(wVec, covariance.matrix);
    const muDaily = pRets.length > 0 ? pRets.reduce((s, r) => s + r, 0) / pRets.length : 0;

    const portValue = sumValid;
    const paramVar95 = parametricVaR(portValue, sigmaDaily, 0.95, 1);
    const paramVar99 = parametricVaR(portValue, sigmaDaily, 0.99, 1);
    const var95 = historicalVaR(portValue, pRets, 0.95);
    const var99 = historicalVaR(portValue, pRets, 0.99);
    const cvar95 = historicalCVaR(portValue, pRets, 0.95);
    const rollingVar = rollingHistoricalVaR(portValue, pRets, 60, 0.95);

    return {
      ready: true,
      loading,
      asOf: Date.now(),
      lookbackDays: pRets.length,
      source: "historical",
      totalValue: portValue,
      weights,
      assetStats,
      portfolio: {
        sigmaDaily,
        sigmaAnnual: sigmaDaily * Math.sqrt(252),
        muDaily,
        muAnnual: muDaily * 252,
        sharpe: sharpe(pRets),
        sortino: sortino(pRets),
        var95, var99, cvar95, paramVar95, paramVar99,
        rollingVar,
        returns: pRets,
      },
      correlation,
      covariance,
      returnsByTicker: retsByT,
      volumesByTicker,
    };
  }, [holdings, prices, totalValue, loading]);
}

// Re-export for convenience
export { mertonDistanceToDefault };
