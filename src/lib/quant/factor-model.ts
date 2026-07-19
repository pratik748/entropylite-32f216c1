/**
 * Multi-factor time-series risk model — the regression layer under the
 * Desk's book mode (the BlackRock/Aladdin-style decomposition, reduced to
 * what a browser can honestly compute).
 * ─────────────────────────────────────────────────────────────────────────
 * Method, fully disclosed:
 *  - Factors are ETF/index PROXIES (named in the UI), daily log returns,
 *    tail-aligned to the common overlap — same convention as the
 *    covariance engine in quant-engine.ts.
 *  - Per asset: OLS of the asset's daily returns on the factor returns
 *    with a small ridge term for numerical stability (λ scaled to the
 *    design matrix; the intercept is not penalized).
 *  - Portfolio factor exposure e_j = Σᵢ wᵢ βᵢⱼ.
 *  - Systematic variance = eᵀ Σ_f e with Σ_f the sample covariance of the
 *    factor returns. Idiosyncratic variance = Σᵢ wᵢ² σ²(εᵢ) — residuals
 *    are assumed cross-sectionally uncorrelated, an approximation that is
 *    stated, not hidden.
 *  - Factor risk contributions are the Euler decomposition of systematic
 *    variance and sum to 1 by construction.
 *  - Scenarios are single-factor partial shocks (−2σ over ~1 month with
 *    other factors held fixed) — first-order, disclosed as such.
 * Every output carries n (observations) and R² so a reader can judge fit.
 */

import { invertMatrix } from "@/lib/portfolio-math";

export interface FactorDef {
  id: string;
  label: string;
  /** The real, fetchable proxy series behind the factor. */
  ticker: string;
  kind: "market" | "rates" | "credit" | "fx" | "commodity";
}

export const CORE_FACTORS: FactorDef[] = [
  { id: "mkt_us", label: "US Equity · S&P 500", ticker: "^GSPC", kind: "market" },
  { id: "rates", label: "Long Rates · TLT", ticker: "TLT", kind: "rates" },
  { id: "credit", label: "Credit · HYG", ticker: "HYG", kind: "credit" },
  { id: "usd", label: "US Dollar · UUP", ticker: "UUP", kind: "fx" },
  { id: "gold", label: "Gold · GLD", ticker: "GLD", kind: "commodity" },
  { id: "oil", label: "Oil · USO", ticker: "USO", kind: "commodity" },
];

export const INDIA_FACTOR: FactorDef = {
  id: "mkt_in", label: "India Equity · NIFTY 50", ticker: "^NSEI", kind: "market",
};

/** Factor set for the book: core global factors, plus NIFTY when INR assets exist. */
export function selectFactors(hasInrExposure: boolean): FactorDef[] {
  return hasInrExposure ? [CORE_FACTORS[0], INDIA_FACTOR, ...CORE_FACTORS.slice(1)] : [...CORE_FACTORS];
}

const TRADING_DAYS = 252;

export interface OlsFit {
  alpha: number;
  betas: number[];
  /** t-statistics of the factor betas (ridge-approximate SEs, λ ≈ 1e-4). */
  tStats: number[];
  r2: number;
  /** Daily residual volatility. */
  residVolDaily: number;
  n: number;
}

/**
 * Ridge-stabilized OLS. `X` rows are observations, columns are factors
 * (intercept added internally, unpenalized). Returns null on degenerate
 * input — never a fabricated fit.
 */
export function ridgeOls(y: number[], X: number[][], lambda = 1e-4): OlsFit | null {
  const n = y.length;
  if (n < 10 || X.length !== n) return null;
  const k = X[0]?.length ?? 0;
  if (k === 0 || X.some((r) => r.length !== k)) return null;

  // Design with intercept
  const Xi = X.map((r) => [1, ...r]);
  const p = k + 1;

  // XᵀX and Xᵀy
  const xtx: number[][] = Array.from({ length: p }, () => new Array(p).fill(0));
  const xty: number[] = new Array(p).fill(0);
  for (let t = 0; t < n; t++) {
    for (let i = 0; i < p; i++) {
      xty[i] += Xi[t][i] * y[t];
      for (let j = i; j < p; j++) xtx[i][j] += Xi[t][i] * Xi[t][j];
    }
  }
  for (let i = 0; i < p; i++) for (let j = 0; j < i; j++) xtx[i][j] = xtx[j][i];

  // Ridge scaled to the average diagonal of the factor block; intercept unpenalized.
  const diagMean = k > 0 ? xtx.slice(1).reduce((s, r, i) => s + r[i + 1], 0) / k : 0;
  const ridge = lambda * (diagMean > 0 ? diagMean : 1);
  for (let i = 1; i < p; i++) xtx[i][i] += ridge;

  const inv = invertMatrix(xtx);
  if (!inv) return null;
  const beta = inv.map((row) => row.reduce((s, v, j) => s + v * xty[j], 0));

  // Fit statistics
  const yMean = y.reduce((s, v) => s + v, 0) / n;
  let ssr = 0, sst = 0;
  for (let t = 0; t < n; t++) {
    const yHat = Xi[t].reduce((s, v, j) => s + v * beta[j], 0);
    ssr += (y[t] - yHat) ** 2;
    sst += (y[t] - yMean) ** 2;
  }
  const r2 = sst > 0 ? Math.max(0, 1 - ssr / sst) : 0;
  const dof = Math.max(1, n - p);
  const residVolDaily = Math.sqrt(ssr / dof);

  // t-stats via SE_j = √(σ²_ε · [(XᵀX+λR)⁻¹]_jj) — with the tiny λ used
  // here this is the classical OLS SE to numerical precision.
  const sigma2 = ssr / dof;
  const tStats: number[] = [];
  for (let j = 1; j < p; j++) {
    const se = Math.sqrt(Math.max(0, sigma2 * inv[j][j]));
    tStats.push(se > 0 ? beta[j] / se : 0);
  }

  return { alpha: beta[0], betas: beta.slice(1), tStats, r2, residVolDaily, n };
}

