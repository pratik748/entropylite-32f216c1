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
    const GOOGLE_GEMINI_KEY = Deno.env.get("GOOGLE_GEMINI_KEY");
    if (!GOOGLE_GEMINI_KEY) throw new Error("GOOGLE_GEMINI_KEY not configured");

    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GOOGLE_GEMINI_KEY}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: "You are a macro-strategist at a sovereign wealth fund. Model second and third-order causal effects of geopolitical and economic events. Return ONLY valid JSON." }] },
        contents: [{ role: "user", parts: [{ text: `Event: "${event}"
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
}` }] }],
        generationConfig: { temperature: 0.3, maxOutputTokens: 3000 },
      }),
    });

    if (!res.ok) {
      if (res.status === 429) return new Response(JSON.stringify({ error: "Rate limited" }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      throw new Error(`Gemini error: ${res.status}`);
    }

    const data = await res.json();
    const raw = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim()?.replace(/^```json?\n?/, "")?.replace(/\n?```$/, "") || "{}";
    const result = JSON.parse(raw);

    return new Response(JSON.stringify(result), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error) {
    console.error("Causal effects error:", error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});