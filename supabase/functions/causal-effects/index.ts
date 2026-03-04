import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { event, portfolio } = await req.json();
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY not configured");

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: "You are a macro-strategist at a sovereign wealth fund. You model second and third-order causal effects of geopolitical and economic events across all asset classes globally. Return ONLY valid JSON." },
          { role: "user", content: `Event: "${event}"
Portfolio: ${portfolio || "No portfolio loaded"}
Date: ${new Date().toISOString().split("T")[0]}

Simulate the full causal chain:

1. FIRST ORDER (immediate, 0-48h): Direct price, volatility, liquidity, sentiment, capital flow impacts
2. SECOND ORDER (1-4 weeks): Ripple effects across correlated assets, sectors, currencies, commodities, logistics routes
3. THIRD ORDER (1-6 months): Structural consequences — capital reallocation, policy reaction probability, alliance shifts, supply chain rerouting, inflation propagation, narrative evolution

Return JSON:
{
  "event": "<event name>",
  "first_order": [
    { "order": 1, "effect": "<specific effect>", "asset_class": "<equities|bonds|commodities|forex|crypto>", "direction": "<up|down|volatile>", "magnitude": "<specific % or descriptor>", "confidence": <0-1>, "time_horizon": "<intraday|1-3 days|1 week>" }
  ],
  "second_order": [
    { "order": 2, "effect": "<ripple effect>", "asset_class": "<type>", "direction": "<up|down|volatile>", "magnitude": "<specific>", "confidence": <0-1>, "time_horizon": "<1-2 weeks|2-4 weeks>" }
  ],
  "third_order": [
    { "order": 3, "effect": "<structural consequence>", "asset_class": "<type>", "direction": "<up|down|volatile>", "magnitude": "<specific>", "confidence": <0-1>, "time_horizon": "<1-3 months|3-6 months|structural>" }
  ],
  "scenario_tree": [
    { "label": "Bull", "probability": <0-1>, "capital_impact_pct": <number>, "key_moves": ["<move1>", "<move2>"] },
    { "label": "Base", "probability": <0-1>, "capital_impact_pct": <number>, "key_moves": ["<move1>", "<move2>"] },
    { "label": "Bear", "probability": <0-1>, "capital_impact_pct": <number>, "key_moves": ["<move1>", "<move2>"] },
    { "label": "Tail Risk", "probability": <0-1>, "capital_impact_pct": <number>, "key_moves": ["<move1>", "<move2>"] }
  ],
  "reflexivity_score": <0-100>,
  "scar_tag": "<pattern tag for future reference>"
}

Provide 4-6 effects per order. Be specific with tickers, currencies, and percentages. All probabilities must sum reasonably.` },
        ],
        temperature: 0.3,
        max_tokens: 3000,
      }),
    });

    if (!aiRes.ok) {
      if (aiRes.status === 429) return new Response(JSON.stringify({ error: "Rate limited" }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      if (aiRes.status === 402) return new Response(JSON.stringify({ error: "Credits exhausted" }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      throw new Error(`AI error: ${aiRes.status}`);
    }

    const aiData = await aiRes.json();
    const raw = aiData.choices?.[0]?.message?.content?.trim()?.replace(/^```json?\n?/, "")?.replace(/\n?```$/, "") || "{}";
    const result = JSON.parse(raw);

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Causal effects error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
