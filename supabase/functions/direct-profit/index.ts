const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

import { callAIParallel } from "../_shared/callAI.ts";
import { buildTickerCandidates, isIndianTicker, normalizeTickerInput } from "../_shared/ticker.ts";

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

const PRICE_SANITY: Record<string, { min: number; max: number }> = {
  "SBIN.NS": { min: 200, max: 2000 }, "SBIN.BO": { min: 200, max: 2000 },
  "RELIANCE.NS": { min: 500, max: 5000 }, "RELIANCE.BO": { min: 500, max: 5000 },
  "TCS.NS": { min: 1000, max: 8000 }, "TCS.BO": { min: 1000, max: 8000 },
  "INFY.NS": { min: 500, max: 3000 }, "INFY.BO": { min: 500, max: 3000 },
  "HDFCBANK.NS": { min: 500, max: 3000 }, "HDFCBANK.BO": { min: 500, max: 3000 },
  "ICICIBANK.NS": { min: 300, max: 2500 }, "ICICIBANK.BO": { min: 300, max: 2500 },
  "TATAMOTORS.NS": { min: 100, max: 1500 }, "TATAMOTORS.BO": { min: 100, max: 1500 },
  "ITC.NS": { min: 100, max: 1000 }, "ITC.BO": { min: 100, max: 1000 },
  "KOTAKBANK.NS": { min: 500, max: 3000 }, "KOTAKBANK.BO": { min: 500, max: 3000 },
  "BHARTIARTL.NS": { min: 400, max: 3000 }, "BHARTIARTL.BO": { min: 400, max: 3000 },
  "BAJFINANCE.NS": { min: 2000, max: 15000 }, "BAJFINANCE.BO": { min: 2000, max: 15000 },
  "MARUTI.NS": { min: 3000, max: 20000 }, "MARUTI.BO": { min: 3000, max: 20000 },
  "LT.NS": { min: 1000, max: 6000 }, "LT.BO": { min: 1000, max: 6000 },
  "TATASTEEL.NS": { min: 50, max: 500 }, "TATASTEEL.BO": { min: 50, max: 500 },
  "SUNPHARMA.NS": { min: 400, max: 3000 }, "SUNPHARMA.BO": { min: 400, max: 3000 },
  "TITAN.NS": { min: 1000, max: 6000 }, "TITAN.BO": { min: 1000, max: 6000 },
  "HINDUNILVR.NS": { min: 1000, max: 5000 }, "HINDUNILVR.BO": { min: 1000, max: 5000 },
  "MRF.NS": { min: 50000, max: 200000 }, "MRF.BO": { min: 50000, max: 200000 },
  "AAPL": { min: 80, max: 400 },
  "MSFT": { min: 150, max: 700 },
  "GOOGL": { min: 50, max: 300 },
  "AMZN": { min: 50, max: 400 },
  "TSLA": { min: 50, max: 600 },
  "NVDA": { min: 30, max: 300 },
  "META": { min: 100, max: 1000 },
  "BTC-USD": { min: 10000, max: 500000 },
  "ETH-USD": { min: 500, max: 50000 },
};

