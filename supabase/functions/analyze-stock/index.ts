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

    // 1. Fetch current stock price from Yahoo Finance with cache busting
    let currentPrice = 0;
    const suffixes = [".NS", ".BO"];
    const baseTicker = ticker.replace(".NS", "").replace(".BO", "").replace(".BSE", "");
    const t = Date.now();

    for (const suffix of suffixes) {
      if (currentPrice > 0) break;
      try {
        const symbol = `${baseTicker}${suffix}`;
        const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d&_t=${t}`;
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
        }
      } catch (e) {
        console.error(`Yahoo Finance error for ${baseTicker}${suffix}:`, e);
      }
    }

    // 2. Use Lovable AI for comprehensive analysis
    const prompt = `You are a senior Indian equity research analyst with access to the latest market data. Today's date is ${new Date().toISOString().split('T')[0]}. Analyze the stock "${ticker}" for an investor who bought at ₹${buyPrice} with ${quantity} shares.
${currentPrice > 0 ? `The current market price is ₹${currentPrice}.` : "Current price data is unavailable — estimate based on your most recent knowledge."}

IMPORTANT: Provide REAL analysis based on actual recent events, earnings, and macro conditions.

Return a JSON object with EXACTLY this structure (no markdown, no code fences, just raw JSON):
{
  "currentPrice": <number>,
  "riskLevel": "<High | Medium | Low>",
  "riskScore": <number 0-100>,
  "riskBreakdown": {
    "volatilityRisk": <number 0-100>,
    "sectorRisk": <number 0-100>,
    "regulatoryRisk": <number 0-100>,
    "financialRisk": <number 0-100>,
    "macroRisk": <number 0-100>
  },
  "keyRisks": ["<risk1>", "<risk2>", "<risk3>", "<risk4>"],
  "bullRange": [<lower>, <upper>],
  "neutralRange": [<lower>, <upper>],
  "bearRange": [<lower>, <upper>],
  "suggestion": "<Hold | Add | Exit>",
  "confidence": <number 0-100>,
  "confidenceReasoning": "<1-2 sentence explanation>",
  "summary": "<3-4 sentence analysis>",
  "macroFactors": ["<factor1>", "<factor2>"],
  "overallSentiment": <number -100 to 100>,
  "totalPressure": <number>,
  "sector": "<sector name like Financials, IT, Energy, Consumer, Pharma, Auto, Metals, Realty>",
  "marketCap": "<Large Cap | Mid Cap | Small Cap>",
  "pe": <number P/E ratio>,
  "pbv": <number P/BV ratio>,
  "dividendYield": <number %>,
  "beta": <number>,
  "esgScore": <number 0-100 or null>,
  "news": [
    {
      "headline": "<real recent headline>",
      "category": "<Company | Sector | Macro | Competitor>",
      "sentiment": <number -100 to 100>,
      "shortTermImpact": <number %>,
      "longTermImpact": <number %>,
      "confidence": <number 0-100>,
      "explanation": "<1 sentence>"
    }
  ]
}

Include 5-7 news items. Use REAL recent Indian market data. All prices in INR.`;

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
        temperature: 0.5,
        max_tokens: 2500,
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

    if (currentPrice > 0) {
      analysis.currentPrice = currentPrice;
    }

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
