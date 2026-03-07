import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function callGemini(systemPrompt: string, userPrompt: string, maxTokens = 4000, temperature = 0.3) {
  const key = Deno.env.get("GOOGLE_GEMINI_KEY");
  if (!key) throw new Error("GOOGLE_GEMINI_KEY not configured");
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: systemPrompt }] },
      contents: [{ role: "user", parts: [{ text: userPrompt }] }],
      generationConfig: { temperature, maxOutputTokens: maxTokens },
    }),
  });
  if (!res.ok) {
    const status = res.status;
    const text = await res.text();
    console.error("Gemini error:", status, text);
    if (status === 429) throw { status: 429, message: "Rate limited" };
    throw new Error(`Gemini error: ${status}`);
  }
  const data = await res.json();
  const raw = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
  if (!raw) throw new Error("Empty Gemini response");
  return raw.replace(/^```json?\n?/, "").replace(/\n?```$/, "");
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { ticker, buyPrice, quantity } = await req.json();
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
    if (isIndian) currency = "INR";

    const symbolsToTry = isIndian
      ? [ticker, ticker.replace(".NS", ".BO"), ticker.replace(".BO", ".NS")]
      : [ticker];

    for (const symbol of symbolsToTry) {
      if (currentPrice > 0) break;
      try {
        const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=5d&_t=${t}`;
        const yahooRes = await fetch(yahooUrl, {
          headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36", "Cache-Control": "no-cache, no-store" },
        });
        const yahooData = await yahooRes.json();
        const meta = yahooData?.chart?.result?.[0]?.meta;
        if (meta?.regularMarketPrice && meta.regularMarketPrice > 0) {
          currentPrice = meta.regularMarketPrice;
          currency = meta.currency || currency;
          prevClose = meta.chartPreviousClose || meta.previousClose || 0;
          dayHigh = meta.regularMarketDayHigh || 0;
          dayLow = meta.regularMarketDayLow || 0;
          volume = meta.regularMarketVolume || 0;
          fiftyTwoWeekHigh = meta.fiftyTwoWeekHigh || 0;
          fiftyTwoWeekLow = meta.fiftyTwoWeekLow || 0;
        }
      } catch (e) { console.error(`Yahoo error for ${symbol}:`, e); }
    }

    const currencySymbol = currency === "INR" ? "₹" : currency === "EUR" ? "€" : currency === "GBP" ? "£" : currency === "JPY" ? "¥" : "$";
    const dayChange = prevClose > 0 ? ((currentPrice - prevClose) / prevClose * 100).toFixed(2) : "N/A";
    const from52High = fiftyTwoWeekHigh > 0 ? ((currentPrice - fiftyTwoWeekHigh) / fiftyTwoWeekHigh * 100).toFixed(1) : "N/A";

    const prompt = `Today is ${new Date().toISOString().split('T')[0]}. 
Perform DEEP analysis of "${ticker}" for an investor who bought at ${currencySymbol}${buyPrice} with ${quantity} units.

REAL-TIME MARKET DATA:
- Current Price: ${currentPrice > 0 ? `${currencySymbol}${currentPrice}` : "unavailable"}
- Currency: ${currency}
- Day Change: ${dayChange}%
- Previous Close: ${currencySymbol}${prevClose}
- Day Range: ${currencySymbol}${dayLow} - ${currencySymbol}${dayHigh}
- Volume: ${volume.toLocaleString()}
- 52-Week Range: ${currencySymbol}${fiftyTwoWeekLow} - ${currencySymbol}${fiftyTwoWeekHigh}
- Distance from 52W High: ${from52High}%

Asset type: ${isCrypto ? "Cryptocurrency" : isForex ? "Forex pair" : isCommodity ? "Commodity futures" : isIndian ? "Indian equity (NSE/BSE)" : "Global equity"}

Return a JSON object with EXACTLY this structure (no markdown, just raw JSON):
{
  "currentPrice": <number>,
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
Include 6-8 news items with REAL recent headlines. Every data point must reflect current market reality.`;

    let jsonStr: string;
    try {
      jsonStr = await callGemini(
        "You are an institutional-grade financial analyst. Return only valid JSON. Every number must be based on real current market data. No placeholders.",
        prompt
      );
    } catch (e: any) {
      if (e.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      throw e;
    }

    const analysis = JSON.parse(jsonStr);
    if (currentPrice > 0) analysis.currentPrice = currentPrice;
    analysis.currency = currency;

    return new Response(JSON.stringify(analysis), {
      headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0" },
    });
  } catch (error) {
    console.error("Error in analyze-stock:", error);
    return new Response(JSON.stringify({ error: "Analysis failed", details: error.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});