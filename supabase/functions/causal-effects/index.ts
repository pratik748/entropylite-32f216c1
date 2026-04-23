import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { callAI } from "../_shared/callAI.ts";
import { safeParseJSON } from "../_shared/safeParseJSON.ts";
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
    const { event, portfolio, provider } = await req.json();

    const result = await callAI({
      provider,
      systemPrompt: `You are a senior macro strategist at a sovereign wealth fund (think GIC / Norges Bank). You model how a single shock propagates across asset classes through 1st, 2nd, and 3rd-order channels — and you ground every effect in a real transmission mechanism, not vibes.

REASONING FRAMEWORK — for every effect you write:
1. Identify the transmission channel (rates, credit, FX, commodities, supply chain, sentiment, regulatory, fiscal).
2. Name the mechanism in one clause ("USD strengthens → EM debt service costs rise → BRL/ZAR/TRY underperform").
3. Calibrate magnitude to historical analogues — a Fed +50bp surprise moves 2Y ~15–25bp; a crude +10% shock hits airlines ~3–6%; an EM currency crisis bleeds equities 8–15% over 2–4 weeks.
4. Confidence reflects how mechanical the link is (rates → bond prices ≈ 0.9; geopolitical → sentiment ≈ 0.4–0.6).
5. Time horizons must escalate by order: 1st-order intraday→days, 2nd-order weeks, 3rd-order months/structural.

SCENARIO TREE RULES:
- Probabilities across Bull/Base/Bear/Tail-Risk MUST sum to 1.0 (±0.02).
- capital_impact_pct is portfolio-level expected % impact in each branch — Bull positive, Base near 0, Bear negative single-digits, Tail Risk double-digit negative.
- key_moves must name a concrete instrument or pair (SPY -3%, USDJPY +2%, NVDA -8%) — NOT generic "stocks fall".

VOICE: tight, sell-side, numerate. Strings ≤ 220 chars. Return ONLY valid JSON.`,
      userPrompt: `Event: "${event}"
Portfolio: ${portfolio || "No portfolio loaded"}
Date: ${new Date().toISOString().split("T")[0]}

Walk the cascade end-to-end:
(a) FIRST-ORDER (4–6 effects): direct re-pricing — the assets that move within hours because their pricing model takes the event as a direct input.
(b) SECOND-ORDER (4–6 effects): correlated re-pricing — assets that move because of the 1st-order moves (carry trades unwind, hedges fire, sector rotation).
(c) THIRD-ORDER (4–6 effects): structural / behavioural — capex cuts, policy responses, supply-chain rewiring, narrative shifts that take weeks to months.
(d) Build the 4-branch scenario tree with probabilities summing to 1 and portfolio-level capital impact per branch.
(e) reflexivity_score: how self-reinforcing is this cascade? 0=one-shot, 100=full feedback loop (margin calls → forced selling → more margin calls).
(f) scar_tag: a 2-3 word pattern label so the system can match this to historical analogues.

Be specific with tickers, currencies, percentages, and time windows in every entry.

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
      maxTokens: 4096,
      temperature: 0.3,
    });

    console.log(`causal-effects used provider: ${result.provider}`);
    const parsed = safeParseJSON(result.text);

    return new Response(JSON.stringify(parsed), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error: any) {
    // requireAuth throws a Response object directly
    if (error instanceof Response) return error;
    console.error("Causal effects error:", error);
    if (error.status === 429) return new Response(JSON.stringify({ error: "Rate limited" }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    return new Response(JSON.stringify({ error: error.message || "Internal error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
