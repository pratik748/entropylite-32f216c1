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

    // 1. Fetch current stock price from Yahoo Finance (free, accurate for Indian stocks)
    let currentPrice = 0;
    const suffixes = [".NS", ".BO"];
    const baseTicker = ticker.replace(".NS", "").replace(".BO", "").replace(".BSE", "");

    for (const suffix of suffixes) {
      if (currentPrice > 0) break;
      try {
        const symbol = `${baseTicker}${suffix}`;
        const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`;
        const yahooRes = await fetch(yahooUrl, {
          headers: { "User-Agent": "Mozilla/5.0" },
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

    // 2. Use Lovable AI for comprehensive analysis with real confidence & risk
    const prompt = `You are a senior Indian equity research analyst with access to the latest market data. Today's date is ${new Date().toISOString().split('T')[0]}. Analyze the stock "${ticker}" for an investor who bought at ₹${buyPrice} with ${quantity} shares.
${currentPrice > 0 ? `The current market price is ₹${currentPrice}.` : "Current price data is unavailable — estimate based on your most recent knowledge and provide your best estimate."}

IMPORTANT: Provide REAL analysis based on actual recent events, earnings, and macro conditions. Do NOT use placeholder or generic data.

For confidence: Base it on data availability, earnings visibility, analyst consensus, and sector predictability. Explain your reasoning.
For risk: Evaluate volatility, beta, sector risk, regulatory risk, leverage, and macro sensitivity. Quantify with a risk score 0-100.

Return a JSON object with EXACTLY this structure (no markdown, no code fences, just raw JSON):
{
  "currentPrice": <number - current price or best estimate in INR>,
  "riskLevel": "<High | Medium | Low>",
  "riskScore": <number 0-100, where 0=no risk, 100=extreme risk>,
  "riskBreakdown": {
    "volatilityRisk": <number 0-100>,
    "sectorRisk": <number 0-100>,
    "regulatoryRisk": <number 0-100>,
    "financialRisk": <number 0-100>,
    "macroRisk": <number 0-100>
  },
  "keyRisks": ["<specific recent risk event 1>", "<risk 2>", "<risk 3>", "<risk 4>"],
  "bullRange": [<lower>, <upper>],
  "neutralRange": [<lower>, <upper>],
  "bearRange": [<lower>, <upper>],
  "suggestion": "<Hold | Add | Exit>",
  "confidence": <number 0-100>,
  "confidenceReasoning": "<1-2 sentence explanation of why confidence is at this level>",
  "summary": "<3-4 sentence analysis based on real recent events>",
  "macroFactors": ["<factor1>", "<factor2>", ...],
  "overallSentiment": <number -100 to 100>,
  "totalPressure": <number - estimated % price pressure based on news>,
  "news": [
    {
      "headline": "<real recent headline from the last 1-3 months>",
      "category": "<Company | Sector | Macro | Competitor>",
      "sentiment": <number -100 to 100>,
      "shortTermImpact": <number % impact>,
      "longTermImpact": <number % impact>,
      "confidence": <number 0-100>,
      "explanation": "<1 sentence explaining the impact>"
    }
  ]
}

Include 5-7 news items covering Company, Sector, Macro, and Competitor categories.
Use REAL recent Indian market data and events. All price ranges must be in INR.
Focus on NSE/BSE listed companies and Indian macroeconomic factors like RBI policy, INR/USD, crude oil, GDP growth, inflation, FII flows, etc.`;

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: "You are a financial analyst. Return only valid JSON, no markdown." },
          { role: "user", content: prompt },
        ],
        temperature: 0.7,
        max_tokens: 2000,
      }),
    });

    const aiData = await aiRes.json();

    if (!aiData.choices?.[0]?.message?.content) {
      console.error("AI response:", JSON.stringify(aiData));
      return new Response(
        JSON.stringify({ error: "AI analysis failed", details: aiData.error?.message || "No response from AI" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const rawContent = aiData.choices[0].message.content.trim();
    // Strip possible markdown code fences
    const jsonStr = rawContent.replace(/^```json?\n?/, "").replace(/\n?```$/, "");
    const analysis = JSON.parse(jsonStr);

    // Override with real price if we got one
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
