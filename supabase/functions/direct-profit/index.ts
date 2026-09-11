const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

import { buildTickerCandidates, isIndianTicker, normalizeTickerInput } from "../_shared/ticker.ts";
import { runConsensus, type EngineSignal, pctToConf } from "../_shared/ensemble.ts";
import { costHaircut, tickerClass } from "../_shared/costs.ts";
import { loadCalibration, loadReliabilityReport, logSignalOutcome } from "../_shared/calibration.ts";
import { engleGrangerLite, mertonProxy, walkForwardEdge, returnMoments } from "../_shared/mathEdge.ts";
import {
  logReturns,
  sampleStd,
  sharpeRatio as canonSharpe,
  sortinoRatio as canonSortino,
  historicalVaRCVaR,
  maxDrawdown as maxDrawdownDec,
  betaRegression,
  mean,
} from "../_shared/stats.ts";
import { riskFreeFor } from "../_shared/riskFree.ts";
import { modelInfo } from "../_shared/modelRegistry.ts";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

async function fetchAlphaVantage(symbol: string): Promise<{ price: number; prevClose: number; high: number; low: number; volume: number } | null> {
  const apiKey = Deno.env.get("ALPHAVANTAGE_API_KEY");
  if (!apiKey) return null;
  try {
    const cleanSymbol = symbol.replace(/\.(NS|BO)$/, "");
    const exchange = symbol.endsWith(".BO") ? "BSE" : "NSE";
    const avSymbol = symbol.endsWith(".NS") || symbol.endsWith(".BO") ? `${exchange}:${cleanSymbol}` : cleanSymbol;
    const url = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${encodeURIComponent(avSymbol)}&apikey=${apiKey}`;
    const res = await fetch(url);
    if (!res.ok) { await res.text(); return null; }
    const data = await res.json();
    const q = data?.["Global Quote"];
    if (!q || !q["05. price"]) return null;
    return {
      price: parseFloat(q["05. price"]),
      prevClose: parseFloat(q["08. previous close"] || "0"),
      high: parseFloat(q["03. high"] || "0"),
      low: parseFloat(q["04. low"] || "0"),
      volume: parseInt(q["06. volume"] || "0"),
    };
  } catch { return null; }
}

interface MarketSnapshot {
  currentPrice: number;
  prevClose: number;
  dayHigh: number;
  dayLow: number;
  volume: number;
  fiftyTwoWeekHigh: number;
  fiftyTwoWeekLow: number;
  currency: string;
  closes: number[];
  volumes: number[];
}

interface TechnicalSnapshot {
  sma5: number;
  sma20: number;
  momentumScore: number;
  annualizedVol: number;
  zScore: number;
  posIn52w: number;
  volumeRatio: number;
  changePct: number;
  support: number;
  resistance: number;
  prices5d: number[];
  dailyVol: number;
}

interface RiskMetrics {
  var95: number;
  cvar95: number;
  var99: number;
  sharpeRatio: number;
  sortinoRatio: number;
  maxDrawdown: number;
  betaEstimate: number;
  kellyFraction: number;
}

interface ClankSignal {
  id: string;
  label: string;
  active: boolean;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  description: string;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function roundPrice(value: number) {
  return Number.isFinite(value) ? Number(value.toFixed(2)) : 0;
}

function getCurrencySymbol(currency: string) {
  const symbols: Record<string, string> = {
    USD: "$", INR: "₹", EUR: "€", GBP: "£", JPY: "¥", CNY: "¥",
    HKD: "HK$", KRW: "₩", CAD: "C$", AUD: "A$", CHF: "Fr",
  };
  return symbols[currency] || "$";
}

/** Dynamic price sanity verification without hardcoded static ticker bounds */
function passesSanityCheck(price: number, prevClose?: number): boolean {
  if (!Number.isFinite(price) || price <= 0) return false;
  if (prevClose && prevClose > 0) {
    const ratio = price / prevClose;
    if (ratio < 0.1 || ratio > 10.0) return false;
  }
  return true;
}

async function fetchFullSnapshot(ticker: string, isIndian: boolean): Promise<MarketSnapshot | null> {
  const symbolsToTry = buildTickerCandidates(ticker);
  let result: MarketSnapshot | null = null;

  for (const symbol of symbolsToTry) {
    if (result) break;
    try {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1y&_t=${Date.now()}`;
      const res = await fetch(url, { headers: { "User-Agent": UA, "Cache-Control": "no-cache, no-store" } });
      if (res.ok) {
        const data = await res.json();
        const raw = data?.chart?.result?.[0];
        const meta = raw?.meta;
        if (meta?.regularMarketPrice && meta.regularMarketPrice > 0) {
          const prev = meta.chartPreviousClose || meta.previousClose || 0;
          if (!passesSanityCheck(meta.regularMarketPrice, prev)) continue;
          result = {
            currentPrice: meta.regularMarketPrice,
            prevClose: prev,
            dayHigh: meta.regularMarketDayHigh || 0,
            dayLow: meta.regularMarketDayLow || 0,
            volume: meta.regularMarketVolume || 0,
            fiftyTwoWeekHigh: meta.fiftyTwoWeekHigh || 0,
            fiftyTwoWeekLow: meta.fiftyTwoWeekLow || 0,
            currency: isIndian ? "INR" : meta.currency || "USD",
            closes: (raw?.indicators?.quote?.[0]?.close || []).filter((v: any) => v != null && v > 0),
            volumes: (raw?.indicators?.quote?.[0]?.volume || []).filter((v: any) => v != null),
          };
          break;
        }
      } else { await res.text(); }
    } catch { /* next */ }

    try {
      const url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=price`;
      const res = await fetch(url, { headers: { "User-Agent": UA, "Cache-Control": "no-cache, no-store" } });
      if (res.ok) {
        const data = await res.json();
        const pm = data?.quoteSummary?.result?.[0]?.price;
        const p = pm?.regularMarketPrice?.raw;
        if (p && p > 0) {
          const prev = pm?.regularMarketPreviousClose?.raw || 0;
          if (!passesSanityCheck(p, prev)) continue;
          result = {
            currentPrice: p,
            prevClose: prev,
            dayHigh: pm?.regularMarketDayHigh?.raw || 0,
            dayLow: pm?.regularMarketDayLow?.raw || 0,
            volume: pm?.regularMarketVolume?.raw || 0,
            fiftyTwoWeekHigh: pm?.fiftyTwoWeekHigh?.raw || 0,
            fiftyTwoWeekLow: pm?.fiftyTwoWeekLow?.raw || 0,
            currency: isIndian ? "INR" : pm?.currency || "USD",
            closes: [],
            volumes: [],
          };
          break;
        }
      } else { await res.text(); }
    } catch { /* next */ }
  }

  if (!result) {
    for (const symbol of symbolsToTry) {
      const av = await fetchAlphaVantage(symbol);
      if (av && av.price > 0 && passesSanityCheck(av.price, av.prevClose)) {
        result = {
          currentPrice: av.price,
          prevClose: av.prevClose,
          dayHigh: av.high,
          dayLow: av.low,
          volume: av.volume,
          fiftyTwoWeekHigh: 0,
          fiftyTwoWeekLow: 0,
          currency: isIndian ? "INR" : "USD",
          closes: [],
          volumes: [],
        };
        break;
      }
    }
  }
  return result;
}

async function fetchVIX(): Promise<number> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/%5EVIX?interval=1d&range=5d&_t=${Date.now()}`;
    const res = await fetch(url, { headers: { "User-Agent": UA } });
    if (!res.ok) { await res.text(); return 0; }
    const data = await res.json();
    return data?.chart?.result?.[0]?.meta?.regularMarketPrice || 0;
  } catch { return 0; }
}

