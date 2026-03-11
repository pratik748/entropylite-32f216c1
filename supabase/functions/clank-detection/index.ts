import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { callAI } from "../_shared/callAI.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { portfolio, vix, regime, provider } = await req.json();
    const ctx = JSON.stringify({ portfolio: portfolio?.slice(0, 20), vix, regime });

    const result = await callAI({
      systemPrompt: `You are an institutional constraint detection engine. Analyze portfolio holdings against known mechanical market forces that create predictable, forced trading flows. Detect ALL applicable constraints from this list:

1. Index Rebalance Flows — quarterly S&P/Russell reconstitution forcing passive fund buying/selling
2. ETF Creation/Redemption — authorized participant arbitrage creating forced basket trades
3. Volatility Targeting Funds — risk parity / vol control funds forced to sell when VIX spikes
4. CTA Trend Triggers — systematic trend followers hitting entry/exit thresholds
5. Dealer Gamma Exposure — options market maker hedging creating amplified moves near strikes
6. Pension Rebalancing — quarterly calendar-driven flows from pension fund mandates
7. Margin Call Cascades — forced liquidation chains from leveraged positions
8. Liquidity Bottlenecks — thin order book levels where forced selling accelerates

Return JSON:
{
  "constraints": [
    {
      "id": "vol_control|cta_trend|gamma_exp|index_rebal|etf_arb|pension|margin|liquidity",
      "name": "...",
      "status": "critical|active|approaching|watching|dormant",
      "activation_probability": 0.0-1.0,
      "estimated_forced_volume_bn": 0,
      "direction": "SELL|BUY|REBALANCE",
      "affected_tickers": ["..."],
      "trigger_condition": "...",
      "time_horizon": "immediate|days|weeks",
      "cascade_risk": "none|low|medium|high",
      "ai_reasoning": "..."
    }
  ],
  "aggregate_pressure_score": 0-100,
  "cascade_sequence": [
    { "order": 1, "constraint": "...", "triggers": "...", "estimated_price_impact_pct": 0 }
  ],
  "meta": { "model_confidence": 0-100, "analysis_depth": "..." }
}`,
      userPrompt: `Detect institutional constraints for:\n${ctx}`,
      maxTokens: 4096,
      temperature: 0.4,
    });

    const data = JSON.parse(result.text);
    return new Response(JSON.stringify({ ...data, timestamp: Date.now(), provider: "cloudflare" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("clank-detection error:", err);
    return new Response(JSON.stringify({
      constraints: [],
      aggregate_pressure_score: 0,
      cascade_sequence: [],
      meta: { model_confidence: 0, analysis_depth: "fallback" },
      timestamp: Date.now(),
      provider: "fallback",
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
