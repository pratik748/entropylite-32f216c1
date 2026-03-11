
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { callAI } from "../_shared/callAI.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { portfolio, provider } = await req.json();

    if (!portfolio || portfolio.length === 0) {
      return new Response(JSON.stringify([]), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const summary = portfolio.map((s: any) => ({
      ticker: s.ticker, risk: s.riskScore || 40, beta: s.beta || 1,
      pnlPct: s.pnlPct || 0, currentPrice: s.currentPrice || s.buyPrice,
      sector: s.sector || "Unknown",
    }));

    const result = await callAI({
      systemPrompt: `You are a risk-to-profit conversion AI. Identify actionable trading opportunities from portfolio risk signals.
Return ONLY valid JSON array:
[{
  "type": "Crowded Trade" | "Forced Seller" | "Vol Spike" | "Momentum" | "Mean Reversion" | "Structural Dislocation",
  "signal": string (what you detected),
  "asset": string (ticker),
  "action": string (specific actionable trade),
  "expectedEdge": string (expected profit),
  "confidence": number (0-100),
  "urgency": "High" | "Medium" | "Low",
  "riskReward": string (e.g. "1:3.2")
}]
Find 3-8 opportunities. Be specific about strike prices, entry points, and position sizing.`,
      userPrompt: `Portfolio: ${JSON.stringify(summary)}
Identify crowded trades, forced sellers, volatility opportunities, momentum plays, mean-reversion setups, and structural dislocations.`,
      temperature: 0.5,
      maxTokens: 3072,
    });

    const opportunities = JSON.parse(result.text);
    return new Response(JSON.stringify(opportunities), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("crown-intelligence error:", err);
    return new Response(JSON.stringify({ error: err.message || "Crown intelligence failed" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