/** Fetch 1y daily closes for benchmark index (^NSEI / SPY) */
async function fetchBenchmarkCloses(isIndian: boolean): Promise<number[]> {
  const sym = isIndian ? "%5ENSEI" : "SPY";
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${sym}?interval=1d&range=1y`;
    const res = await fetch(url, { headers: { "User-Agent": UA } });
    if (!res.ok) { await res.text(); return []; }
    const data = await res.json();
    const raw = data?.chart?.result?.[0];
    return (raw?.indicators?.quote?.[0]?.close || []).filter((v: any) => v != null && v > 0);
  } catch { return []; }
}

async function fetchRecentNews(ticker: string): Promise<string[]> {
  try {
    const cleanTicker = ticker.replace(/\.(NS|BO)$/i, "");
    const url = `https://news.google.com/rss/search?q=${encodeURIComponent(cleanTicker + " stock")}&hl=en&gl=US&ceid=US:en`;
    const res = await fetch(url, { headers: { "User-Agent": UA } });
    if (!res.ok) return [];
    const xml = await res.text();
    const titles: string[] = [];
    const matches = xml.matchAll(/<title><!\[CDATA\[(.*?)\]\]><\/title>/g);
    for (const m of matches) {
      if (titles.length >= 6) break;
      const t = m[1].trim();
      if (t && !t.startsWith("Google News") && t.length > 10) titles.push(t);
    }
    if (titles.length === 0) {
      const plainMatches = xml.matchAll(/<title>(.*?)<\/title>/g);
      for (const m of plainMatches) {
        if (titles.length >= 6) break;
        const t = m[1].trim();
        if (t && !t.startsWith("Google News") && t.length > 10) titles.push(t);
      }
    }
    return titles;
  } catch {
    return [];
  }
}

function computeTechnicals(snap: MarketSnapshot): TechnicalSnapshot {
  const { currentPrice, closes, volumes, fiftyTwoWeekHigh, fiftyTwoWeekLow, volume, prevClose } = snap;
  const prices5d = closes.slice(-5);
  const prices20d = closes.slice(-20);

  const sma5 = prices5d.length > 0 ? prices5d.reduce((a, b) => a + b, 0) / prices5d.length : currentPrice;
  const sma20 = prices20d.length > 0 ? prices20d.reduce((a, b) => a + b, 0) / prices20d.length : currentPrice;

  const momentumScore = (currentPrice > sma5 ? 1 : -1) + (currentPrice > sma20 ? 1 : -1) + (sma5 > sma20 ? 1 : -1);

  const returns20d = logReturns(prices20d);
  const dailyVolRaw = sampleStd(returns20d);
  const annualizedVol = dailyVolRaw * Math.sqrt(252) * 100;
  const zScore = sma20 > 0 && dailyVolRaw > 0 ? (currentPrice - sma20) / (sma20 * dailyVolRaw * Math.sqrt(20)) : 0;

  const range52w = (fiftyTwoWeekHigh || currentPrice) - (fiftyTwoWeekLow || currentPrice);
  const posIn52w = range52w > 0 ? ((currentPrice - (fiftyTwoWeekLow || currentPrice)) / range52w) * 100 : 50;
  const avgVolume = volumes.length > 0 ? volumes.reduce((a, b) => a + b, 0) / volumes.length : volume;
  const volumeRatio = avgVolume > 0 ? volume / avgVolume : 1;

  const supportCandidates = [...prices20d.slice(-10).filter((p: number) => p > 0), currentPrice];
  const resistanceCandidates = [...prices20d.slice(-10).filter((p: number) => p > 0), currentPrice];

  return {
    sma5: roundPrice(sma5),
    sma20: roundPrice(sma20),
    momentumScore,
    annualizedVol: Number(annualizedVol.toFixed(1)),
    zScore: Number(zScore.toFixed(2)),
    posIn52w: Number(posIn52w.toFixed(1)),
    volumeRatio: Number(volumeRatio.toFixed(2)),
    changePct: prevClose > 0 ? Number((((currentPrice - prevClose) / prevClose) * 100).toFixed(2)) : 0,
    support: roundPrice(Math.min(...supportCandidates)),
    resistance: roundPrice(Math.max(...resistanceCandidates)),
    prices5d,
    dailyVol: Number((dailyVolRaw * 100).toFixed(3)),
  };
}

