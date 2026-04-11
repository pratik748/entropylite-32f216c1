import { corsHeaders } from "@supabase/supabase-js/cors";
import { callAI } from "../_shared/callAI.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { ticker, indiaMode } = await req.json();
    if (!ticker || typeof ticker !== "string") {
      return new Response(JSON.stringify({ error: "ticker required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const currency = indiaMode ? "INR" : "USD";

    const systemPrompt = `You are an institutional trading decision engine. You MUST respond with ONLY valid JSON, no explanation or markdown.

Your job: Given a stock ticker, produce a complete actionable trade plan.

Rules:
- ALL prices must be realistic current market levels in ${currency}
- Confidence is 0-100
- action is exactly one of: BUY, SELL, WAIT
- direction is exactly one of: UP, DOWN, SIDEWAYS
- timeframe examples: "Intraday", "2-3 days", "1 week", "2 weeks"
- directionReason max 8 words
- positiveNews and negativeNews are single short sentences (no links)
- protection is ONE simple sentence about what to do if trade fails

JSON schema:
{
  "action": "BUY" | "SELL" | "WAIT",
  "confidence": number,
  "entryLow": number,
  "entryHigh": number,
  "targetPrice": number,
  "stopLoss": number,
  "timeframe": string,
  "direction": "UP" | "DOWN" | "SIDEWAYS",
  "directionReason": string,
  "positiveNews": string,
  "negativeNews": string,
  "protection": string,
  "currentPrice": number
}`;

    const userPrompt = `Ticker: ${ticker.toUpperCase()}
Market: ${indiaMode ? "India (NSE/BSE)" : "US/Global"}
Currency: ${currency}
Date: ${new Date().toISOString().split("T")[0]}

Produce the trade decision JSON now.`;

    const result = await callAI({
      systemPrompt,
      userPrompt,
      maxTokens: 2048,
      temperature: 0.3,
      jsonMode: true,
    });

    let parsed: any;
    try {
      parsed = JSON.parse(result.text);
    } catch {
      // Try to extract JSON from text
      const match = result.text.match(/\{[\s\S]*\}/);
      if (match) {
        parsed = JSON.parse(match[0]);
      } else {
        throw new Error("Failed to parse AI response as JSON");
      }
    }

    // Validate and ensure defaults
    const output = {
      action: ["BUY", "SELL", "WAIT"].includes(parsed.action) ? parsed.action : "WAIT",
      confidence: Math.min(100, Math.max(0, Number(parsed.confidence) || 50)),
      entryLow: Number(parsed.entryLow) || 0,
      entryHigh: Number(parsed.entryHigh) || 0,
      targetPrice: Number(parsed.targetPrice) || 0,
      stopLoss: Number(parsed.stopLoss) || 0,
      timeframe: parsed.timeframe || "1 week",
      direction: ["UP", "DOWN", "SIDEWAYS"].includes(parsed.direction) ? parsed.direction : "SIDEWAYS",
      directionReason: (parsed.directionReason || "Insufficient data").slice(0, 60),
      positiveNews: (parsed.positiveNews || "No significant positive catalyst").slice(0, 120),
      negativeNews: (parsed.negativeNews || "No significant risk detected").slice(0, 120),
      protection: (parsed.protection || "Exit at stop loss if trade fails").slice(0, 120),
      currentPrice: Number(parsed.currentPrice) || 0,
      provider: result.provider,
    };

    return new Response(JSON.stringify(output), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("direct-profit error:", err);
    return new Response(JSON.stringify({ error: err.message || "Analysis failed" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
