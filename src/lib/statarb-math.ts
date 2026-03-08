/**
 * Statistical Arbitrage — Pure Mathematics Library
 * Zero UI dependencies. All functions take arrays of numbers, return arrays of numbers.
 */

// ─── Random / Utility ───────────────────────────────────────────────

export function gaussianRandom(): number {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

export function percentile(arr: number[], p: number): number {
  const s = [...arr].sort((a, b) => a - b);
  const i = (p / 100) * (s.length - 1);
  const lo = Math.floor(i), hi = Math.ceil(i);
  return lo === hi ? s[lo] : s[lo] + (s[hi] - s[lo]) * (i - lo);
}

export function mean(arr: number[]): number {
  return arr.length === 0 ? 0 : arr.reduce((s, v) => s + v, 0) / arr.length;
}

export function stddev(arr: number[]): number {
  const m = mean(arr);
  return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / arr.length);
}

export function returns(prices: number[]): number[] {
  return prices.slice(1).map((p, i) => Math.log(p / prices[i]));
}

// ─── 1. Price Dynamics ──────────────────────────────────────────────

/** Geometric Brownian Motion path: dS = μSdt + σSdW */
export function gbmPath(S0: number, mu: number, sigma: number, days: number, dt = 1 / 252): number[] {
  const path = [S0];
  let S = S0;
  for (let i = 0; i < days; i++) {
    const dW = gaussianRandom() * Math.sqrt(dt);
    S = S * Math.exp((mu - 0.5 * sigma * sigma) * dt + sigma * dW);
    path.push(Math.max(S, 0.001));
  }
  return path;
}

/** Merton Jump Diffusion: dS = μSdt + σSdW + JSdq */
export function jumpDiffusionPath(
  S0: number, mu: number, sigma: number, days: number,
  jumpProb = 0.01, jumpMean = -0.03, jumpStd = 0.02, dt = 1 / 252
): number[] {
  const path = [S0];
  let S = S0;
  for (let i = 0; i < days; i++) {
    const dW = gaussianRandom() * Math.sqrt(dt);
    let jump = 0;
    if (Math.random() < jumpProb) jump = jumpMean + jumpStd * gaussianRandom();
    S = S * Math.exp((mu - 0.5 * sigma * sigma) * dt + sigma * dW + jump);
    path.push(Math.max(S, 0.001));
  }
  return path;
}

/** GARCH(1,1): σ²t = α₀ + α₁ε²(t-1) + β₁σ²(t-1) */
export function garch11(
  logReturns: number[],
  alpha0 = 0.00001, alpha1 = 0.08, beta1 = 0.90
): { sigma: number[]; forecast: number } {
  const n = logReturns.length;
  const sigma: number[] = new Array(n);
  const m = mean(logReturns);
  let sig2 = logReturns.reduce((s, r) => s + (r - m) ** 2, 0) / n;
  
  for (let t = 0; t < n; t++) {
    sigma[t] = Math.sqrt(sig2);
    const eps = logReturns[t] - m;
    sig2 = alpha0 + alpha1 * eps * eps + beta1 * sig2;
  }
  return { sigma, forecast: Math.sqrt(sig2) };
}

/** Hidden Markov Model — 2-state (bull/bear) Baum-Welch simplified */
export function hmmRegimeDetect(
  logReturns: number[], nStates = 3
): { regimeProbs: number[][]; currentRegime: number; transitionMatrix: number[][] } {
  const n = logReturns.length;
  // Initialize regime centers via quantile clustering
  const sorted = [...logReturns].sort((a, b) => a - b);
  const centers = Array.from({ length: nStates }, (_, i) => 
    sorted[Math.floor((i + 0.5) * n / nStates)]
  );
  const stds = Array(nStates).fill(stddev(logReturns));
  
  // Assign regimes by closest center
  const assignments = logReturns.map(r => {
    let best = 0, bestDist = Infinity;
    for (let s = 0; s < nStates; s++) {
      const d = Math.abs(r - centers[s]);
      if (d < bestDist) { bestDist = d; best = s; }
    }
    return best;
  });
  
  // Build transition matrix
  const trans = Array.from({ length: nStates }, () => Array(nStates).fill(0));
  for (let i = 1; i < n; i++) trans[assignments[i - 1]][assignments[i]]++;
  for (let s = 0; s < nStates; s++) {
    const rowSum = trans[s].reduce((a, b) => a + b, 0) || 1;
    trans[s] = trans[s].map(v => v / rowSum);
  }
  
  // Regime probabilities (soft assignment via gaussian likelihood)
  const regimeProbs = logReturns.map(r => {
    const probs = centers.map((c, s) => {
      const z = (r - c) / (stds[s] || 0.01);
      return Math.exp(-0.5 * z * z);
    });
    const sum = probs.reduce((a, b) => a + b, 0) || 1;
    return probs.map(p => p / sum);
  });
  
  return { regimeProbs, currentRegime: assignments[n - 1], transitionMatrix: trans };
}

