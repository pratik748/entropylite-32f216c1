const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
import { callAIParallel } from "../_shared/callAI.ts";

const INDIA_SUFFIX_RE = /\.(NS|BO)$/i;

function isIndiaTicker(ticker: string): boolean {
  return INDIA_SUFFIX_RE.test(ticker);
}

function normalizeIndiaTicker(ticker: string): string {
  if (INDIA_SUFFIX_RE.test(ticker)) return ticker.toUpperCase();
  return `${ticker.toUpperCase()}.NS`;
}

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

interface RealMarketData {
  currentPrice: number;
  prevClose: number;
  changePct: number;
  volume: number;
  currency: string;
  high52w: number;
  low52w: number;
  prices5d: number[];
  prices20d: number[];
  avgVolume: number;
}

async function fetchRealData(symbol: string): Promise<RealMarketData | null> {
  try {
    // Fetch 1mo of daily data for technicals
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1mo&_t=${Date.now()}`;
    const res = await fetch(url, {
      headers: { "User-Agent": UA, "Accept": "application/json", "Cache-Control": "no-cache" },
    });
    if (!res.ok) { await res.text(); return null; }
    const data = await res.json();
    const result = data?.chart?.result?.[0];
    if (!result) return null;

    const meta = result.meta;
    const closes: number[] = result.indicators?.quote?.[0]?.close?.filter((v: any) => v != null) || [];
    const volumes: number[] = result.indicators?.quote?.[0]?.volume?.filter((v: any) => v != null) || [];

    if (!meta?.regularMarketPrice || meta.regularMarketPrice <= 0) return null;

    const currentPrice = meta.regularMarketPrice;
    const prevClose = meta.chartPreviousClose || meta.previousClose || closes[closes.length - 2] || currentPrice;

    return {
      currentPrice,
      prevClose,
      changePct: prevClose > 0 ? ((currentPrice - prevClose) / prevClose) * 100 : 0,
      volume: meta.regularMarketVolume || volumes[volumes.length - 1] || 0,
      currency: meta.currency || "USD",
      high52w: meta.fiftyTwoWeekHigh || Math.max(...closes, currentPrice),
      low52w: meta.fiftyTwoWeekLow || Math.min(...closes.filter((c: number) => c > 0), currentPrice),
      prices5d: closes.slice(-5),
      prices20d: closes.slice(-20),
      avgVolume: volumes.length > 0 ? volumes.reduce((a: number, b: number) => a + b, 0) / volumes.length : 0,
    };
  } catch (e) {
    console.error("fetchRealData error:", e);
    return null;
  }
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

function computeTechnicals(data: RealMarketData) {
  const { currentPrice, prices5d, prices20d, high52w, low52w, volume, avgVolume } = data;

  const sma5 = prices5d.length > 0 ? prices5d.reduce((a, b) => a + b, 0) / prices5d.length : currentPrice;
  const sma20 = prices20d.length > 0 ? prices20d.reduce((a, b) => a + b, 0) / prices20d.length : currentPrice;

  // Momentum: price vs SMAs
  const momentumScore = (currentPrice > sma5 ? 1 : -1) + (currentPrice > sma20 ? 1 : -1) + (sma5 > sma20 ? 1 : -1);

  // Volatility: std dev of 20d returns
  const returns20d: number[] = [];
  for (let i = 1; i < prices20d.length; i++) {
    if (prices20d[i - 1] > 0) returns20d.push((prices20d[i] - prices20d[i - 1]) / prices20d[i - 1]);
  }
  const meanReturn = returns20d.length > 0 ? returns20d.reduce((a, b) => a + b, 0) / returns20d.length : 0;
  const variance = returns20d.length > 0 ? returns20d.reduce((a, b) => a + (b - meanReturn) ** 2, 0) / returns20d.length : 0;
  const dailyVol = Math.sqrt(variance);
  const annualizedVol = dailyVol * Math.sqrt(252) * 100;

  // Mean reversion: z-score from 20d mean
  const zScore = sma20 > 0 && dailyVol > 0 ? (currentPrice - sma20) / (sma20 * dailyVol * Math.sqrt(20)) : 0;

  // Position in 52w range
  const range52w = high52w - low52w;
  const posIn52w = range52w > 0 ? ((currentPrice - low52w) / range52w) * 100 : 50;

  // Volume ratio
  const volumeRatio = avgVolume > 0 ? volume / avgVolume : 1;

  // Support/resistance (simple)
  const support = Math.min(sma20, ...prices5d.filter(p => p > 0));
  const resistance = Math.max(sma20, ...prices5d.filter(p => p > 0));

  return {
    sma5: +sma5.toFixed(2),
    sma20: +sma20.toFixed(2),
    momentumScore, // -3 to +3
    annualizedVol: +annualizedVol.toFixed(1),
    zScore: +zScore.toFixed(2),
    posIn52w: +posIn52w.toFixed(1),
    volumeRatio: +volumeRatio.toFixed(2),
    support: +support.toFixed(2),
    resistance: +resistance.toFixed(2),
    dailyVol: +(dailyVol * 100).toFixed(3),
  };
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

    const rawTicker = ticker.trim().toUpperCase();
    const resolvedTicker = indiaMode ? normalizeIndiaTicker(rawTicker) : rawTicker;
    const currency = indiaMode ? "INR" : "USD";
    const market = indiaMode ? "India (NSE/BSE)" : "US/Global";

    // ── Fetch REAL market data ──
    const [realData, vix] = await Promise.all([
      fetchRealData(resolvedTicker),
      fetchVIX(),
    ]);

    if (!realData || realData.currentPrice <= 0) {
      return new Response(JSON.stringify({
        error: `Could not fetch real price data for ${resolvedTicker}. Check the ticker symbol.`,
      }), {
        status: 422,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const tech = computeTechnicals(realData);
    console.log(`direct-profit: ${resolvedTicker} price=${realData.currentPrice} chg=${realData.changePct.toFixed(2)}% vol=${tech.annualizedVol}% momentum=${tech.momentumScore} z=${tech.zScore} vix=${vix}`);

    // ── Build data-grounded prompt ──
    const quantContext = indiaMode
      ? `Indian market context:
- Use NSE/BSE listed prices in INR
- Reference NIFTY 50 and SENSEX as benchmarks
- Consider FII/DII flow patterns
- Factor in RBI policy stance and INR strength
- Indian market hours: 9:15 AM - 3:30 PM IST
- Use Indian options expiry cycles (weekly Thursday for NIFTY)`
      : `US/Global market context:
- Use NYSE/NASDAQ listed prices in USD
- Reference S&P 500 and VIX as benchmarks
- Consider institutional flow and dark pool activity
- Factor in Fed policy stance and DXY strength
- US market hours: 9:30 AM - 4:00 PM ET`;

    const systemPrompt = `You are an institutional-grade quantitative trading decision engine. You MUST respond with ONLY valid JSON, no explanation or markdown.

CRITICAL: You have REAL market data below. Your decision MUST be grounded in this data. Do NOT fabricate prices or technicals.

DECISION RULES (strict):
- If momentum is negative (score <= -1) AND price is below SMA20 AND z-score < -0.5: lean SELL or WAIT
- If stock is already >15% above 52w midpoint AND volatility is HIGH: lean WAIT or reduce confidence
- If z-score > 1.5 (overbought): SELL or WAIT, NOT BUY
- If z-score < -1.5 (oversold) AND momentum turning: could be BUY on dip
- Volume ratio < 0.5 (low conviction): reduce confidence by 15-20 points
- VIX > 25: reduce all BUY confidence by 10 points, add caution
- If daily change is < -3%: WAIT unless clear support bounce
- Confidence should RARELY exceed 80. Only >85 when ALL signals strongly align.
- WAIT is valid and should be used when signals conflict or are unclear.

${quantContext}

ALL prices in ${currency}. Use the REAL currentPrice provided, do NOT make up prices.

JSON schema:
{
  "action": "BUY" | "SELL" | "WAIT",
  "confidence": number,
  "entryLow": number,
  "entryHigh": number,
  "targetPrice": number,
  "stopLoss": number,
  "timeframe": string,
  "direction": "UP" | "DOWN" | "SIDEWAYS",
  "directionReason": string,
  "positiveNews": string,
  "negativeNews": string,
  "protection": string,
  "currentPrice": number,
  "quantScore": number,
  "volatilityRegime": "LOW" | "NORMAL" | "HIGH",
  "riskRewardRatio": number
}`;

    const userPrompt = `Ticker: ${resolvedTicker}
Market: ${market}
Currency: ${currency}
Date: ${new Date().toISOString().split("T")[0]}

=== REAL MARKET DATA (use these exact numbers) ===
Current Price: ${realData.currentPrice}
Previous Close: ${realData.prevClose}
Today Change: ${realData.changePct.toFixed(2)}%
Volume: ${realData.volume.toLocaleString()} (${tech.volumeRatio}x avg)
52-Week High: ${realData.high52w}
52-Week Low: ${realData.low52w}
Position in 52w range: ${tech.posIn52w}%

=== COMPUTED TECHNICALS ===
SMA 5-day: ${tech.sma5}
SMA 20-day: ${tech.sma20}
Momentum Score: ${tech.momentumScore}/3 (${tech.momentumScore >= 2 ? 'strong bullish' : tech.momentumScore >= 1 ? 'mild bullish' : tech.momentumScore <= -2 ? 'strong bearish' : tech.momentumScore <= -1 ? 'mild bearish' : 'neutral'})
Annualized Volatility: ${tech.annualizedVol}%
Z-Score (mean reversion): ${tech.zScore} (${Math.abs(tech.zScore) > 1.5 ? 'EXTREME' : Math.abs(tech.zScore) > 1 ? 'elevated' : 'normal'})
Support Zone: ${tech.support}
Resistance Zone: ${tech.resistance}
VIX: ${vix > 0 ? vix.toFixed(1) : 'N/A'}

Last 5 daily closes: ${realData.prices5d.map(p => p.toFixed(2)).join(', ')}

Produce the trade decision JSON now. Remember: confidence should reflect REAL signal alignment, not optimism.`;

    // Fire all 3 AI providers in parallel for consensus
    const results = await callAIParallel({
      systemPrompt,
      userPrompt,
      maxTokens: 2048,
      temperature: 0.3,
      jsonMode: true,
    });

    // Parse all successful results
    const parsed: any[] = [];
    for (const r of results) {
      try {
        let obj: any;
        try {
          obj = JSON.parse(r.text);
        } catch {
          const match = r.text.match(/\{[\s\S]*\}/);
          if (match) obj = JSON.parse(match[0]);
        }
        if (obj && obj.action) {
          obj._provider = r.provider;
          // Force currentPrice to real value
          obj.currentPrice = realData.currentPrice;
          parsed.push(obj);
        }
      } catch {
        console.warn(`Failed to parse result from ${r.provider}`);
      }
    }

    if (parsed.length === 0) {
      throw new Error("All AI providers failed to produce valid output");
    }

    // Consensus logic
    const actionVotes: Record<string, number> = { BUY: 0, SELL: 0, WAIT: 0 };
    for (const p of parsed) {
      if (actionVotes[p.action] !== undefined) actionVotes[p.action]++;
    }
    const consensusAction = Object.entries(actionVotes).sort((a, b) => b[1] - a[1])[0][0];
    const consensusCount = actionVotes[consensusAction];
    const consensusBoost = parsed.length > 1 ? (consensusCount / parsed.length) * 5 : 0;

    // Pick the best result (prefer consensus action, then highest confidence)
    const best = parsed
      .filter(p => p.action === consensusAction)
      .sort((a, b) => (Number(b.confidence) || 0) - (Number(a.confidence) || 0))[0]
      || parsed[0];

    // Apply hard caps based on real data
    let rawConfidence = Number(best.confidence) || 50;
    
    // Penalize if signals conflict
    if (tech.momentumScore <= -1 && best.action === "BUY") rawConfidence = Math.min(rawConfidence, 55);
    if (tech.momentumScore >= 1 && best.action === "SELL") rawConfidence = Math.min(rawConfidence, 55);
    if (Math.abs(tech.zScore) > 1.5 && best.action === "BUY" && tech.zScore > 0) rawConfidence = Math.min(rawConfidence, 50);
    if (vix > 30) rawConfidence = Math.min(rawConfidence, 65);
    if (tech.volumeRatio < 0.5) rawConfidence -= 10;
    
    const finalConfidence = Math.min(92, Math.max(15, rawConfidence + consensusBoost));

    // Validate entry/target/SL are realistic vs real price
    const realPrice = realData.currentPrice;
    let entryLow = Number(best.entryLow) || realPrice * 0.98;
    let entryHigh = Number(best.entryHigh) || realPrice * 1.02;
    let targetPrice = Number(best.targetPrice) || realPrice * 1.05;
    let stopLoss = Number(best.stopLoss) || realPrice * 0.95;

    // Sanity: entries should be within 5% of current price
    if (Math.abs(entryLow - realPrice) / realPrice > 0.1) entryLow = realPrice * 0.98;
    if (Math.abs(entryHigh - realPrice) / realPrice > 0.1) entryHigh = realPrice * 1.02;

    const riskRewardRatio = best.action === "BUY"
      ? (targetPrice - (entryLow + entryHigh) / 2) / ((entryLow + entryHigh) / 2 - stopLoss || 1)
      : best.action === "SELL"
        ? ((entryLow + entryHigh) / 2 - targetPrice) / (stopLoss - (entryLow + entryHigh) / 2 || 1)
        : 0;

    const output = {
      action: ["BUY", "SELL", "WAIT"].includes(best.action) ? best.action : "WAIT",
      confidence: Math.round(finalConfidence),
      entryLow: +entryLow.toFixed(2),
      entryHigh: +entryHigh.toFixed(2),
      targetPrice: +targetPrice.toFixed(2),
      stopLoss: +stopLoss.toFixed(2),
      timeframe: best.timeframe || "1 week",
      direction: ["UP", "DOWN", "SIDEWAYS"].includes(best.direction) ? best.direction : "SIDEWAYS",
      directionReason: (best.directionReason || "Insufficient data").slice(0, 60),
      positiveNews: (best.positiveNews || "No significant positive catalyst").slice(0, 120),
      negativeNews: (best.negativeNews || "No significant risk detected").slice(0, 120),
      protection: (best.protection || "Exit at stop loss if trade fails").slice(0, 120),
      currentPrice: realPrice,
      quantScore: Math.min(100, Math.max(0, Number(best.quantScore) || 50)),
      volatilityRegime: tech.annualizedVol > 40 ? "HIGH" : tech.annualizedVol > 20 ? "NORMAL" : "LOW",
      riskRewardRatio: +Math.abs(riskRewardRatio).toFixed(2),
      providersUsed: parsed.length,
      consensus: consensusCount === parsed.length ? "UNANIMOUS" : consensusCount > 1 ? "MAJORITY" : "SPLIT",
    };

    console.log(`direct-profit result: ${resolvedTicker} → ${output.action} ${output.confidence}% (${output.consensus})`);

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
