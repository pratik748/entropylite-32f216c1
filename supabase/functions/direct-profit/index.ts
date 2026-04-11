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
    if (!res.ok) {
      await res.text();
      return null;
    }
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
  } catch {
    return null;
  }
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

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function roundPrice(value: number) {
  return Number.isFinite(value) ? Number(value.toFixed(2)) : 0;
}

/** Known price floors for major tickers to reject wrong-symbol matches */
const PRICE_SANITY: Record<string, { min: number; max: number }> = {
  // Indian blue chips (INR)
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
  // US majors (USD)
  "AAPL": { min: 80, max: 400 },
  "MSFT": { min: 150, max: 700 },
  "GOOGL": { min: 50, max: 300 },
  "AMZN": { min: 50, max: 400 },
  "TSLA": { min: 50, max: 600 },
  "NVDA": { min: 30, max: 300 },
  "META": { min: 100, max: 1000 },
  // Crypto
  "BTC-USD": { min: 10000, max: 500000 },
  "ETH-USD": { min: 500, max: 50000 },
};

function passesSanityCheck(symbol: string, price: number): boolean {
  const check = PRICE_SANITY[symbol];
  if (!check) return true; // no check = accept
  return price >= check.min && price <= check.max;
}

async function fetchFullSnapshot(ticker: string, isIndian: boolean): Promise<MarketSnapshot | null> {
  const symbolsToTry = buildTickerCandidates(ticker);
  let result: MarketSnapshot | null = null;

  for (const symbol of symbolsToTry) {
    if (result) break;

    try {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1mo&_t=${Date.now()}`;
      const res = await fetch(url, {
        headers: { "User-Agent": UA, "Cache-Control": "no-cache, no-store" },
      });
      if (res.ok) {
        const data = await res.json();
        const raw = data?.chart?.result?.[0];
        const meta = raw?.meta;
        if (meta?.regularMarketPrice && meta.regularMarketPrice > 0) {
          if (!passesSanityCheck(symbol, meta.regularMarketPrice)) {
            console.warn(`direct-profit SANITY FAIL ${symbol}: got ${meta.regularMarketPrice}, rejecting`);
            continue;
          }
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
          console.log(`direct-profit ✓ ${symbol} via v8: ${result.currency} ${result.currentPrice}`);
          break;
        }
      } else {
        await res.text();
      }
    } catch {
      // continue to next fallback
    }

    try {
      const url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=price`;
      const res = await fetch(url, {
        headers: { "User-Agent": UA, "Cache-Control": "no-cache, no-store" },
      });
      if (res.ok) {
        const data = await res.json();
        const pm = data?.quoteSummary?.result?.[0]?.price;
        const p = pm?.regularMarketPrice?.raw;
        if (p && p > 0) {
          if (!passesSanityCheck(symbol, p)) {
            console.warn(`direct-profit SANITY FAIL ${symbol}: got ${p}, rejecting`);
            continue;
          }
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
          console.log(`direct-profit ✓ ${symbol} via v10: ${result.currency} ${result.currentPrice}`);
          break;
        }
      } else {
        await res.text();
      }
    } catch {
      // continue to next fallback
    }
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
        console.log(`direct-profit ✓ ${symbol} via Alpha Vantage: ${result.currency} ${result.currentPrice}`);
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
    if (!res.ok) {
      await res.text();
      return 0;
    }
    const data = await res.json();
    return data?.chart?.result?.[0]?.meta?.regularMarketPrice || 0;
  } catch {
    return 0;
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
        ? `Exit below ${currency} ${roundPrice(stopLoss)} if momentum breaks.`
        : `Cover above ${currency} ${roundPrice(stopLoss)} if the squeeze starts.`,
    currentPrice: roundPrice(snap.currentPrice),
    quantScore,
    volatilityRegime,
    riskRewardRatio: action === "WAIT" ? 0 : Number(Math.abs(riskRewardRatio).toFixed(2)),
  };
}