// ─── 2. Portfolio Risk ──────────────────────────────────────────────

/** Rolling covariance matrix from return series */
export function covarianceMatrix(returnSeries: number[][]): number[][] {
  const n = returnSeries.length;
  const means = returnSeries.map(mean);
  const cov: number[][] = Array.from({ length: n }, () => Array(n).fill(0));
  const len = returnSeries[0]?.length || 0;
  
  for (let i = 0; i < n; i++) {
    for (let j = i; j < n; j++) {
      let sum = 0;
      for (let t = 0; t < len; t++) {
        sum += (returnSeries[i][t] - means[i]) * (returnSeries[j][t] - means[j]);
      }
      cov[i][j] = cov[j][i] = sum / (len - 1 || 1);
    }
  }
  return cov;
}

/** Cholesky decomposition: returns lower triangular L where Σ = L·Lᵀ */
export function choleskyDecompose(matrix: number[][]): number[][] {
  const n = matrix.length;
  const L: number[][] = Array.from({ length: n }, () => Array(n).fill(0));
  
  for (let i = 0; i < n; i++) {
    for (let j = 0; j <= i; j++) {
      let sum = 0;
      for (let k = 0; k < j; k++) sum += L[i][k] * L[j][k];
      if (i === j) {
        L[i][j] = Math.sqrt(Math.max(matrix[i][i] - sum, 1e-10));
      } else {
        L[i][j] = (matrix[i][j] - sum) / (L[j][j] || 1e-10);
      }
    }
  }
  return L;
}

/** Generate correlated random shocks using Cholesky decomposition */
export function correlatedShocks(L: number[][], nAssets: number): number[] {
  const z = Array.from({ length: nAssets }, gaussianRandom);
  return L.map(row => row.reduce((s, v, j) => s + v * z[j], 0));
}

/** Historical VaR at given confidence */
export function historicalVaR(returns: number[], confidence = 0.95): number {
  return -percentile(returns, (1 - confidence) * 100);
}

/** Parametric (Normal) VaR */
export function parametricVaR(mu: number, sigma: number, confidence = 0.95): number {
  const zScores: Record<number, number> = { 0.9: 1.282, 0.95: 1.645, 0.99: 2.326 };
  const z = zScores[confidence] || 1.645;
  return -(mu - z * sigma);
}

/** Monte Carlo VaR from simulated returns */
export function monteCarloVaR(
  currentValue: number, mu: number, sigma: number,
  days = 10, nSims = 10000, confidence = 0.95
): { var: number; cvar: number; distribution: number[] } {
  const finals: number[] = [];
  for (let i = 0; i < nSims; i++) {
    let val = currentValue;
    for (let d = 0; d < days; d++) {
      val *= Math.exp((mu - 0.5 * sigma * sigma) / 252 + sigma / Math.sqrt(252) * gaussianRandom());
    }
    finals.push(val - currentValue);
  }
  finals.sort((a, b) => a - b);
  const varIdx = Math.floor((1 - confidence) * nSims);
  const varVal = -finals[varIdx];
  const cvarVals = finals.slice(0, varIdx);
  const cvar = cvarVals.length > 0 ? -mean(cvarVals) : varVal;
  return { var: varVal, cvar, distribution: finals };
}

/** Maximum drawdown from a price/value path */
export function maxDrawdown(path: number[]): { drawdown: number; peakIdx: number; troughIdx: number } {
  let peak = path[0], maxDD = 0, peakIdx = 0, troughIdx = 0;
  for (let i = 1; i < path.length; i++) {
    if (path[i] > peak) { peak = path[i]; peakIdx = i; }
    const dd = (peak - path[i]) / peak;
    if (dd > maxDD) { maxDD = dd; troughIdx = i; }
  }
  return { drawdown: maxDD, peakIdx, troughIdx };
}

// ─── 3. Portfolio Optimization ──────────────────────────────────────

