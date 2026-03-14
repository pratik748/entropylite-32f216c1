/**
 * FUTURE GRAPH MACHINE (FGM)
 * Pipeline: Data Loader → Statistical Parameter Extractor → Simulation Engine → Projection Processor → Chart Overlay
 */

// ─── Types ──────────────────────────────────────────────────────────

export interface FGMParameters {
  currentPrice: number;
  drift: number;       // μ annualized
  volatility: number;  // σ annualized
  rollingVol30: number;
  rollingVol60: number;
  rollingVol90: number;
  meanPrice: number;
  logReturns: number[];
  dailyReturns: number[];
  ouTheta: number;     // mean reversion speed
  ouMu: number;        // long-term mean
  hurstExponent: number;
}

export interface FGMProjection {
  median_path: number[];
  bullish_path: number[];
  bearish_path: number[];
  confidence_95_upper: number[];
  confidence_95_lower: number[];
  confidence_75_upper: number[];
  confidence_75_lower: number[];
  monte_carlo_paths: number[][];
  days: number[];
}

export type FGMModel = "GBM" | "MeanReversion" | "Hybrid";

// ─── Cache ──────────────────────────────────────────────────────────

const cache = new Map<string, { result: FGMProjection; ts: number }>();
const CACHE_TTL = 60_000; // 1 minute

function cacheKey(ticker: string, horizon: number, model: FGMModel, depth: number): string {
  return `${ticker}:${horizon}:${model}:${depth}`;
}

// ─── Random ─────────────────────────────────────────────────────────