/** Sample covariance matrix of tail-aligned return series (columns of `series`). */
export function sampleCovariance(series: number[][]): number[][] {
  const k = series.length;
  const n = Math.min(...series.map((s) => s.length));
  const aligned = series.map((s) => s.slice(-n));
  const means = aligned.map((s) => s.reduce((a, v) => a + v, 0) / n);
  const cov: number[][] = Array.from({ length: k }, () => new Array(k).fill(0));
  for (let i = 0; i < k; i++) {
    for (let j = i; j < k; j++) {
      let acc = 0;
      for (let t = 0; t < n; t++) acc += (aligned[i][t] - means[i]) * (aligned[j][t] - means[j]);
      cov[i][j] = cov[j][i] = acc / Math.max(1, n - 1);
    }
  }
  return cov;
}

export interface AssetFactorFit {
  ticker: string;
  weight: number;
  betas: Record<string, number>;
  /** t-statistic per factor beta. */
  tStats: Record<string, number>;
  r2: number;
  idioVolAnnual: number;
  n: number;
}

export interface FactorScenario {
  factorId: string;
  label: string;
  /** The shock applied to the factor, in % (e.g. -8.2 = factor falls 8.2%). */
  shockPct: number;
  /** First-order portfolio impact in %, = exposure × shock. */
  impactPct: number;
}

export interface FactorModelResult {
  factors: FactorDef[];
  perAsset: AssetFactorFit[];
  /** Share of supplied weight that was successfully fit. */
  coveredWeight: number;
  portfolio: {
    /** e_j = Σ wᵢβᵢⱼ. */
    exposures: Record<string, number>;
    sysVolAnnual: number;
    idioVolAnnual: number;
    totalVolAnnual: number;
    /** Systematic share of total model variance (0..1). */
    systematicShare: number;
    /** Euler shares of systematic variance by factor; sums to 1. */
    contributions: Record<string, number>;
    /** Weight-averaged regression R². */
    avgR2: number;
    /** Share of fitted weight whose market-factor beta has |t| ≥ 2. */
    marketBetaSignificantShare: number;
    n: number;
  } | null;
  factorStats: Record<string, { sigmaAnnual: number; n: number }>;
  scenarios: FactorScenario[];
}

/**
 * Fit the factor model for a book. Assets whose return series overlap the
 * factor series for fewer than `minObs` days are skipped (and excluded from
 * coveredWeight) — thin fits are worse than no fits.
 */