/** Compute VaR, CVaR, Sharpe, Sortino, Max Drawdown, Blume-adjusted Empirical Beta, Kelly Fraction */
function computeRiskMetrics(
  snap: MarketSnapshot,
  tech: TechnicalSnapshot,
  benchCloses: number[],
  vix: number,
): RiskMetrics {
  const closes = snap.closes;
  const returns = logReturns(closes);

  if (returns.length < 20) {
    const dailyVol = tech.annualizedVol / (Math.sqrt(252) * 100) || 0.015;
    const notional = snap.currentPrice;
    return {
      var95: roundPrice(notional * dailyVol * 1.645),
      cvar95: roundPrice(notional * dailyVol * 2.063),
      var99: roundPrice(notional * dailyVol * 2.326),
      sharpeRatio: 0,
      sortinoRatio: 0,
      maxDrawdown: 0,
      betaEstimate: 1,
      kellyFraction: 0,
    };
  }

  const n = returns.length;

  // Historical VaR / CVaR
  const { varPct: var95Pct, cvarPct: cvar95Pct } = historicalVaRCVaR(returns, 0.95);
  const { varPct: var99Pct } = historicalVaRCVaR(returns, 0.99);

  const notional = snap.currentPrice;

  const rf = riskFreeFor(snap.currency).annualRate;
  const sharpeRatio = Number(canonSharpe(returns, rf).toFixed(2));
  const sortinoRatio = Number(canonSortino(returns, rf).toFixed(2));
  const maxDD = maxDrawdownDec(closes);

  // Empirical Beta with Blume Bayesian shrinkage toward 1.0 (β_adj = 0.67*β + 0.33*1.0)
  let betaEstimate = 1.0;
  if (benchCloses.length >= 20) {
    const benchReturns = logReturns(benchCloses);
    const reg = betaRegression(returns, benchReturns);
    if (reg && Number.isFinite(reg.beta)) {
      const blumeBeta = 0.67 * reg.beta + 0.33 * 1.0;
      betaEstimate = Number(clamp(blumeBeta, 0.1, 4.0).toFixed(2));
    }
  }

  // Kelly fraction with Wilson 95% binomial lower bound on win rate
  const wins = returns.filter((r) => r > 0);
  const losses = returns.filter((r) => r < 0);
  const trials = Math.max(n, 1);
  const successes = wins.length;
  const phat = successes / trials;
  const z = 1.96;
  const z2 = z * z;
  const denom = 1 + z2 / trials;
  const center = (phat + z2 / (2 * trials)) / denom;
  const margin = (z * Math.sqrt(phat * (1 - phat) / trials + z2 / (4 * trials * trials))) / denom;
  const pLow = Math.max(0, center - margin);
  const avgWin = wins.length > 0 ? wins.reduce((s, v) => s + v, 0) / wins.length : 0;
  const avgLoss = losses.length > 0 ? Math.abs(losses.reduce((s, v) => s + v, 0) / losses.length) : 1;
  const b = avgLoss > 0 ? avgWin / avgLoss : 1;
  const kellyRaw = b > 0 ? (pLow * b - (1 - pLow)) / b : 0;
  const kellyFraction = Number(clamp(kellyRaw * 0.5, 0, 0.25).toFixed(2));

  return {
    var95: roundPrice(notional * var95Pct),
    cvar95: roundPrice(notional * cvar95Pct),
    var99: roundPrice(notional * var99Pct),
    sharpeRatio,
    sortinoRatio,
    maxDrawdown: Number((maxDD * 100).toFixed(2)),
    betaEstimate,
    kellyFraction,
  };
}

/** Detect CLANK-style structural constraints from market data */
function detectClankSignals(snap: MarketSnapshot, tech: TechnicalSnapshot, vix: number): ClankSignal[] {
  const signals: ClankSignal[] = [];

  // Volatility Control Fund trigger
  if (tech.annualizedVol > 35 || vix > 25) {
    signals.push({
      id: "vol-control",
      label: "Volatility Control Fund Trigger",
      active: true,
      severity: vix > 30 || tech.annualizedVol > 50 ? "CRITICAL" : "HIGH",
      description: `Annualized vol ${tech.annualizedVol}% + VIX ${vix > 0 ? vix.toFixed(1) : "N/A"} → forced deleveraging likely`,
    });
  }

  // CTA Trend Trigger
  if (Math.abs(tech.momentumScore) >= 3) {
    signals.push({
      id: "cta-trend",
      label: "CTA Trend-Following Signal",
      active: true,
      severity: "MEDIUM",
      description: `Momentum ${tech.momentumScore}/3 → systematic trend funds likely ${tech.momentumScore > 0 ? "adding" : "reducing"} exposure`,
    });
  }

  // Gamma Squeeze / Dealer Gamma Flip
  if (tech.volumeRatio > 2.0 && Math.abs(tech.changePct) > 3) {
    signals.push({
      id: "gamma-squeeze",
      label: "Dealer Gamma Dislocation",
      active: true,
      severity: "HIGH",
      description: `Volume ${tech.volumeRatio.toFixed(1)}x avg with ${tech.changePct}% move → potential gamma squeeze / pin risk`,
    });
  }

  // Mean Reversion Extreme
  if (Math.abs(tech.zScore) > 2.0) {
    signals.push({
      id: "mean-reversion",
      label: "Extreme Mean Reversion Zone",
      active: true,
      severity: "HIGH",
      description: `Z-score ${tech.zScore} → ${tech.zScore > 0 ? "severely overbought" : "severely oversold"}, institutional rebalancing probable`,
    });
  }

  // 52-Week Extremes (index rebalancing risk)
  if (tech.posIn52w > 95 || tech.posIn52w < 5) {
    signals.push({
      id: "52w-extreme",
      label: "52-Week Range Extreme",
      active: true,
      severity: "MEDIUM",
      description: `At ${tech.posIn52w.toFixed(0)}% of 52W range → index rebalancing or option hedging flows expected`,
    });
  }

  // Liquidity Vacuum
  if (tech.volumeRatio < 0.5) {
    signals.push({
      id: "liquidity-vacuum",
      label: "Liquidity Vacuum Detected",
      active: true,
      severity: "MEDIUM",
      description: `Volume only ${(tech.volumeRatio * 100).toFixed(0)}% of average → thin book, outsized moves possible`,
    });
  }

  return signals;
}

function deriveVolatilityRegime(annualizedVol: number): "LOW" | "NORMAL" | "HIGH" {
  if (annualizedVol >= 45) return "HIGH";
  if (annualizedVol >= 18) return "NORMAL";
  return "LOW";
}

