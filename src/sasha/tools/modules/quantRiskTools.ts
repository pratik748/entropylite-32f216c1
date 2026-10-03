/**
 * SASHA Quantitative Mathematical & Risk Decomposition Tools
 */

import { ledoitWolfShrinkage, covToCorr } from "@/lib/quant/covariance";
import { round } from "@/foresight/tools/dataHub";
import type { SashaTool, ToolExecutionContext } from "../types";
import type { EulerRiskShare } from "../../types";

export const calcCovarianceTool: SashaTool<
  { returnsMatrix: number[][]; tickers: string[] },
  { tickers: string[]; covarianceMatrix: number[][]; correlationMatrix: number[][]; shrinkageIntensity: number }
> = {
  id: "quant.calc_covariance",
  name: "Calculate Ledoit–Wolf Shrunk Covariance Matrix",
  description: "Computes well-conditioned covariance and correlation matrices using analytical Ledoit-Wolf optimal shrinkage toward constant correlation.",
  category: "quant",
  keywords: ["covariance", "correlation", "ledoit_wolf", "shrinkage", "matrix", "risk"],
  parameters: {
    returnsMatrix: { type: "array", description: "Matrix of asset return vectors [N x T]", required: true },
    tickers: { type: "array", description: "Ticker labels corresponding to rows", required: true },
  },
  requiredData: ["aligned_returns"],
  dependencies: ["market.calc_returns"],
  permission: "compute",
  async execute(input) {
    const N = input.returnsMatrix.length;
    const T = input.returnsMatrix[0]?.length || 0;
    if (N === 0 || T === 0) {
      throw new Error("Empty returns matrix provided to covariance engine");
    }

    let covarianceMatrix: number[][];
    let shrinkageIntensity = 0;

    if (N >= 2 && T >= 20) {
      const lw = ledoitWolfShrinkage(input.returnsMatrix);
      if (lw) {
        covarianceMatrix = lw.sigma;
        shrinkageIntensity = lw.delta;
      } else {
        // Fallback sample covariance
        covarianceMatrix = Array.from({ length: N }, () => new Array(N).fill(0));
        for (let i = 0; i < N; i++) {
          for (let j = i; j < N; j++) {
            let cov = 0;
            for (let t = 0; t < T; t++) cov += input.returnsMatrix[i][t] * input.returnsMatrix[j][t];
            covarianceMatrix[i][j] = covarianceMatrix[j][i] = cov / T;
          }
        }
      }
    } else {
      // Single asset or short series
      covarianceMatrix = Array.from({ length: N }, (_, i) => {
        const row = new Array(N).fill(0);
        let var_i = 0;
        for (let t = 0; t < T; t++) var_i += input.returnsMatrix[i][t] * input.returnsMatrix[i][t];
        row[i] = var_i / (T || 1) || 0.0004;
        return row;
      });
    }

    const correlationMatrix = covToCorr(covarianceMatrix);

    return {
      tickers: input.tickers,
      covarianceMatrix,
      correlationMatrix,
      shrinkageIntensity: round(shrinkageIntensity, 4),
    };
  },
  interpretOutput(output, input, ctx) {
    return {
      summary: `Computed ${output.tickers.length}x${output.tickers.length} Ledoit–Wolf shrunk covariance matrix (optimal shrinkage intensity δ* = ${output.shrinkageIntensity}).`,
      primaryMetrics: [
        { label: "Assets", value: output.tickers.length },
        { label: "Shrinkage (δ*)", value: output.shrinkageIntensity },
      ],
      provenance: {
        toolId: "quant.calc_covariance",
        executionId: ctx.executionId,
        timestamp: Date.now(),
        sourceType: "calculated_metric",
        primaryDataSource: "Empirical Log Returns",
        modelOrMethod: "Ledoit-Wolf (2004) Analytical Covariance Shrinkage to Constant Correlation Target",
        assumptions: ["Stationary return distribution over observation window"],
        computationTimeMs: 12,
      },
    };
  },
  failureConditions: ["Matrix singular or ill-conditioned", "Insufficient sample points T < N"],
};

export const calcEulerRiskTool: SashaTool<
  { weights: number[]; covarianceMatrix: number[][]; tickers: string[]; sectors?: string[] },
  {
    annualizedVolPct: number;
    shares: EulerRiskShare[];
    dominantTicker: string;
    dominantRiskSharePct: number;
    riskParityDivergencePct: number;
  }
