/**
 * SASHA Statistical Arbitrage & Cointegration Tools
 */

import { cointegrationEG, ouFit, mean, stddev } from "@/lib/statarb-math";
import { round } from "@/foresight/tools/dataHub";
import type { SashaTool, ToolExecutionContext } from "../types";
import type { CointegrationStats } from "../../types";

export const testCointegrationTool: SashaTool<
  { pricesA: number[]; pricesB: number[]; tickerA: string; tickerB: string },
  CointegrationStats
> = {
  id: "statarb.test_cointegration",
  name: "Engle–Granger Cointegration & Augmented Dickey-Fuller Test",
  description: "Executes Engle-Granger two-step cointegration testing with ADF unit root test on residuals to determine if a stationary spread exists.",
  category: "statarb",
  keywords: ["cointegration", "adf", "engle_granger", "pairs", "stat_arb", "spread", "mean_reversion"],
  parameters: {
    pricesA: { type: "array", description: "Historical price series of asset A", required: true },
    pricesB: { type: "array", description: "Historical price series of asset B", required: true },
    tickerA: { type: "string", description: "Symbol A", required: true },
    tickerB: { type: "string", description: "Symbol B", required: true },
  },
  requiredData: ["historical_prices"],
  dependencies: ["market.fetch_history"],
  permission: "compute",
  async execute(input) {
    const eg = cointegrationEG(input.pricesA, input.pricesB);
    const ou = ouFit(eg.residuals, 1);

    // Current Z-score of spread
    const residuals = eg.residuals;
    const mu = mean(residuals);
    const sigma = stddev(residuals) || 1e-6;
    const currentZScore = residuals.length > 0 ? (residuals[residuals.length - 1] - mu) / sigma : 0;

    let spreadVerdict: CointegrationStats["spreadVerdict"] = "random_walk";
    if (eg.cointegrated) {
      if (Math.abs(currentZScore) > 2.0) spreadVerdict = "diverging";
      else if (Math.abs(currentZScore) > 0.5) spreadVerdict = "mean_reverting";
      else spreadVerdict = "equilibrium";
    }

    return {
      isCointegrated: eg.cointegrated,
      adfStat: round(eg.tStat, 3),
      pValue: round(eg.pValue, 4),
      criticalValues: {
        "1%": round(eg.crit1Pct, 2),
        "5%": round(eg.crit5Pct, 2),
        "10%": round(eg.crit10Pct, 2),
      },
      halfLifeDays: round(ou.halfLife, 1),
      reversionSpeed: round(ou.theta, 4),
      currentZScore: round(currentZScore, 2),
      spreadVerdict,
    };
  },
  interpretOutput(output, input, ctx) {
    const status = output.isCointegrated
      ? `Cointegrated pair (ADF = ${output.adfStat}, p = ${output.pValue}). Spread half-life is ${output.halfLifeDays} days with current Z-score of ${output.currentZScore > 0 ? "+" : ""}${output.currentZScore}σ (${output.spreadVerdict}).`
      : `No stationary cointegration detected (ADF = ${output.adfStat}, p = ${output.pValue} > 0.05). Spread behaves as a non-stationary random walk.`;

    return {
      summary: status,
      primaryMetrics: [
        { label: "Cointegration", value: output.isCointegrated ? "Stationary (✓)" : "Non-Stationary (✗)", tone: output.isCointegrated ? "gain" : "neutral" },
        { label: "ADF Statistic", value: output.adfStat },
        { label: "p-value", value: output.pValue },
        { label: "OU Half-Life", value: `${output.halfLifeDays}d` },
        { label: "Spread Z-Score", value: `${output.currentZScore > 0 ? "+" : ""}${output.currentZScore}σ` },
      ],
      chartHint: "sparkline",
      provenance: {
        toolId: "statarb.test_cointegration",
        executionId: ctx.executionId,
        timestamp: Date.now(),
        sourceType: "calculated_metric",
        primaryDataSource: "Realized Market Price Series",
        modelOrMethod: "Engle-Granger Two-Step OLS with Augmented Dickey-Fuller Unit Root Test on Residuals",
        assumptions: ["Linear cointegrating vector P_A - β P_B - α"],
        computationTimeMs: 15,
      },
    };
  },
  failureConditions: ["Zero variance in series", "Mismatched array lengths"],
};