function buildDeterministicTradePlan(
  snap: MarketSnapshot,
  tech: TechnicalSnapshot,
  currency: string,
  market: string,
  vix: number,
  riskMetrics: RiskMetrics,
  clankSignals: ClankSignal[],
  newsHeadlines: string[],
  resolvedTicker: string,
  currencySymbol: string,
  desirableHint?: { listed?: boolean; avgPnlPct?: number; zoneCount?: number; regimes?: string[] } | null,
) {
  const bullishSignals: string[] = [];
  const bearishSignals: string[] = [];

  if (tech.momentumScore >= 2) bullishSignals.push("strong momentum alignment (SMA5 > SMA20)");
  if (tech.momentumScore <= -2) bearishSignals.push("negative momentum breakdown (SMA5 < SMA20)");
  if (snap.currentPrice > tech.sma20) bullishSignals.push("price holding above 20-day mean");
  if (snap.currentPrice < tech.sma20) bearishSignals.push("price trading below 20-day mean");
  if (tech.zScore <= -1.2) bullishSignals.push(`oversold mean reversion stretch (z=${tech.zScore})`);
  if (tech.zScore >= 1.2) bearishSignals.push(`overbought extension hurdle (z=+${tech.zScore})`);
  if (tech.changePct >= 1.5) bullishSignals.push(`constructive daily impulse (+${tech.changePct}%)`);
  if (tech.changePct <= -1.5) bearishSignals.push(`adverse tape pressure (${tech.changePct}%)`);
  if (tech.volumeRatio >= 1.2) {
    if (tech.changePct >= 0) bullishSignals.push(`institutional volume accumulation (${tech.volumeRatio}x)`);
    else bearishSignals.push(`elevated distribution volume (${tech.volumeRatio}x)`);
  }
  if (tech.volumeRatio < 0.65) bearishSignals.push("subdued institutional participation");
  if (vix >= 25) bearishSignals.push(`elevated macro volatility regime (VIX ${vix.toFixed(1)})`);

  const criticalClank = clankSignals.filter((s) => s.severity === "CRITICAL");
  if (criticalClank.length > 0) bearishSignals.push("active mechanical constraint trigger");

  if (desirableHint?.listed) {
    bullishSignals.push("ODGS desirable asset node");
    if ((desirableHint.avgPnlPct ?? 0) >= 3) bullishSignals.push("ODGS empirical alpha zone");
  }

  const bullScore = bullishSignals.length;
  const bearScore = bearishSignals.length;
  const scoreDiff = bullScore - bearScore;

  let bias = 0;
  bias += tech.momentumScore * 1.2;
  bias += (snap.currentPrice > tech.sma20 ? 0.6 : -0.6);
  bias += clamp(-tech.zScore, -1.5, 1.5) * 0.8;
  bias += clamp(tech.changePct / 2, -1.5, 1.5);
  bias += scoreDiff * 0.5;
  if (desirableHint?.listed) bias += 0.8 + Math.min(1.2, (desirableHint.avgPnlPct ?? 0) / 5);
  if (criticalClank.length > 0) bias -= 1.0;
  if (vix >= 28) bias -= 0.5;
  if (tech.volumeRatio >= 1.15) bias += Math.sign(bias) * 0.4;

  const directionalEdge = Math.max(bullScore, bearScore);
  const trulyFlat =
    Math.abs(bias) < 0.6 &&
    Math.abs(tech.momentumScore) <= 1 &&
    Math.abs(tech.zScore) < 1.0 &&
    Math.abs(tech.changePct) < 0.6;
  const action: "BUY" | "SELL" | "WAIT" = trulyFlat ? "WAIT" : (bias >= 0 ? "BUY" : "SELL");
  const direction = action === "BUY" ? "UP" : action === "SELL" ? "DOWN" : "SIDEWAYS";
  const volatilityRegime = deriveVolatilityRegime(tech.annualizedVol);

  const waitReasons: string[] = [];
  if (action === "WAIT") {
    waitReasons.push(`Tape is neutral: composite directional bias is ${bias.toFixed(2)} (|bias| < 0.60)`);
    waitReasons.push(`Momentum ${tech.momentumScore}/3, z-score ${tech.zScore}, day change ${tech.changePct}%`);
    waitReasons.push(`Bull signals (${bullScore}) vs Bear signals (${bearScore}) lack decisive statistical spread`);
    if (vix >= 28) waitReasons.push(`Macro VIX at ${vix.toFixed(1)} mandates disciplined capital preservation`);
  }

  const entryWidth = clamp(Math.max(0.006, tech.dailyVol / 100), 0.006, 0.02);
  const targetWidth = clamp(entryWidth * 2.4, 0.018, 0.08);
  const stopWidth = clamp(entryWidth * 1.2, 0.012, 0.04);

  let entryLow = snap.currentPrice * (1 - entryWidth);
  let entryHigh = snap.currentPrice * (1 + entryWidth * 0.35);
  let targetPrice = snap.currentPrice;
  let stopLoss = snap.currentPrice;
  let riskRewardRatio = 0;

  if (action === "BUY") {
    targetPrice = Math.max(snap.currentPrice * (1 + targetWidth), tech.resistance || 0);
    stopLoss = Math.min(snap.currentPrice * (1 - stopWidth), tech.support || snap.currentPrice * (1 - stopWidth));
    riskRewardRatio = (targetPrice - ((entryLow + entryHigh) / 2)) / Math.max(((entryLow + entryHigh) / 2) - stopLoss, 0.01);
  } else if (action === "SELL") {
    entryLow = snap.currentPrice * (1 - entryWidth * 0.35);
    entryHigh = snap.currentPrice * (1 + entryWidth);
    targetPrice = Math.min(snap.currentPrice * (1 - targetWidth), tech.support || snap.currentPrice * (1 - targetWidth));
    stopLoss = Math.max(snap.currentPrice * (1 + stopWidth), tech.resistance || snap.currentPrice * (1 + stopWidth));
    riskRewardRatio = ((((entryLow + entryHigh) / 2) - targetPrice) / Math.max(stopLoss - ((entryLow + entryHigh) / 2), 0.01));
  } else {
    entryLow = snap.currentPrice * 0.99;
    entryHigh = snap.currentPrice * 1.01;
    targetPrice = tech.resistance || snap.currentPrice * 1.02;
    stopLoss = tech.support || snap.currentPrice * 0.98;
  }

  const confidenceBase = action === "WAIT" ? 42 : 56;
  const confidence = clamp(
    Math.round(confidenceBase + directionalEdge * 5 - Math.max(0, Math.min(bullScore, bearScore)) * 3 - (tech.volumeRatio < 0.75 ? 5 : 0) - (vix >= 28 ? 4 : 0)),
    35,
    88,
  );
  const quantScore = clamp(Math.round(44 + directionalEdge * 8 - Math.min(bullScore, bearScore) * 3), 35, 85);

  // Institutional NLG Prose Synthesis
  const strongestBull = bullishSignals[0] || `Constructive ${market} market structure`;
  const strongestBear = bearishSignals[0] || "No immediate downside catalyst";
  const directionReason = action === "BUY"
    ? strongestBull
    : action === "SELL"
      ? strongestBear
      : bullScore === bearScore
        ? "Signals balanced across horizon"
        : bullScore > bearScore
          ? strongestBull
          : strongestBear;

  const topNewsPositive = newsHeadlines.find((h) => /beats|jump|surge|win|record|growth|upgrade|order|high|gain|rise/i.test(h));
  const topNewsNegative = newsHeadlines.find((h) => /miss|fall|drop|slump|cut|probe|sebi|lawsuit|downgrade|loss|decline/i.test(h));

  const positiveNews = topNewsPositive
    ? topNewsPositive.slice(0, 120)
    : (bullScore > 0 ? strongestBull : `Macro support in ${currency}`).slice(0, 120);

  const negativeNews = topNewsNegative
    ? topNewsNegative.slice(0, 120)
    : (bearScore > 0 ? strongestBear : "Contained systemic downside risks").slice(0, 120);

  // Protection Field: Exact stock-specific derivative hedge
  const protection = action === "WAIT"
    ? "No position required; preserve cash until ensemble confirms statistical edge."
    : action === "BUY"
      ? `${resolvedTicker} ${roundPrice(stopLoss)} PE hedge. Invalidation stop at ${currencySymbol}${roundPrice(stopLoss)}. Max risk per share: ${currencySymbol}${roundPrice(snap.currentPrice - stopLoss)}.`
      : `Cover position above ${currencySymbol}${roundPrice(stopLoss)} with ${resolvedTicker} ${roundPrice(stopLoss)} CE. Max loss: ${currencySymbol}${roundPrice(stopLoss - snap.currentPrice)}/share.`;

  return {
    action,
    bias: Number(bias.toFixed(2)),
    confidence,
    currency,
    entryLow: roundPrice(entryLow),
    entryHigh: roundPrice(entryHigh),
    targetPrice: roundPrice(targetPrice),
    stopLoss: roundPrice(stopLoss),
    timeframe: volatilityRegime === "HIGH" ? "2-5 days" : "1-3 weeks",
    direction,
    directionReason: directionReason.slice(0, 60),
    positiveNews,
    negativeNews,
    protection,
    currentPrice: roundPrice(snap.currentPrice),
    quantScore,
    volatilityRegime,
    riskRewardRatio: action === "WAIT" ? 0 : Number(Math.abs(riskRewardRatio).toFixed(2)),
    riskMetrics,
    clankSignals,
    newsHeadlines: newsHeadlines.slice(0, 5),
    waitReasons,
    bullSignals: bullishSignals,
    bearSignals: bearishSignals,
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { ticker, indiaMode, desirableHint } = await req.json();
    if (!ticker || typeof ticker !== "string") {
      return new Response(JSON.stringify({ error: "ticker required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const resolvedTicker = normalizeTickerInput(ticker.trim());
    const isIndian = indiaMode === true || isIndianTicker(resolvedTicker);
    const market = isIndian ? "India (NSE/BSE)" : "US/Global";

    // ── 1. HIGH-SPEED CONCURRENT DATA PIPELINE ────────────────────────
    const [snap, vix, benchCloses, newsHeadlines] = await Promise.all([
      fetchFullSnapshot(resolvedTicker, isIndian),
      fetchVIX(),
      fetchBenchmarkCloses(isIndian),
      fetchRecentNews(resolvedTicker),
    ]);

    if (!snap || snap.currentPrice <= 0) {
      return new Response(JSON.stringify({
        error: `Could not fetch price data for ${resolvedTicker}. Check the ticker symbol and try again.`,
      }), {
        status: 422,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const currency = snap.currency || (isIndian ? "INR" : "USD");
    const currencySymbol = getCurrencySymbol(currency);
    const tech = computeTechnicals(snap);
    const riskMetrics = computeRiskMetrics(snap, tech, benchCloses, vix);
    const clankSignals = detectClankSignals(snap, tech, vix);

    // ── 2. DASHBOARD INTELLIGENCE CONGRUENCE ─────────────────────────
    let intelSummary: any = null;
    try {
      const supabaseUrl = Deno.env.get("SUPABASE_URL");
      const authHeader = req.headers.get("authorization");
      if (supabaseUrl && authHeader) {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 6000);
        try {
          const intelRes = await fetch(`${supabaseUrl}/functions/v1/analyze-stock`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: authHeader,
              apikey: Deno.env.get("SUPABASE_ANON_KEY") || "",
            },
            body: JSON.stringify({
              ticker: resolvedTicker,
              buyPrice: snap.currentPrice,
              quantity: 1,
            }),
            signal: ctrl.signal,
          });
          if (intelRes.ok) {
            intelSummary = await intelRes.json();
          } else {
            await intelRes.text().catch(() => "");
          }
        } catch {
          // graceful fallback
        } finally {
          clearTimeout(timer);
        }
      }
    } catch {
      // non-blocking
    }

    // ── 3. PURE DETERMINISTIC QUANTITATIVE TRADE PLAN ────────────────
    const deterministic = buildDeterministicTradePlan(
      snap,
      tech,
      currency,
      market,
      vix,
      riskMetrics,
      clankSignals,
      newsHeadlines,
      resolvedTicker,
      currencySymbol,
      desirableHint,
    );

    let output: Record<string, unknown> = {
      action: deterministic.action,
      confidence: deterministic.confidence,
      currency,
      entryLow: deterministic.entryLow,
      entryHigh: deterministic.entryHigh,
      targetPrice: deterministic.targetPrice,
      stopLoss: deterministic.stopLoss,
      timeframe: deterministic.timeframe,
      direction: deterministic.direction,
      directionReason: deterministic.directionReason,
      positiveNews: deterministic.positiveNews,
      negativeNews: deterministic.negativeNews,
      protection: deterministic.protection,
      currentPrice: deterministic.currentPrice,
      quantScore: deterministic.quantScore,
      volatilityRegime: deterministic.volatilityRegime,
      riskRewardRatio: deterministic.riskRewardRatio,
      riskMetrics,
      clankSignals,
      newsHeadlines: deterministic.newsHeadlines,
      bullSignals: deterministic.bullSignals,
      bearSignals: deterministic.bearSignals,
      waitReasons: deterministic.waitReasons,
    };

    // ── 4. MULTI-ENGINE ENSEMBLE CONSENSUS GATE ──────────────────────
    const dirOf = (a: string): -1 | 0 | 1 => a === "BUY" ? 1 : a === "SELL" ? -1 : 0;
    const desirableZones = Math.max(0, Number(desirableHint?.zoneCount) || 0);
    const desirableEdge = ((desirableHint?.avgPnlPct ?? 0) * desirableZones) / (desirableZones + 3);

    const engineSignals: EngineSignal[] = [
      {
        id: "deterministic",
        label: "Deterministic Technicals",
        direction: dirOf(deterministic.action),
        confidence: pctToConf(deterministic.confidence),
        reliability: 0.62,
      },
      {
        id: "momentum",
        label: "Momentum (SMA/MA Alignment)",
        direction: tech.momentumScore >= 1 ? 1 : tech.momentumScore <= -1 ? -1 : 0,
        confidence: Math.min(1, Math.abs(tech.momentumScore) / 3),
        reliability: 0.58,
        hasSignal: Math.abs(tech.momentumScore) >= 1,
      },
      {
        id: "mean_reversion",
        label: "Mean Reversion (Z-Score)",
        direction: tech.zScore <= -1.2 ? 1 : tech.zScore >= 1.2 ? -1 : 0,
        confidence: Math.min(1, Math.abs(tech.zScore) / 2.5),
        reliability: 0.54,
        hasSignal: Math.abs(tech.zScore) >= 1.2,
      },
      {
        id: "sharpe",
        label: "Risk-Adjusted Return (Sharpe)",
        direction: riskMetrics.sharpeRatio > 0.5 ? 1 : riskMetrics.sharpeRatio < -0.3 ? -1 : 0,
        confidence: Math.min(1, Math.abs(riskMetrics.sharpeRatio) / 2),
        reliability: 0.56,
        hasSignal: Math.abs(riskMetrics.sharpeRatio) >= 0.3,
      },
      {
        id: "volume",
        label: "Volume Confirmation",
        direction: tech.volumeRatio >= 1.4 ? (tech.changePct >= 0 ? 1 : -1) : 0,
        confidence: Math.min(1, (tech.volumeRatio - 1) / 1.5),
        reliability: 0.55,
        hasSignal: tech.volumeRatio >= 1.4,
      },
      {
        id: "clank",
        label: "CLANK Structural Constraints",
        direction: clankSignals.some((s) => s.severity === "CRITICAL") ? -1 : 0,
        confidence: clankSignals.some((s) => s.severity === "CRITICAL") ? 0.75 : 0,
        reliability: 0.65,
        hasSignal: clankSignals.some((s) => s.severity === "CRITICAL" || s.severity === "HIGH"),
      },
      {
        id: "desirable",
        label: `ODGS Desirable-Asset Memory (edge=${desirableEdge.toFixed(2)}%, n=${desirableZones})`,
        direction: desirableHint?.listed ? (desirableEdge >= 0 ? 1 : -1) : 0,
        confidence: Math.min(0.9, 0.4 + Math.abs(desirableEdge) / 6),
        reliability: 0.55 + 0.10 * Math.min(1, desirableZones / 6),
        hasSignal: !!desirableHint?.listed,
      },
    ];

    if (intelSummary?.suggestion) {
      engineSignals.push({
        id: "intelligence",
        label: "Dashboard Intelligence Consensus",
        direction: intelSummary.suggestion === "Add" ? 1
          : intelSummary.suggestion === "Exit" ? -1
          : intelSummary.suggestion === "Skip" ? -1
          : 0,
        confidence: pctToConf(intelSummary.confidence),
        reliability: 0.66,
        hasSignal: intelSummary.suggestion !== "Hold",
      });
      (output as any).intelligence = {
        suggestion: intelSummary.suggestion,
        confidence: intelSummary.confidence,
        verdict: intelSummary.verdict,
        trend: intelSummary.technicals?.trend,
        regime: intelSummary.regime,
        riskScore: intelSummary.riskScore,
        riskLevel: intelSummary.riskLevel,
        bullRange: intelSummary.bullRange,
        bearRange: intelSummary.bearRange,
        sentiment: intelSummary.overallSentiment,
      };
    }

    // ── 5. REAL-MATH STATISTICAL ARBITRAGE & STRUCTURAL ENGINES ───────
    let cointEngine: EngineSignal | null = null;
    let mertonEngine: EngineSignal | null = null;
    let wfEngine: EngineSignal | null = null;
    let momentSkew = 0, momentKurt = 0;
    let cointRaw: ReturnType<typeof engleGrangerLite> | null = null;
    let mertonRaw: ReturnType<typeof mertonProxy> | null = null;
    let wfRaw: ReturnType<typeof walkForwardEdge> | null = null;

    try {
      if (benchCloses.length >= 60 && snap.closes.length >= 60) {
        const eg = engleGrangerLite(snap.closes, benchCloses);
        cointRaw = eg;
        if (eg.cointegrated && Math.abs(eg.residZ) >= 1.5 && Number.isFinite(eg.halfLife) && eg.halfLife > 1 && eg.halfLife < 60) {
          const dir: -1 | 0 | 1 = eg.residZ > 0 ? -1 : 1;
          cointEngine = {
            id: "cointegration",
            label: `Cointegration vs ${isIndian ? "NIFTY" : "SPY"} (z=${eg.residZ.toFixed(2)}, t½=${eg.halfLife.toFixed(0)}d)`,
            direction: dir,
            confidence: Math.min(1, Math.abs(eg.residZ) / 3),
            reliability: 0.64,
            hasSignal: true,
          };
        }
      }

      const moments = returnMoments(snap.closes);
      momentSkew = moments.skew;
      momentKurt = moments.excessKurt;

      const ddPct = riskMetrics.maxDrawdown / 100;
      const sigmaAnnual = tech.annualizedVol / 100;
      const trendSlope = tech.sma5 > tech.sma20 ? 1 : tech.sma5 < tech.sma20 ? -1 : 0;
      const mp = mertonProxy({ sigmaAnnual, drawdownPct: ddPct, trendSlope });
      mertonRaw = mp;
      if (mp.signal !== 0 || mp.severity !== "OK") {
        mertonEngine = {
          id: "structural_credit",
          label: `Structural Credit DD=${mp.dd}σ (${mp.severity})`,
          direction: mp.signal,
          confidence: mp.severity === "DISTRESS" ? 0.85 : mp.severity === "STRESS" ? 0.55 : 0.4,
          reliability: 0.62,
          hasSignal: mp.severity === "DISTRESS" || mp.signal !== 0,
        };
      }

      const wf = walkForwardEdge(snap.closes, 5);
      wfRaw = wf;
      if (wf.n >= 40) {
        const dominantSide: -1 | 0 | 1 = String(output.action) === "BUY" ? 1 : String(output.action) === "SELL" ? -1 : 0;
        let dir: -1 | 0 | 1 = 0;
        if (dominantSide === 1) dir = wf.hitRate >= 0.52 ? 1 : wf.hitRate <= 0.45 ? -1 : 0;
        else if (dominantSide === -1) dir = wf.hitRate <= 0.48 ? -1 : wf.hitRate >= 0.55 ? 1 : 0;
        else dir = wf.fwdSharpe > 0.5 ? 1 : wf.fwdSharpe < -0.5 ? -1 : 0;
        wfEngine = {
          id: "walkforward",
          label: `Walk-Forward T+5 (hit=${(wf.hitRate * 100).toFixed(0)}% n=${wf.n})`,
          direction: dir,
          confidence: Math.min(1, Math.abs(wf.hitRate - 0.5) * 4),
          reliability: 0.68,
          hasSignal: dir !== 0,
        };
      }
    } catch (e) {
      console.warn("direct-profit: mathEdge engines exception:", (e as Error).message);
    }

    if (cointEngine) engineSignals.push(cointEngine);
    if (mertonEngine) engineSignals.push(mertonEngine);
    if (wfEngine) engineSignals.push(wfEngine);

    const rrFromOutput = Number(output.riskRewardRatio);
    const haircut = costHaircut(resolvedTicker);
    const [calibration, reliabilityReport] = await Promise.all([
      loadCalibration(),
      loadReliabilityReport(),
    ]);

    const DP_GATES = {
      minEngines: 2,
      minVotingBuckets: 1,
      minAgreeingBuckets: 1,
      minCalibratedProb: 0.53,
      minAgreement: 0.30,
      minExpectedR: 0.05,
    } as const;

    const consensus = runConsensus(engineSignals, {
      rUp: Number.isFinite(rrFromOutput) && rrFromOutput > 0 ? rrFromOutput : 2.0,
      rDown: 1.0,
      costHaircut: haircut,
      calibration,
      skew: momentSkew,
      excessKurt: momentKurt,
      gates: DP_GATES,
      bucketBonus: 0.35,
    });

    // ── 6. EXPECTED UTILITY RESOLUTION ────────────────────────────────
    if (consensus.decision === "STAND_ASIDE" && output.action !== "WAIT") {
      output.action = "WAIT";
      output.direction = "SIDEWAYS";
      output.directionReason = "Ensemble engines diverge; stand aside";
      output.entryLow = roundPrice(snap.currentPrice * 0.99);
      output.entryHigh = roundPrice(snap.currentPrice * 1.01);
      output.targetPrice = roundPrice(tech.resistance || snap.currentPrice * 1.02);
      output.stopLoss = roundPrice(tech.support || snap.currentPrice * 0.98);
      output.riskRewardRatio = 0;
      output.protection = "No active position; wait for engine consensus before deploying risk.";
      const dirLabel = (d: number) => d === 1 ? "BUY" : d === -1 ? "SELL" : "--";
      const bucketLine = `Buckets: A(price)=${dirLabel(consensus.bucketDirs.A)} · B(intel)=${dirLabel(consensus.bucketDirs.B)} · C(regime)=${dirLabel(consensus.bucketDirs.C)}`;
      (output as any).waitReasons = [
        consensus.standAsideReason || "Engines disagree",
        bucketLine,
        `Calibrated win-probability: ${(consensus.calibratedProb * 100).toFixed(0)}% (threshold: ${(DP_GATES.minCalibratedProb * 100).toFixed(0)}%)`,
        haircut > 0.005 ? `Round-trip cost ${(haircut * 100).toFixed(2)}% (${tickerClass(resolvedTicker)})` : `Liquidity tier: ${tickerClass(resolvedTicker)}`,
        `Expected R after costs: ${consensus.expectedR.toFixed(2)}`,
        ...((output as any).waitReasons || []),
      ];
    } else if (consensus.decision !== "STAND_ASIDE" && output.action === "WAIT") {
      const dir: "BUY" | "SELL" = consensus.decision;
      const cp = snap.currentPrice;
      const sigma = Math.max(0.006, Math.min(0.02, tech.dailyVol / 100));
      const stopWidth = Math.max(0.012, Math.min(0.04, sigma * 1.2));
      const rMultiple = Math.max(1.5, Math.min(4, (consensus.expectedR + 1) / Math.max(1 - consensus.calibratedProb, 0.05) * 0.5));
      const targetWidth = Math.max(0.018, Math.min(0.08, stopWidth * rMultiple));
      let eL = cp, eH = cp, tg = cp, sl = cp, rr = 0;
      if (dir === "BUY") {
        eL = cp * (1 - sigma); eH = cp * (1 + sigma * 0.35);
        tg = Math.max(cp * (1 + targetWidth), tech.resistance || 0);
        sl = Math.min(cp * (1 - stopWidth), tech.support || cp * (1 - stopWidth));
        rr = (tg - (eL + eH) / 2) / Math.max((eL + eH) / 2 - sl, 0.01);
      } else {
        eL = cp * (1 - sigma * 0.35); eH = cp * (1 + sigma);
        tg = Math.min(cp * (1 - targetWidth), tech.support || cp * (1 - targetWidth));
        sl = Math.max(cp * (1 + stopWidth), tech.resistance || cp * (1 + stopWidth));
        rr = ((eL + eH) / 2 - tg) / Math.max(sl - (eL + eH) / 2, 0.01);
      }

      output.action = dir;
      output.direction = dir === "BUY" ? "UP" : "DOWN";
      output.directionReason = `Ensemble consensus ${dir}: ${(consensus.calibratedProb * 100).toFixed(0)}% win-prob, ${consensus.expectedR.toFixed(2)}R expected after costs`;
      output.entryLow = roundPrice(eL);
      output.entryHigh = roundPrice(eH);
      output.targetPrice = roundPrice(tg);
      output.stopLoss = roundPrice(sl);
      output.riskRewardRatio = Number(Math.abs(rr).toFixed(2));
      output.protection = dir === "BUY"
        ? `${resolvedTicker} ${roundPrice(sl)} PE as hedge. Trail stop at ${currencySymbol}${roundPrice(sl)}. Risk/share: ${currencySymbol}${roundPrice(cp - sl)}.`
        : `Cover above ${currencySymbol}${roundPrice(sl)} with ${resolvedTicker} ${roundPrice(sl)} CE. Max loss: ${currencySymbol}${roundPrice(sl - cp)}/share.`;
      output.confidence = Math.round(consensus.calibratedProb * 100);
      (output as any).waitReasons = undefined;
    }

    if (output.action !== "WAIT") {
      const calibratedPct = Math.round(consensus.calibratedProb * 100);
      output.confidence = Math.min(Number(output.confidence) || calibratedPct, calibratedPct + 5);
    }
    output.consensus = consensus.consensusLabel;
    (output as any).providersUsed = consensus.engineCount;
    (output as any).ensemble = consensus;

    // ── 7. QUANT EDGE & EXPECTED PROFIT COMPUTATION ───────────────────
    {
      const act = String(output.action);
      const cp = snap.currentPrice;
      const entryMid = (Number(output.entryLow) + Number(output.entryHigh)) / 2 || cp;
      const tgt = Number(output.targetPrice) || cp;
      const stp = Number(output.stopLoss) || cp;
      const p = consensus.calibratedProb;
      const tailMult = consensus.tailMultiplier ?? 1;

      const grossUp = act === "SELL" ? entryMid - tgt : tgt - entryMid;
      const grossDown = act === "SELL" ? stp - entryMid : entryMid - stp;
      const rawUp = Math.max(0, grossUp);
      const rawDown = Math.max(0, grossDown);
      const costPerShare = entryMid * haircut;
      const expectedProfitPerShare = act === "WAIT"
        ? 0
        : p * rawUp - (1 - p) * rawDown * tailMult - costPerShare;
      const expectedProfitPct = entryMid > 0 ? (expectedProfitPerShare / entryMid) * 100 : 0;
      const dirLabelOf = (d: number) => (d === 1 ? "BUY" : d === -1 ? "SELL" : "NEUTRAL");

      (output as any).quantEdge = {
        expectedProfit: {
          perShare: roundPrice(expectedProfitPerShare),
          pct: Number(expectedProfitPct.toFixed(2)),
          currency,
          winProb: Number((p * 100).toFixed(1)),
          expectedR: consensus.expectedR,
          upsidePerShare: roundPrice(rawUp),
          downsidePerShare: roundPrice(rawDown),
          costPerShare: roundPrice(costPerShare),
        },
        meanReversion: cointRaw
          ? {
              benchmark: isIndian ? "NIFTY" : "SPY",
              cointegrated: cointRaw.cointegrated,
              residZ: Number(cointRaw.residZ.toFixed(2)),
              halfLifeDays: Number.isFinite(cointRaw.halfLife) ? Number(cointRaw.halfLife.toFixed(0)) : null,
              beta: Number(cointRaw.beta.toFixed(2)),
              signal: cointEngine ? dirLabelOf(cointEngine.direction) : "NEUTRAL",
              note: cointRaw.cointegrated
                ? `Spread ${cointRaw.residZ > 0 ? "stretched high" : "stretched low"} vs ${isIndian ? "NIFTY" : "SPY"}, reverts toward fair value`
                : `No stable cointegration with ${isIndian ? "NIFTY" : "SPY"}, pure mean-reversion edge absent`,
            }
          : null,
        walkForward: wfRaw && wfRaw.n >= 20
          ? {
              hitRate: Number((wfRaw.hitRate * 100).toFixed(0)),
              meanFwdPct: Number((wfRaw.meanFwd * 100).toFixed(2)),
              fwdSharpe: Number(wfRaw.fwdSharpe.toFixed(2)),
              sample: wfRaw.n,
              horizonDays: 5,
              signal: wfEngine ? dirLabelOf(wfEngine.direction) : "NEUTRAL",
            }
          : null,
        structuralCredit: mertonRaw
          ? {
              distanceToDefault: mertonRaw.dd,
              impliedPD: Number((mertonRaw.pd * 100).toFixed(1)),
              severity: mertonRaw.severity,
              signal: dirLabelOf(mertonRaw.signal),
            }
          : null,
        fatTails: {
          skew: Number(momentSkew.toFixed(2)),
          excessKurtosis: Number(momentKurt.toFixed(2)),
          tailMultiplier: Number(tailMult.toFixed(2)),
          note: tailMult > 1.2
            ? "Left tail heavier than normal, downside penalised in expected value"
            : "Tail risk near-normal",
        },
        hedge: act === "WAIT"
          ? { needed: false, instruction: "No position, no hedge required." }
          : {
              needed: true,
              instruction: String(output.protection),
              riskPerShare: roundPrice(rawDown),
              var95PerShare: riskMetrics.var95,
              cvar95PerShare: riskMetrics.cvar95,
              suggestedStopLoss: roundPrice(stp),
              kellyFraction: riskMetrics.kellyFraction,
            },
      };
    }

    // ── 8. MODEL REGISTRY & AUDIT PROVENANCE ──────────────────────────
    (output as any).model = modelInfo("direct-profit");
    (output as any).probabilityProvenance = {
      basis: consensus.probBasis,
      meaning: "hand-set prior Platt map of (ensemble score, agreement), a model score on a probability scale, not an empirically calibrated frequency",
      reliability: reliabilityReport,
    };

    if (output.action !== "WAIT") {
      logSignalOutcome({
        source: "direct-profit",
        ticker: resolvedTicker,
        tickerClass: tickerClass(resolvedTicker),
        regime: vix > 30 ? "crisis" : vix > 22 ? "elevated" : vix > 15 ? "normal" : "calm",
        action: String(output.action),
        ensembleScore: consensus.ensembleScore,
        agreement: consensus.agreement,
        calibratedProb: consensus.calibratedProb,
        expectedR: consensus.expectedR,
        bucketADir: consensus.bucketDirs.A,
        bucketBDir: consensus.bucketDirs.B,
        bucketCDir: consensus.bucketDirs.C,
        engines: engineSignals.map((s) => ({ id: s.id, direction: s.direction, confidence: Number(s.confidence.toFixed(2)) })),
        entryPrice: snap.currentPrice,
        targetPrice: Number(output.targetPrice) || null,
        stopLoss: Number(output.stopLoss) || null,
        costHaircut: haircut,
      }).catch(() => {});
    }

    return new Response(JSON.stringify(output), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("direct-profit error:", err);
    return new Response(JSON.stringify({ error: err.message || "Analysis failed" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
