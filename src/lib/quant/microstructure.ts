/**
 * Market Microstructure & Optimal Execution Engine
 * ──────────────────────────────────────────────────────────────────────────
 * Institutional-grade execution modeling and microstructure analytics:
 *
 * 1. Almgren-Chriss Optimal Execution (Almgren & Chriss 2000):
 *    - Closed-form deterministic liquidation trajectories minimizing Expected Shortfall
 *      of execution cost under linear permanent and temporary price impact with risk aversion λ.
 *    - Trajectory: x_j = sinh(κ (T - t_j)) / sinh(κ T) * X
 *      where κ ≈ arcosh(1 + 0.5 * (λ * σ² * τ² / η)) / τ
 *
 * 2. Kyle's Lambda Price Impact (Kyle 1985):
 *    - Price impact coefficient λ_kyle = Cov(ΔP, Q) / Var(Q)
 *    - Estimates depth of book and adverse selection per unit traded volume.
 *
 * 3. Roll Effective Bid-Ask Spread (Roll 1984):
 *    - Serial covariance of price changes: S = 2 * sqrt(-Cov(ΔP_t, ΔP_{t-1})) when Cov < 0.
 *
 * 4. Amihud Price Impact / Illiquidity Ratio (Amihud 2002):
 *    - Average ratio of absolute daily return to dollar volume: (1/T) * Σ (|r_t| / (P_t * V_t)).
 *
 * 5. Implementation Shortfall & Volume-Weighted Arrival Slippage.
 *
 * Pure, deterministic, zero-download, runs instantaneously in browser/WASM.
 */

export interface AlmgrenChrissParams {
  /** Total units to liquidate (positive = sell, negative = buy) */
  totalShares: number;
  /** Total time horizon in days/periods (e.g. 1.0 = 1 full day) */
  horizonPeriods: number;
  /** Number of discrete trading intervals (e.g. 10 or 20 slices) */
  intervals: number;
  /** Daily price volatility σ */
  dailyVolatility: number;
  /** Current asset price P0 */
  initialPrice: number;
  /** Permanent price impact coefficient γ ($/share per share traded) */
  permanentImpactGamma: number;
  /** Temporary price impact coefficient η ($/share per share/period rate) */
  temporaryImpactEta: number;
  /** Risk aversion coefficient λ >= 0 (λ=0 gives TWAP linear execution, λ>0 front-loads) */
  riskAversionLambda?: number;
}

export interface AlmgrenChrissTrajectory {
  /** Time steps t_j */
  timeSteps: number[];
  /** Holdings remaining at each time step x_j */
  holdingsRemaining: number[];
  /** Trade volume executed in each step n_j = x_{j-1} - x_j */
  tradeSizes: number[];
  /** Optimal urgency decay parameter κ */
  kappa: number;
  /** Expected total transaction cost E[x] in currency */
  expectedCost: number;
  /** Variance of total transaction cost V[x] in currency² */
  varianceOfCost: number;
  /** Value at Risk / Utility: E[x] + λ * V[x] */
  utilityPenalty: number;
  /** Half-life of liquidation in intervals (t_half = ln(2)/κ) */
  halfLifePeriods: number;
}

/**
 * Computes the optimal Almgren-Chriss execution schedule.
 */
export function calculateAlmgrenChriss(params: AlmgrenChrissParams): AlmgrenChrissTrajectory {
  const {
    totalShares,
    horizonPeriods,
    intervals,
    dailyVolatility,
    initialPrice,
    permanentImpactGamma,
    temporaryImpactEta,
    riskAversionLambda = 1e-5,
  } = params;

  const N = Math.max(2, intervals);
  const tau = horizonPeriods / N; // length of each interval
  const X0 = Math.abs(totalShares);
  const sigma = Math.max(1e-6, dailyVolatility);
  const gamma = Math.max(1e-12, permanentImpactGamma);
  const eta = Math.max(1e-12, temporaryImpactEta);
  const lambda = Math.max(0, riskAversionLambda);

  // Compute tilde_eta = eta * (1 - 0.5 * gamma * tau / eta)
  const tildeEta = Math.max(1e-12, eta * (1 - 0.5 * (gamma * tau) / eta));

  // Compute urgency parameter κ
  // (1/2) * (λ * σ² / tilde_eta) * tau²
  const halfLambdaSigma2Tau2 = 0.5 * (lambda * sigma * sigma * tau * tau) / tildeEta;
  const argAcosh = 1 + halfLambdaSigma2Tau2;
  // κ * tau = arcosh(1 + 0.5 * (λ * σ² / tilde_eta) * tau²)
  // arcosh(y) = ln(y + sqrt(y² - 1))
  const kappaTau = Math.log(argAcosh + Math.sqrt(Math.max(0, argAcosh * argAcosh - 1)));
  const kappa = kappaTau / tau;

  const timeSteps: number[] = [];
  const holdingsRemaining: number[] = [];
  const tradeSizes: number[] = [];

  const sinhKT = Math.sinh(kappa * horizonPeriods);

  for (let j = 0; j <= N; j++) {
    const tj = j * tau;
    timeSteps.push(tj);

    let xj: number;
    if (Math.abs(kappaTau) < 1e-6 || Math.abs(sinhKT) < 1e-12) {
      // Linear execution (TWAP limit as λ -> 0)
      xj = X0 * (1 - j / N);
    } else {
      // Exponential execution
      const sinhRemaining = Math.sinh(kappa * (horizonPeriods - tj));
      xj = X0 * (sinhRemaining / sinhKT);
    }
    holdingsRemaining.push(xj);
  }

  // Calculate trade sizes n_j = x_{j-1} - x_j
  for (let j = 1; j <= N; j++) {
    tradeSizes.push(holdingsRemaining[j - 1] - holdingsRemaining[j]);
  }

  // Expected Cost E[x] = 0.5 * γ * X0² + tilde_eta * Σ n_j² / tau
  let sumNj2 = 0;
  for (const nj of tradeSizes) {
    sumNj2 += nj * nj;
  }
  const permanentCost = 0.5 * gamma * X0 * X0;
  const temporaryCost = (tildeEta / tau) * sumNj2;
  const expectedCost = permanentCost + temporaryCost;

  // Variance of Cost V[x] = σ² * Σ tau * x_j²
  let sumTauXj2 = 0;
  for (let j = 1; j <= N; j++) {
    const xMid = 0.5 * (holdingsRemaining[j - 1] + holdingsRemaining[j]);
    sumTauXj2 += tau * xMid * xMid;
  }
  const varianceOfCost = sigma * sigma * sumTauXj2;
  const utilityPenalty = expectedCost + lambda * varianceOfCost;
  const halfLifePeriods = kappa > 1e-6 ? Math.log(2) / kappa : horizonPeriods / 2;

  return {
    timeSteps,
    holdingsRemaining: holdingsRemaining.map(v => (totalShares < 0 ? -v : v)),
    tradeSizes: tradeSizes.map(v => (totalShares < 0 ? -v : v)),
    kappa,
    expectedCost,
    varianceOfCost,
    utilityPenalty,
    halfLifePeriods,
  };
}

