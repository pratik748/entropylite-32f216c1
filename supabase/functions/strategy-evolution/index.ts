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
    const { portfolio, regime, vix, memory, generation, provider } = await req.json();
    const ctx = JSON.stringify({
      portfolio: portfolio?.slice(0, 15),
      regime, vix,
      past_strategies: memory?.slice(0, 10),
      generation: generation || 1,
    });

    const result = await callAI({
      provider,
      systemPrompt: `You are an autonomous quantitative strategy evolution engine modelled on a systematic-fund research desk (think AQR / Two Sigma alpha lab). You generate, simulate, filter, and rank trading-strategy candidates conditioned on the live portfolio + regime + VIX, and you EVOLVE from prior memories — never re-propose what already failed.

EVOLUTION FRAMEWORK:
1. GENERATE 6–10 candidates spanning at least 4 of: momentum, mean_reversion, volatility, carry, event_driven, statistical, hybrid. Diversity beats redundancy.
2. CONDITION on the regime: in high-VIX/crisis bias toward volatility + mean_reversion + event_driven; in low-VIX bias toward momentum + carry + statistical.
3. INHERIT from memory: if a past strategy had positive realized Sharpe, MUTATE it (tighter stop, different instrument, longer holding) and tag evolved_from. If it failed, do NOT propose a near-identical variant — explain in edge_explanation what changes structurally.
4. SIMULATE before filtering — estimate Sharpe from edge × hit-rate × R:R × (1 − drag). Estimate max DD from position size × stop × correlation cluster.
5. FILTER GATE: only keep strategies with estimated_sharpe > 0.5 AND confidence > 40 AND risk_reward implied by stop/take ≥ 1:1.5.
6. RANK by estimated_sharpe × confidence/100, set best_strategy_id.

CALIBRATION DISCIPLINE:
• estimated_sharpe — be honest. >2.0 only if the edge is structural (hard-coded statistical arb); 1.0–1.8 quality systematic; 0.5–1.0 marginal but worth paper-trading.
• estimated_max_dd_pct — must be coherent with stop_loss_pct × position_size_pct × cluster correlation; never write a 5% DD on a 20% position with a 10% stop.
• edge_explanation: 1–2 sentences naming the MECHANISM (microstructure, behavioural bias, structural flow), not "machine learning finds patterns".
• instruments: real, tradeable tickers / pairs / options structures the user could actually execute.
• avg_sharpe = mean of surviving strategies. candidates_generated and candidates_filtered must reflect the actual gate.

Return ONLY valid JSON in the exact schema below — no markdown, no preamble.`,
      userPrompt: `Evolve strategies for:
${ctx}

Walk the framework:
(a) Tag the regime from VIX (<15 calm, 15–22 normal, 22–32 high, >32 crisis) and tilt strategy types accordingly.
(b) Inherit from memory — mutate winners, structurally redesign losers, never re-propose near-identicals.
(c) Generate 6–10 candidates, simulate Sharpe + DD honestly, then apply the filter gate.
(d) Rank survivors by Sharpe × confidence; set best_strategy_id.
(e) evolution_note: 1 sentence on what changed this generation vs. memory (which lineage advanced, which died).

JSON schema:
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
      maxTokens: 4096,
      temperature: 0.7,
    });

    const data = safeParseJSON(result.text);
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
