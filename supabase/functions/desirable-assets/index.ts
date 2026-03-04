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
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0", "Cache-Control": "no-cache, no-store" },
    });
    const data = await res.json();
    const meta = data?.chart?.result?.[0]?.meta;
    if (!meta) return null;
    const prevClose = meta.chartPreviousClose || meta.previousClose || 0;
    return {
      price: meta.regularMarketPrice || 0,
      currency: meta.currency || "USD",
      change: prevClose > 0 ? ((meta.regularMarketPrice - prevClose) / prevClose) * 100 : 0,
    };
  } catch { return null; }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const portfolioTickers = body.portfolioTickers || [];
    const portfolioValue = body.portfolioValue || 100000;

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "AI not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Step 1: AI generates recommendations
    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: "You are a senior portfolio strategist. Return ONLY valid JSON." },
          { role: "user", content: `Today is ${new Date().toISOString().split("T")[0]}. Portfolio value: $${portfolioValue.toLocaleString()}. Existing tickers: ${portfolioTickers.join(", ") || "none"}.

Analyze current global market conditions and recommend 8-10 BEST assets to buy RIGHT NOW. Include stocks, ETFs, crypto, commodities across global markets. DO NOT repeat existing portfolio tickers.

Focus on: momentum, value, macro trends, sector rotation, geopolitical hedges.

Return JSON:
{
  "marketCondition": "<1 sentence current market state>",
  "recommendations": [
    {
      "ticker": "<Yahoo Finance ticker format>",
      "name": "<asset name>",
      "assetClass": "<Equity|ETF|Crypto|Commodity|Forex>",
      "exchange": "<exchange>",
      "currency": "<USD|INR|EUR|GBP|JPY>",
      "currentEstPrice": <number>,
      "entryZone": [<low>, <high>],
      "targetPrice": <number>,
      "stopLoss": <number>,
      "timeHorizon": "<1W|1M|3M|6M|1Y>",
      "suggestedQty": <number based on $10k allocation>,
      "confidence": <0-100>,
      "thesis": "<2 sentence rationale>",
      "catalyst": "<upcoming catalyst>",
      "hedgingStrategy": "<1 sentence hedge>",
      "riskReward": "<e.g. 1:3>",
      "sector": "<sector>",
      "tags": ["<momentum|value|defensive|growth|contrarian|macro>"]
    }
  ]
}` },
        ],
        temperature: 0.4,
        max_tokens: 3000,
      }),
    });

    const aiData = await aiRes.json();
    if (!aiData.choices?.[0]?.message?.content) {
      return new Response(JSON.stringify({ error: "AI failed" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const raw = aiData.choices[0].message.content.trim().replace(/^```json?\n?/, "").replace(/\n?```$/, "");
    const result = JSON.parse(raw);

    // Step 2: Validate prices with real Yahoo data
    const enriched = await Promise.all(
      (result.recommendations || []).map(async (rec: any) => {
        const real = await fetchYahooPrice(rec.ticker);
        return {
          ...rec,
          realPrice: real?.price || rec.currentEstPrice,
          realCurrency: real?.currency || rec.currency,
          priceChange24h: real?.change || 0,
          priceVerified: !!real,
        };
      })
    );

    return new Response(JSON.stringify({
      marketCondition: result.marketCondition,
      recommendations: enriched,
      timestamp: Date.now(),
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("Desirable assets error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
