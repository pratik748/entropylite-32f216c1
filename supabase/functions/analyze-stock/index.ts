import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { callAI } from "../_shared/callAI.ts";
import { requireAuth } from "../_shared/auth.ts";
import { safeParseJSON } from "../_shared/safeParseJSON.ts";

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
    // Strip .NS/.BO suffix for Alpha Vantage — it uses BSE: or NSE: prefix format
    const cleanSymbol = symbol.replace(/\.(NS|BO)$/, "");
    const exchange = symbol.endsWith(".BO") ? "BSE" : "NSE";
    const avSymbol = symbol.endsWith(".NS") || symbol.endsWith(".BO") ? `${exchange}:${cleanSymbol}` : cleanSymbol;

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
    await requireAuth(req, corsHeaders);
    const rawBody = await req.json();
    const provider = rawBody.provider;
    const ticker = (rawBody.ticker || "").toString().trim().toUpperCase();
    const buyPrice = rawBody.buyPrice;
    const quantity = rawBody.quantity;
    if (!ticker || !buyPrice || !quantity) {
      return new Response(JSON.stringify({ error: "ticker, buyPrice, and quantity are required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const t = Date.now();
    let currentPrice = 0;
    let currency = "USD";
    let prevClose = 0;
    let dayHigh = 0;
    let dayLow = 0;
    let volume = 0;
    let fiftyTwoWeekHigh = 0;
    let fiftyTwoWeekLow = 0;

    const isIndian = ticker.endsWith(".NS") || ticker.endsWith(".BO");
    const isCrypto = ticker.includes("-USD") || ticker.includes("-EUR");
    const isForex = ticker.includes("=X");
    const isCommodity = ticker.includes("=F");
    // Force INR for Indian tickers regardless of what Yahoo returns
    if (isIndian) currency = "INR";

    // Known Indian stocks without suffix — auto-try .NS and .BO
    const KNOWN_INDIAN = ["WIPRO","TCS","INFY","RELIANCE","HDFCBANK","ICICIBANK","SBIN","TATAMOTORS","BHARTIARTL","ITC","KOTAKBANK","LT","AXISBANK","MARUTI","SUNPHARMA","TITAN","BAJFINANCE","HCLTECH","ADANIENT","ADANIPORTS","TECHM","HINDUNILVR","POWERGRID","NTPC","ONGC","COALINDIA","BPCL","JSWSTEEL","TATASTEEL","DRREDDY","CIPLA","DIVISLAB","ULTRACEMCO","GRASIM","NESTLEIND","BAJAJFINSV","HEROMOTOCO","EICHERMOT","APOLLOHOSP","HINDALCO","VEDL","MRF","IRCTC","ZOMATO","PAYTM","NYKAA","DMART","TRENT","JIOFIN","ETERNAL"];
    const looksIndian = KNOWN_INDIAN.includes(ticker) || KNOWN_INDIAN.includes(ticker.replace(/\.(NS|BO)$/, ""));

    const symbolsToTry = isIndian
      ? [ticker, ticker.replace(".NS", ".BO"), ticker.replace(".BO", ".NS")]
      : looksIndian && !isCrypto && !isForex && !isCommodity && !ticker.startsWith("^")
        ? [ticker, `${ticker}.NS`, `${ticker}.BO`]
        : [ticker];

    // If it's a known Indian ticker without suffix, force INR
    if (looksIndian && !isIndian) currency = "INR";

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
            if (!isIndian && !looksIndian) currency = meta.currency || currency;
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
            if (!isIndian && !looksIndian) currency = q.currency || currency;
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
            if (!isIndian && !looksIndian) currency = pm?.currency || currency;
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

    const currencySymbol = currency === "INR" ? "₹" : currency === "EUR" ? "€" : currency === "GBP" ? "£" : currency === "JPY" ? "¥" : "$";
    const dayChange = prevClose > 0 ? ((currentPrice - prevClose) / prevClose * 100).toFixed(2) : "N/A";
    const from52High = fiftyTwoWeekHigh > 0 ? ((currentPrice - fiftyTwoWeekHigh) / fiftyTwoWeekHigh * 100).toFixed(1) : "N/A";

    const priceUnavailable = currentPrice <= 0;
    const prompt = `Today is ${new Date().toISOString().split('T')[0]}. 
Perform DEEP analysis of "${ticker}" for an investor who bought at ${currencySymbol}${buyPrice} with ${quantity} units.
${priceUnavailable ? `\nIMPORTANT: Live price data could not be fetched. You MUST use your latest knowledge of ${ticker}'s approximate current market price in ${currency}. Set "currentPrice" to your best estimate in ${currency}. ${isIndian || looksIndian ? "This is an Indian stock listed on NSE/BSE — ALL prices MUST be in INR (Indian Rupees), NOT USD." : ""}\n` : ""}
REAL-TIME MARKET DATA:
- Current Price: ${currentPrice > 0 ? `${currencySymbol}${currentPrice}` : "unavailable — use your knowledge"}
- Currency: ${currency}
- Day Change: ${dayChange}%
- Previous Close: ${currencySymbol}${prevClose}
- Day Range: ${currencySymbol}${dayLow} - ${currencySymbol}${dayHigh}
- Volume: ${volume.toLocaleString()}
- 52-Week Range: ${currencySymbol}${fiftyTwoWeekLow} - ${currencySymbol}${fiftyTwoWeekHigh}
- Distance from 52W High: ${from52High}%

Asset type: ${isCrypto ? "Cryptocurrency" : isForex ? "Forex pair" : isCommodity ? "Commodity futures" : (isIndian || looksIndian) ? "Indian equity (NSE/BSE) — prices in INR" : "Global equity"}

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
  "confidenceReasoning": "<2-3 sentence explanation>",
  "summary": "<4-5 sentence deep analysis>",
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
  "news": [{ "headline": "<real headline>", "category": "<Company|Sector|Macro>", "sentiment": <-100 to 100>, "shortTermImpact": <% number>, "longTermImpact": <% number>, "confidence": <0-100>, "explanation": "<2 sentence>" }]
}
ALL price values (currentPrice, support, resistance, bullRange, bearRange, neutralRange) MUST be in ${currency}.
Include 6-8 news items with REAL recent headlines. Every data point must reflect current market reality.`;

    let jsonStr: string;
    try {
      const result = await callAI({
        systemPrompt: `You are an institutional-grade financial analyst. Return only valid JSON. Every number must be based on real current market data. No placeholders. Keep strings short to avoid truncation. ALL monetary values must be in ${currency}.`,
        userPrompt: prompt,
        maxTokens: 8192,
        provider,
      });
      jsonStr = result.text;
      console.log(`analyze-stock used provider: ${result.provider}`);
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
  } catch (error) {
    console.error("Error in analyze-stock:", error);
    return new Response(JSON.stringify({ error: "Analysis failed", details: error.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