function sanitizeOutput(best: any, snap: MarketSnapshot, tech: TechnicalSnapshot, parsedCount: number, consensusCount: number) {
  const action = ["BUY", "SELL", "WAIT"].includes(best?.action) ? best.action : "WAIT";
  const realPrice = roundPrice(snap.currentPrice);
  const volatilityRegime = ["LOW", "NORMAL", "HIGH"].includes(best?.volatilityRegime)
    ? best.volatilityRegime
    : deriveVolatilityRegime(tech.annualizedVol);

  let confidence = clamp(Math.round(Number(best?.confidence) || 50), action === "WAIT" ? 20 : 25, 92);
  if (parsedCount > 1) {
    if (consensusCount === parsedCount) confidence = clamp(confidence + 4, 20, 92);
    else if (consensusCount > parsedCount / 2) confidence = clamp(confidence + 2, 20, 92);
    else if (action === "WAIT") confidence = clamp(confidence - 4, 18, 88);
  }

  let entryLow = Number(best?.entryLow);
  let entryHigh = Number(best?.entryHigh);
  let targetPrice = Number(best?.targetPrice);
  let stopLoss = Number(best?.stopLoss);

  if (!Number.isFinite(entryLow)) entryLow = realPrice * 0.985;
  if (!Number.isFinite(entryHigh)) entryHigh = realPrice * 1.01;
  if (entryLow > entryHigh) [entryLow, entryHigh] = [entryHigh, entryLow];

  if (Math.abs(entryLow - realPrice) / Math.max(realPrice, 1) > 0.18) entryLow = realPrice * 0.985;
  if (Math.abs(entryHigh - realPrice) / Math.max(realPrice, 1) > 0.18) entryHigh = realPrice * 1.01;

  if (!Number.isFinite(targetPrice)) {
    targetPrice = action === "SELL" ? realPrice * 0.95 : realPrice * 1.05;
  }
  if (!Number.isFinite(stopLoss)) {
    stopLoss = action === "SELL" ? realPrice * 1.04 : realPrice * 0.96;
  }

  if (action === "BUY") {
    if (targetPrice <= entryHigh) targetPrice = Math.max(realPrice * 1.04, tech.resistance || realPrice * 1.04);
    if (stopLoss >= entryLow) stopLoss = Math.min(realPrice * 0.96, tech.support || realPrice * 0.96);
  } else if (action === "SELL") {
    if (targetPrice >= entryLow) targetPrice = Math.min(realPrice * 0.96, tech.support || realPrice * 0.96);
    if (stopLoss <= entryHigh) stopLoss = Math.max(realPrice * 1.04, tech.resistance || realPrice * 1.04);
  } else {
    targetPrice = tech.resistance || realPrice * 1.02;
    stopLoss = tech.support || realPrice * 0.98;
  }

  const midEntry = (entryLow + entryHigh) / 2;
  const riskRewardRatio = action === "BUY"
    ? (targetPrice - midEntry) / Math.max(midEntry - stopLoss, 0.01)
    : action === "SELL"
      ? (midEntry - targetPrice) / Math.max(stopLoss - midEntry, 0.01)
      : 0;

  const output: Record<string, unknown> = {
    action,
    confidence,
    entryLow: roundPrice(entryLow),
    entryHigh: roundPrice(entryHigh),
    targetPrice: roundPrice(targetPrice),
    stopLoss: roundPrice(stopLoss),
    timeframe: typeof best?.timeframe === "string" && best.timeframe.trim() ? best.timeframe.slice(0, 40) : "1-3 weeks",
    direction: ["UP", "DOWN", "SIDEWAYS"].includes(best?.direction) ? best.direction : action === "BUY" ? "UP" : action === "SELL" ? "DOWN" : "SIDEWAYS",
    directionReason: (typeof best?.directionReason === "string" && best.directionReason.trim() ? best.directionReason : "Signal alignment is mixed").slice(0, 60),
    positiveNews: (typeof best?.positiveNews === "string" && best.positiveNews.trim() ? best.positiveNews : "No significant positive catalyst").slice(0, 120),
    negativeNews: (typeof best?.negativeNews === "string" && best.negativeNews.trim() ? best.negativeNews : "No significant downside catalyst").slice(0, 120),
    protection: (typeof best?.protection === "string" && best.protection.trim() ? best.protection : "Exit if price breaks the stop level.").slice(0, 120),
    currentPrice: realPrice,
    quantScore: clamp(Math.round(Number(best?.quantScore) || 50), 0, 100),
    volatilityRegime,
    riskRewardRatio: action === "WAIT" ? 0 : Number(Math.abs(riskRewardRatio).toFixed(2)),
    providersUsed: parsedCount,
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
    const currency = isIndian ? "INR" : "USD";
    const currencySymbol = isIndian ? "₹" : "$";
    const market = isIndian ? "India (NSE/BSE)" : "US/Global";

    const [snap, vix] = await Promise.all([
      fetchFullSnapshot(resolvedTicker, isIndian),
      fetchVIX(),
    ]);

    if (!snap || snap.currentPrice <= 0) {
      return new Response(JSON.stringify({
        error: `Could not fetch price data for ${resolvedTicker}. Check the ticker symbol and try again.`,
      }), {
        status: 422,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const tech = computeTechnicals(snap);
    console.log(`direct-profit snapshot: ${resolvedTicker} ${snap.currentPrice} ${currency} | momentum=${tech.momentumScore} | z=${tech.zScore} | vol=${tech.annualizedVol} | vix=${vix}`);

    const quantContext = isIndian
      ? `Indian market context:\n- NSE/BSE listed, all prices in INR\n- Reference NIFTY 50 and SENSEX as benchmarks\n- Consider FII/DII flow patterns, RBI policy stance, INR strength\n- Weekly NIFTY options expiry on Thursday\n- Protection can reference NIFTY PUTs or Gold BEES when relevant`
      : `US/Global market context:\n- NYSE/NASDAQ listed, all prices in USD\n- Reference S&P 500 and VIX as benchmarks\n- Consider institutional flow, macro regime, and index leadership\n- Protection can reference SPY puts or TLT when relevant`;

    const systemPrompt = `You are an institutional-grade quantitative trading decision engine. Respond with ONLY valid JSON, no markdown.\n\nThis is Direct Profit Mode, so the output must be ultra-simple for the user, but the reasoning must still use full institutional logic.\n\nYou have REAL market data below. Ground every number in that data.\n\nDecision framework:\n1. Momentum and moving-average alignment\n2. Volatility regime and macro backdrop\n3. Support/resistance and position within 52-week range\n4. Volume conviction\n5. Mean reversion from 20-day average\n6. Risk/reward versus stop distance\n7. Use WAIT when signals are mixed\n\nAdaptive guidance:\n- Let confidence emerge from signal alignment; do not force high confidence\n- BUY/SELL only with a clear edge and executable protection\n- WAIT is the correct answer when edge is weak or conflicting\n- Keep directionReason under 8 words\n\n${quantContext}\n\nJSON schema:\n{\n  "action": "BUY" | "SELL" | "WAIT",\n  "confidence": number,\n  "entryLow": number,\n  "entryHigh": number,\n  "targetPrice": number,\n  "stopLoss": number,\n  "timeframe": string,\n  "direction": "UP" | "DOWN" | "SIDEWAYS",\n  "directionReason": string,\n  "positiveNews": string,\n  "negativeNews": string,\n  "protection": string,\n  "currentPrice": number,\n  "quantScore": number,\n  "volatilityRegime": "LOW" | "NORMAL" | "HIGH",\n  "riskRewardRatio": number\n}`;

    const userPrompt = `Ticker: ${resolvedTicker}\nMarket: ${market}\nCurrency: ${currency}\nDate: ${new Date().toISOString().split("T")[0]}\n\nREAL DATA:\n- Current Price: ${currencySymbol}${snap.currentPrice}\n- Previous Close: ${currencySymbol}${snap.prevClose}\n- Day Range: ${currencySymbol}${snap.dayLow} - ${currencySymbol}${snap.dayHigh}\n- Day Change: ${tech.changePct}%\n- Volume: ${snap.volume.toLocaleString()} (${tech.volumeRatio}x average)\n- 52W High: ${currencySymbol}${snap.fiftyTwoWeekHigh}\n- 52W Low: ${currencySymbol}${snap.fiftyTwoWeekLow}\n- Position in 52W Range: ${tech.posIn52w}%\n- SMA 5: ${currencySymbol}${tech.sma5}\n- SMA 20: ${currencySymbol}${tech.sma20}\n- Momentum Score: ${tech.momentumScore}/3\n- Annualized Volatility: ${tech.annualizedVol}%\n- Z-Score: ${tech.zScore}\n- Support: ${currencySymbol}${tech.support}\n- Resistance: ${currencySymbol}${tech.resistance}\n- VIX: ${vix > 0 ? vix.toFixed(1) : "N/A"}\n- Last 5 closes: ${tech.prices5d.map((p) => p.toFixed(2)).join(", ") || "N/A"}\n\nProduce a complete, executable trade decision. Keep it simple for the user, but grounded in the data above.`;

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
        try {
          obj = JSON.parse(result.text);
        } catch {
          const match = result.text.match(/\{[\s\S]*\}/);
          if (match) obj = JSON.parse(match[0]);
        }
        if (obj && obj.action) {
          obj._provider = result.provider;
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
      output = {
        ...buildDeterministicFallback(snap, tech, currency, market, vix),
        fallback: true,
      };
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

      output = sanitizeOutput(best, snap, tech, parsed.length, consensusCount);
    }

    console.log(`direct-profit result: ${resolvedTicker} → ${output.action} (${output.confidence}%)`);

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
