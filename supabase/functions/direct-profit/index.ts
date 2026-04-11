const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
import { callAIParallel } from "../_shared/callAI.ts";
import { buildTickerCandidates, isIndianTicker, normalizeTickerInput } from "../_shared/ticker.ts";

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

// ── Same data pipeline as analyze-stock ──

async function fetchAlphaVantage(symbol: string): Promise<{ price: number; prevClose: number; high: number; low: number; volume: number } | null> {
  const apiKey = Deno.env.get("ALPHAVANTAGE_API_KEY");
  if (!apiKey) return null;
  try {
    const cleanSymbol = symbol.replace(/\.(NS|BO)$/, "");
    const exchange = symbol.endsWith(".BO") ? "BSE" : "NSE";
    const avSymbol = (symbol.endsWith(".NS") || symbol.endsWith(".BO")) ? `${exchange}:${cleanSymbol}` : cleanSymbol;
    const url = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${encodeURIComponent(avSymbol)}&apikey=${apiKey}`;
    const res = await fetch(url);
    if (!res.ok) { await res.text(); return null; }
    const data = await res.json();
    const q = data?.["Global Quote"];
    if (!q || !q["05. price"]) return null;
    return { price: parseFloat(q["05. price"]), prevClose: parseFloat(q["08. previous close"] || "0"), high: parseFloat(q["03. high"] || "0"), low: parseFloat(q["04. low"] || "0"), volume: parseInt(q["06. volume"] || "0") };
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

async function fetchFullSnapshot(ticker: string, isIndian: boolean): Promise<MarketSnapshot | null> {
  const symbolsToTry = buildTickerCandidates(ticker);
  let result: MarketSnapshot | null = null;

  for (const symbol of symbolsToTry) {
    if (result) break;

    // v8 chart — get 1mo of daily data for technicals
    try {
      const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1mo&_t=${Date.now()}`;
      const res = await fetch(url, { headers: { "User-Agent": UA, "Cache-Control": "no-cache" } });
      if (res.ok) {
        const data = await res.json();
        const r = data?.chart?.result?.[0];
        const meta = r?.meta;
        if (meta?.regularMarketPrice && meta.regularMarketPrice > 0) {
          const closes = (r.indicators?.quote?.[0]?.close || []).filter((v: any) => v != null);
          const vols = (r.indicators?.quote?.[0]?.volume || []).filter((v: any) => v != null);
          result = {
            currentPrice: meta.regularMarketPrice,
            prevClose: meta.chartPreviousClose || meta.previousClose || 0,
            dayHigh: meta.regularMarketDayHigh || 0,
            dayLow: meta.regularMarketDayLow || 0,
            volume: meta.regularMarketVolume || 0,
            fiftyTwoWeekHigh: meta.fiftyTwoWeekHigh || 0,
            fiftyTwoWeekLow: meta.fiftyTwoWeekLow || 0,
            currency: isIndian ? "INR" : (meta.currency || "USD"),
            closes,
            volumes: vols,
          };
          console.log(`✓ ${symbol} via v8: ${result.currency} ${result.currentPrice}`);
          break;
        }
      } else { await res.text(); }
    } catch { /* next */ }

    // v10 quoteSummary fallback
    try {
      const url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=price`;
      const res = await fetch(url, { headers: { "User-Agent": UA } });
      if (res.ok) {
        const data = await res.json();
        const pm = data?.quoteSummary?.result?.[0]?.price;
        const p = pm?.regularMarketPrice?.raw;
        if (p && p > 0) {
          result = {
            currentPrice: p,
            prevClose: pm?.regularMarketPreviousClose?.raw || 0,
            dayHigh: pm?.regularMarketDayHigh?.raw || 0,
            dayLow: pm?.regularMarketDayLow?.raw || 0,
            volume: pm?.regularMarketVolume?.raw || 0,
            fiftyTwoWeekHigh: pm?.fiftyTwoWeekHigh?.raw || 0,
            fiftyTwoWeekLow: pm?.fiftyTwoWeekLow?.raw || 0,
            currency: isIndian ? "INR" : (pm?.currency || "USD"),
            closes: [],
            volumes: [],
          };
          console.log(`✓ ${symbol} via v10: ${result.currency} ${result.currentPrice}`);
          break;
        }
      } else { await res.text(); }
    } catch { /* next */ }
  }

  // Alpha Vantage fallback
  if (!result) {
    for (const symbol of symbolsToTry) {
      const av = await fetchAlphaVantage(symbol);
      if (av && av.price > 0) {
        result = {
          currentPrice: av.price, prevClose: av.prevClose,
          dayHigh: av.high, dayLow: av.low, volume: av.volume,
          fiftyTwoWeekHigh: 0, fiftyTwoWeekLow: 0,
          currency: isIndian ? "INR" : "USD", closes: [], volumes: [],
        };
        console.log(`✓ ${symbol} via AlphaVantage: ${result.currency} ${result.currentPrice}`);
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

// ── Dynamic technicals (not hardcoded rules) ──

function computeTechnicals(snap: MarketSnapshot) {
  const { currentPrice, closes, volumes, fiftyTwoWeekHigh, fiftyTwoWeekLow, volume } = snap;
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
  const dailyVol = Math.sqrt(variance);
  const annualizedVol = dailyVol * Math.sqrt(252) * 100;

  const zScore = sma20 > 0 && dailyVol > 0 ? (currentPrice - sma20) / (sma20 * dailyVol * Math.sqrt(20)) : 0;

  const range52w = (fiftyTwoWeekHigh || currentPrice) - (fiftyTwoWeekLow || currentPrice);
  const posIn52w = range52w > 0 ? ((currentPrice - fiftyTwoWeekLow) / range52w) * 100 : 50;

  const avgVolume = volumes.length > 0 ? volumes.reduce((a: number, b: number) => a + b, 0) / volumes.length : volume;
  const volumeRatio = avgVolume > 0 ? volume / avgVolume : 1;

  const changePct = snap.prevClose > 0 ? ((currentPrice - snap.prevClose) / snap.prevClose) * 100 : 0;

  return {
    sma5: +sma5.toFixed(2), sma20: +sma20.toFixed(2),
    momentumScore, annualizedVol: +annualizedVol.toFixed(1),
    zScore: +zScore.toFixed(2), posIn52w: +posIn52w.toFixed(1),
    volumeRatio: +volumeRatio.toFixed(2), changePct: +changePct.toFixed(2),
    prices5d, dailyVol: +(dailyVol * 100).toFixed(3),
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
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Use the SAME ticker normalization as the core system
    const resolvedTicker = normalizeTickerInput(ticker.trim());
    const isIndian = indiaMode || isIndianTicker(resolvedTicker);
    const currency = isIndian ? "INR" : "USD";
    const currencySymbol = isIndian ? "₹" : "$";
    const market = isIndian ? "India (NSE/BSE)" : "US/Global";

    // ── Fetch real data using same pipeline as analyze-stock ──
    const [snap, vix] = await Promise.all([
      fetchFullSnapshot(resolvedTicker, isIndian),
      fetchVIX(),
    ]);

    if (!snap || snap.currentPrice <= 0) {
      return new Response(JSON.stringify({
        error: `Could not fetch price data for ${resolvedTicker}. Check the ticker symbol.`,
      }), { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const tech = computeTechnicals(snap);
    const dayChange = snap.prevClose > 0 ? ((snap.currentPrice - snap.prevClose) / snap.prevClose * 100).toFixed(2) : "N/A";
    const from52High = snap.fiftyTwoWeekHigh > 0 ? ((snap.currentPrice - snap.fiftyTwoWeekHigh) / snap.fiftyTwoWeekHigh * 100).toFixed(1) : "N/A";

    console.log(`direct-profit: ${resolvedTicker} price=${snap.currentPrice} chg=${dayChange}% vol=${tech.annualizedVol}% momentum=${tech.momentumScore} z=${tech.zScore} vix=${vix}`);

    // ── Same depth of analysis prompt as core system, output formatted for Direct Profit ──
    const quantContext = isIndian
      ? `Indian market context:
- NSE/BSE listed, all prices in INR
- Reference NIFTY 50 and SENSEX as benchmarks
- Consider FII/DII flow patterns, RBI policy stance, INR strength
- Indian market hours: 9:15 AM - 3:30 PM IST
- Weekly NIFTY options expiry on Thursday
- For hedging reference NIFTY PUT options or Gold BEES`
      : `US/Global market context:
- NYSE/NASDAQ listed, all prices in USD
- Reference S&P 500 and VIX as benchmarks
- Consider institutional flow and dark pool activity
- Factor in Fed policy stance and DXY strength
- US market hours: 9:30 AM - 4:00 PM ET
- For hedging reference SPY PUT options or TLT`;

    const systemPrompt = `You are an institutional-grade quantitative trading decision engine. You MUST respond with ONLY valid JSON, no explanation or markdown.

You have REAL market data below. Your decision MUST be grounded in this data. Do NOT fabricate prices.

ANALYSIS FRAMEWORK (same as institutional desk):
1. MOMENTUM: Evaluate SMA alignment (5d vs 20d vs price), trend direction
2. VOLATILITY: Current vol regime relative to historical, VIX context
3. SUPPORT/RESISTANCE: Key levels from price structure and 52-week range
4. RISK/REWARD: Calculate realistic target/stop ratio from support/resistance
5. VOLUME: Conviction signal from volume vs average
6. REGIME: Broader market risk appetite from VIX and index context
7. MEAN REVERSION: Z-score from 20d mean for extreme readings
8. FUNDAMENTALS: Sector context, macro backdrop, any known catalysts

DECISION GUIDELINES (adaptive, not rigid):
- Let the data drive the decision. If signals conflict, output WAIT.
- Confidence should reflect how many signals align. Mixed signals = lower confidence naturally.
- WAIT is a valid and often correct output.
- BUY/SELL only when there is a clear edge with defined risk/reward.
- All prices must be realistic and in ${currency}.

${quantContext}

JSON schema:
{
  "action": "BUY" | "SELL" | "WAIT",
  "confidence": number (0-100, reflects actual signal alignment),
  "entryLow": number,
  "entryHigh": number,
  "targetPrice": number,
  "stopLoss": number,
  "timeframe": string,
  "direction": "UP" | "DOWN" | "SIDEWAYS",
  "directionReason": string (max 8 words, must reference a real signal),
  "positiveNews": string (one short sentence, real catalyst or "None"),
  "negativeNews": string (one short sentence, real risk or "None"),
  "protection": string (one sentence: what to do if trade fails),
  "currentPrice": number,
  "quantScore": number (0-100),
  "volatilityRegime": "LOW" | "NORMAL" | "HIGH",
  "riskRewardRatio": number
}`;

    const userPrompt = `Ticker: ${resolvedTicker}
Market: ${market}
Currency: ${currency}
Date: ${new Date().toISOString().split("T")[0]}

=== REAL-TIME MARKET DATA ===
Current Price: ${currencySymbol}${snap.currentPrice}
Previous Close: ${currencySymbol}${snap.prevClose}
Day Change: ${dayChange}%
Day Range: ${currencySymbol}${snap.dayLow} - ${currencySymbol}${snap.dayHigh}
Volume: ${snap.volume.toLocaleString()} (${tech.volumeRatio}x average)
52-Week High: ${currencySymbol}${snap.fiftyTwoWeekHigh}
52-Week Low: ${currencySymbol}${snap.fiftyTwoWeekLow}
Distance from 52W High: ${from52High}%
Position in 52W range: ${tech.posIn52w}%

=== COMPUTED TECHNICALS ===
SMA 5-day: ${currencySymbol}${tech.sma5}
SMA 20-day: ${currencySymbol}${tech.sma20}
Momentum Score: ${tech.momentumScore}/3 (${tech.momentumScore >= 2 ? 'strong bullish' : tech.momentumScore >= 1 ? 'mild bullish' : tech.momentumScore <= -2 ? 'strong bearish' : tech.momentumScore <= -1 ? 'mild bearish' : 'neutral'})
Annualized Volatility: ${tech.annualizedVol}%
Z-Score (mean reversion): ${tech.zScore} (${Math.abs(tech.zScore) > 2 ? 'EXTREME' : Math.abs(tech.zScore) > 1 ? 'elevated' : 'normal'})
VIX: ${vix > 0 ? vix.toFixed(1) : 'N/A'}

Last 5 daily closes: ${tech.prices5d.map((p: number) => p.toFixed(2)).join(', ')}

Analyze all signals together. Let conflicting signals naturally lower confidence. Produce the trade decision JSON now.`;

    // ── Same multi-provider consensus as core system ──
    const results = await callAIParallel({
      systemPrompt, userPrompt,
      maxTokens: 2048, temperature: 0.3, jsonMode: true,
    });

    const parsed: any[] = [];
    for (const r of results) {
      try {
        let obj: any;
        try { obj = JSON.parse(r.text); } catch {
          const match = r.text.match(/\{[\s\S]*\}/);
          if (match) obj = JSON.parse(match[0]);
        }
        if (obj && obj.action) {
          obj._provider = r.provider;
          obj.currentPrice = snap.currentPrice; // force real price
          parsed.push(obj);
        }
      } catch { console.warn(`Failed to parse result from ${r.provider}`); }
    }

    if (parsed.length === 0) throw new Error("All AI providers failed to produce valid output");

    // Consensus
    const actionVotes: Record<string, number> = { BUY: 0, SELL: 0, WAIT: 0 };
    for (const p of parsed) {
      if (actionVotes[p.action] !== undefined) actionVotes[p.action]++;
    }
    const consensusAction = Object.entries(actionVotes).sort((a, b) => b[1] - a[1])[0][0];
    const consensusCount = actionVotes[consensusAction];

    // Pick best result matching consensus
    const best = parsed
      .filter(p => p.action === consensusAction)
      .sort((a, b) => (Number(b.confidence) || 0) - (Number(a.confidence) || 0))[0] || parsed[0];

    // Dynamic confidence adjustment based on consensus strength (not hardcoded caps)
    let confidence = Number(best.confidence) || 50;
    if (parsed.length > 1) {
      const agreementRatio = consensusCount / parsed.length;
      // Scale: unanimous = +5, majority = +2, split = -10
      if (agreementRatio === 1) confidence += 5;
      else if (agreementRatio >= 0.5) confidence += 2;
      else confidence -= 10;
    }
    confidence = Math.min(100, Math.max(5, Math.round(confidence)));

    // Validate entry/target/SL against real price (sanity, not rigid)
    const realPrice = snap.currentPrice;
    let entryLow = Number(best.entryLow) || realPrice * 0.98;
    let entryHigh = Number(best.entryHigh) || realPrice * 1.02;
    if (Math.abs(entryLow - realPrice) / realPrice > 0.15) entryLow = realPrice * 0.98;
    if (Math.abs(entryHigh - realPrice) / realPrice > 0.15) entryHigh = realPrice * 1.02;

    const targetPrice = Number(best.targetPrice) || realPrice * 1.05;
    const stopLoss = Number(best.stopLoss) || realPrice * 0.95;
    const midEntry = (entryLow + entryHigh) / 2;
    const rr = best.action === "BUY"
      ? (targetPrice - midEntry) / Math.max(midEntry - stopLoss, 0.01)
      : best.action === "SELL"
        ? (midEntry - targetPrice) / Math.max(stopLoss - midEntry, 0.01)
        : 0;

    const volRegime = tech.annualizedVol > 45 ? "HIGH" : tech.annualizedVol > 18 ? "NORMAL" : "LOW";

    const output = {
      action: ["BUY", "SELL", "WAIT"].includes(best.action) ? best.action : "WAIT",
      confidence,
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
      volatilityRegime: volRegime,
      riskRewardRatio: +Math.abs(rr).toFixed(2),
      providersUsed: parsed.length,
      consensus: consensusCount === parsed.length ? "UNANIMOUS" : consensusCount > 1 ? "MAJORITY" : "SPLIT",
    };

    console.log(`direct-profit result: ${resolvedTicker} → ${output.action} ${output.confidence}% (${output.consensus}, ${output.providersUsed} providers)`);

    return new Response(JSON.stringify(output), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("direct-profit error:", err);
    return new Response(JSON.stringify({ error: err.message || "Analysis failed" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