export function computeFactorModel(opts: {
  assetReturns: Record<string, number[]>;
  /** Capital weights of the assets (need not sum to 1; renormalized over fits). */
  weights: Record<string, number>;
  factorReturns: Record<string, number[]>;
  factors: FactorDef[];
  minObs?: number;
}): FactorModelResult | null {
  const { assetReturns, weights, factorReturns, factors, minObs = 60 } = opts;

  const usableFactors = factors.filter(
    (f) => (factorReturns[f.id]?.length ?? 0) >= minObs,
  );
  if (usableFactors.length < 2) return null;

  const factorSeries = usableFactors.map((f) => factorReturns[f.id]);
  const fN = Math.min(...factorSeries.map((s) => s.length));
  const alignedFactors = factorSeries.map((s) => s.slice(-fN));

  // Factor covariance + per-factor stats
  const sigmaF = sampleCovariance(alignedFactors);
  const factorStats: FactorModelResult["factorStats"] = {};
  usableFactors.forEach((f, j) => {
    factorStats[f.id] = { sigmaAnnual: Math.sqrt(Math.max(0, sigmaF[j][j]) * TRADING_DAYS), n: fN };
  });

  // Per-asset regressions on the common overlap of asset × factors
  const perAsset: AssetFactorFit[] = [];
  for (const [ticker, rets] of Object.entries(assetReturns)) {
    const w = weights[ticker] ?? 0;
    if (w <= 0) continue;
    const n = Math.min(rets.length, fN);
    if (n < minObs) continue;
    const y = rets.slice(-n);
    const X: number[][] = Array.from({ length: n }, (_, t) =>
      alignedFactors.map((s) => s[s.length - n + t]),
    );
    const fit = ridgeOls(y, X);
    if (!fit) continue;
    const betas: Record<string, number> = {};
    const tStats: Record<string, number> = {};
    usableFactors.forEach((f, j) => { betas[f.id] = fit.betas[j]; tStats[f.id] = fit.tStats[j]; });
    perAsset.push({
      ticker,
      weight: w,
      betas,
      tStats,
      r2: fit.r2,
      idioVolAnnual: fit.residVolDaily * Math.sqrt(TRADING_DAYS),
      n: fit.n,
    });
  }

  const totalW = Object.values(weights).reduce((s, v) => s + Math.max(0, v), 0);
  const fitW = perAsset.reduce((s, a) => s + a.weight, 0);
  const coveredWeight = totalW > 0 ? fitW / totalW : 0;
  if (perAsset.length === 0 || fitW <= 0) {
    return { factors: usableFactors, perAsset: [], coveredWeight: 0, portfolio: null, factorStats, scenarios: [] };
  }

  // Renormalize weights over the fitted subset so the decomposition is
  // internally consistent; coveredWeight discloses what was left out.
  const wNorm = perAsset.map((a) => a.weight / fitW);

  // Portfolio exposures
  const e = usableFactors.map((f) =>
    perAsset.reduce((s, a, i) => s + wNorm[i] * a.betas[f.id], 0),
  );
  const exposures: Record<string, number> = {};
  usableFactors.forEach((f, j) => { exposures[f.id] = e[j]; });

  // Systematic vs idiosyncratic variance (daily)
  const sigmaFe = sigmaF.map((row) => row.reduce((s, v, j) => s + v * e[j], 0));
  const sysVarDaily = Math.max(0, e.reduce((s, v, j) => s + v * sigmaFe[j], 0));
  const idioVarDaily = perAsset.reduce(
    (s, a, i) => s + wNorm[i] ** 2 * (a.idioVolAnnual ** 2 / TRADING_DAYS),
    0,
  );
  const totalVarDaily = sysVarDaily + idioVarDaily;

  // Euler contributions to systematic variance
  const contributions: Record<string, number> = {};
  usableFactors.forEach((f, j) => {
    contributions[f.id] = sysVarDaily > 0 ? (e[j] * sigmaFe[j]) / sysVarDaily : 0;
  });

  const avgR2 = perAsset.reduce((s, a, i) => s + wNorm[i] * a.r2, 0);
  const marketId = usableFactors[0].id;
  const marketBetaSignificantShare = perAsset.reduce(
    (s, a, i) => s + (Math.abs(a.tStats[marketId] ?? 0) >= 2 ? wNorm[i] : 0), 0);
  const minN = Math.min(...perAsset.map((a) => a.n));

  // Single-factor partial shocks: −2σ over ~21 trading days.
  const scenarios: FactorScenario[] = usableFactors.map((f, j) => {
    const monthlySigmaPct = Math.sqrt(Math.max(0, sigmaF[j][j]) * 21) * 100;
    const shockPct = -2 * monthlySigmaPct;
    return {
      factorId: f.id,
      label: f.label,
      shockPct,
      impactPct: e[j] * shockPct,
    };
  }).sort((a, b) => a.impactPct - b.impactPct);

  return {
    factors: usableFactors,
    perAsset,
    coveredWeight,
    portfolio: {
      exposures,
      sysVolAnnual: Math.sqrt(sysVarDaily * TRADING_DAYS),
      idioVolAnnual: Math.sqrt(idioVarDaily * TRADING_DAYS),
      totalVolAnnual: Math.sqrt(totalVarDaily * TRADING_DAYS),
      systematicShare: totalVarDaily > 0 ? sysVarDaily / totalVarDaily : 0,
      contributions,
      avgR2,
      marketBetaSignificantShare,
      n: minN,
    },
    factorStats,
    scenarios,
  };
}

/**
 * Rolling single-factor beta (cov/var over a trailing window), tail-aligned.
 * Used for beta-stability monitoring: a 60d beta far from the full-sample
 * beta means the book's market sensitivity has shifted regime.
 */
export function rollingBetaSeries(assetRets: number[], factorRets: number[], window = 60): number[] {
  const n = Math.min(assetRets.length, factorRets.length);
  if (n < window + 5) return [];
  const a = assetRets.slice(-n);
  const f = factorRets.slice(-n);
  const out: number[] = [];
  for (let end = window; end <= n; end++) {
    let ma = 0, mf = 0;
    for (let t = end - window; t < end; t++) { ma += a[t]; mf += f[t]; }
    ma /= window; mf /= window;
    let cov = 0, varF = 0;
    for (let t = end - window; t < end; t++) {
      cov += (a[t] - ma) * (f[t] - mf);
      varF += (f[t] - mf) ** 2;
    }
    out.push(varF > 0 ? cov / varF : 0);
  }
  return out;
}