/** Mean-Variance (Markowitz) efficient frontier via grid search */
export function markowitzFrontier(
  expectedReturns: number[], covMatrix: number[][], nPoints = 50
): { weights: number[][]; returns: number[]; risks: number[] } {
  const n = expectedReturns.length;
  const results: { w: number[]; ret: number; risk: number }[] = [];
  
  // Generate random portfolios
  for (let p = 0; p < nPoints * 100; p++) {
    const raw = Array.from({ length: n }, () => Math.random());
    const sum = raw.reduce((a, b) => a + b, 0);
    const w = raw.map(v => v / sum);
    
    const ret = w.reduce((s, wi, i) => s + wi * expectedReturns[i], 0);
    let risk = 0;
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++)
        risk += w[i] * w[j] * covMatrix[i][j];
    risk = Math.sqrt(Math.max(risk, 0));
    
    results.push({ w, ret, risk });
  }
  
  // Extract efficient frontier (top return for each risk bucket)
  results.sort((a, b) => a.risk - b.risk);
  const minRisk = results[0].risk;
  const maxRisk = results[results.length - 1].risk;
  const step = (maxRisk - minRisk) / nPoints;
  
  const frontier: typeof results = [];
  for (let r = minRisk; r <= maxRisk; r += step) {
    const bucket = results.filter(p => p.risk >= r && p.risk < r + step);
    if (bucket.length > 0) {
      frontier.push(bucket.reduce((best, p) => p.ret > best.ret ? p : best));
    }
  }
  
  return {
    weights: frontier.map(f => f.w),
    returns: frontier.map(f => f.ret),
    risks: frontier.map(f => f.risk),
  };
}

/** Risk Parity: allocate so each asset contributes equal risk */
export function riskParityWeights(covMatrix: number[][]): number[] {
  const n = covMatrix.length;
  const vols = covMatrix.map((_, i) => Math.sqrt(covMatrix[i][i]));
  const invVols = vols.map(v => 1 / (v || 0.01));
  const sum = invVols.reduce((a, b) => a + b, 0);
  return invVols.map(v => v / sum);
}

/** Kelly Criterion: f* = (bp - q) / b */
export function kellyCriterion(winProb: number, payoffRatio: number): number {
  const q = 1 - winProb;
  return Math.max(0, Math.min(1, (payoffRatio * winProb - q) / payoffRatio));
}

// ─── 4. Time Series Signals ─────────────────────────────────────────

/** Simple AR(1) + drift forecast */
export function arimaForecast(series: number[], nForecast = 30): number[] {
  const n = series.length;
  if (n < 3) return Array(nForecast).fill(series[n - 1] || 0);
  
  // Estimate AR(1) coefficient
  const diffs = series.slice(1).map((v, i) => v - series[i]);
  const mu = mean(diffs);
  let num = 0, den = 0;
  for (let i = 1; i < diffs.length; i++) {
    num += (diffs[i] - mu) * (diffs[i - 1] - mu);
    den += (diffs[i - 1] - mu) ** 2;
  }
  const phi = den > 0 ? Math.max(-0.99, Math.min(0.99, num / den)) : 0;
  
  const forecast: number[] = [];
  let lastVal = series[n - 1];
  let lastDiff = diffs[diffs.length - 1];
  for (let i = 0; i < nForecast; i++) {
    const nextDiff = mu + phi * (lastDiff - mu);
    lastVal += nextDiff;
    forecast.push(lastVal);
    lastDiff = nextDiff;
  }
  return forecast;
}

/** 1D Kalman Filter for price smoothing */
export function kalmanFilter(
  observations: number[],
  processNoise = 0.01, measurementNoise = 0.1
): { filtered: number[]; gain: number[] } {
  const n = observations.length;
  const filtered: number[] = new Array(n);
  const gain: number[] = new Array(n);
  
  let xHat = observations[0];
  let P = 1;
  
  for (let i = 0; i < n; i++) {
    // Predict
    const xPred = xHat;
    const pPred = P + processNoise;
    
    // Update
    const K = pPred / (pPred + measurementNoise);
    xHat = xPred + K * (observations[i] - xPred);
    P = (1 - K) * pPred;
    
    filtered[i] = xHat;
    gain[i] = K;
  }
  
  return { filtered, gain };
}

// ─── 5. Factor Modeling ─────────────────────────────────────────────

