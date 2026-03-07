import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function fetchYahooPrice(symbol: string) {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=5d&_t=${Date.now()}`;
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0", "Cache-Control": "no-cache, no-store" } });
    const data = await res.json();
    const meta = data?.chart?.result?.[0]?.meta;
    if (!meta) return null;
    const prevClose = meta.chartPreviousClose || meta.previousClose || 0;
    return {
      price: meta.regularMarketPrice || 0,
      currency: meta.currency || "USD",
      change: prevClose > 0 ? ((meta.regularMarketPrice - prevClose) / prevClose) * 100 : 0,
      volume: meta.regularMarketVolume || 0,
      fiftyTwoHigh: meta.fiftyTwoWeekHigh || 0,
      fiftyTwoLow: meta.fiftyTwoWeekLow || 0,
    };
  } catch { return null; }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const portfolioTickers = body.portfolioTickers || [];
    const portfolioValue = body.portfolioValue || 100000;

    const GOOGLE_GEMINI_KEY = Deno.env.get("GOOGLE_GEMINI_KEY");
    if (!GOOGLE_GEMINI_KEY) {
      return new Response(JSON.stringify({ error: "AI not configured" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GOOGLE_GEMINI_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: "You are an elite portfolio strategist at a $50B+ asset manager. Return ONLY valid JSON." }] },
        contents: [{ role: "user", parts: [{ text: `Today is ${new Date().toISOString().split("T")[0]}. Portfolio value: $${portfolioValue.toLocaleString()}. Existing tickers: ${portfolioTickers.join(", ") || "none"}.

Recommend 8-10 BEST assets to buy RIGHT NOW. Include global equities, ETFs, crypto, commodities, defensive positions. DO NOT repeat existing tickers: ${portfolioTickers.join(", ")}

Return JSON:
{
  "marketCondition": "<2-3 sentence market regime assessment>",
  "regimeType": "<risk-on|risk-off|transition|crisis>",
  "recommendations": [{
    "ticker": "<Yahoo Finance ticker>",
    "name": "<full name>",
    "assetClass": "<Equity|ETF|Crypto|Commodity|Forex>",
    "exchange": "<exchange>",
    "currency": "<USD|INR|EUR|GBP|JPY>",
    "currentEstPrice": <number>,
    "entryZone": [<support>, <resistance breakout>],
    "targetPrice": <number>,
    "stopLoss": <number>,
    "timeHorizon": "<1W|1M|3M|6M|1Y>",
    "suggestedQty": <number>,
    "confidence": <0-100>,
    "thesis": "<3 sentence rationale>",
    "catalyst": "<specific catalyst>",
    "hedgingStrategy": "<specific hedge>",
    "riskReward": "<e.g. 1:3.5>",
    "sector": "<sector>",
    "tags": ["<tag>"],
    "correlationToPortfolio": "<low|medium|high>",
    "maxDrawdownEstimate": <% number>
  }]
}` }] }],
        generationConfig: { temperature: 0.35, maxOutputTokens: 4000 },
      }),
    });

    if (!res.ok) {
      if (res.status === 429) return new Response(JSON.stringify({ error: "Rate limit exceeded." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      const errText = await res.text();
      console.error("Gemini error:", res.status, errText);
      return new Response(JSON.stringify({ error: "AI analysis failed" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const data = await res.json();
    const raw = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim()?.replace(/^```json?\n?/, "")?.replace(/\n?```$/, "");
    if (!raw) return new Response(JSON.stringify({ error: "Empty AI response" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    const result = JSON.parse(raw);

    // Validate prices with real Yahoo data
    const enriched = await Promise.all(
      (result.recommendations || []).map(async (rec: any) => {
        const real = await fetchYahooPrice(rec.ticker);
        return { ...rec, realPrice: real?.price || rec.currentEstPrice, realCurrency: real?.currency || rec.currency, priceChange24h: real?.change || 0, priceVerified: !!real, realVolume: real?.volume || 0, fiftyTwoHigh: real?.fiftyTwoHigh || 0, fiftyTwoLow: real?.fiftyTwoLow || 0 };
      })
    );

    return new Response(JSON.stringify({ marketCondition: result.marketCondition, regimeType: result.regimeType || "transition", recommendations: enriched, timestamp: Date.now() }), {
      headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("Desirable assets error:", error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});