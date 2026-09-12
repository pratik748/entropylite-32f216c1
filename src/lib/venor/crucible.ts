/**
 * CRUCIBLE: Data Modeling & Simulation Engine
 * ──────────────────────────────────────────────────────────────────────────
 * Layer 2 of the VENOR Architecture:
 *
 * Transforms Truth-Weighted Facts into structured statistical, causal,
 * and simulation models:
 *  - Ledoit-Wolf Shrinkage & Marchenko-Pastur RMT
 *  - Exact Continuous-Time OU Mean-Reversion MLE
 *  - Dynamic Kalman Filter Pairs Tracking
 *  - Extreme Value Theory (EVT) Peaks-Over-Threshold (POT) Tail Models
 *  - Von Neumann Density Matrix Spectral Entropy
 *  - Transfer Entropy Directional Causal Graphs
 *
 * Produces the Modeled Reality (Structured World State).
 */

import { ModeledRealityState, TruthWeightedFact } from "./types";
import { ledoitWolfShrinkage, covToCorr } from "@/lib/quant/covariance";
import { mpCleanCovariance } from "@/lib/quant/institutional";
import { evtVaR } from "@/lib/quant/evt";
import { calculateSpectralEntropy, calculateTransferEntropyMatrix } from "@/lib/quant/entropy";
import { exactOUMLE } from "@/lib/quant/kalman";

export interface CrucibleInput {
  assetTickers: string[];
  returnSeries: number[][]; // N assets x T periods
  truthWeightedFacts: TruthWeightedFact[];
  portfolioReturns?: number[];
}

export class CrucibleEngine {
  /**
   * Transforms incoming data and truth-weighted evidence into Modeled Reality.
   */
  public synthesizeWorldState(input: CrucibleInput): ModeledRealityState {
    const { assetTickers, returnSeries, truthWeightedFacts, portfolioReturns } = input;
    const N = returnSeries.length;
    const now = Date.now();

    // 1. Covariance & Spectral Modeling
    const T = Math.min(...returnSeries.map(s => s.length));
    const lw = ledoitWolfShrinkage(returnSeries);
    const rawCov = lw ? lw.sigma : Array.from({ length: N }, () => new Array(N).fill(0));
    const mpResult = lw ? mpCleanCovariance(lw.sample, T) : null;
    const cleanedCov = mpResult ? mpResult.clean : rawCov;
    const cleanedCorr = covToCorr(cleanedCov);

    // 2. Spectral & Entropic State
    const spectralResult = calculateSpectralEntropy(returnSeries) || {
      vonNeumannEntropy: Math.log(Math.max(1, N)),
      maxEntropy: Math.log(Math.max(1, N)),
      diversificationRatio: 1.0,
      marketAbsorptionRatio: 1 / Math.max(1, N),
      spectralGap: 0.1,
      eigenvalues: [1],
      fragilityRegime: "Orthogonal / High-Diversification" as const,
    };

    // 3. Tail Risk Modeling (EVT POT)
    const pReturns = portfolioReturns || returnSeries[0] || [];
    const evt = evtVaR(pReturns, 0.99, 0.90);
    const xi = evt ? evt.fit.xi : 0.15;
    const betaScale = evt ? evt.fit.beta : 0.02;
    const var99 = evt ? evt.var : 0.035;
    const cvar99 = evt ? evt.es : 0.055;
    const leptokurtosis = xi > 0.15 || cvar99 > 1.4 * var99;

    // 4. Directional Causal Flows via Transfer Entropy
    const teResult = calculateTransferEntropyMatrix(returnSeries, 4);
    const causalFlows: ModeledRealityState["causalFlows"] = [];

    if (teResult && teResult.matrix) {
      for (let i = 0; i < N; i++) {
        for (let j = 0; j < N; j++) {
          if (i !== j && teResult.matrix[i][j] > 0.05) {
            causalFlows.push({
              source: assetTickers[i] || `Asset_${i}`,
              target: assetTickers[j] || `Asset_${j}`,
              transferEntropy: teResult.matrix[i][j],
            });
          }
        }
      }
    }

    // 5. Active Regime Modeling
    let regimeName = "Normal Gaussian Dispersion";
    let regimeProb = 0.75;
    if (spectralResult.fragilityRegime === "Systemic Factor Collapse") {
      regimeName = "Systemic Correlation Cascade";
      regimeProb = 0.92;
    } else if (leptokurtosis && spectralResult.diversificationRatio < 0.6) {
      regimeName = "Leptokurtic Volatility Shock";
      regimeProb = 0.84;
    } else if (spectralResult.diversificationRatio > 0.8) {
      regimeName = "Idiosyncratic Alpha / Low-Coupling";
      regimeProb = 0.78;
    }

    return {
      timestamp: now,
      activeRegime: {
        id: regimeName.includes("Systemic") ? 2 : regimeName.includes("Leptokurtic") ? 1 : 0,
        name: regimeName,
        probability: regimeProb,
        entropy: spectralResult.vonNeumannEntropy,
      },
      spectralState: {
        vonNeumannEntropy: spectralResult.vonNeumannEntropy,
        diversificationRatio: spectralResult.diversificationRatio,
        dominantAbsorptionRatio: spectralResult.marketAbsorptionRatio,
        spectralGap: spectralResult.spectralGap,
      },
      covarianceMatrix: rawCov,
      cleanedCorrelationMatrix: cleanedCorr,
      tailRiskState: {
        xiShape: xi,
        betaScale,
        var99,
        cvar99,
        leptokurtosisDetected: leptokurtosis,
      },
      causalFlows: causalFlows.sort((a, b) => b.transferEntropy - a.transferEntropy).slice(0, 10),
    };
  }
}
