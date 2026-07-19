/**
 * useInstitutionalAnalytics — single wiring point between real portfolio
 * state / market data and the analytics engine (src/lib/analytics).
 * ─────────────────────────────────────────────────────────────────────
 * Data flow:
 *   holdings (portfolio-state) ──┐
 *   1y daily history per asset ──┼─▶ useQuantSnapshot (μ, Σ, ρ, VaR, returns)
 *   benchmark index history ─────┘
 *        │
 *        ▼
 *   performance · risk · exposure · attribution · optimizers · stress
 *        │
 *        ▼
 *   insights (cited) ─▶ institutional report (typed sections)
 *
 * The benchmark is a real index chosen from the portfolio's dominant listing
 * currency (NSE book → NIFTY 50, otherwise S&P 500) and fetched through the
 * same historical-prices pipeline as every other series.
 */

import { useEffect, useMemo } from "react";
import type { PortfolioStock } from "@/components/PortfolioPanel";
import { useNormalizedPortfolio } from "@/hooks/useNormalizedPortfolio";
import { useQuantSnapshot, type QuantSnapshot } from "@/hooks/useQuantSnapshot";
import { useHistoricalPrices } from "@/hooks/useHistoricalPrices";
import { logReturns } from "@/lib/quant-engine";
import {
  computePerformanceMetrics, regressOnBenchmark,
} from "@/lib/analytics/performance";
import {
  computeRiskMetrics, runStressScenario, historicalWorstWindow,
  volatilitySensitivity, STRESS_SCENARIOS,
} from "@/lib/analytics/risk";
import { computeExposure } from "@/lib/analytics/exposure";
import { computeAttribution } from "@/lib/analytics/attribution";
import { runAllOptimizers, type OptimizerInput } from "@/lib/analytics/optimizers";
import { synthesizeInsights } from "@/lib/analytics/insights";
import { generateInstitutionalReport, type ReportContext } from "@/lib/analytics/reports";
import type {
  PerformanceMetrics, RiskMetrics, ExposureAnalysis, AttributionAnalysis,
  OptimizerResult, OptimizerId, OptimizerConstraints, Insight,
  StressResult, HistoricalReplayResult, InstitutionalReport, MetricValue,
} from "@/lib/analytics/types";

export interface InstitutionalAnalytics {
  ready: boolean;
  loading: boolean;
  snapshot: QuantSnapshot;
  benchmarkTicker: string;
  benchmarkReady: boolean;
  /** Benchmark daily log-return series (tail-alignable); null before load. */
  benchmarkReturns: number[] | null;
  performance: PerformanceMetrics | null;
  risk: RiskMetrics | null;
  exposure: ExposureAnalysis | null;
  attribution: AttributionAnalysis | null;
  optimizers: OptimizerResult[];
  /** Regression betas per ticker vs the real benchmark (null w/o benchmark). */
  betasByTicker: Record<string, number> | null;
  betaBasis: string;
  stresses: StressResult[];
  replays: HistoricalReplayResult[];
  sensitivity: ReturnType<typeof volatilitySensitivity>;
  insights: Insight[];
  report: InstitutionalReport | null;
  /** Optimizer picked as the rebalancing recommendation (HRP by default). */
  recommended: OptimizerResult | null;
}

/** Benchmark index by dominant listing currency of the book. */
export function pickBenchmark(currencies: string[]): string {
  const counts: Record<string, number> = {};
  for (const c of currencies) counts[c] = (counts[c] ?? 0) + 1;
  const dominant = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "USD";
  return dominant === "INR" ? "^NSEI" : "^GSPC";
}

