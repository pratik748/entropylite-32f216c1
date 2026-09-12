/**
 * Dynamic State-Space Kalman Filter & Exact Continuous-Time OU Engine
 * ──────────────────────────────────────────────────────────────────────────
 * Institutional-grade statistical arbitrage and dynamic hedge ratio tracking:
 *
 * 1. 2D State-Space Dynamic Kalman Filter (Hedge Ratio & Intercept):
 *    - State equation:       θ_t = θ_{t-1} + w_t,      w_t ~ N(0, Q)
 *    - Observation equation: y_t = H_t θ_t + v_t,      v_t ~ N(0, R)
 *      where H_t = [1, x_t] and θ_t = [alpha_t, beta_t]ᵀ
 *    - Online dynamic tracking of spread hedge ratio β_t and spread intercept α_t
 *      with innovation error e_t and prediction error variance F_t.
 *
 * 2. Exact Continuous-Time Ornstein-Uhlenbeck MLE (Maximum Likelihood Estimation):
 *    - Continuous SDE: dX_t = θ (μ - X_t) dt + σ dW_t
 *    - Exact transition density:
 *      X_t | X_{t-1} ~ N( μ + (X_{t-1} - μ) e^{-θ Δt}, (σ² / 2θ) * (1 - e^{-2θ Δt}) )
 *    - Closed-form exact MLE for (θ, μ, σ) without Euler discretization bias.
 *    - Half-life: τ = ln(2) / θ with Fisher Information asymptotic confidence intervals.
 *
 * Pure, deterministic, zero-download, runs instantaneously in browser/WASM.
 */

export interface KalmanPairState {
  /** Dynamic intercept α_t */
  alpha: number[];
  /** Dynamic hedge ratio β_t */
  beta: number[];
  /** Dynamic spread series: s_t = y_t - (alpha_t + beta_t * x_t) */
  spread: number[];
  /** Standardized innovation z-score: e_t / sqrt(F_t) */
  zScore: number[];
  /** Innovation variance F_t */
  variance: number[];
  /** Final state vector [alpha, beta] */
  finalAlpha: number;
  finalBeta: number;
  /** Final spread z-score */
  finalZScore: number;
}

/**
 * Runs a 2D online Kalman Filter to track the dynamic cointegrating hedge ratio
 * between target asset Y and reference asset X.
 *
 * @param y Asset Y price series (dependent)
 * @param x Asset X price series (independent)
 * @param delta Process noise parameter Q = delta / (1 - delta) * I (default 1e-4)
 * @param measurementNoise Variance of observation error R (default 1e-3)
 */
export function dynamicKalmanHedgeRatio(
  y: number[],
  x: number[],
  delta = 1e-4,
  measurementNoise = 1e-3
): KalmanPairState | null {
  const T = Math.min(y.length, x.length);
  if (T < 10) return null;

  // Process noise covariance matrix Q (2x2)
  const qVal = delta / (1 - delta);
  const Q = [
    [qVal, 0],
    [0, qVal],
  ];
  const R = Math.max(1e-6, measurementNoise);

  // Initial state θ_0 = [0, y[0]/x[0]]
  let theta = [0, x[0] !== 0 ? y[0] / x[0] : 1];
  // Initial state covariance P_0 = I
  let P = [
    [1, 0],
    [0, 1],
  ];

  const alphaArr: number[] = [];
  const betaArr: number[] = [];
  const spreadArr: number[] = [];
  const zScoreArr: number[] = [];
  const varianceArr: number[] = [];

  for (let t = 0; t < T; t++) {
    const yt = y[t];
    const xt = x[t];

    // 1. Predict state: θ_{t|t-1} = θ_{t-1}
    //    Predict covariance: P_{t|t-1} = P_{t-1} + Q
    const P_pred = [
      [P[0][0] + Q[0][0], P[0][1] + Q[0][1]],
      [P[1][0] + Q[1][0], P[1][1] + Q[1][1]],
    ];

    // 2. Observation matrix H_t = [1, x_t]
    //    Predicted observation: y_pred = H_t * θ_{t|t-1} = alpha + beta * x_t
    const y_pred = theta[0] + theta[1] * xt;
    const error = yt - y_pred;

    // 3. Innovation variance: F_t = H_t * P_{t|t-1} * H_tᵀ + R
    //    = P00 + 2 * xt * P01 + xt² * P11 + R
    const Ft = P_pred[0][0] + 2 * xt * P_pred[0][1] + xt * xt * P_pred[1][1] + R;
    const invFt = 1 / Math.max(Ft, 1e-12);

    // 4. Kalman gain K_t = P_{t|t-1} * H_tᵀ / F_t (2x1 vector)
    const K = [
      (P_pred[0][0] + xt * P_pred[0][1]) * invFt,
      (P_pred[1][0] + xt * P_pred[1][1]) * invFt,
    ];

    // 5. Update state: θ_t = θ_{t|t-1} + K_t * error
    theta = [
      theta[0] + K[0] * error,
      theta[1] + K[1] * error,
    ];

    // 6. Update covariance: P_t = (I - K_t * H_t) * P_{t|t-1}
    const I_KH = [
      [1 - K[0], -K[0] * xt],
      [-K[1], 1 - K[1] * xt],
    ];

    P = [
      [I_KH[0][0] * P_pred[0][0] + I_KH[0][1] * P_pred[1][0], I_KH[0][0] * P_pred[0][1] + I_KH[0][1] * P_pred[1][1]],
      [I_KH[1][0] * P_pred[0][0] + I_KH[1][1] * P_pred[1][0], I_KH[1][0] * P_pred[0][1] + I_KH[1][1] * P_pred[1][1]],
    ];

    // Symmetrize P to ensure numerical stability
    const symmP01 = 0.5 * (P[0][1] + P[1][0]);
    P[0][1] = symmP01;
    P[1][0] = symmP01;

    const stdError = Math.sqrt(Math.max(Ft, 1e-12));
    const z = error / stdError;

    alphaArr.push(theta[0]);
    betaArr.push(theta[1]);
    spreadArr.push(error);
    zScoreArr.push(z);
    varianceArr.push(Ft);
  }

  return {
    alpha: alphaArr,
    beta: betaArr,
    spread: spreadArr,
    zScore: zScoreArr,
    variance: varianceArr,
    finalAlpha: theta[0],
    finalBeta: theta[1],
    finalZScore: zScoreArr[zScoreArr.length - 1],
  };
}

