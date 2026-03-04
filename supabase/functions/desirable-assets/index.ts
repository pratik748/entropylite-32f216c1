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

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "AI not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Step 1: AI generates deep recommendations with market regime analysis
    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: "You are an elite portfolio strategist at a $50B+ asset manager. You think in terms of regime shifts, factor exposures, cross-asset correlations, and geopolitical tail risks. Return ONLY valid JSON." },
          { role: "user", content: `Today is ${new Date().toISOString().split("T")[0]}. Portfolio value: $${portfolioValue.toLocaleString()}. Existing tickers: ${portfolioTickers.join(", ") || "none"}.

DEEP MARKET ANALYSIS REQUIRED:
1. Assess current macro regime: growth/inflation cycle, central bank policy direction, credit conditions
2. Identify sector rotation signals: which sectors are entering/exiting favor
3. Evaluate cross-asset momentum: equities vs bonds vs commodities vs crypto
4. Factor analysis: value vs growth, large vs small cap, quality vs junk
5. Geopolitical overlay: which regions are risk-on vs risk-off

Based on this DEEP analysis, recommend 8-10 BEST assets to buy RIGHT NOW. Include:
- Global equities (US, EU, Asia, India, EM)
- ETFs for thematic/sector exposure
- Crypto positions for asymmetric upside
- Commodity positions for inflation/geopolitical hedge
- At least 1 defensive/hedge position

DO NOT repeat existing portfolio tickers: ${portfolioTickers.join(", ")}

For each recommendation provide:
- SPECIFIC entry zones based on real support/resistance levels
- Time-calibrated targets based on the asset's historical volatility
- Hedging strategies that are EXECUTABLE (specific instruments, not vague)
- Catalysts with SPECIFIC dates or events where possible

Return JSON:
{
  "marketCondition": "<2-3 sentence deep market regime assessment including current phase, risks, and opportunity set>",
  "regimeType": "<risk-on|risk-off|transition|crisis>",
  "recommendations": [
    {
      "ticker": "<Yahoo Finance ticker format>",
      "name": "<full asset name>",
      "assetClass": "<Equity|ETF|Crypto|Commodity|Forex>",
      "exchange": "<exchange>",
      "currency": "<USD|INR|EUR|GBP|JPY>",
      "currentEstPrice": <number>,
      "entryZone": [<support level>, <resistance breakout>],
      "targetPrice": <number based on measured move or fundamental fair value>,
      "stopLoss": <number based on key support break>,
      "timeHorizon": "<1W|1M|3M|6M|1Y>",
      "suggestedQty": <number based on $10k allocation and position sizing>,
      "confidence": <0-100>,
      "thesis": "<3 sentence deep rationale covering fundamentals, technicals, and macro alignment>",
      "catalyst": "<specific upcoming catalyst with date if possible>",
      "hedgingStrategy": "<specific executable hedge e.g. 'Buy AAPL 180 put for Dec expiry' or 'Short XLE as energy hedge'>",
      "riskReward": "<e.g. 1:3.5>",
      "sector": "<sector>",
      "tags": ["<momentum|value|defensive|growth|contrarian|macro|hedge|income>"],
      "correlationToPortfolio": "<low|medium|high>",
      "maxDrawdownEstimate": <% number>
    }
  ]
}` },
        ],
        temperature: 0.35,
        max_tokens: 4000,
      }),
    });

    if (!aiRes.ok) {
      if (aiRes.status === 429) {
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again shortly." }), {
          status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      if (aiRes.status === 402) {
        return new Response(JSON.stringify({ error: "AI credits exhausted." }), {
          status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      const errText = await aiRes.text();
      console.error("AI gateway error:", aiRes.status, errText);
      return new Response(JSON.stringify({ error: "AI analysis failed" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await aiRes.json();
    if (!aiData.choices?.[0]?.message?.content) {
      return new Response(JSON.stringify({ error: "AI failed" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const raw = aiData.choices[0].message.content.trim().replace(/^```json?\n?/, "").replace(/\n?```$/, "");
    const result = JSON.parse(raw);

    // Step 2: Validate ALL prices with real Yahoo data in parallel
    const enriched = await Promise.all(
      (result.recommendations || []).map(async (rec: any) => {
        const real = await fetchYahooPrice(rec.ticker);
        return {
          ...rec,
          realPrice: real?.price || rec.currentEstPrice,
          realCurrency: real?.currency || rec.currency,
          priceChange24h: real?.change || 0,
          priceVerified: !!real,
          realVolume: real?.volume || 0,
          fiftyTwoHigh: real?.fiftyTwoHigh || 0,
          fiftyTwoLow: real?.fiftyTwoLow || 0,
        };
      })
    );

    return new Response(JSON.stringify({
      marketCondition: result.marketCondition,
      regimeType: result.regimeType || "transition",
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