export const calcPairSpreadTool: SashaTool<
  { pricesA: number[]; pricesB: number[]; tickerA: string; tickerB: string },
  {
    ratioSeries: number[];
    currentRatio: number;
    meanRatio: number;
    stdRatio: number;
    spreadZScore: number;
    percentileRank: number;
    sparkline: number[];
  }
> = {
  id: "statarb.calc_spread",
  name: "Calculate Relative Price Ratio & Valuation Spread",
  description: "Computes the rolling price ratio series P_A / P_B, historical mean, standard deviation, current Z-score, and percentile rank.",
  category: "statarb",
  keywords: ["spread", "ratio", "valuation_spread", "z_score", "percentile"],
  parameters: {
    pricesA: { type: "array", description: "Prices of A", required: true },
    pricesB: { type: "array", description: "Prices of B", required: true },
    tickerA: { type: "string", description: "Ticker A", required: true },
    tickerB: { type: "string", description: "Ticker B", required: true },
  },
  requiredData: ["historical_prices"],
  dependencies: ["market.fetch_history"],
  permission: "compute",
  async execute(input) {
    const len = Math.min(input.pricesA.length, input.pricesB.length);
    const ratios: number[] = [];

    for (let i = 0; i < len; i++) {
      const pB = input.pricesB[i];
      if (pB > 0) {
        ratios.push(input.pricesA[i] / pB);
      }
    }

    if (ratios.length === 0) throw new Error("Could not compute valid price ratios");

    const mu = mean(ratios);
    const sigma = stddev(ratios) || 1e-6;
    const current = ratios[ratios.length - 1];
    const zScore = (current - mu) / sigma;

    // Percentile rank
    const sorted = [...ratios].sort((a, b) => a - b);
    const rankIndex = sorted.findIndex((r) => r >= current);
    const percentileRank = rankIndex >= 0 ? Math.round((rankIndex / sorted.length) * 100) : 50;

    // 40-point downsampled sparkline for visual rendering
    const step = Math.max(1, Math.floor(ratios.length / 40));
    const sparkline: number[] = [];
    for (let i = 0; i < ratios.length; i += step) {
      sparkline.push(round(ratios[i], 3));
    }
    if (sparkline[sparkline.length - 1] !== round(current, 3)) {
      sparkline.push(round(current, 3));
    }

    return {
      ratioSeries: ratios,
      currentRatio: round(current, 3),
      meanRatio: round(mu, 3),
      stdRatio: round(sigma, 4),
      spreadZScore: round(zScore, 2),
      percentileRank,
      sparkline,
    };
  },
  interpretOutput(output, input, ctx) {
    return {
      summary: `Current price ratio is ${output.currentRatio} vs historical mean of ${output.meanRatio} (Z = ${output.spreadZScore > 0 ? "+" : ""}${output.spreadZScore}σ, P${output.percentileRank}).`,
      primaryMetrics: [
        { label: "Current Ratio", value: output.currentRatio },
        { label: "Mean Ratio", value: output.meanRatio },
        { label: "Spread Z-Score", value: `${output.spreadZScore > 0 ? "+" : ""}${output.spreadZScore}σ` },
        { label: "Percentile", value: `P${output.percentileRank}` },
      ],
      chartHint: "sparkline",
      provenance: {
        toolId: "statarb.calc_spread",
        executionId: ctx.executionId,
        timestamp: Date.now(),
        sourceType: "calculated_metric",
        primaryDataSource: "Realized Market Price Series",
        modelOrMethod: "Continuous Price Ratio Distribution (P_A / P_B)",
        assumptions: ["Equal weighting of historical observations"],
        computationTimeMs: 4,
      },
    };
  },
  failureConditions: ["Denominator prices zero or negative"],
};