/** OLS regression: y = α + Σ(βi × xi) + ε */
export function factorRegression(
  assetReturns: number[], factorReturns: number[][]
): { alpha: number; betas: number[]; rSquared: number; residuals: number[] } {
  const n = assetReturns.length;
  const nFactors = factorReturns.length;
  
  // Simple OLS via normal equations (small factor count)
  const meanY = mean(assetReturns);
  const meanX = factorReturns.map(mean);
  
  const betas: number[] = [];
  for (let f = 0; f < nFactors; f++) {
    let num = 0, den = 0;
    for (let t = 0; t < n; t++) {
      num += (factorReturns[f][t] - meanX[f]) * (assetReturns[t] - meanY);
      den += (factorReturns[f][t] - meanX[f]) ** 2;
    }
    betas.push(den > 0 ? num / den : 0);
  }
  
  const alpha = meanY - betas.reduce((s, b, i) => s + b * meanX[i], 0);
  
  const residuals = assetReturns.map((y, t) => {
    const predicted = alpha + betas.reduce((s, b, i) => s + b * factorReturns[i][t], 0);
    return y - predicted;
  });
  
  const ssRes = residuals.reduce((s, r) => s + r * r, 0);
  const ssTot = assetReturns.reduce((s, y) => s + (y - meanY) ** 2, 0);
  const rSquared = ssTot > 0 ? 1 - ssRes / ssTot : 0;
  
  return { alpha, betas, rSquared, residuals };
}

// ─── 6. Liquidity / Market Impact ───────────────────────────────────

/** Almgren-Chriss market impact estimate */
export function almgrenChrissImpact(
  orderSize: number, dailyVolume: number, volatility: number,
  urgency = 0.5 // 0=passive, 1=aggressive
): { temporaryImpact: number; permanentImpact: number; totalCostBps: number } {
  const participationRate = orderSize / (dailyVolume || 1);
  const eta = 0.142; // temporary impact coefficient
  const gamma = 0.314; // permanent impact coefficient
  
  const tempImpact = eta * volatility * Math.pow(participationRate, 0.6) * urgency;
  const permImpact = gamma * volatility * Math.sqrt(participationRate);
  const totalBps = (tempImpact + permImpact) * 10000;
  
  return { temporaryImpact: tempImpact, permanentImpact: permImpact, totalCostBps: totalBps };
}

/** Order book imbalance score */
export function orderBookImbalance(bidVolume: number, askVolume: number): number {
  const total = bidVolume + askVolume;
  return total > 0 ? (bidVolume - askVolume) / total : 0; // -1 to +1
}

// ─── 7. Full Monte Carlo Engine ─────────────────────────────────────

export interface MCResult {
  paths: number[][];
  finalValues: number[];
  expectedReturn: number;
  var95: number;
  var99: number;
  cvar95: number;
  maxDrawdownDist: number[];
  percentileBands: { day: number; p5: number; p25: number; p50: number; p75: number; p95: number }[];
}

export function runMonteCarlo(
  S0: number, mu: number, sigma: number,
  days = 252, nPaths = 10000, nVisiblePaths = 40,
  useJumps = false, jumpProb = 0.01, jumpMean = -0.03, jumpStd = 0.02
): MCResult {
  const sampleEvery = Math.max(1, Math.floor(days / 100));
  const stepsCount = Math.ceil(days / sampleEvery) + 1;
  const paths: number[][] = [];
  const finalValues: number[] = [];
  const maxDrawdowns: number[] = [];
  const dayValues: number[][] = Array.from({ length: stepsCount }, () => []);

  for (let p = 0; p < nPaths; p++) {
    let S = S0, peak = S0, worstDD = 0;
    const storePath = p < nVisiblePaths;
    const path: number[] = storePath ? [S0] : [];
    let stepIdx = 1;

    for (let d = 1; d <= days; d++) {
      const dW = gaussianRandom() * Math.sqrt(1 / 252);
      let jump = 0;
      if (useJumps && Math.random() < jumpProb) jump = jumpMean + jumpStd * gaussianRandom();
      S = S * Math.exp((mu - 0.5 * sigma * sigma) / 252 + sigma * dW + jump);
      S = Math.max(S, 0.001);
      if (S > peak) peak = S;
      const dd = (peak - S) / peak;
      if (dd > worstDD) worstDD = dd;

      if (d % sampleEvery === 0) {
        if (storePath) path.push(S);
        if (stepIdx < stepsCount) dayValues[stepIdx].push(S);
        stepIdx++;
      }
    }
    finalValues.push(S);
    maxDrawdowns.push(worstDD);
    if (storePath) paths.push(path);
  }
  dayValues[0] = [S0]; // day 0

  const sortedFinals = [...finalValues].sort((a, b) => a - b);
  const ret = mean(finalValues.map(v => (v - S0) / S0));
  const v95 = percentile(sortedFinals, 5);
  const v99 = percentile(sortedFinals, 1);
  const cv95Vals = sortedFinals.filter(v => v <= v95);
  const cv95 = cv95Vals.length > 0 ? mean(cv95Vals) : v95;

  const percentileBands = dayValues.map((vals, i) => ({
    day: Math.round((i / (stepsCount - 1)) * days),
    p5: vals.length > 0 ? percentile(vals, 5) : S0,
    p25: vals.length > 0 ? percentile(vals, 25) : S0,
    p50: vals.length > 0 ? percentile(vals, 50) : S0,
    p75: vals.length > 0 ? percentile(vals, 75) : S0,
    p95: vals.length > 0 ? percentile(vals, 95) : S0,
  }));

  return {
    paths, finalValues, expectedReturn: ret,
    var95: (S0 - v95) / S0, var99: (S0 - v99) / S0,
    cvar95: (S0 - cv95) / S0, maxDrawdownDist: maxDrawdowns,
    percentileBands,
  };
}

