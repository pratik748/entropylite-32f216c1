import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { callAI, callAIParallel } from "../_shared/callAI.ts";
import { requireAuth } from "../_shared/auth.ts";
import { safeParseJSON } from "../_shared/safeParseJSON.ts";
import { buildTickerCandidates, isIndianTicker, normalizeTickerInput } from "../_shared/ticker.ts";
import { fetchTickerLiveBundle, bundleToPromptContext } from "../_shared/liveData.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

/** Alpha Vantage fallback for when Yahoo is blocked */
async function fetchAlphaVantage(symbol: string): Promise<{ price: number; prevClose: number; high: number; low: number; volume: number } | null> {
  const apiKey = Deno.env.get("ALPHAVANTAGE_API_KEY");
  if (!apiKey) return null;
  try {
    // Strip .NS/.BO (and legacy .NSE/.BSE) suffix for Alpha Vantage — it uses BSE:/NSE: prefix format
    const normalized = normalizeTickerInput(symbol);
    const cleanSymbol = normalized.replace(/\.(NS|BO)$/, "");
    const exchange = normalized.endsWith(".BO") ? "BSE" : "NSE";
    const avSymbol = normalized.endsWith(".NS") || normalized.endsWith(".BO") ? `${exchange}:${cleanSymbol}` : cleanSymbol;

    const url = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${encodeURIComponent(avSymbol)}&apikey=${apiKey}`;
    const res = await fetch(url);
    if (!res.ok) return null;
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
  } catch (e) {
    console.error(`AlphaVantage error for ${symbol}:`, e);
    return null;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const auth = await requireAuth(req, corsHeaders);
    const userId = auth.user.id;
    const rawBody = await req.json();
    const provider = rawBody.provider;
    const indiaMode = rawBody.indiaMode === true;
    const requestedTicker = (rawBody.ticker || "").toString();
    const ticker = normalizeTickerInput(requestedTicker);
    const buyPrice = rawBody.buyPrice;
    const quantity = rawBody.quantity;
    if (!ticker || !buyPrice || !quantity) {
      return new Response(JSON.stringify({ error: "ticker, buyPrice, and quantity are required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ─── ODGS Ledger Context: per-user historical outcomes for profit/risk bias ───
    let odgsContext = "";
    try {
      const supaUrl = Deno.env.get("SUPABASE_URL");
      const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
      if (supaUrl && serviceKey) {
        const ledgerRes = await fetch(`${supaUrl}/rest/v1/odgs_trade_ledger?user_id=eq.${userId}&order=trade_timestamp.desc&limit=200`, {
          headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
        });
        const gradRes = await fetch(`${supaUrl}/rest/v1/odgs_gradient_state?user_id=eq.${userId}&select=*`, {
          headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` },
        });
        const ledger: any[] = ledgerRes.ok ? await ledgerRes.json() : [];
        const gradArr: any[] = gradRes.ok ? await gradRes.json() : [];
        const grad = gradArr[0];

        if (ledger.length > 0) {
          const tickerTrades = ledger.filter(t => (t.asset || "").toUpperCase() === ticker.toUpperCase());
          const allWins = ledger.filter(t => Number(t.pnl_pct) > 0).length;
          const overallWR = ((allWins / ledger.length) * 100).toFixed(0);
          const avgPnl = (ledger.reduce((s, t) => s + Number(t.pnl_pct || 0), 0) / ledger.length).toFixed(2);

          let tickerLine = "";
          if (tickerTrades.length > 0) {
            const tWins = tickerTrades.filter(t => Number(t.pnl_pct) > 0).length;
            const tWR = ((tWins / tickerTrades.length) * 100).toFixed(0);
            const tAvg = (tickerTrades.reduce((s, t) => s + Number(t.pnl_pct || 0), 0) / tickerTrades.length).toFixed(2);
            const worst = Math.min(...tickerTrades.map(t => Number(t.pnl_pct || 0))).toFixed(2);
            tickerLine = `\n- This user's ${ticker} history: ${tickerTrades.length} closed trades, ${tWR}% win rate, avg ${tAvg}% P&L, worst ${worst}%.`;
          }

          const bias = grad?.asset_biases?.[ticker.toUpperCase()];
          const biasLine = typeof bias === "number"
            ? `\n- Learned bias for ${ticker}: ${bias.toFixed(2)}× (1.0 = neutral, >1 favored, <1 disfavored).`
            : "";

          const recentLosses = ledger
            .filter(t => Number(t.pnl_pct) < -2)
            .slice(0, 5)
            .map(t => `${t.asset} ${Number(t.pnl_pct).toFixed(1)}% in ${t.feature_regime || "unknown"} regime`)
            .join("; ");
          const lossLine = recentLosses ? `\n- Recent loss patterns to factor into risk assessment: ${recentLosses}.` : "";

          odgsContext = `\nUSER OUTCOME LEDGER (real per-account trade history — bias toward profitable patterns and away from prior losses):
- Total closed trades: ${ledger.length} | Overall win rate: ${overallWR}% | Avg P&L: ${avgPnl}%${tickerLine}${biasLine}${lossLine}
Use this ledger to ground confidence and risk: raise confidence when current setup matches profitable patterns; lower confidence and tighten ranges when it matches prior-loss patterns.`;
        }
      }
    } catch (e: any) { console.warn("ODGS context fetch failed:", e?.message); }


    // Fetch Polymarket prediction signals for price skewing
    let polymarketContext = "";
    try {
      const polyRes = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/polymarket-signals`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${Deno.env.get("SUPABASE_ANON_KEY")}` },
        body: JSON.stringify({ ticker }),
      });
      if (polyRes.ok) {
        const polyData = await polyRes.json();
        if (polyData?.signals?.length > 0) {
          const topSignals = polyData.signals.slice(0, 6);
          polymarketContext = `\nPREDICTION MARKET SIGNALS (Polymarket — real money bets):\n${topSignals.map((s: any) => 
            `- "${s.market}": ${(s.probability * 100).toFixed(0)}% probability, direction: ${s.direction}, conviction: ${s.conviction}/100, 24h volume: $${((s.volume24h || 0) / 1000).toFixed(0)}K`
          ).join("\n")}\nUse these prediction market odds to SKEW your price targets and risk assessment. High-probability bearish signals should compress bull ranges and widen bear ranges. High-probability bullish signals should do the opposite.`;
        }
      }
    } catch (e) { console.warn("Polymarket fetch for analyze-stock failed:", e.message); }

    const t = Date.now();
    let currentPrice = 0;
    const isIndian = isIndianTicker(ticker);
    let currency = isIndian ? "INR" : "USD";
    let prevClose = 0;
    let dayHigh = 0;
    let dayLow = 0;
    let volume = 0;
    let fiftyTwoWeekHigh = 0;
    let fiftyTwoWeekLow = 0;

    const isCrypto = ticker.includes("-USD") || ticker.includes("-EUR");
    const isForex = ticker.includes("=X");
    const isCommodity = ticker.includes("=F");
    const symbolsToTry = buildTickerCandidates(ticker);
    console.log(`Ticker normalized: "${requestedTicker}" -> "${ticker}"; candidates: ${symbolsToTry.join(", ")}`);

    // ─── Yahoo Finance attempts ───
    for (const symbol of symbolsToTry) {
      if (currentPrice > 0) break;

      // v8 chart
      try {
        const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=5d&_t=${t}`;
        const yahooRes = await fetch(yahooUrl, { headers: { "User-Agent": UA, "Cache-Control": "no-cache, no-store" } });
        console.log(`v8 ${symbol}: HTTP ${yahooRes.status}`);
        if (yahooRes.ok) {
          const yahooData = await yahooRes.json();
          const meta = yahooData?.chart?.result?.[0]?.meta;
          if (meta?.regularMarketPrice && meta.regularMarketPrice > 0) {
            currentPrice = meta.regularMarketPrice;
            if (!isIndian) currency = meta.currency || currency;
            prevClose = meta.chartPreviousClose || meta.previousClose || 0;
            dayHigh = meta.regularMarketDayHigh || 0;
            dayLow = meta.regularMarketDayLow || 0;
            volume = meta.regularMarketVolume || 0;
            fiftyTwoWeekHigh = meta.fiftyTwoWeekHigh || 0;
            fiftyTwoWeekLow = meta.fiftyTwoWeekLow || 0;
            console.log(`✓ ${symbol} via v8: ${currency} ${currentPrice}`);
            break;
          }
        }
      } catch (e) { console.error(`Yahoo v8 error for ${symbol}:`, e); }

      // v6 quote
      try {
        const url = `https://query2.finance.yahoo.com/v6/finance/quote?symbols=${encodeURIComponent(symbol)}`;
        const res = await fetch(url, { headers: { "User-Agent": UA, "Cache-Control": "no-cache, no-store" } });
        console.log(`v6 ${symbol}: HTTP ${res.status}`);
        if (res.ok) {
          const data = await res.json();
          const q = data?.quoteResponse?.result?.[0];
          if (q?.regularMarketPrice && q.regularMarketPrice > 0) {
            currentPrice = q.regularMarketPrice;
            if (!isIndian) currency = q.currency || currency;
            prevClose = q.regularMarketPreviousClose || 0;
            dayHigh = q.regularMarketDayHigh || 0;
            dayLow = q.regularMarketDayLow || 0;
            volume = q.regularMarketVolume || 0;
            fiftyTwoWeekHigh = q.fiftyTwoWeekHigh || 0;
            fiftyTwoWeekLow = q.fiftyTwoWeekLow || 0;
            console.log(`✓ ${symbol} via v6: ${currency} ${currentPrice}`);
            break;
          }
        }
      } catch (e) { console.error(`Yahoo v6 error for ${symbol}:`, e); }

      // v10 quoteSummary
      try {
        const url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=price`;
        const res = await fetch(url, { headers: { "User-Agent": UA, "Cache-Control": "no-cache, no-store" } });
        console.log(`v10 ${symbol}: HTTP ${res.status}`);
        if (res.ok) {
          const data = await res.json();
          const pm = data?.quoteSummary?.result?.[0]?.price;
          const p = pm?.regularMarketPrice?.raw;
          if (p && p > 0) {
            currentPrice = p;
            if (!isIndian) currency = pm?.currency || currency;
            prevClose = pm?.regularMarketPreviousClose?.raw || 0;
            dayHigh = pm?.regularMarketDayHigh?.raw || 0;
            dayLow = pm?.regularMarketDayLow?.raw || 0;
            volume = pm?.regularMarketVolume?.raw || 0;
            fiftyTwoWeekHigh = pm?.fiftyTwoWeekHigh?.raw || 0;
            fiftyTwoWeekLow = pm?.fiftyTwoWeekLow?.raw || 0;
            console.log(`✓ ${symbol} via v10: ${currency} ${currentPrice}`);
            break;
          }
        }
      } catch (e) { console.error(`Yahoo v10 error for ${symbol}:`, e); }
    }

    // ─── Alpha Vantage fallback when Yahoo fails ───
    if (currentPrice <= 0) {
      console.log("Yahoo failed for all symbols, trying Alpha Vantage...");
      for (const symbol of symbolsToTry) {
        if (currentPrice > 0) break;
        const av = await fetchAlphaVantage(symbol);
        if (av && av.price > 0) {
          currentPrice = av.price;
          prevClose = av.prevClose;
          dayHigh = av.high;
          dayLow = av.low;
          volume = av.volume;
          console.log(`✓ ${symbol} via AlphaVantage: ${currency} ${currentPrice}`);
        }
      }
    }

    console.log(`Price resolution for ${ticker}: ${currentPrice > 0 ? `${currency} ${currentPrice}` : "FAILED — all endpoints returned no data"}`);

    // ─── Live scraped fundamentals (Screener / Yahoo / Finviz / Filings / News) ───
    let liveContext = "";
    try {
      const bundle = await fetchTickerLiveBundle(ticker, isIndian);
      liveContext = bundleToPromptContext(bundle);
      const sources = [
        bundle.screener && "Screener.in",
        bundle.yahoo && "Yahoo",
        bundle.finviz && "Finviz",
        bundle.filings.length && `${bundle.filings.length} filings`,
        bundle.news.length && `${bundle.news.length} news`,
      ].filter(Boolean).join(", ");
      console.log(`Live bundle for ${ticker}: ${sources || "no live sources hit"}`);
    } catch (e: any) {
      console.warn("Live bundle fetch failed:", e.message);
    }

    const currencySymbol = currency === "INR" ? "₹" : currency === "EUR" ? "€" : currency === "GBP" ? "£" : currency === "JPY" ? "¥" : "$";
    const dayChange = prevClose > 0 ? ((currentPrice - prevClose) / prevClose * 100).toFixed(2) : "N/A";
    const from52High = fiftyTwoWeekHigh > 0 ? ((currentPrice - fiftyTwoWeekHigh) / fiftyTwoWeekHigh * 100).toFixed(1) : "N/A";

    const priceUnavailable = currentPrice <= 0;
    const prompt = `Today is ${new Date().toISOString().split('T')[0]}. 
Perform DEEP analysis of "${ticker}" for an investor who bought at ${currencySymbol}${buyPrice} with ${quantity} units.
${priceUnavailable ? `\nIMPORTANT: Live price data could not be fetched. You MUST use your latest knowledge of ${ticker}'s approximate current market price in ${currency}. Set "currentPrice" to your best estimate in ${currency}. ${isIndian ? "This is an Indian stock listed on NSE/BSE — ALL prices MUST be in INR (Indian Rupees), NOT USD." : ""}\n` : ""}
REAL-TIME MARKET DATA:
- Current Price: ${currentPrice > 0 ? `${currencySymbol}${currentPrice}` : "unavailable — use your knowledge"}
- Currency: ${currency}
- Day Change: ${dayChange}%
- Previous Close: ${currencySymbol}${prevClose}
- Day Range: ${currencySymbol}${dayLow} - ${currencySymbol}${dayHigh}
- Volume: ${volume.toLocaleString()}
- 52-Week Range: ${currencySymbol}${fiftyTwoWeekLow} - ${currencySymbol}${fiftyTwoWeekHigh}
- Distance from 52W High: ${from52High}%

Asset type: ${isCrypto ? "Cryptocurrency" : isForex ? "Forex pair" : isCommodity ? "Commodity futures" : isIndian ? "Indian equity (NSE/BSE) — prices in INR" : "Global equity"}
${liveContext ? `\n${liveContext}\n` : ""}${polymarketContext}${odgsContext}

Return a JSON object with EXACTLY this structure (no markdown, just raw JSON):
{
  "currentPrice": <number in ${currency}>,
  "currency": "${currency}",
  "riskLevel": "<High | Medium | Low>",
  "riskScore": <0-100>,
  "riskBreakdown": { "volatilityRisk": <0-100>, "sectorRisk": <0-100>, "regulatoryRisk": <0-100>, "financialRisk": <0-100>, "macroRisk": <0-100> },
  "keyRisks": ["<risk1>", "<risk2>", "<risk3>", "<risk4>"],
  "bullRange": [<lower>, <upper>],
  "neutralRange": [<lower>, <upper>],
  "bearRange": [<lower>, <upper>],
  "suggestion": "<Hold | Add | Exit>",
  "confidence": <0-100>,
  "confidenceReasoning": "<2-3 sentence explanation of confidence score based on data quality, macro alignment, and structural factors>",
  "verdict": "<1 sentence probabilistic scenario assessment e.g. 'High-probability upside scenario toward 1850 projected range if support at 1500 holds with current momentum structure' or 'Downside scenario likely — structural deterioration with volatility expansion forming below key levels'>",
  "hedgeStrategy": "<Specific hedge positioning if primary scenario is invalidated, e.g. 'ATM put at strike 1450 (~2% premium) limits downside exposure to -5%' or 'Nifty IT index futures 1:0.5 ratio to offset sector beta exposure' — NEVER say 'no hedge needed', always provide a concrete defensive positioning>",
  "summary": "<4-5 sentence deep analysis using observational and probabilistic language — describe what market structure indicates, not what the user should do>",
  "macroFactors": ["<factor1>", "<factor2>"],
  "overallSentiment": <-100 to 100>,
  "totalPressure": <number>,
  "sector": "<sector name>",
  "assetClass": "<Equity | Crypto | Forex | Commodity | ETF>",
  "exchange": "<exchange name>",
  "marketCap": "<Large Cap | Mid Cap | Small Cap | Micro Cap | N/A>",
  "pe": <number or null>,
  "pbv": <number or null>,
  "dividendYield": <number or null>,
  "beta": <number>,
  "roe": <number or null>,
  "debtToEquity": <number or null>,
  "esgScore": <0-100 or null>,
  "technicals": { "rsi": <number>, "support": <number>, "resistance": <number>, "trend": "<bullish|bearish|sideways>", "maSignal": "<above_200dma|below_200dma|crossing>" },
  "news": [{ "headline": "<REAL recent headline from the last 7 days — must be a genuine news event, not fabricated>", "date": "<YYYY-MM-DD>", "category": "<Company|Sector|Macro>", "sentiment": <-100 to 100>, "shortTermImpact": <% number>, "longTermImpact": <% number>, "confidence": <0-100>, "explanation": "<2 sentence>" }]
}
ALL price values (currentPrice, support, resistance, bullRange, bearRange, neutralRange) MUST be in ${currency}.
CRITICAL NEWS RULES:
- Include 6-8 news items with REAL headlines from the LAST 7 DAYS only. Today is ${new Date().toISOString().split('T')[0]}.
- Each headline must reference a real event (earnings release, analyst upgrade/downgrade, regulatory action, macro data release, sector development).
- Include the date each headline was published.
- DO NOT fabricate or hallucinate headlines. If you cannot recall a real headline, describe the real event factually (e.g. "Fed holds rates steady at June FOMC meeting").
- News must be MARKET-MOVING — no generic filler like "Company continues operations".
FORMATTING: Do NOT use markdown. No asterisks, no bold (**), no italic (*), no headers (#), no bullet points. Use plain text only. Numbers and percentages are fine.
Every data point must reflect current market reality.`;

    let jsonStr: string;
    try {
      const aiOpts = {
        systemPrompt: `You are an institutional-grade market research analyst. You provide probabilistic scenario assessments — NOT investment advice. Use observational, data-driven language. Never use directive words like "buy", "sell", "enter", "exit". Instead use "market structure indicates", "high-probability scenario", "projected range", "liquidity zone forming", "volatility expansion likely". Return only valid JSON. Every number must be based on real current market data. No placeholders. Keep strings short to avoid truncation. ALL monetary values must be in ${currency}.${indiaMode ? "\nFocus exclusively on Indian market context (NSE/BSE). Consider SEBI/RBI regulations, Indian tax structure, INR denomination. Global events included only if they directly impact Indian markets." : ""}`,
        userPrompt: prompt,
        maxTokens: 8192,
      };

      // Fire both providers in parallel, pick the best result
      const parallelResults = await callAIParallel(aiOpts);
      console.log(`analyze-stock: ${parallelResults.length} parallel AI responses received`);

      // Pick the response with the most complete JSON (longest valid parse)
      let bestText = "";
      let bestScore = -1;
      for (const result of parallelResults) {
        const parsed = safeParseJSON(result.text);
        if (!parsed) continue;
        // Score by completeness: count non-null keys
        const keys = Object.keys(parsed);
        const score = keys.filter(k => parsed[k] != null).length;
        if (score > bestScore) {
          bestScore = score;
          bestText = result.text;
          console.log(`analyze-stock: picked ${result.provider} response (${score} fields)`);
        }
      }

      if (!bestText && parallelResults.length > 0) {
        bestText = parallelResults[0].text;
      }
      jsonStr = bestText;
    } catch (e: any) {
      if (e.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      throw e;
    }

    // Robust JSON parsing with safeParseJSON
    let analysis: any;
    try {
      analysis = safeParseJSON(jsonStr);
    } catch (parseErr: any) {
      console.error("JSON parse failed even after repair:", parseErr.message);
      throw new Error(`JSON parse failed: ${parseErr.message}`);
    }
    if (currentPrice > 0) analysis.currentPrice = currentPrice;
    // Always enforce correct currency
    analysis.currency = currency;

    return new Response(JSON.stringify(analysis), {
      headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0" },
    });
  } catch (error: any) {
    console.error("Error in analyze-stock:", error);
    if (error instanceof Response) return error;
    return new Response(JSON.stringify({ error: "Analysis failed", details: error.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
