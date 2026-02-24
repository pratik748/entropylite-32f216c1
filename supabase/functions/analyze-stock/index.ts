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

    const ALPHAVANTAGE_API_KEY = Deno.env.get("ALPHAVANTAGE_API_KEY");
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    if (!LOVABLE_API_KEY) {
      return new Response(
        JSON.stringify({ error: "AI API key not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 1. Fetch current stock price from Alpha Vantage (if key available)
    let currentPrice = 0;
    if (ALPHAVANTAGE_API_KEY) {
      try {
        const avUrl = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${encodeURIComponent(ticker)}&apikey=${ALPHAVANTAGE_API_KEY}`;
        const avRes = await fetch(avUrl);
        const avData = await avRes.json();
        if (avData["Global Quote"]?.["05. price"]) {
          currentPrice = parseFloat(avData["Global Quote"]["05. price"]);
        }
        if (!currentPrice) {
          const symbol = ticker.replace(".NS", "").replace(".BO", "");
          const avUrl2 = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${encodeURIComponent(symbol)}.BSE&apikey=${ALPHAVANTAGE_API_KEY}`;
          const avRes2 = await fetch(avUrl2);
          const avData2 = await avRes2.json();
          if (avData2["Global Quote"]?.["05. price"]) {
            currentPrice = parseFloat(avData2["Global Quote"]["05. price"]);
          }
        }
      } catch (e) {
        console.error("Alpha Vantage error:", e);
      }
    }

    // 2. Use Lovable AI for comprehensive analysis
    const prompt = `You are a senior Indian equity research analyst. Today's date is ${new Date().toISOString().split('T')[0]}. Analyze the stock "${ticker}" for an investor who bought at ₹${buyPrice} with ${quantity} shares.
${currentPrice > 0 ? `The current market price is ₹${currentPrice}.` : "Current price data is unavailable — estimate based on your most recent knowledge."}

Return a JSON object with EXACTLY this structure (no markdown, no code fences, just raw JSON):
{
  "currentPrice": <number - current price or best estimate>,
  "riskLevel": "<High | Medium | Low>",
  "keyRisks": ["<risk1>", "<risk2>", "<risk3>", "<risk4>"],
  "bullRange": [<lower>, <upper>],
  "neutralRange": [<lower>, <upper>],
  "bearRange": [<lower>, <upper>],
  "suggestion": "<Hold | Add | Exit>",
  "confidence": <number 0-100>,
  "summary": "<3-4 sentence analysis>",
  "macroFactors": ["<factor1>", "<factor2>", ...],
  "overallSentiment": <number -100 to 100>,
  "totalPressure": <number - estimated % price pressure>,
  "news": [
    {
      "headline": "<real or realistic recent headline>",
      "category": "<Company | Sector | Macro | Competitor>",
      "sentiment": <number -100 to 100>,
      "shortTermImpact": <number % impact>,
      "longTermImpact": <number % impact>,
      "confidence": <number 0-100>,
      "explanation": "<1 sentence>"
    }
  ]
}

Include 5-7 news items covering Company, Sector, Macro, and Competitor categories.
Use realistic recent Indian market data and events. All price ranges should be in INR.
Focus on NSE/BSE listed companies and Indian macroeconomic factors like RBI policy, INR/USD, crude oil, GDP growth, inflation, FII flows, etc.`;

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
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Error in analyze-stock:", error);
    return new Response(
      JSON.stringify({ error: "Analysis failed", details: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