/**
 * Kyle's Lambda Market Depth Estimator (Kyle 1985)
 * Returns the price impact per unit of signed order flow.
 *
 * @param priceChanges Array of price differences ΔP_t = P_t - P_{t-1}
 * @param signedVolumes Array of signed volume flows Q_t = Sign_t * Vol_t
 */
export function calculateKylesLambda(priceChanges: number[], signedVolumes: number[]): {
  lambda: number;
  rSquared: number;
  marketDepthUnits: number;
} | null {
  const T = Math.min(priceChanges.length, signedVolumes.length);
  if (T < 10) return null;

  let meanP = 0;
  let meanQ = 0;
  for (let t = 0; t < T; t++) {
    meanP += priceChanges[t];
    meanQ += signedVolumes[t];
  }
  meanP /= T;
  meanQ /= T;

  let covPQ = 0;
  let varQ = 0;
  let varP = 0;

  for (let t = 0; t < T; t++) {
    const dp = priceChanges[t] - meanP;
    const dq = signedVolumes[t] - meanQ;
    covPQ += dp * dq;
    varQ += dq * dq;
    varP += dp * dp;
  }

  if (varQ < 1e-18) return null;

  const lambda = Math.max(0, covPQ / varQ);
  const rSquared = (varP > 1e-18 && varQ > 1e-18) ? Math.min(1, Math.max(0, (covPQ * covPQ) / (varP * varQ))) : 0;
  const marketDepthUnits = lambda > 1e-18 ? 1 / lambda : Infinity;

  return { lambda, rSquared, marketDepthUnits };
}

/**
 * Roll's Effective Bid-Ask Spread Estimator (Roll 1984)
 * Measures effective spread from the serial autocovariance of price changes.
 *
 * @param priceChanges Array of consecutive price changes ΔP_t = P_t - P_{t-1}
 */
export function calculateRollEffectiveSpread(priceChanges: number[]): {
  effectiveSpread: number;
  autocovariance: number;
  isValidCovariance: boolean;
} {
  const T = priceChanges.length;
  if (T < 10) {
    return { effectiveSpread: 0, autocovariance: 0, isValidCovariance: false };
  }

  let meanP = 0;
  for (let t = 0; t < T; t++) meanP += priceChanges[t];
  meanP /= T;

  let autoCov = 0;
  for (let t = 1; t < T; t++) {
    autoCov += (priceChanges[t] - meanP) * (priceChanges[t - 1] - meanP);
  }
  autoCov /= (T - 1);

  if (autoCov < 0) {
    // Roll formula: S = 2 * sqrt(-Cov(ΔP_t, ΔP_{t-1}))
    const effectiveSpread = 2 * Math.sqrt(-autoCov);
    return { effectiveSpread, autocovariance: autoCov, isValidCovariance: true };
  } else {
    // When covariance is positive (trending/momentum market), spread estimate is 0
    return { effectiveSpread: 0, autocovariance: autoCov, isValidCovariance: false };
  }
}

/**
 * Amihud Illiquidity Ratio (Amihud 2002)
 * Measures daily price response per dollar of volume.
 *
 * @param dailyReturns Array of daily percentage returns |r_t|
 * @param dollarVolumes Array of daily turnover (Price_t * Volume_t)
 */
export function calculateAmihudIlliquidity(dailyReturns: number[], dollarVolumes: number[]): {
  amihudRatio: number;
  illiquidityScore: number; // Log-scaled institutional percentile [0, 100]
} | null {
  const T = Math.min(dailyReturns.length, dollarVolumes.length);
  if (T < 5) return null;

  let sumRatio = 0;
  let validDays = 0;

  for (let t = 0; t < T; t++) {
    const dVol = dollarVolumes[t];
    if (dVol > 1000) {
      sumRatio += (Math.abs(dailyReturns[t]) * 1e6) / dVol; // scaled per $1M volume
      validDays++;
    }
  }

  if (validDays === 0) return null;

  const amihudRatio = sumRatio / validDays;
  // Transform to normalized score: higher score = more illiquid / severe slippage risk
  const illiquidityScore = Math.max(0, Math.min(100, (Math.log10(Math.max(amihudRatio, 1e-4)) + 4) * 20));

  return { amihudRatio, illiquidityScore };
}