export function useInstitutionalAnalytics(
  stocks: PortfolioStock[],
  opts?: {
    constraints?: OptimizerConstraints;
    recommendedId?: OptimizerId;
    /**
     * When true, `recommended` is EXACTLY the requested optimizer or null —
     * no silent fallback to a different model. A surface that offers a
     * model selector must set this, otherwise a failed selection quietly
     * shows another model's numbers and the control appears dead.
     */
    strictRecommended?: boolean;
  },
): InstitutionalAnalytics {
  const norm = useNormalizedPortfolio(stocks);
  const snapshot = useQuantSnapshot(stocks);
  const { prices: benchPrices, loading: benchLoading, fetchHistorical } = useHistoricalPrices();

  const benchmarkTicker = useMemo(
    () => pickBenchmark(norm.holdings.map(h => h.currency)),
    [norm.holdings],
  );

  useEffect(() => {
    if (norm.holdings.length > 0) fetchHistorical([benchmarkTicker], "1y");
  }, [benchmarkTicker, norm.holdings.length, fetchHistorical]);

  const constraints = opts?.constraints;
  const recommendedId = opts?.recommendedId ?? "hrp";
  const strictRecommended = opts?.strictRecommended ?? false;

  return useMemo<InstitutionalAnalytics>(() => {
    const { holdings, totalValue, totalInvested, totalPnl, fmt, baseCurrency } = norm;
    const empty: InstitutionalAnalytics = {
      ready: false, loading: snapshot.loading || benchLoading, snapshot,
      benchmarkTicker, benchmarkReady: false, benchmarkReturns: null,
      performance: null, risk: null, exposure: null, attribution: null,
      optimizers: [], betasByTicker: null, betaBasis: "unavailable",
      stresses: [], replays: [], sensitivity: [], insights: [], report: null,
      recommended: null,
    };
    if (holdings.length === 0 || !snapshot.ready) return empty;

    const pRets = snapshot.portfolio.returns;
    const T = pRets.length;

    // ── Benchmark series ─────────────────────────────────────────
    const benchSeries = benchPrices[benchmarkTicker];
    const benchRets = benchSeries && benchSeries.closes.length >= 30
      ? logReturns(benchSeries.closes)
      : null;
    const benchmarkReady = benchRets != null;

    // ── Per-asset betas: regression on the real benchmark when we
    //    have it, otherwise the analysis-layer beta (disclosed). ──
    let betasByTicker: Record<string, number> | null = null;
    let betaBasis: string;
    let betaSampleSize = T;
    if (benchRets) {
      betasByTicker = {};
      for (const t of Object.keys(snapshot.returnsByTicker)) {
        const reg = regressOnBenchmark(snapshot.returnsByTicker[t], benchRets);
        if (reg) { betasByTicker[t] = reg.beta; betaSampleSize = Math.min(betaSampleSize, reg.n); }
      }
      betaBasis = `OLS on ${benchmarkTicker} daily returns`;
      if (Object.keys(betasByTicker).length === 0) { betasByTicker = null; }
    }
    if (!betasByTicker) {
      const fromAnalysis: Record<string, number> = {};
      for (const h of holdings) if (isFinite(h.beta)) fromAnalysis[h.ticker] = h.beta;
      betasByTicker = Object.keys(fromAnalysis).length > 0 ? fromAnalysis : null;
      betaBasis = "analysis-layer beta (benchmark series unavailable)";
      betaSampleSize = 0;
    } else {
      betaBasis = `OLS on ${benchmarkTicker} daily returns`;
    }

    // ── Core analytics ───────────────────────────────────────────
    const performance = computePerformanceMetrics({
      portfolioReturns: pRets,
      benchmarkReturns: benchRets ?? undefined,
      benchmarkTicker: benchRets ? benchmarkTicker : undefined,
    });

    const covTickers = snapshot.covariance.tickers;
    const Sigma = snapshot.covariance.matrix;
    const haveCov = covTickers.length >= 2 && Sigma.length === covTickers.length;
    const weightsAligned = haveCov ? covTickers.map(t => snapshot.weights[t] ?? 0) : undefined;

    const positions = holdings.map(h => ({
      ticker: h.ticker,
      weight: totalValue > 0 ? h.value / totalValue : 0,
      sector: h.sector,
    }));

    const risk = T >= 20
      ? computeRiskMetrics({
          portfolioReturns: pRets,
          positions,
          correlation: snapshot.correlation.matrix,
          covariance: haveCov ? Sigma : undefined,
          weightsAligned,
        })
      : null;

    const exposure = computeExposure({
      positions: holdings.map(h => {
        const stats = snapshot.assetStats[h.ticker];
        const rets = snapshot.returnsByTicker[h.ticker];
        const trailing = rets && rets.length > 0
          ? Math.exp(rets.reduce((s, r) => s + r, 0)) - 1
          : null;
        return {
          ticker: h.ticker,
          value: h.value,
          sector: h.sector,
          currency: h.currency,
          beta: betasByTicker?.[h.ticker] ?? null,
          sigmaAnnual: stats?.sigmaAnnual ?? null,
          trailingReturn: trailing,
        };
      }),
      totalValue,
      betaSampleSize,
    });

    const attribution = computeAttribution({
      positions: holdings.map(h => ({
        ticker: h.ticker,
        weight: totalValue > 0 ? h.value / totalValue : 0,
        returnPct: h.pnlPct,
        sector: h.sector,
      })),
      sigma: haveCov ? Sigma : undefined,
      sigmaTickers: haveCov ? covTickers : undefined,
    });

    // ── Optimizers ───────────────────────────────────────────────
    let optimizers: OptimizerResult[] = [];
    if (haveCov) {
      const input: OptimizerInput = {
        tickers: covTickers,
        sigma: Sigma,
        mu: covTickers.map(t => snapshot.assetStats[t]?.mu ?? 0),
        returnSeries: covTickers.map(t => snapshot.returnsByTicker[t] ?? []),
        currentWeights: weightsAligned,
        sampleSize: T,
        constraints,
      };
      optimizers = runAllOptimizers(input);
    }
    const recommended = strictRecommended
      ? (optimizers.find(o => o.id === recommendedId && o.diagnostics.converged) ?? null)
      : (optimizers.find(o => o.id === recommendedId && o.diagnostics.converged)
          ?? optimizers.find(o => o.id === "risk_parity" && o.diagnostics.converged)
          ?? optimizers.find(o => o.diagnostics.converged)
          ?? null);

    // ── Stress & replay ──────────────────────────────────────────
    const stressPositions = holdings.map(h => ({
      ticker: h.ticker,
      weight: totalValue > 0 ? h.value / totalValue : 0,
      beta: betasByTicker?.[h.ticker] ?? null,
    }));
    const avgRec: MetricValue | null = risk?.drawdown.avgRecoveryDays ?? null;
    const stresses = betasByTicker
      ? STRESS_SCENARIOS.map(s => runStressScenario({
          scenario: s,
          positions: stressPositions,
          portfolioValue: totalValue,
          betaSampleSize,
          avgRecoveryDays: avgRec,
          betaBasis,
        }))
      : [];
    const replays = [5, 20, 60]
      .map(w => historicalWorstWindow(pRets, w, totalValue))
      .filter((r): r is HistoricalReplayResult => r != null);
    const sensitivity = snapshot.portfolio.sigmaDaily > 0
      ? volatilitySensitivity({
          sigmaDaily: snapshot.portfolio.sigmaDaily,
          portfolioValue: totalValue,
          sampleSize: T,
        })
      : [];

    // ── Insights + report ────────────────────────────────────────
    const insights = synthesizeInsights({ performance, risk, exposure, attribution, recommended });

    const ctx: ReportContext = {
      asOf: snapshot.asOf,
      baseCurrency,
      totalValue,
      totalInvested,
      totalPnl,
      positionCount: holdings.length,
      lookbackDays: T,
      fmt,
    };
    const report = generateInstitutionalReport({
      ctx, performance, risk, exposure, attribution, insights,
      stresses, replays, recommended,
      currentWeights: positions.map(p => ({ ticker: p.ticker, weight: p.weight })),
    });

    return {
      ready: true,
      loading: snapshot.loading || benchLoading,
      snapshot,
      benchmarkTicker,
      benchmarkReady,
      benchmarkReturns: benchRets,
      performance,
      risk,
      exposure,
      attribution,
      optimizers,
      betasByTicker,
      betaBasis,
      stresses,
      replays,
      sensitivity,
      insights,
      report,
      recommended,
    };
  }, [norm, snapshot, benchPrices, benchLoading, benchmarkTicker, constraints, recommendedId, strictRecommended]);
}
