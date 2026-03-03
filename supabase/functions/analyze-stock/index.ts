import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { ticker, buyPrice, quantity } = await req.json();

    if (!ticker || !buyPrice || !quantity) {
      return new Response(
        JSON.stringify({ error: "ticker, buyPrice, and quantity are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(
        JSON.stringify({ error: "AI API key not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Determine asset type and Yahoo symbol
    const t = Date.now();
    let currentPrice = 0;
    let currency = "USD";
    
    // Detect asset class from ticker format
    const isIndian = ticker.endsWith(".NS") || ticker.endsWith(".BO");
    const isCrypto = ticker.includes("-USD") || ticker.includes("-EUR");
    const isForex = ticker.includes("=X");
    const isCommodity = ticker.includes("=F");
    
    if (isIndian) currency = "INR";

    // Try fetching from Yahoo Finance — supports all global assets
    const symbolsToTry = isIndian 
      ? [ticker, ticker.replace(".NS", ".BO"), ticker.replace(".BO", ".NS")]
      : [ticker];

    for (const symbol of symbolsToTry) {
      if (currentPrice > 0) break;
      try {
        const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=5d&_t=${t}`;
        const yahooRes = await fetch(yahooUrl, {
          headers: {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
            "Cache-Control": "no-cache, no-store",
          },
        });
        const yahooData = await yahooRes.json();
        const meta = yahooData?.chart?.result?.[0]?.meta;
        if (meta?.regularMarketPrice && meta.regularMarketPrice > 0) {
          currentPrice = meta.regularMarketPrice;
          currency = meta.currency || currency;
        }
      } catch (e) {
        console.error(`Yahoo error for ${symbol}:`, e);
      }
    }

    const currencySymbol = currency === "INR" ? "₹" : currency === "EUR" ? "€" : currency === "GBP" ? "£" : "$";

    const prompt = `You are a senior global investment research analyst. Today is ${new Date().toISOString().split('T')[0]}. 
Analyze the asset "${ticker}" for an investor who bought at ${currencySymbol}${buyPrice} with ${quantity} units.
${currentPrice > 0 ? `Current market price: ${currencySymbol}${currentPrice}. Currency: ${currency}.` : "Price unavailable — use latest knowledge."}

Asset type: ${isCrypto ? "Cryptocurrency" : isForex ? "Forex pair" : isCommodity ? "Commodity futures" : isIndian ? "Indian equity" : "Global equity"}

IMPORTANT: Provide REAL analysis based on actual recent events, earnings, and macro conditions globally.

Return a JSON object with EXACTLY this structure (no markdown, just raw JSON):
{
  "currentPrice": <number>,
  "currency": "${currency}",
  "riskLevel": "<High | Medium | Low>",
  "riskScore": <0-100>,
  "riskBreakdown": {
    "volatilityRisk": <0-100>,
    "sectorRisk": <0-100>,
    "regulatoryRisk": <0-100>,
    "financialRisk": <0-100>,
    "macroRisk": <0-100>
  },
  "keyRisks": ["<risk1>", "<risk2>", "<risk3>", "<risk4>"],
  "bullRange": [<lower>, <upper>],
  "neutralRange": [<lower>, <upper>],
  "bearRange": [<lower>, <upper>],
  "suggestion": "<Hold | Add | Exit>",
  "confidence": <0-100>,
  "confidenceReasoning": "<1-2 sentence explanation>",
  "summary": "<3-4 sentence analysis>",
  "macroFactors": ["<factor1>", "<factor2>"],
  "overallSentiment": <-100 to 100>,
  "totalPressure": <number>,
  "sector": "<sector name>",
  "assetClass": "<Equity | Crypto | Forex | Commodity | ETF>",
  "exchange": "<exchange name>",
  "marketCap": "<Large Cap | Mid Cap | Small Cap | N/A>",
  "pe": <number or null>,
  "pbv": <number or null>,
  "dividendYield": <number or null>,
  "beta": <number>,
  "esgScore": <0-100 or null>,
  "news": [
    {
      "headline": "<real recent headline>",
      "category": "<Company | Sector | Macro | Competitor>",
      "sentiment": <-100 to 100>,
      "shortTermImpact": <% number>,
      "longTermImpact": <% number>,
      "confidence": <0-100>,
      "explanation": "<1 sentence>"
    }
  ]
}

Include 5-7 news items. Use REAL recent market data.`;

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: "You are a financial analyst. Return only valid JSON, no markdown." },
          { role: "user", content: prompt },
        ],
        temperature: 0.4,
        max_tokens: 3000,
      }),
    });

    const aiData = await aiRes.json();

    if (!aiData.choices?.[0]?.message?.content) {
      console.error("AI response:", JSON.stringify(aiData));
      return new Response(
        JSON.stringify({ error: "AI analysis failed", details: aiData.error?.message || "No response" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const rawContent = aiData.choices[0].message.content.trim();
    const jsonStr = rawContent.replace(/^```json?\n?/, "").replace(/\n?```$/, "");
    const analysis = JSON.parse(jsonStr);

    // Override with real Yahoo price
    if (currentPrice > 0) {
      analysis.currentPrice = currentPrice;
    }
    analysis.currency = currency;

    return new Response(JSON.stringify(analysis), {
      headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0" },
    });
  } catch (error) {
    console.error("Error in analyze-stock:", error);
    return new Response(
      JSON.stringify({ error: "Analysis failed", details: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