function gaussianRandom(): number {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// ─── Parameter Extraction ───────────────────────────────────────────

export function extractParameters(prices: number[]): FGMParameters {
  const n = prices.length;
  const currentPrice = prices[n - 1];

  // Daily log returns
  const logReturns: number[] = [];
  const dailyReturns: number[] = [];
  for (let i = 1; i < n; i++) {
    logReturns.push(Math.log(prices[i] / prices[i - 1]));
    dailyReturns.push((prices[i] - prices[i - 1]) / prices[i - 1]);
  }

  // Drift & volatility (annualized)
  const meanLogRet = logReturns.reduce((a, b) => a + b, 0) / logReturns.length;
  const drift = meanLogRet * 252;
  const variance = logReturns.reduce((s, r) => s + (r - meanLogRet) ** 2, 0) / (logReturns.length - 1);
  const volatility = Math.sqrt(variance * 252);

  // Rolling volatility
  const rollingVol = (window: number) => {
    if (logReturns.length < window) return volatility;
    const slice = logReturns.slice(-window);
    const m = slice.reduce((a, b) => a + b, 0) / slice.length;
    const v = slice.reduce((s, r) => s + (r - m) ** 2, 0) / (slice.length - 1);
    return Math.sqrt(v * 252);
  };

  // Mean price
  const meanPrice = prices.reduce((a, b) => a + b, 0) / n;

  // OU estimation (simple regression approach)
  // dx = θ(μ - x)dt + σdW → regress Δx on x
  const dx = dailyReturns.map((_, i) => prices[i + 1] - prices[i]).filter((_, i) => i < dailyReturns.length);
  const xVals = prices.slice(0, -1);
  const n2 = Math.min(dx.length, xVals.length);
  let sumX = 0, sumDX = 0, sumXX = 0, sumXDX = 0;
  for (let i = 0; i < n2; i++) {
    sumX += xVals[i];
    sumDX += dx[i];
    sumXX += xVals[i] ** 2;
    sumXDX += xVals[i] * dx[i];
  }
  const beta = (n2 * sumXDX - sumX * sumDX) / (n2 * sumXX - sumX ** 2 || 1);
  const alpha = (sumDX - beta * sumX) / n2;
  const ouTheta = Math.max(0.001, -beta * 252); // annualized
  const ouMu = beta !== 0 ? -alpha / beta : meanPrice;

  // Hurst exponent (R/S method simplified)
  const hurstExponent = computeHurst(logReturns);

  return {
    currentPrice, drift, volatility,
    rollingVol30: rollingVol(30),
    rollingVol60: rollingVol(60),
    rollingVol90: rollingVol(90),
    meanPrice, logReturns, dailyReturns,
    ouTheta, ouMu, hurstExponent,
  };
}

function computeHurst(returns: number[]): number {
  const n = returns.length;
  if (n < 20) return 0.5;
  const scales = [10, 20, Math.min(40, Math.floor(n / 2))].filter(s => s <= n / 2);
  if (scales.length < 2) return 0.5;
  const logRS: number[] = [];
  const logN: number[] = [];
  for (const s of scales) {
    const nBlocks = Math.floor(n / s);
    let totalRS = 0;
    for (let b = 0; b < nBlocks; b++) {
      const block = returns.slice(b * s, (b + 1) * s);
      const mean = block.reduce((a, b) => a + b, 0) / s;
      const cumDev: number[] = [];
      let cum = 0;
      for (const r of block) { cum += r - mean; cumDev.push(cum); }
      const R = Math.max(...cumDev) - Math.min(...cumDev);
      const S = Math.sqrt(block.reduce((ss, r) => ss + (r - mean) ** 2, 0) / s) || 1e-10;
      totalRS += R / S;
    }
    logRS.push(Math.log(totalRS / nBlocks));
    logN.push(Math.log(s));
  }
  // Linear regression log(R/S) = H * log(n) + c
  const mX = logN.reduce((a, b) => a + b, 0) / logN.length;
  const mY = logRS.reduce((a, b) => a + b, 0) / logRS.length;
  let num = 0, den = 0;
  for (let i = 0; i < logN.length; i++) {
    num += (logN[i] - mX) * (logRS[i] - mY);
    den += (logN[i] - mX) ** 2;
  }
  return Math.max(0, Math.min(1, den > 0 ? num / den : 0.5));
}

// ─── Simulation Engines ─────────────────────────────────────────────

export function simulateGBM(
  S0: number, mu: number, sigma: number, horizon: number, nPaths: number
): number[][] {
  const dt = 1 / 252;
  const paths: number[][] = [];
  for (let p = 0; p < nPaths; p++) {
    const path = [S0];
    for (let t = 1; t <= horizon; t++) {
      const dW = gaussianRandom() * Math.sqrt(dt);
      path.push(path[t - 1] * Math.exp((mu - 0.5 * sigma ** 2) * dt + sigma * dW));
    }
    paths.push(path);
  }
  return paths;
}

export function simulateOU(
  S0: number, muLong: number, theta: number, sigma: number, horizon: number, nPaths: number
): number[][] {
  const dt = 1 / 252;
  const paths: number[][] = [];
  for (let p = 0; p < nPaths; p++) {
    const path = [S0];
    for (let t = 1; t <= horizon; t++) {
      const dW = gaussianRandom() * Math.sqrt(dt);
      const prev = path[t - 1];
      const drift = theta * (muLong - prev) * dt;
      path.push(prev + drift + sigma * prev * dW);
    }
    paths.push(path);
  }
  return paths;
}

export function simulateHybrid(
  S0: number, params: FGMParameters, horizon: number, nPaths: number
): number[][] {
  const dt = 1 / 252;
  // Hurst < 0.5 → more OU weight, > 0.5 → more GBM weight
  const gbmWeight = Math.max(0.1, Math.min(0.9, params.hurstExponent));
  const ouWeight = 1 - gbmWeight;
  const paths: number[][] = [];

  for (let p = 0; p < nPaths; p++) {
    const path = [S0];
    for (let t = 1; t <= horizon; t++) {
      const dW = gaussianRandom() * Math.sqrt(dt);
      const prev = path[t - 1];
      // GBM component
      const gbmNext = prev * Math.exp((params.drift - 0.5 * params.volatility ** 2) * dt + params.volatility * dW);
      // OU component
      const ouDrift = params.ouTheta * (params.ouMu - prev) * dt;
      const ouNext = prev + ouDrift + params.volatility * prev * dW;
      path.push(gbmWeight * gbmNext + ouWeight * ouNext);
    }
    paths.push(path);
  }
  return paths;
}

// ─── Projection Processor ───────────────────────────────────────────

export function processProjections(paths: number[][], sampleCount = 30): FGMProjection {
  const horizon = paths[0].length - 1;
  const nPaths = paths.length;
  const days = Array.from({ length: horizon + 1 }, (_, i) => i);

  const median_path: number[] = [];
  const bullish_path: number[] = [];
  const bearish_path: number[] = [];
  const confidence_95_upper: number[] = [];
  const confidence_95_lower: number[] = [];
  const confidence_75_upper: number[] = [];
  const confidence_75_lower: number[] = [];

  for (let t = 0; t <= horizon; t++) {
    const vals = paths.map(p => p[t]).sort((a, b) => a - b);
    const pct = (p: number) => vals[Math.min(Math.floor(p * nPaths), nPaths - 1)];
    median_path.push(pct(0.5));
    bullish_path.push(pct(0.9));
    bearish_path.push(pct(0.1));
    confidence_95_upper.push(pct(0.975));
    confidence_95_lower.push(pct(0.025));
    confidence_75_upper.push(pct(0.75));
    confidence_75_lower.push(pct(0.25));
  }

  // Sample subset of paths for rendering
  const step = Math.max(1, Math.floor(nPaths / sampleCount));
  const monte_carlo_paths = paths.filter((_, i) => i % step === 0).slice(0, sampleCount);

  return {
    median_path, bullish_path, bearish_path,
    confidence_95_upper, confidence_95_lower,
    confidence_75_upper, confidence_75_lower,
    monte_carlo_paths, days,
  };
}

// ─── Rolling Volatility ─────────────────────────────────────────────

export function rollingVolatility(returns: number[], window: number): number[] {
  const result: number[] = [];
  for (let i = window; i <= returns.length; i++) {
    const slice = returns.slice(i - window, i);
    const mean = slice.reduce((a, b) => a + b, 0) / slice.length;
    const variance = slice.reduce((s, r) => s + (r - mean) ** 2, 0) / (slice.length - 1);
    result.push(Math.sqrt(variance * 252));
  }
  return result;
}

// ─── Synthetic Historical Data Generator ────────────────────────────

export function generateHistoricalPrices(
  buyPrice: number, currentPrice: number, mu: number, vol: number, days = 120
): number[] {
  // Generate path from buyPrice → currentPrice with realistic noise
  const totalReturn = Math.log(currentPrice / buyPrice);
  const dailyDrift = totalReturn / days;
  const dailyVol = vol / Math.sqrt(252);

  // Generate raw path
  const raw = [buyPrice];
  for (let i = 1; i <= days; i++) {
    raw.push(raw[i - 1] * Math.exp(dailyDrift + dailyVol * gaussianRandom() * 0.5));
  }

  // Scale to hit current price exactly
  const scale = currentPrice / raw[days];
  // Blend scaling to be gradual (not jump at end)
  return raw.map((p, i) => {
    const blend = i / days;
    return p * (1 + (scale - 1) * blend);
  });
}

// ─── Main FGM Pipeline ──────────────────────────────────────────────

export function runFGM(
  ticker: string,
  buyPrice: number,
  currentPrice: number,
  mu: number,
  vol: number,
  horizon: number,
  model: FGMModel,
  depth: number,
): { projection: FGMProjection; params: FGMParameters; historicalPrices: number[] } {
  // Check cache
  const key = cacheKey(ticker, horizon, model, depth);
  const cached = cache.get(key);
  if (cached && Date.now() - cached.ts < CACHE_TTL) {
    const historicalPrices = generateHistoricalPrices(buyPrice, currentPrice, mu, vol);
    const params = extractParameters(historicalPrices);
    return { projection: cached.result, params, historicalPrices };
  }

  // Generate synthetic historical data
  const historicalPrices = generateHistoricalPrices(buyPrice, currentPrice, mu, vol);
  const params = extractParameters(historicalPrices);

  // Run simulation based on model
  let paths: number[][];
  switch (model) {
    case "GBM":
      paths = simulateGBM(currentPrice, params.drift, params.volatility, horizon, depth);
      break;
    case "MeanReversion":
      paths = simulateOU(currentPrice, params.ouMu, params.ouTheta, params.volatility, horizon, depth);
      break;
    case "Hybrid":
      paths = simulateHybrid(currentPrice, params, horizon, depth);
      break;
  }

  const projection = processProjections(paths);

  // Cache result
  cache.set(key, { result: projection, ts: Date.now() });

  return { projection, params, historicalPrices };
}

// ─── Forecast Statistics ────────────────────────────────────────────

export function forecastStats(projection: FGMProjection, currentPrice: number, horizonDays: number[]) {
  return horizonDays.map(d => {
    const idx = Math.min(d, projection.median_path.length - 1);
    const median = projection.median_path[idx];
    const upper95 = projection.confidence_95_upper[idx];
    const lower95 = projection.confidence_95_lower[idx];

    // Estimate P(profit) from the band positions
    const range = upper95 - lower95;
    const pProfit = range > 0 ? Math.max(0, Math.min(1, (upper95 - currentPrice) / range)) : 0.5;
    const pUp10 = range > 0 ? Math.max(0, Math.min(1, (upper95 - currentPrice * 1.1) / range)) : 0;
    const pDown10 = range > 0 ? Math.max(0, Math.min(1, (currentPrice * 0.9 - lower95) / range)) : 0;
    const expectedDrawdown = (lower95 - currentPrice) / currentPrice;

    return {
      horizon: d,
      medianPrice: median,
      pProfit, pUp10, pDown10,
      expectedDrawdown,
      upper95, lower95,
    };
  });
}
