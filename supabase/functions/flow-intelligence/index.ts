
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { callAI } from "../_shared/callAI.ts";
import { safeParseJSON } from "../_shared/safeParseJSON.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { portfolio, vix, marketRegime, provider, polymarketSignals } = await req.json();

    if (!portfolio || portfolio.length === 0) {
      return new Response(JSON.stringify({ error: "No portfolio data" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const summary = portfolio.map((s: any) => ({
      ticker: s.ticker, beta: s.beta || 1, risk: s.riskScore || 40,
      sector: s.sector || "Unknown", weight: s.weight || 0,
    }));

    // Build Polymarket context if available
    const polyContext = polymarketSignals && Array.isArray(polymarketSignals) && polymarketSignals.length > 0
      ? `\nPrediction Market Signals (Polymarket):\n${polymarketSignals.map((s: any) => `- "${s.market}": ${(s.probability * 100).toFixed(0)}% prob, ${s.direction}, $${(s.volume24h / 1000).toFixed(0)}K vol`).join("\n")}`
      : "";

    let result;
    try {
      result = await callAI({
        provider,
        systemPrompt: `You are an institutional flow detection AI. Analyze portfolio structure, market context, and prediction market signals to detect flow signals.
Return ONLY valid JSON array of flow signals:
[{
  "name": string (signal name like "ETF Rebalancing", "Vol Targeting", "CTA Momentum", "Polymarket Macro Skew", etc.),
  "category": "STRUCT" | "FLOW" | "RISK" | "OPTIONS" | "PRED",
  "intensity": number (0-100),
  "direction": "BUY" | "SELL" | "NEUTRAL",
  "impact": number (0-100),
  "reasoning": string (1 sentence explanation)
}]
Generate 6-12 signals covering: ETF Rebalancing, Vol Targeting, Liquidity Stress, CTA Momentum, Gamma Exposure, Dark Pool Activity, Risk Parity, Pension Rebalance. If prediction market data is available, include 2-3 "PRED" category signals based on Polymarket probabilities. Base signals on the actual portfolio composition, market conditions, and prediction market odds.`,
        userPrompt: `Portfolio holdings: ${JSON.stringify(summary)}
VIX: ${vix || "N/A"}, Regime: ${marketRegime || "Unknown"}${polyContext}
Detect institutional flow patterns and prediction market-informed signals based on the portfolio's beta exposure, sector concentration, and risk profile.`,
        temperature: 0.5,
        maxTokens: 2048,
      });
    } catch (aiErr: any) {
      const msg = String(aiErr?.message || aiErr);
      const isCapacity = /429|capacity|rate.?limit|service_tier/i.test(msg);
      console.warn("flow-intelligence AI failed, returning empty signals:", msg);
      return new Response(
        JSON.stringify({ signals: [], fallback: true, reason: isCapacity ? "AI_CAPACITY" : "AI_FAILED" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const signals = safeParseJSON(result.text) || [];
    return new Response(JSON.stringify(signals), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("flow-intelligence error:", err);
    return new Response(
      JSON.stringify({ signals: [], fallback: true, reason: "FUNCTION_ERROR", error: err.message }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