export interface ExactOUMLE {
  /** Mean-reversion speed θ (annualized rate if dt=1/252) */
  theta: number;
  /** Long-term equilibrium mean μ */
  mu: number;
  /** Continuous diffusion volatility σ */
  sigma: number;
  /** Exact half-life of mean-reversion in periods: τ = ln(2) / θ */
  halfLife: number;
  /** Asymptotic 95% Confidence Interval for half-life [lower, upper] */
  halfLifeCI95: [number, number];
  /** Stationary standard deviation of the spread: σ_eq = σ / sqrt(2θ) */
  equilibriumStd: number;
  /** Maximum log-likelihood */
  logLikelihood: number;
  /** Whether the process is strictly stationary (θ > 0) */
  isStationary: boolean;
}

/**
 * Exact Maximum Likelihood Estimation of Ornstein-Uhlenbeck parameters.
 * Eliminates discretization bias present in standard OLS regressions.
 *
 * @param series Time series of spread or price observations X_t
 * @param dt Observation interval (default 1/252 for daily data)
 */
export function exactOUMLE(series: number[], dt = 1 / 252): ExactOUMLE | null {
  const N = series.length;
  if (N < 20) return null;

  const X = series;
  let Sx = 0;
  let Sy = 0;
  let Sxx = 0;
  let Syy = 0;
  let Sxy = 0;

  const n = N - 1;

  for (let i = 0; i < n; i++) {
    const x = X[i];
    const y = X[i + 1];
    Sx += x;
    Sy += y;
    Sxx += x * x;
    Syy += y * y;
    Sxy += x * y;
  }

  // Exact MLE formulas:
  // a = e^{-θ dt}
  const denomA = n * Sxx - Sx * Sx;
  if (Math.abs(denomA) < 1e-15) return null;

  const a = (n * Sxy - Sx * Sy) / denomA;

  // Stationarity check: |a| < 1 implies θ > 0
  if (a <= 0 || a >= 0.999999) {
    // Non-stationary / unit-root limit
    const fallbackMu = Sx / n;
    return {
      theta: 0.001,
      mu: fallbackMu,
      sigma: 0.01,
      halfLife: Infinity,
      halfLifeCI95: [Infinity, Infinity],
      equilibriumStd: Infinity,
      logLikelihood: -Infinity,
      isStationary: false,
    };
  }

  const theta = -Math.log(a) / dt;
  const mu = (Sy - a * Sx) / (n * (1 - a));

  // Variance of residuals: σ_e² = (1/n) Σ [y - a*x - μ(1-a)]²
  let sumSqRes = 0;
  for (let i = 0; i < n; i++) {
    const res = X[i + 1] - a * X[i] - mu * (1 - a);
    sumSqRes += res * res;
  }
  const sigmaE2 = sumSqRes / n;

  // Continuous diffusion σ: σ² = σ_e² * 2θ / (1 - a²)
  const sigma2 = (sigmaE2 * 2 * theta) / Math.max(1e-12, 1 - a * a);
  const sigma = Math.sqrt(Math.max(1e-12, sigma2));
  const equilibriumStd = Math.sqrt(Math.max(1e-12, sigma2 / (2 * theta)));

  // Half-life τ = ln(2) / θ
  const halfLife = Math.log(2) / theta;

  // Asymptotic standard error of θ via Fisher Information:
  // Var(a) ≈ (1 - a²) / n
  // By Delta Method: Var(θ) = Var(-ln(a)/dt) = (1 / (a * dt))² * Var(a)
  const varA = Math.max(1e-12, (1 - a * a) / n);
  const seTheta = (1 / (a * dt)) * Math.sqrt(varA);

  const thetaLower = Math.max(1e-4, theta - 1.96 * seTheta);
  const thetaUpper = theta + 1.96 * seTheta;

  const halfLifeCI95: [number, number] = [
    Math.log(2) / thetaUpper,
    Math.log(2) / thetaLower,
  ];

  // Exact Gaussian Log-Likelihood
  const logLikelihood =
    -0.5 * n * Math.log(2 * Math.PI) -
    n * Math.log(Math.sqrt(sigmaE2)) -
    (0.5 / sigmaE2) * sumSqRes;

  return {
    theta,
    mu,
    sigma,
    halfLife,
    halfLifeCI95,
    equilibriumStd,
    logLikelihood,
    isStationary: true,
  };
}
