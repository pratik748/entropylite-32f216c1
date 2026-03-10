import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { callAI } from "../_shared/callAI.ts";
import { requireAuth } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    await requireAuth(req, corsHeaders);
    const { event, portfolio } = await req.json();

    const result = await callAI({
      systemPrompt: "You are a macro-strategist at a sovereign wealth fund. Model second and third-order causal effects of geopolitical and economic events. Return ONLY valid JSON.",
      userPrompt: `Event: "${event}"
Portfolio: ${portfolio || "No portfolio loaded"}
Date: ${new Date().toISOString().split("T")[0]}

Simulate the full causal chain with 4-6 effects per order. Be specific with tickers, currencies, and percentages.

Return JSON:
{
  "event": "<event name>",
  "first_order": [{ "order": 1, "effect": "<effect>", "asset_class": "<equities|bonds|commodities|forex|crypto>", "direction": "<up|down|volatile>", "magnitude": "<specific %>", "confidence": <0-1>, "time_horizon": "<intraday|1-3 days|1 week>" }],
  "second_order": [{ "order": 2, "effect": "<ripple effect>", "asset_class": "<type>", "direction": "<up|down|volatile>", "magnitude": "<specific>", "confidence": <0-1>, "time_horizon": "<1-2 weeks|2-4 weeks>" }],
  "third_order": [{ "order": 3, "effect": "<structural consequence>", "asset_class": "<type>", "direction": "<up|down|volatile>", "magnitude": "<specific>", "confidence": <0-1>, "time_horizon": "<1-3 months|3-6 months|structural>" }],
  "scenario_tree": [
    { "label": "Bull", "probability": <0-1>, "capital_impact_pct": <number>, "key_moves": ["<move1>", "<move2>"] },
    { "label": "Base", "probability": <0-1>, "capital_impact_pct": <number>, "key_moves": ["<move1>", "<move2>"] },
    { "label": "Bear", "probability": <0-1>, "capital_impact_pct": <number>, "key_moves": ["<move1>", "<move2>"] },
    { "label": "Tail Risk", "probability": <0-1>, "capital_impact_pct": <number>, "key_moves": ["<move1>", "<move2>"] }
  ],
  "reflexivity_score": <0-100>,
  "scar_tag": "<pattern tag>"
}`,
      maxTokens: 3000,
      temperature: 0.3,
    });

    console.log(`causal-effects used provider: ${result.provider}`);
    const parsed = JSON.parse(result.text);

    return new Response(JSON.stringify(parsed), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error: any) {
    console.error("Causal effects error:", error);
    if (error.status === 429) return new Response(JSON.stringify({ error: "Rate limited" }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
