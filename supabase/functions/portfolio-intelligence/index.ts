import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { callAI } from "../_shared/callAI.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { portfolio, totalValue, baseCurrency } = await req.json();

    if (!portfolio || portfolio.length === 0) {
      return new Response(JSON.stringify({ error: "No portfolio data" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const result = await callAI({
      systemPrompt: `You are a portfolio intelligence AI engine. Analyze the full portfolio and produce:
Return ONLY valid JSON:
{
  "commandCenter": {
    "assets": [{
      "ticker": string, "weight": number, "flowPressure": number (0-100),
      "reflexivity": number (0-100), "structural": number (0-100),
      "worstCase": number (negative dollar loss 21-day), "suggestion": "Add" | "Hold" | "Trim" | "Exit"
    }]
  },
  "aftermath": {
    "assets": [{
      "ticker": string, "priceImpactBps": number, "slippageCost": number,
      "daysToUnwind": number, "narrativeRisk": "High" | "Medium" | "Low",
      "competitorReaction": number (0-100), "optimalSizePct": number
    }],
    "totalSlippage": number, "avgImpact": number, "selfDefeatRisk": "HIGH" | "MEDIUM" | "LOW"
  },
  "execution": {
    "recommendedAlgo": "VWAP" | "TWAP" | "POV" | "Adaptive",
    "reasoning": string,
    "estimatedSlippage": number, "completionHours": number,
    "optimalParticipation": number (percent)
  },
  "liquidityRadar": [{
    "ticker": string, "liquidityScore": number (0-100), "daysToExit": number
  }],
  "rebalancingSuggestions": [string],
  "concentrationWarnings": [string]
}`,
      userPrompt: `Portfolio (${baseCurrency || "USD"}, total: $${totalValue?.toLocaleString() || "N/A"}):
${JSON.stringify(portfolio, null, 1)}
Analyze capital allocation efficiency, market impact, optimal execution, and provide rebalancing suggestions.`,
      temperature: 0.4,
      maxTokens: 4096,
    });

    const data = JSON.parse(result.text);
    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("portfolio-intelligence error:", err);
    return new Response(JSON.stringify({ error: err.message || "Portfolio intelligence failed" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