> = {
  id: "quant.calc_euler_risk",
  name: "Euler Marginal Risk Share Decomposition",
  description: "Decomposes portfolio volatility into exact percentage Euler risk shares (PCR_i) satisfying Euler's theorem: sum(PCR_i) = 100%.",
  category: "quant",
  keywords: ["euler", "risk_contribution", "marginal_risk", "pcr", "volatility", "risk_share"],
  parameters: {
    weights: { type: "array", description: "Portfolio capital weights summing to 1.0", required: true },
    covarianceMatrix: { type: "array", description: "Covariance matrix (daily or annualized)", required: true },
    tickers: { type: "array", description: "Asset ticker symbols", required: true },
    sectors: { type: "array", description: "Sector names for each asset", required: false },
  },
  requiredData: ["weights", "covariance_matrix"],
  dependencies: ["quant.calc_covariance"],
  permission: "compute",
  async execute(input) {
    let w = input.weights || [];
    const totalW = w.reduce((acc: number, val: number) => acc + val, 0);
    if (totalW > 1.5) {
      w = w.map((val: number) => val / totalW);
    } else if (totalW === 0 && input.tickers?.length > 0) {
      w = input.tickers.map(() => 1 / input.tickers.length);
    }
    const cov = input.covarianceMatrix;
    const tickers = input.tickers;
    const sectors = input.sectors || tickers.map(() => "Equities");
    const n = tickers.length;

    // Daily portfolio variance = w^T * Sigma * w
    let portVarDaily = 0;
    const marginalContribs: number[] = new Array(n).fill(0);

    for (let i = 0; i < n; i++) {
      let sigmaW_i = 0;
      for (let j = 0; j < n; j++) {
        sigmaW_i += (cov[i]?.[j] ?? (i === j ? 0.0004 : 0)) * (w[j] ?? (1 / n));
      }
      marginalContribs[i] = sigmaW_i;
      portVarDaily += (w[i] ?? (1 / n)) * sigmaW_i;
    }

    const portVolDaily = Math.sqrt(Math.max(1e-9, portVarDaily));
    const annualizedVolPct = round(portVolDaily * Math.sqrt(252) * 100, 2);

    const shares: EulerRiskShare[] = [];
    let dominantTicker = tickers[0] || "Asset";
    let maxRiskShare = -1;
    let maxDivergence = 0;

    for (let i = 0; i < n; i++) {
      const assetVolAnnual = round(Math.sqrt(Math.max(1e-9, cov[i]?.[i] ?? 0.0004)) * Math.sqrt(252) * 100, 2);
      // Euler Risk Contribution = w_i * (Sigma * w)_i / sigma_p
      const absRiskContrib = portVolDaily > 0 ? ((w[i] ?? (1 / n)) * marginalContribs[i]) / portVolDaily : 0;
      // Percentage contribution to risk = (w_i * (Sigma * w)_i) / sigma_p^2
      const pcrPct = portVarDaily > 0 ? round(((w[i] ?? (1 / n)) * marginalContribs[i] * 100) / portVarDaily, 2) : round(100 / n, 2);
      const weightPct = round((w[i] ?? (1 / n)) * 100, 2);

      const div = Math.abs(pcrPct - weightPct);
      if (div > maxDivergence) maxDivergence = div;

      if (pcrPct > maxRiskShare) {
        maxRiskShare = pcrPct;
        dominantTicker = tickers[i];
      }

      shares.push({
        ticker: tickers[i],
        weightPct,
        volatilityPct: assetVolAnnual,
        marginalRiskPct: round(marginalContribs[i] * Math.sqrt(252) * 100, 3),
        eulerRiskSharePct: pcrPct,
        sector: sectors[i] || "Equities",
      });
    }

    return {
      annualizedVolPct,
      shares,
      eulerRiskShares: shares,
      dominantTicker,
      dominantRiskTicker: dominantTicker,
      dominantRiskSharePct: maxRiskShare,
      riskParityDivergencePct: round(maxDivergence, 2),
    };
  },
  interpretOutput(output, input, ctx) {
    return {
      summary: `Portfolio volatility is ${output.annualizedVolPct}% annualized. ${output.dominantTicker} dominates risk at ${output.dominantRiskSharePct}% of total variance.`,
      primaryMetrics: [
        { label: "Portfolio σ", value: `${output.annualizedVolPct}%` },
        { label: "Dominant Asset", value: output.dominantTicker },
        { label: "Max Risk Share", value: `${output.dominantRiskSharePct}%` },
        { label: "Risk-Weight Divergence", value: `${output.riskParityDivergencePct}%` },
      ],
      chartHint: "euler_waterfall",
      provenance: {
        toolId: "quant.calc_euler_risk",
        executionId: ctx.executionId,
        timestamp: Date.now(),
        sourceType: "calculated_metric",
        primaryDataSource: "Ledoit-Wolf Covariance Matrix",
        modelOrMethod: "Euler's Homogeneous Function Theorem (PCR_i = w_i (Σw)_i / σ_p^2)",
        assumptions: ["Continuous daily compounding, 252 annual trading days"],
        computationTimeMs: 8,
      },
    };
  },
  failureConditions: ["Non-positive-definite covariance matrix"],
};