// ─── 8. Stress Testing ──────────────────────────────────────────────

export interface StressScenario {
  name: string;
  shocks: Record<string, number>; // factor -> shock magnitude
}

export function stressTest(
  portfolioWeights: number[], factorBetas: number[][], scenario: StressScenario
): { portfolioImpact: number; assetImpacts: number[] } {
  const factorNames = Object.keys(scenario.shocks);
  const assetImpacts = portfolioWeights.map((_, i) => {
    let impact = 0;
    factorBetas[i]?.forEach((beta, f) => {
      const shock = scenario.shocks[factorNames[f]] || 0;
      impact += beta * shock;
    });
    return impact;
  });
  const portfolioImpact = portfolioWeights.reduce((s, w, i) => s + w * assetImpacts[i], 0);
  return { portfolioImpact, assetImpacts };
}

// ─── 9. Structural Flow Detection ───────────────────────────────────

export interface FlowSignal {
  type: string;
  direction: "buy" | "sell";
  magnitude: number; // 0-100
  confidence: number;
  description: string;
}

export function detectStructuralFlows(
  prices: number[], volumes: number[], dayOfMonth: number
): FlowSignal[] {
  const signals: FlowSignal[] = [];
  const n = prices.length;
  if (n < 20) return signals;

  // ETF rebalance detection (end of quarter)
  if (dayOfMonth >= 25) {
    const recentVolRatio = mean(volumes.slice(-5)) / (mean(volumes.slice(-20)) || 1);
    if (recentVolRatio > 1.3) {
      signals.push({
        type: "ETF Rebalance", direction: recentVolRatio > 1.5 ? "sell" : "buy",
        magnitude: Math.min(100, recentVolRatio * 40),
        confidence: 0.6, description: "Volume spike near quarter-end suggests index rebalancing"
      });
    }
  }

  // Volatility targeting funds (vol regime change → forced selling)
  const recentReturns = returns(prices.slice(-20));
  const recentVol = stddev(recentReturns) * Math.sqrt(252);
  const longVol = stddev(returns(prices)) * Math.sqrt(252);
  if (recentVol > longVol * 1.5) {
    signals.push({
      type: "Vol-Target Deleveraging", direction: "sell",
      magnitude: Math.min(100, (recentVol / longVol) * 50),
      confidence: 0.7, description: "Rising volatility may trigger vol-targeting fund deleveraging"
    });
  }

  // Momentum factor crowding
  const mom20 = (prices[n - 1] - prices[n - 20]) / prices[n - 20];
  if (Math.abs(mom20) > 0.1) {
    signals.push({
      type: "Momentum Crowding", direction: mom20 > 0 ? "buy" : "sell",
      magnitude: Math.min(100, Math.abs(mom20) * 500),
      confidence: 0.5, description: `Strong ${mom20 > 0 ? "positive" : "negative"} momentum may attract systematic flows`
    });
  }

  return signals;
}

// ─── 10. Mean Reversion / SnapBack ──────────────────────────────────

export interface MeanReversionResult {
  zScore: number;
  halfLife: number;
  hurstExponent: number;
  isStationary: boolean;
  meanPrice: number;
  upperBand: number;
  lowerBand: number;
  snapBackProb: number;
  expectedSnapBack: number;
  ouParams: { theta: number; mu: number; sigma: number };
}