function passesSanityCheck(symbol: string, price: number): boolean {
  const check = PRICE_SANITY[symbol];
  if (!check) return true;
  return price >= check.min && price <= check.max;
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
          if (!passesSanityCheck(symbol, meta.regularMarketPrice)) continue;
          result = {
            currentPrice: meta.regularMarketPrice,
            prevClose: meta.chartPreviousClose || meta.previousClose || 0,
            dayHigh: meta.regularMarketDayHigh || 0,
            dayLow: meta.regularMarketDayLow || 0,
            volume: meta.regularMarketVolume || 0,
            fiftyTwoWeekHigh: meta.fiftyTwoWeekHigh || 0,
            fiftyTwoWeekLow: meta.fiftyTwoWeekLow || 0,
            currency: isIndian ? "INR" : meta.currency || "USD",
            closes: (raw?.indicators?.quote?.[0]?.close || []).filter((v: any) => v != null),
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
          if (!passesSanityCheck(symbol, p)) continue;
          result = {
            currentPrice: p,
            prevClose: pm?.regularMarketPreviousClose?.raw || 0,
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
      if (av && av.price > 0 && passesSanityCheck(symbol, av.price)) {
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
      if (titles.length >= 5) break;
      const t = m[1].trim();
      if (t && !t.startsWith("Google News") && t.length > 10) titles.push(t);
    }
    // Fallback: plain <title>
    if (titles.length === 0) {
      const plainMatches = xml.matchAll(/<title>(.*?)<\/title>/g);
      for (const m of plainMatches) {
        if (titles.length >= 5) break;
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

  const returns20d: number[] = [];
  for (let i = 1; i < prices20d.length; i++) {
    if (prices20d[i - 1] > 0) returns20d.push((prices20d[i] - prices20d[i - 1]) / prices20d[i - 1]);
  }
  const meanReturn = returns20d.length > 0 ? returns20d.reduce((a, b) => a + b, 0) / returns20d.length : 0;
  const variance = returns20d.length > 0 ? returns20d.reduce((a, b) => a + (b - meanReturn) ** 2, 0) / returns20d.length : 0;
  const dailyVolRaw = Math.sqrt(variance);
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

/** Compute VaR, CVaR, Sharpe, Sortino, Max Drawdown, Kelly from historical closes */
function computeRiskMetrics(snap: MarketSnapshot, tech: TechnicalSnapshot, vix: number): RiskMetrics {
  const closes = snap.closes;
  const returns: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    if (closes[i - 1] > 0) returns.push((closes[i] - closes[i - 1]) / closes[i - 1]);
  }

  if (returns.length < 3) {
    // Not enough data — estimate from annualized vol
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

  const sorted = [...returns].sort((a, b) => a - b);
  const n = sorted.length;

  // VaR: percentile of losses
  const idx95 = Math.max(0, Math.floor(n * 0.05) - 1);
  const idx99 = Math.max(0, Math.floor(n * 0.01) - 1);
  const var95Pct = Math.abs(sorted[idx95]);
  const var99Pct = Math.abs(sorted[idx99]);

  // CVaR: average of returns below VaR threshold
  const tailCount = Math.max(1, Math.ceil(n * 0.05));
  const tailSum = sorted.slice(0, tailCount).reduce((s, v) => s + v, 0);
  const cvar95Pct = Math.abs(tailSum / tailCount);

  const notional = snap.currentPrice;

  // Sharpe ratio (annualized, risk-free ≈ 4.5%)
  const meanReturn = returns.reduce((s, v) => s + v, 0) / n;
  const stdDev = Math.sqrt(returns.reduce((s, v) => s + (v - meanReturn) ** 2, 0) / n);
  const annualReturn = meanReturn * 252;
  const annualStd = stdDev * Math.sqrt(252);
  const riskFreeRate = 0.045;
  const sharpeRatio = annualStd > 0 ? Number(((annualReturn - riskFreeRate) / annualStd).toFixed(2)) : 0;

  // Sortino ratio (downside deviation only)
  const negReturns = returns.filter(r => r < 0);
  const downsideVar = negReturns.length > 0
    ? negReturns.reduce((s, v) => s + v ** 2, 0) / negReturns.length
    : 0;
  const downsideDev = Math.sqrt(downsideVar) * Math.sqrt(252);
  const sortinoRatio = downsideDev > 0 ? Number(((annualReturn - riskFreeRate) / downsideDev).toFixed(2)) : 0;

  // Max drawdown from closes
  let peak = closes[0];
  let maxDD = 0;
  for (const p of closes) {
    if (p > peak) peak = p;
    const dd = (peak - p) / peak;
    if (dd > maxDD) maxDD = dd;
  }

  // Beta estimate from VIX proxy
  const betaEstimate = vix > 0
    ? Number(clamp(1 + (tech.annualizedVol - 20) / 40, 0.3, 2.5).toFixed(2))
    : 1;

  // Kelly fraction: f* = (p*b - q) / b  where p=win rate, b=avg win/avg loss
  const wins = returns.filter(r => r > 0);
  const losses = returns.filter(r => r < 0);
  const winRate = wins.length / Math.max(n, 1);
  const avgWin = wins.length > 0 ? wins.reduce((s, v) => s + v, 0) / wins.length : 0;
  const avgLoss = losses.length > 0 ? Math.abs(losses.reduce((s, v) => s + v, 0) / losses.length) : 1;
  const b = avgLoss > 0 ? avgWin / avgLoss : 1;
  const kellyFraction = b > 0 ? Number(clamp((winRate * b - (1 - winRate)) / b, 0, 0.5).toFixed(2)) : 0;

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

function buildDeterministicFallback(
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
) {
  const bullishSignals: string[] = [];
  const bearishSignals: string[] = [];

  if (tech.momentumScore >= 2) bullishSignals.push("strong momentum");
  if (tech.momentumScore <= -2) bearishSignals.push("weak momentum");
  if (snap.currentPrice > tech.sma20) bullishSignals.push("price above 20-day average");
  if (snap.currentPrice < tech.sma20) bearishSignals.push("price below 20-day average");
  if (tech.zScore <= -1.2) bullishSignals.push("oversold mean reversion");
  if (tech.zScore >= 1.2) bearishSignals.push("overbought extension");
  if (tech.changePct >= 2) bullishSignals.push("positive daily follow-through");
  if (tech.changePct <= -2) bearishSignals.push("negative daily pressure");
  if (tech.volumeRatio >= 1.15) {
    if (bullishSignals.length >= bearishSignals.length) bullishSignals.push("volume confirmation");
    else bearishSignals.push("volume confirmation");
  }
  if (tech.volumeRatio < 0.75) bearishSignals.push("thin participation");
  if (vix >= 25) bearishSignals.push("risk-off backdrop");

  // CLANK-derived signals
  const criticalClank = clankSignals.filter(s => s.severity === "CRITICAL");
  if (criticalClank.length > 0) bearishSignals.push("structural constraint active");

  const bullScore = bullishSignals.length;
  const bearScore = bearishSignals.length;
  const scoreDiff = bullScore - bearScore;

  const directionalEdge = Math.max(bullScore, bearScore);
  const action = scoreDiff >= 1 && bullScore >= 2
    ? "BUY"
    : scoreDiff <= -1 && bearScore >= 2
      ? "SELL"
      : "WAIT";
  const direction = action === "BUY" ? "UP" : action === "SELL" ? "DOWN" : scoreDiff > 0 ? "UP" : scoreDiff < 0 ? "DOWN" : "SIDEWAYS";
  const volatilityRegime = deriveVolatilityRegime(tech.annualizedVol);

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

  const confidenceBase = action === "WAIT" ? 40 : 54;
  const confidence = clamp(
    Math.round(confidenceBase + directionalEdge * 5 - Math.max(0, Math.min(bullScore, bearScore)) * 3 - (tech.volumeRatio < 0.75 ? 5 : 0) - (vix >= 28 ? 4 : 0)),
    34,
    80,
  );
  const quantScore = clamp(Math.round(42 + directionalEdge * 9 - Math.min(bullScore, bearScore) * 3), 35, 84);

  const strongestBull = bullishSignals[0] || `Stable ${market} setup`;
  const strongestBear = bearishSignals[0] || "No major downside catalyst";
  const directionReason = action === "BUY"
    ? strongestBull
    : action === "SELL"
      ? strongestBear
      : bullScore === bearScore
        ? "Signals are mixed"
        : bullScore > bearScore
          ? strongestBull
          : strongestBear;

  return {
    action,
    confidence,
    currency,
    entryLow: roundPrice(entryLow),
    entryHigh: roundPrice(entryHigh),
    targetPrice: roundPrice(targetPrice),
    stopLoss: roundPrice(stopLoss),
    timeframe: volatilityRegime === "HIGH" ? "2-5 days" : "1-3 weeks",
    direction,
    directionReason: directionReason.slice(0, 60),
    positiveNews: (bullScore > 0 ? strongestBull : `No clear upside catalyst in ${currency}`).slice(0, 120),
    negativeNews: (bearScore > 0 ? strongestBear : "No clear downside catalyst").slice(0, 120),
    protection: action === "WAIT"
      ? "Wait for a cleaner setup before taking risk."
      : action === "BUY"
        ? `${resolvedTicker} ${roundPrice(stopLoss)} PE as hedge. Trail stop at ${currencySymbol}${roundPrice(stopLoss)}. Risk per share: ${currencySymbol}${roundPrice(snap.currentPrice - stopLoss)}.`
        : `Cover above ${currencySymbol}${roundPrice(stopLoss)} with ${resolvedTicker} ${roundPrice(stopLoss)} CE. Max loss: ${currencySymbol}${roundPrice(stopLoss - snap.currentPrice)}/share.`,
    currentPrice: roundPrice(snap.currentPrice),
    quantScore,
    volatilityRegime,
    riskRewardRatio: action === "WAIT" ? 0 : Number(Math.abs(riskRewardRatio).toFixed(2)),
    riskMetrics,
    clankSignals,
    newsHeadlines: newsHeadlines.slice(0, 5),
  };
}

function sanitizeOutput(best: any, snap: MarketSnapshot, tech: TechnicalSnapshot, parsedCount: number, consensusCount: number, riskMetrics: RiskMetrics, clankSignals: ClankSignal[], newsHeadlines: string[], deterministic: ReturnType<typeof buildDeterministicFallback>) {
  const action = ["BUY", "SELL", "WAIT"].includes(best?.action) ? best.action : "WAIT";
  const realPrice = roundPrice(snap.currentPrice);
  const volatilityRegime = ["LOW", "NORMAL", "HIGH"].includes(best?.volatilityRegime)
    ? best.volatilityRegime
    : deriveVolatilityRegime(tech.annualizedVol);

  const aiConfidence = Math.round(Number(best?.confidence) || 50);
  
  let signalFloor = 40;
  if (action !== "WAIT") {
    const absMomentum = Math.abs(tech.momentumScore);
    const absZ = Math.abs(tech.zScore);
    const volConfirm = tech.volumeRatio >= 1.1;
    
    if (absMomentum >= 3) signalFloor = 68;
    else if (absMomentum >= 2) signalFloor = 58;
    else if (absMomentum >= 1) signalFloor = 48;
    
    if (absZ >= 1.5) signalFloor += 8;
    else if (absZ >= 0.8) signalFloor += 4;
    if (volConfirm) signalFloor += 5;
    if (tech.annualizedVol < 20) signalFloor += 3;
    if (tech.annualizedVol > 45) signalFloor -= 8;

    // CLANK penalty: active critical constraints reduce confidence
    const critCount = clankSignals.filter(s => s.severity === "CRITICAL").length;
    const highCount = clankSignals.filter(s => s.severity === "HIGH").length;
    signalFloor -= critCount * 6 + highCount * 3;
  } else {
    signalFloor = 30;
  }
  
  let confidence = Math.max(aiConfidence, signalFloor);
  confidence = clamp(confidence, action === "WAIT" ? 25 : 35, 92);
  
  if (parsedCount > 1) {
    if (consensusCount === parsedCount) confidence = clamp(confidence + 5, 25, 92);
    else if (consensusCount > parsedCount / 2) confidence = clamp(confidence + 3, 25, 92);
    else confidence = clamp(confidence - 3, 25, 88);
  }

  let entryLow = Number(deterministic.entryLow);
  let entryHigh = Number(deterministic.entryHigh);
  let targetPrice = Number(deterministic.targetPrice);
  let stopLoss = Number(deterministic.stopLoss);

  const midEntry = (entryLow + entryHigh) / 2;
  const riskRewardRatio = action === "BUY"
    ? (targetPrice - midEntry) / Math.max(midEntry - stopLoss, 0.01)
    : action === "SELL"
      ? (midEntry - targetPrice) / Math.max(stopLoss - midEntry, 0.01)
      : 0;

  const output: Record<string, unknown> = {
    action,
    confidence,
    currency: snap.currency || "USD",
    entryLow: roundPrice(entryLow),
    entryHigh: roundPrice(entryHigh),
    targetPrice: roundPrice(targetPrice),
    stopLoss: roundPrice(stopLoss),
     timeframe: typeof best?.timeframe === "string" && best.timeframe.trim() ? best.timeframe.slice(0, 40) : String(deterministic.timeframe),
    direction: ["UP", "DOWN", "SIDEWAYS"].includes(best?.direction) ? best.direction : action === "BUY" ? "UP" : action === "SELL" ? "DOWN" : "SIDEWAYS",
     directionReason: (typeof best?.directionReason === "string" && best.directionReason.trim() ? best.directionReason : String(deterministic.directionReason)).slice(0, 60),
    positiveNews: (typeof best?.positiveNews === "string" && best.positiveNews.trim() ? best.positiveNews : "No significant positive catalyst").slice(0, 120),
    negativeNews: (typeof best?.negativeNews === "string" && best.negativeNews.trim() ? best.negativeNews : "No significant downside catalyst").slice(0, 120),
     protection: (typeof best?.protection === "string" && best.protection.trim() ? best.protection : String(deterministic.protection)).slice(0, 120),
    currentPrice: realPrice,
     quantScore: Number(deterministic.quantScore),
    volatilityRegime,
    riskRewardRatio: action === "WAIT" ? 0 : Number(Math.abs(riskRewardRatio).toFixed(2)),
    providersUsed: parsedCount,
    riskMetrics,
    clankSignals,
    newsHeadlines: newsHeadlines.slice(0, 5),
  };

  if (parsedCount > 1) {
    output.consensus = consensusCount === parsedCount ? "UNANIMOUS" : consensusCount > 1 ? "MAJORITY" : "SPLIT";
  }

  return output;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { ticker, indiaMode } = await req.json();
    if (!ticker || typeof ticker !== "string") {
      return new Response(JSON.stringify({ error: "ticker required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const resolvedTicker = normalizeTickerInput(ticker.trim());
    const isIndian = indiaMode === true || isIndianTicker(resolvedTicker);
    const market = isIndian ? "India (NSE/BSE)" : "US/Global";

    const [snap, vix, newsHeadlines] = await Promise.all([
      fetchFullSnapshot(resolvedTicker, isIndian),
      fetchVIX(),
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
    const riskMetrics = computeRiskMetrics(snap, tech, vix);
    const clankSignals = detectClankSignals(snap, tech, vix);

    // ── INTELLIGENCE CONSENSUS ──────────────────────────────────────────
    // Call the dashboard's analyze-stock function FIRST so Direct Profit's
    // verdict is anchored on the same multi-factor intelligence summary the
    // user sees when they open the stock in the dashboard. This guarantees
    // the two views can no longer contradict each other.
    let intelSummary: any = null;
    try {
      const supabaseUrl = Deno.env.get("SUPABASE_URL");
      const authHeader = req.headers.get("authorization");
      if (supabaseUrl && authHeader) {
        // Hard timeout so a slow/rate-limited analyze-stock can never
        // bring down the Direct Profit response. 25s leaves ~35s budget
        // for our own Mistral call within the edge function deadline.
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 25000);
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
            console.warn(`direct-profit: intelligence call failed ${intelRes.status}`);
          }
        } catch (e) {
          console.warn(`direct-profit: intelligence call aborted/failed: ${(e as Error).message}`);
        } finally {
          clearTimeout(timer);
        }
      }
    } catch (e) {
      console.warn("direct-profit: intelligence call threw", (e as Error).message);
    }

    const intelContext = intelSummary
      ? `\n\nINTELLIGENCE CONSENSUS (dashboard analyze-stock — MUST anchor your action):\n` +
        `- Suggestion: ${intelSummary.suggestion} (${intelSummary.confidence}% conf)\n` +
        `- Verdict: ${intelSummary.verdict}\n` +
        `- Trend: ${intelSummary.technicals?.trend} | RSI: ${intelSummary.technicals?.rsi} | Regime: ${intelSummary.regime}\n` +
        `- Risk Score: ${intelSummary.riskScore}/100 (${intelSummary.riskLevel})\n` +
        `- Bull Range: ${currencySymbol}${intelSummary.bullRange?.[0]}-${currencySymbol}${intelSummary.bullRange?.[1]}\n` +
        `- Bear Range: ${currencySymbol}${intelSummary.bearRange?.[0]}-${currencySymbol}${intelSummary.bearRange?.[1]}\n` +
        `- Sentiment: ${intelSummary.overallSentiment} | News pressure: ${intelSummary.totalPressure}%\n` +
        `- Key Risks: ${(intelSummary.keyRisks || []).slice(0, 3).join(" | ")}\n` +
        `RULES:\n` +
        `• If suggestion is "Exit" → action MUST be SELL or WAIT (never BUY).\n` +
        `• If suggestion is "Add" → action MUST be BUY or WAIT (never SELL).\n` +
        `• If suggestion is "Hold" or "Skip" → action MUST be WAIT unless your own data is overwhelming.\n` +
        `• Your verdict text must NOT contradict the intelligence verdict.`
      : "";

    console.log(`direct-profit snapshot: ${resolvedTicker} ${snap.currentPrice} ${currency} | momentum=${tech.momentumScore} | z=${tech.zScore} | vol=${tech.annualizedVol} | vix=${vix} | VaR95=${riskMetrics.var95} | Sharpe=${riskMetrics.sharpeRatio} | CLANK=${clankSignals.length}`);

    const quantContext = isIndian
      ? `Indian market context:\n- NSE/BSE listed, all prices in ${currency}\n- Reference NIFTY 50 and SENSEX as benchmarks\n- Consider FII/DII flow patterns, RBI policy stance, INR strength\n- Weekly NIFTY options expiry on Thursday\n- CRITICAL: Protection MUST be specific to ${resolvedTicker} — use ${resolvedTicker} PUT options at specific strikes derived from support/stop-loss levels, or tight trailing stops. NEVER suggest generic "Nifty puts" unless the ticker IS Nifty. Include strike price, expiry guidance, and position size context.`
      : `Global market context:\n- Asset prices are quoted in ${currency}\n- Reference major regional benchmarks and volatility context\n- Consider institutional flow, macro regime, and index leadership\n- CRITICAL: Protection MUST be specific to ${resolvedTicker} — use ${resolvedTicker} PUT options at specific strikes near stop-loss, or collar strategies with the stock's own options. Include strike price and expiry guidance. NEVER give vague advice.`;

    const clankContext = clankSignals.length > 0
      ? `\n\nACTIVE STRUCTURAL CONSTRAINTS (CLANK Engine):\n${clankSignals.map(s => `- [${s.severity}] ${s.label}: ${s.description}`).join("\n")}\nFactor these institutional flow constraints into your confidence and action.`
      : "";

    const newsContext = newsHeadlines.length > 0
      ? `\n\nRECENT NEWS HEADLINES:\n${newsHeadlines.map((h, i) => `${i + 1}. ${h}`).join("\n")}\nIncorporate sentiment from these headlines into positiveNews/negativeNews fields.`
      : "";

    const riskContext = `\n\nQUANTITATIVE RISK METRICS (computed from real returns):\n- 1-Day VaR (95%): ${currencySymbol}${riskMetrics.var95} per share\n- 1-Day CVaR (95%): ${currencySymbol}${riskMetrics.cvar95} per share\n- 1-Day VaR (99%): ${currencySymbol}${riskMetrics.var99} per share\n- Sharpe Ratio (annualized): ${riskMetrics.sharpeRatio}\n- Sortino Ratio: ${riskMetrics.sortinoRatio}\n- Max Drawdown (30D): ${riskMetrics.maxDrawdown}%\n- Beta Estimate: ${riskMetrics.betaEstimate}\n- Kelly Fraction: ${riskMetrics.kellyFraction}\nUse these to calibrate your confidence level — low Sharpe + high VaR = lower confidence, etc.`;

    const systemPrompt = `You are an institutional-grade quantitative trading decision engine. Respond with ONLY valid JSON, no markdown.\n\nThis is Direct Profit Mode — output must be ultra-simple for the user, but reasoning must use full institutional logic including VaR, CVaR, Sharpe ratio, structural constraints, and news sentiment.\n\nYou have REAL market data AND computed risk metrics below. Ground every number in that data.\n\nDecision framework:\n1. Momentum and moving-average alignment\n2. Volatility regime and VIX/macro backdrop\n3. VaR/CVaR risk assessment — high VaR relative to target = reduce confidence\n4. Sharpe/Sortino quality — negative Sharpe = WAIT unless strong reversal signal\n5. CLANK structural constraints — active constraints bias toward caution\n6. Support/resistance and position within 52-week range\n7. Volume conviction\n8. Mean reversion from 20-day average\n9. News sentiment integration\n10. Kelly fraction for position sizing context\n11. Intelligence consensus (analyze-stock suggestion) — your action MUST be consistent with it.\n\nConfidence calibration (CRITICAL):\n- confidence represents signal alignment + risk-adjusted edge\n- Momentum 3/3 + volume + Sharpe>1 + no CLANK = confidence 70-85\n- Momentum 2/3 + decent Sharpe + minor CLANK = confidence 50-65\n- Mixed signals OR negative Sharpe OR critical CLANK = confidence 35-50\n- Genuinely conflicting = WAIT at 25-40\n- NEVER return confidence below 35 for BUY/SELL\n- ALL prices MUST remain in the provided currency\n\nPROTECTION FIELD (CRITICAL):\n- MUST be specific to the ticker being analyzed — use the STOCK's OWN options (e.g., "${resolvedTicker} 780 PE" not "Nifty Put")\n- Include a specific strike price derived from the stop-loss or support level\n- Include risk per share in currency terms\n- For BUY: suggest a PUT at/near stop-loss strike as downside hedge\n- For SELL: suggest covering with a CALL at/near stop-loss strike\n- For WAIT: state "no position, no hedge needed"\n- NEVER suggest generic index hedges unless the ticker itself is an index\n\n${quantContext}${clankContext}${newsContext}${riskContext}${intelContext}\n\nJSON schema:\n{\n  "action": "BUY" | "SELL" | "WAIT",\n  "confidence": number,\n  "currency": string,\n  "entryLow": number,\n  "entryHigh": number,\n  "targetPrice": number,\n  "stopLoss": number,\n  "timeframe": string,\n  "direction": "UP" | "DOWN" | "SIDEWAYS",\n  "directionReason": string (under 8 words),\n  "positiveNews": string (incorporate real headlines),\n  "negativeNews": string (incorporate real headlines),\n  "protection": string (MUST be stock-specific with strike price and risk per share),\n  "currentPrice": number,\n  "quantScore": number,\n  "volatilityRegime": "LOW" | "NORMAL" | "HIGH",\n  "riskRewardRatio": number\n}`;

    const userPrompt = `Ticker: ${resolvedTicker}\nMarket: ${market}\nCurrency: ${currency} (ALL prices must stay in this currency)\nDate: ${new Date().toISOString().split("T")[0]}\n\nREAL DATA:\n- Current Price: ${currencySymbol}${snap.currentPrice}\n- Previous Close: ${currencySymbol}${snap.prevClose}\n- Day Range: ${currencySymbol}${snap.dayLow} - ${currencySymbol}${snap.dayHigh}\n- Day Change: ${tech.changePct}%\n- Volume: ${snap.volume.toLocaleString()} (${tech.volumeRatio}x average)\n- 52W High: ${currencySymbol}${snap.fiftyTwoWeekHigh}\n- 52W Low: ${currencySymbol}${snap.fiftyTwoWeekLow}\n- Position in 52W Range: ${tech.posIn52w}%\n- SMA 5: ${currencySymbol}${tech.sma5}\n- SMA 20: ${currencySymbol}${tech.sma20}\n- Momentum Score: ${tech.momentumScore}/3\n- Annualized Volatility: ${tech.annualizedVol}%\n- Z-Score: ${tech.zScore}\n- Support: ${currencySymbol}${tech.support}\n- Resistance: ${currencySymbol}${tech.resistance}\n- VIX: ${vix > 0 ? vix.toFixed(1) : "N/A"}\n- Last 5 closes: ${tech.prices5d.map((p) => p.toFixed(2)).join(", ") || "N/A"}\n\nRISK METRICS:\n- VaR 95%: ${currencySymbol}${riskMetrics.var95}/share | CVaR 95%: ${currencySymbol}${riskMetrics.cvar95}/share\n- VaR 99%: ${currencySymbol}${riskMetrics.var99}/share\n- Sharpe: ${riskMetrics.sharpeRatio} | Sortino: ${riskMetrics.sortinoRatio}\n- Max DD: ${riskMetrics.maxDrawdown}% | Beta: ${riskMetrics.betaEstimate}\n- Kelly: ${riskMetrics.kellyFraction}\n\n${clankSignals.length > 0 ? "STRUCTURAL CONSTRAINTS:\n" + clankSignals.map(s => `[${s.severity}] ${s.label}`).join("\n") : "No active structural constraints."}\n\n${newsHeadlines.length > 0 ? "RECENT NEWS:\n" + newsHeadlines.map((h, i) => `${i + 1}. ${h}`).join("\n") : "No recent headlines available."}\n\nProduce a complete, executable trade decision grounded in ALL the data above.`;

    const deterministic = buildDeterministicFallback(snap, tech, currency, market, vix, riskMetrics, clankSignals, newsHeadlines, resolvedTicker, currencySymbol);

    const results = await callAIParallel({
      systemPrompt,
      userPrompt,
      maxTokens: 1800,
      temperature: 0.25,
      jsonMode: true,
    });

    const parsed: any[] = [];
    for (const result of results) {
      try {
        let obj: any;
        try { obj = JSON.parse(result.text); } catch {
          const match = result.text.match(/\{[\s\S]*\}/);
          if (match) obj = JSON.parse(match[0]);
        }
        if (obj && obj.action) {
          obj._provider = result.provider;
          obj.currency = currency;
          obj.currentPrice = snap.currentPrice;
          parsed.push(obj);
        }
      } catch {
        console.warn(`direct-profit parse failed for ${result.provider}`);
      }
    }

    let output: Record<string, unknown>;

    if (parsed.length === 0) {
      console.warn(`direct-profit fallback engaged for ${resolvedTicker}`);
        output = { ...deterministic, fallback: true };
    } else {
      const actionVotes: Record<string, number> = { BUY: 0, SELL: 0, WAIT: 0 };
      for (const item of parsed) {
        if (actionVotes[item.action] !== undefined) actionVotes[item.action]++;
      }

      const scored = parsed.map((item) => {
        const confidence = Number(item.confidence) || 0;
        const quantScore = Number(item.quantScore) || 0;
        const rr = Number(item.riskRewardRatio) || 0;
        const directionalBonus = item.action === "WAIT" ? 0 : 8;
        return {
          ...item,
          _score: confidence + quantScore * 0.35 + Math.min(rr, 4) * 6 + directionalBonus,
        };
      });

      const [consensusAction, consensusCount] = Object.entries(actionVotes).sort((a, b) => b[1] - a[1])[0];
      const majorityExists = consensusCount > parsed.length / 2;
      const best = majorityExists
        ? scored
            .filter((item) => item.action === consensusAction)
            .sort((a, b) => b._score - a._score)[0]
        : scored.sort((a, b) => b._score - a._score)[0];

      output = sanitizeOutput(best, snap, tech, parsed.length, consensusCount, riskMetrics, clankSignals, newsHeadlines, deterministic);
    }

    // ── MASTER ARBITER ──────────────────────────────────────────────────
    // The dashboard intelligence (analyze-stock) is the single source of
    // truth for direction. Direct Profit's job is to translate that verdict
    // into an executable ticket — never to contradict it. Map suggestion
    // → action deterministically, then rebuild prices for the forced side.
    if (intelSummary?.suggestion) {
      const sug = String(intelSummary.suggestion);
      const aiAct = String(output.action);
      // Arbiter rules:
      //  • "Add"  → force BUY  (intel is bullish enough to act)
          //  • "Exit" → force SELL (intel says get out)
          //  • "Skip" → force WAIT (intel explicitly says avoid)
          //  • "Hold" → DO NOT force WAIT. Hold means "no fresh conviction
          //             from the dashboard", but Direct Profit is a tactical
          //             engine — if the deterministic/AI side has a clean
          //             technical edge (momentum + R:R), let it fire.
      const forcedAction: "BUY" | "SELL" | "WAIT" | null =
        sug === "Add" ? "BUY"
        : sug === "Exit" ? "SELL"
        : sug === "Skip" ? "WAIT"
        : null; // Hold → no override

      if (forcedAction && forcedAction !== aiAct) {
        console.log(`direct-profit arbiter: AI=${aiAct} → ${forcedAction} (intel=${sug})`);
        // Rebuild a deterministic plan for the FORCED side so the entry,
        // target, stop and R:R all line up with the new action.
        const sideDet = buildDeterministicFallback(
          { ...snap, currentPrice: snap.currentPrice }, tech, currency, market, vix,
          riskMetrics, clankSignals, newsHeadlines, resolvedTicker, currencySymbol,
        );
        // Override the deterministic action by directly recomputing prices
        // for the forced direction using the same widths.
        const cp = snap.currentPrice;
        const entryWidth = Math.max(0.006, Math.min(0.02, tech.dailyVol / 100));
        const targetWidth = Math.max(0.018, Math.min(0.08, entryWidth * 2.4));
        const stopWidth = Math.max(0.012, Math.min(0.04, entryWidth * 1.2));
        let eL = cp, eH = cp, tg = cp, sl = cp, rr = 0;
        if (forcedAction === "BUY") {
          eL = cp * (1 - entryWidth); eH = cp * (1 + entryWidth * 0.35);
          tg = Math.max(cp * (1 + targetWidth), tech.resistance || 0);
          sl = Math.min(cp * (1 - stopWidth), tech.support || cp * (1 - stopWidth));
          rr = (tg - (eL + eH) / 2) / Math.max((eL + eH) / 2 - sl, 0.01);
        } else if (forcedAction === "SELL") {
          eL = cp * (1 - entryWidth * 0.35); eH = cp * (1 + entryWidth);
          tg = Math.min(cp * (1 - targetWidth), tech.support || cp * (1 - targetWidth));
          sl = Math.max(cp * (1 + stopWidth), tech.resistance || cp * (1 + stopWidth));
          rr = ((eL + eH) / 2 - tg) / Math.max(sl - (eL + eH) / 2, 0.01);
        }

        output.action = forcedAction;
        output.direction = forcedAction === "BUY" ? "UP" : forcedAction === "SELL" ? "DOWN" : "SIDEWAYS";
        output.directionReason = `Intelligence verdict: ${sug}`;
        if (forcedAction === "WAIT") {
          output.entryLow = roundPrice(cp * 0.99);
          output.entryHigh = roundPrice(cp * 1.01);
          output.targetPrice = roundPrice(tech.resistance || cp * 1.02);
          output.stopLoss = roundPrice(tech.support || cp * 0.98);
          output.riskRewardRatio = 0;
          output.protection = "Wait for a cleaner setup before taking risk.";
        } else {
          output.entryLow = roundPrice(eL);
          output.entryHigh = roundPrice(eH);
          output.targetPrice = roundPrice(tg);
          output.stopLoss = roundPrice(sl);
          output.riskRewardRatio = Number(Math.abs(rr).toFixed(2));
          output.protection = forcedAction === "BUY"
            ? `${resolvedTicker} ${roundPrice(sl)} PE as hedge. Trail stop at ${currencySymbol}${roundPrice(sl)}. Risk/share: ${currencySymbol}${roundPrice(cp - sl)}.`
            : `Cover above ${currencySymbol}${roundPrice(sl)} with ${resolvedTicker} ${roundPrice(sl)} CE. Max loss: ${currencySymbol}${roundPrice(sl - cp)}/share.`;
        }
        output.confidence = Math.min(
          Math.max(Number(output.confidence) || 50, Number(intelSummary.confidence) || 50),
          88,
        );
        output.consensus = "ARBITRATED";
        void sideDet; // referenced for future tuning
      }
      // Attach the intelligence snapshot so the UI can render both views.
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

    console.log(`direct-profit result: ${resolvedTicker} → ${output.action} (${output.confidence}%) | VaR95=${riskMetrics.var95} | Sharpe=${riskMetrics.sharpeRatio} | CLANK=${clankSignals.length}`);

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