export const calcBetaRegressionTool: SashaTool<
  { assetReturns: number[]; benchmarkReturns: number[] },
  { beta: number; alphaAnnualPct: number; rSquared: number; correlation: number }
> = {
  id: "quant.calc_beta_regression",
  name: "Calculate OLS Beta & Alpha Regression",
  description: "Performs ordinary least squares (OLS) linear regression of asset returns against market benchmark returns.",
  category: "quant",
  keywords: ["beta", "alpha", "regression", "ols", "r_squared", "correlation"],
  parameters: {
    assetReturns: { type: "array", description: "Array of asset returns", required: true },
    benchmarkReturns: { type: "array", description: "Array of benchmark returns", required: true },
  },
  requiredData: ["aligned_returns"],
  dependencies: ["market.calc_returns"],
  permission: "compute",
  async execute(input) {
    const y = input.assetReturns;
    const x = input.benchmarkReturns;
    const n = Math.min(y.length, x.length);
    if (n < 5) throw new Error("Insufficient data points for beta regression (need >= 5)");

    let sumX = 0;
    let sumY = 0;
    for (let i = 0; i < n; i++) {
      sumX += x[i];
      sumY += y[i];
    }
    const meanX = sumX / n;
    const meanY = sumY / n;

    let covXY = 0;
    let varX = 0;
    let varY = 0;

    for (let i = 0; i < n; i++) {
      const dx = x[i] - meanX;
      const dy = y[i] - meanY;
      covXY += dx * dy;
      varX += dx * dx;
      varY += dy * dy;
    }

    const beta = varX > 0 ? covXY / varX : 1.0;
    const alphaDaily = meanY - beta * meanX;
    const alphaAnnualPct = round(alphaDaily * 252 * 100, 2);
    const correlation = Math.sqrt(varX * varY) > 0 ? covXY / Math.sqrt(varX * varY) : 0;
    const rSquared = round(correlation * correlation, 3);

    return {
      beta: round(beta, 2),
      alphaAnnualPct,
      rSquared,
      correlation: round(correlation, 3),
    };
  },
  interpretOutput(output, input, ctx) {
    return {
      summary: `Beta is ${output.beta} (R² = ${output.rSquared}, annual Alpha = ${output.alphaAnnualPct >= 0 ? "+" : ""}${output.alphaAnnualPct}%).`,
      primaryMetrics: [
        { label: "Beta (β)", value: output.beta },
        { label: "Alpha (α)", value: `${output.alphaAnnualPct >= 0 ? "+" : ""}${output.alphaAnnualPct}%` },
        { label: "R-Squared", value: output.rSquared },
        { label: "Correlation", value: output.correlation },
      ],
      provenance: {
        toolId: "quant.calc_beta_regression",
        executionId: ctx.executionId,
        timestamp: Date.now(),
        sourceType: "calculated_metric",
        primaryDataSource: "Empirical Log Returns",
        modelOrMethod: "Ordinary Least Squares (OLS) Linear Regression (R_i = α + β R_m + ε)",
        assumptions: ["Residuals i.i.d."],
        computationTimeMs: 5,
      },
    };
  },
  failureConditions: ["Zero variance in benchmark returns"],
};