/** Ornstein-Uhlenbeck parameter estimation via OLS on dX = θ(μ - X)dt + σdW */
export function estimateOU(prices: number[]): { theta: number; mu: number; sigma: number } {
  const n = prices.length;
  if (n < 10) return { theta: 0.1, mu: mean(prices), sigma: stddev(prices) };

  const dt = 1 / 252;
  const dX = prices.slice(1).map((p, i) => p - prices[i]);
  const X = prices.slice(0, -1);

  // OLS: dX = a + b*X → θ = -b/dt, μ = -a/b
  const mX = mean(X);
  const mDX = mean(dX);
  let num = 0, den = 0;
  for (let i = 0; i < dX.length; i++) {
    num += (X[i] - mX) * (dX[i] - mDX);
    den += (X[i] - mX) ** 2;
  }
  const b = den > 0 ? num / den : -0.01;
  const a = mDX - b * mX;

  const theta = Math.max(0.01, -b / dt);
  const mu = b !== 0 ? -a / b : mean(prices);

  const residuals = dX.map((d, i) => d - a - b * X[i]);
  const sig = stddev(residuals) / Math.sqrt(dt);

  return { theta, mu, sigma: Math.max(sig, 0.001) };
}

/** Half-life of mean reversion: t½ = ln(2) / θ */
export function meanReversionHalfLife(theta: number): number {
  return theta > 0 ? Math.log(2) / theta : Infinity;
}

/** Hurst exponent via R/S analysis — H < 0.5 = mean-reverting, H > 0.5 = trending */
export function hurstExponent(prices: number[]): number {
  const n = prices.length;
  if (n < 20) return 0.5;
  const rets = returns(prices);
  const m = mean(rets);
  const cumDev = rets.map((r, i) => rets.slice(0, i + 1).reduce((s, v) => s + (v - m), 0));
  const R = Math.max(...cumDev) - Math.min(...cumDev);
  const S = stddev(rets);
  if (S === 0) return 0.5;
  return Math.log(R / S) / Math.log(n);
}

/** Z-score of current price relative to rolling mean/std */
export function zScore(price: number, prices: number[]): number {
  const m = mean(prices);
  const s = stddev(prices);
  return s > 0 ? (price - m) / s : 0;
}

/** Mean Reversion SnapBack probability given OU params */
export function snapBackProbability(currentPrice: number, ou: { theta: number; mu: number; sigma: number }, horizon = 20): number {
  const distance = Math.abs(currentPrice - ou.mu);
  const expectedRevert = distance * (1 - Math.exp(-ou.theta * horizon / 252));
  const volOverHorizon = ou.sigma * Math.sqrt((1 - Math.exp(-2 * ou.theta * horizon / 252)) / (2 * ou.theta));
  if (volOverHorizon === 0) return 0.5;
  // Prob of moving at least halfway back
  const halfwayRevert = distance / 2;
  const zVal = (expectedRevert - halfwayRevert) / volOverHorizon;
  // Approximate normal CDF
  return 0.5 * (1 + Math.tanh(zVal * Math.sqrt(2 / Math.PI)));
}

/** Generate OU mean-reversion simulation paths */
export function ouSimPaths(S0: number, ou: { theta: number; mu: number; sigma: number }, days: number, nPaths: number): number[][] {
  const dt = 1 / 252;
  const paths: number[][] = [];
  for (let p = 0; p < nPaths; p++) {
    const path = [S0];
    let S = S0;
    for (let d = 0; d < days; d++) {
      const dW = gaussianRandom() * Math.sqrt(dt);
      S = S + ou.theta * (ou.mu - S) * dt + ou.sigma * dW;
      path.push(Math.max(S, 0.001));
    }
    paths.push(path);
  }
  return paths;
}

/** Bollinger-style mean reversion bands */
export function meanReversionBands(prices: number[], window = 20, numStd = 2): { mean: number[]; upper: number[]; lower: number[] } {
  const result = { mean: [] as number[], upper: [] as number[], lower: [] as number[] };
  for (let i = 0; i < prices.length; i++) {
    const start = Math.max(0, i - window + 1);
    const slice = prices.slice(start, i + 1);
    const m = mean(slice);
    const s = stddev(slice);
    result.mean.push(m);
    result.upper.push(m + numStd * s);
    result.lower.push(m - numStd * s);
  }
  return result;
}
