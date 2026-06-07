// Real-Math Edge module — institutional quant primitives ported from
// `src/lib/quant/institutional.ts` for use inside edge functions.
// All functions are pure, deterministic, dependency-free.
//
// Levers implemented (all four approved):
//   L1  Engle–Granger cointegration  → mean-reversion gate vs. benchmark
//   L2  Cornish-Fisher VaR / R       → fat-tail-aware expected return
//   L3  Merton-proxy distance-to-default → structural credit veto
//   L4  Walk-forward forward-return  → veto signals with no historical edge

// ── §0 normal helpers ──────────────────────────────────────────────────────
export function normInv(p: number): number {
  if (p <= 0) return -Infinity;
  if (p >= 1) return Infinity;
  const a = [-39.696830, 220.946098, -275.928510, 138.357751, -30.664798, 2.506628];
  const b = [-54.476098, 161.585836, -155.698979, 66.801311, -13.280681];
  const c = [-0.007784894, -0.322396458, -2.400758277, -2.549732539, 4.374664141, 2.938163983];
  const d = [0.007784695, 0.322467565, 2.445134137, 3.754408661];
  const plow = 0.02425, phigh = 1 - plow;
  if (p < plow) {
    const q = Math.sqrt(-2 * Math.log(p));
    return (((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5])/((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1);
  }
  if (p <= phigh) {
    const q = p - 0.5, r = q * q;
    return (((((a[0]*r+a[1])*r+a[2])*r+a[3])*r+a[4])*r+a[5])*q/(((((b[0]*r+b[1])*r+b[2])*r+b[3])*r+b[4])*r+1);
  }
  const q = Math.sqrt(-2 * Math.log(1 - p));
  return -(((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5])/((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1);
}

function mean(xs: number[]): number {
  if (xs.length === 0) return 0;
  let s = 0; for (const x of xs) s += x; return s / xs.length;
}
function variance(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs); let s = 0;
  for (const x of xs) s += (x - m) ** 2;
  return s / (xs.length - 1);
}

/** Sample skewness and excess kurtosis (Pearson). */
export function skewKurt(returns: number[]): { skew: number; excessKurt: number } {
  const n = returns.length;
  if (n < 4) return { skew: 0, excessKurt: 0 };
  const m = mean(returns);
  let m2 = 0, m3 = 0, m4 = 0;
  for (const x of returns) {
    const d = x - m;
    m2 += d * d; m3 += d * d * d; m4 += d * d * d * d;
  }
  m2 /= n; m3 /= n; m4 /= n;
  if (m2 <= 0) return { skew: 0, excessKurt: 0 };
  const skew = m3 / Math.pow(m2, 1.5);
  const excessKurt = m4 / (m2 * m2) - 3;
  return { skew: Math.max(-3, Math.min(3, skew)), excessKurt: Math.max(-3, Math.min(10, excessKurt)) };
}

/** Cornish-Fisher adjusted z for a given confidence (returns negative z). */
export function cornishFisherZ(conf: number, skew: number, excessKurt: number): number {
  const z = normInv(1 - conf);
  const S = skew, K = excessKurt;
  return z + ((z*z - 1) / 6) * S + ((z*z*z - 3*z) / 24) * K - ((2*z*z*z - 5*z) / 36) * S * S;
}

/**
 * Fat-tail aware expected R-multiple.
 * Replaces symmetric `p·rUp − (1−p)·rDown − cost` with CF-adjusted left tail:
 *   rDownAdj = rDown × (zCF / zNormal)        (heavier tail ⇒ rDownAdj > rDown)
 * Negatively skewed names (small caps with crash risk) take a proper hit.
 */
export function cfExpectedR(opts: {
  p: number;
  rUp: number;
  rDown: number;
  skew: number;
  excessKurt: number;
  haircutInR?: number;
  conf?: number;
}): { expectedR: number; rDownAdj: number; tailMultiplier: number } {
  const { p, rUp, rDown, skew, excessKurt, haircutInR = 0, conf = 0.95 } = opts;
  const zN = normInv(1 - conf); // ≈ -1.645
  const zCF = cornishFisherZ(conf, skew, excessKurt);
  // Tail multiplier ≥ 1 means worse-than-normal left tail.
  const tailMultiplier = zN < 0 ? Math.max(0.6, Math.min(2.5, zCF / zN)) : 1;
  const rDownAdj = rDown * tailMultiplier;
  const expectedR = p * rUp - (1 - p) * rDownAdj - haircutInR;
  return { expectedR, rDownAdj, tailMultiplier };
}

// ── §1 Cointegration — Engle-Granger lite ──────────────────────────────────

/** ADF-style stationarity test (no lags), MacKinnon critical values. */
function adfNoLag(residuals: number[]): { tStat: number; stationary: boolean } {
  const n = residuals.length;
  if (n < 25) return { tStat: 0, stationary: false };
  // OLS Δy_t = ρ y_{t-1} + ε
  let sxx = 0, sxy = 0, sx = 0, sy = 0;
  const dy: number[] = [];
  for (let i = 1; i < n; i++) {
    const x = residuals[i - 1];
    const d = residuals[i] - residuals[i - 1];
    dy.push(d);
    sx += x; sy += d; sxx += x * x; sxy += x * d;
  }
  const N = dy.length;
  const mx = sx / N, my = sy / N;
  const cov = sxy / N - mx * my;
  const varX = sxx / N - mx * mx;
  if (varX <= 0) return { tStat: 0, stationary: false };
  const beta = cov / varX;
  let sse = 0;
  for (let i = 0; i < N; i++) {
    const yhat = beta * residuals[i] + (my - beta * mx);
    sse += (dy[i] - yhat) ** 2;
  }
  const sigma2 = sse / Math.max(1, N - 2);
  const seBeta = Math.sqrt(Math.max(sigma2 / (N * varX), 1e-18));
  const t = beta / seBeta;
  // 5% MacKinnon (no constant) ≈ -1.95; we use a stricter -2.5 to reduce false positives
  return { tStat: t, stationary: t < -2.5 };
}

/**
 * Engle-Granger cointegration of asset `y` vs benchmark `x` (log-prices).
 * Returns the current residual z-score (how far the spread has wandered)
 * and whether it's mean-reverting.
 */
export function engleGrangerLite(yPrices: number[], xPrices: number[]): {
  cointegrated: boolean;
  residZ: number;
  halfLife: number;
  beta: number;
  tStat: number;
} {
  const n = Math.min(yPrices.length, xPrices.length);
  if (n < 40) return { cointegrated: false, residZ: 0, halfLife: Infinity, beta: 0, tStat: 0 };
  const y = yPrices.slice(-n).map(Math.log);
  const x = xPrices.slice(-n).map(Math.log);
  const my = mean(y), mx = mean(x);
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) { num += (x[i] - mx) * (y[i] - my); den += (x[i] - mx) ** 2; }
  const beta = den > 0 ? num / den : 0;
  const alpha = my - beta * mx;
  const resid = y.map((v, i) => v - alpha - beta * x[i]);
  const adf = adfNoLag(resid);
  const rMean = mean(resid);
  const rStd = Math.sqrt(variance(resid));
  const residZ = rStd > 0 ? (resid[resid.length - 1] - rMean) / rStd : 0;
  // OU half-life
  let nNum = 0, nDen = 0;
  for (let i = 1; i < resid.length; i++) {
    nNum += resid[i - 1] * (resid[i] - resid[i - 1]);
    nDen += resid[i - 1] ** 2;
  }
  const kappa = nDen > 0 ? nNum / nDen : 0;
  const halfLife = kappa < 0 ? -Math.log(2) / kappa : Infinity;
  return { cointegrated: adf.stationary, residZ, halfLife, beta, tStat: adf.tStat };
}

// ── §3 Merton-proxy distance-to-default ────────────────────────────────────

/**
 * Without debt data we can't compute true Merton. Proxy:
 *   DD ≈ (peakDist - currentDD) / sigmaAnnual
 * where peakDist = 1 (price at 52w high), currentDD = drawdown from peak.
 * Negative DD ⇒ price has fallen far in vol units ⇒ stress.
 */
export function mertonProxy(opts: {
  sigmaAnnual: number; // decimal, e.g. 0.45
  drawdownPct: number; // decimal from peak, e.g. 0.20 for −20%
  trendSlope?: number; // optional; positive = uptrend
}): { dd: number; pd: number; signal: -1 | 0 | 1; severity: "OK" | "STRESS" | "DISTRESS" } {
  const { sigmaAnnual, drawdownPct, trendSlope = 0 } = opts;
  if (!Number.isFinite(sigmaAnnual) || sigmaAnnual <= 0) {
    return { dd: 0, pd: 0.5, signal: 0, severity: "OK" };
  }
  // Convert annual sigma to drawdown-equivalent units.
  const ddVolUnits = drawdownPct / sigmaAnnual;
  // Higher dd-in-vol-units ⇒ more stressed ⇒ structural SELL bias.
  const distance = 2.0 - ddVolUnits; // ~2σ buffer is "healthy"
  const pd = 1 - 1 / (1 + Math.exp(-distance));
  let signal: -1 | 0 | 1 = 0;
  let severity: "OK" | "STRESS" | "DISTRESS" = "OK";
  if (distance < 0.3 && trendSlope <= 0) { signal = -1; severity = "DISTRESS"; }
  else if (distance < 0.8) { severity = "STRESS"; }
  else if (distance > 1.6 && trendSlope > 0) { signal = 1; }
  return { dd: Number(distance.toFixed(2)), pd: Number(pd.toFixed(3)), signal, severity };
}

// ── §4 Walk-forward forward-return edge ────────────────────────────────────

/**
 * Backward-looking, walk-forward evaluation of holding the asset for
 * `horizon` days. Returns hit-rate, mean forward return, and a t-style
 * Sharpe of forward returns. Used to veto signals where the asset has
 * shown no historical edge in this direction.
 */
export function walkForwardEdge(closes: number[], horizon = 5): {
  hitRate: number;
  meanFwd: number;
  fwdSharpe: number;
  n: number;
} {
  if (closes.length < horizon + 20) return { hitRate: 0.5, meanFwd: 0, fwdSharpe: 0, n: 0 };
  const fwds: number[] = [];
  for (let i = 0; i + horizon < closes.length; i++) {
    const a = closes[i], b = closes[i + horizon];
    if (a > 0 && b > 0) fwds.push((b - a) / a);
  }
  if (fwds.length < 20) return { hitRate: 0.5, meanFwd: 0, fwdSharpe: 0, n: fwds.length };
  const wins = fwds.filter((r) => r > 0).length;
  const hitRate = wins / fwds.length;
  const m = mean(fwds);
  const s = Math.sqrt(variance(fwds));
  const fwdSharpe = s > 0 ? (m / s) * Math.sqrt(252 / horizon) : 0;
  return { hitRate, meanFwd: m, fwdSharpe, n: fwds.length };
}

/** Convert daily returns to {skew, excessKurt}. */
export function returnMoments(closes: number[]): { skew: number; excessKurt: number; sigmaAnnual: number; n: number } {
  const rets: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    if (closes[i - 1] > 0 && closes[i] > 0) rets.push(Math.log(closes[i] / closes[i - 1]));
  }
  const { skew, excessKurt } = skewKurt(rets);
  const sigmaDaily = Math.sqrt(variance(rets));
  return { skew, excessKurt, sigmaAnnual: sigmaDaily * Math.sqrt(252), n: rets.length };
}