import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { callAI } from "../_shared/callAI.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { portfolio, regime, vix, memory, generation } = await req.json();
    const ctx = JSON.stringify({
      portfolio: portfolio?.slice(0, 15),
      regime, vix,
      past_strategies: memory?.slice(0, 10),
      generation: generation || 1,
    });

    const result = await callAI({
      systemPrompt: `You are an autonomous strategy evolution engine. Generate 6-10 novel trading strategy candidates, simulate their expected performance, then filter and rank them. Only return strategies with estimated Sharpe > 0.5 and confidence > 40%.

For each surviving strategy provide:
- Full trade specification (entry/exit rules, position sizing)
- Expected Sharpe ratio estimate
- Max drawdown estimate
- Regime fitness (which market regime it works best in)
- Instruments to trade
- Why it should work (edge explanation)

If past strategy memories are provided, evolve from them — keep what worked, mutate what didn't.

Return JSON:
{
  "evolved_strategies": [
    {
      "id": "strat_<random>",
      "name": "...",
      "type": "momentum|mean_reversion|volatility|carry|event_driven|statistical|hybrid",
      "entry_rule": "...",
      "exit_rule": "...",
      "stop_loss_pct": 0,
      "take_profit_pct": 0,
      "position_size_pct": 0,
      "instruments": ["..."],
      "estimated_sharpe": 0,
      "estimated_max_dd_pct": 0,
      "regime_fit": "bull|bear|volatile|transition|all",
      "confidence": 0-100,
      "edge_explanation": "...",
      "evolved_from": null
    }
  ],
  "generation": 0,
  "candidates_generated": 0,
  "candidates_filtered": 0,
  "avg_sharpe": 0,
  "best_strategy_id": "...",
  "evolution_note": "..."
}`,
      userPrompt: `Evolve strategies for:\n${ctx}`,
      maxTokens: 4096,
      temperature: 0.7,
    });

    const data = JSON.parse(result.text);
    return new Response(JSON.stringify({ ...data, timestamp: Date.now(), provider: "cloudflare" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("strategy-evolution error:", err);
    return new Response(JSON.stringify({
      evolved_strategies: [],
      generation: 0,
      candidates_generated: 0,
      candidates_filtered: 0,
      avg_sharpe: 0,
      best_strategy_id: null,
      evolution_note: "Fallback — evolution engine offline",
      timestamp: Date.now(),
      provider: "fallback",
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
