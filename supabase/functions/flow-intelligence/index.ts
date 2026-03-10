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
    const { portfolio, vix, marketRegime } = await req.json();

    if (!portfolio || portfolio.length === 0) {
      return new Response(JSON.stringify({ error: "No portfolio data" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const summary = portfolio.map((s: any) => ({
      ticker: s.ticker, beta: s.beta || 1, risk: s.riskScore || 40,
      sector: s.sector || "Unknown", weight: s.weight || 0,
    }));

    const result = await callAI({
      systemPrompt: `You are an institutional flow detection AI. Analyze portfolio structure and market context to detect flow signals.
Return ONLY valid JSON array of flow signals:
[{
  "name": string (signal name like "ETF Rebalancing", "Vol Targeting", "CTA Momentum", etc.),
  "category": "STRUCT" | "FLOW" | "RISK" | "OPTIONS",
  "intensity": number (0-100),
  "direction": "BUY" | "SELL" | "NEUTRAL",
  "impact": number (0-100),
  "reasoning": string (1 sentence explanation)
}]
Generate 6-10 signals covering: ETF Rebalancing, Vol Targeting, Liquidity Stress, CTA Momentum, Gamma Exposure, Dark Pool Activity, Risk Parity, Pension Rebalance. Base signals on the actual portfolio composition and market conditions.`,
      userPrompt: `Portfolio holdings: ${JSON.stringify(summary)}
VIX: ${vix || "N/A"}, Regime: ${marketRegime || "Unknown"}
Detect institutional flow patterns based on the portfolio's beta exposure, sector concentration, and risk profile.`,
      temperature: 0.5,
      maxTokens: 2048,
    });

    const signals = JSON.parse(result.text);
    return new Response(JSON.stringify(signals), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("flow-intelligence error:", err);
    return new Response(JSON.stringify({ error: err.message || "Flow intelligence failed" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
