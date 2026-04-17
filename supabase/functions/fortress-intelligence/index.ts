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
    const { holdings, threats, actions, baseCurrency, totalValue } = await req.json();

    if (!Array.isArray(actions) || actions.length === 0) {
      return new Response(JSON.stringify({ narratives: {} }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const result = await callAI({
      systemPrompt: `You are an institutional capital-preservation supervisor for a system called Fortress Mode.
Your job: produce ONE-LINE plain-language rationales for proposed defensive actions.
Tone: institutional, observational, NEVER hype ("guaranteed", "risk-free", "always" are forbidden).
Every line ≤ 95 characters.
Return ONLY valid JSON: { "narratives": { "<actionId>": "<one-line rationale>" } }`,
      userPrompt: `Portfolio total value: ${totalValue} ${baseCurrency}.
Holdings: ${JSON.stringify(holdings).slice(0, 4000)}
Detected threats: ${JSON.stringify(threats).slice(0, 2000)}
Proposed actions:
${JSON.stringify(actions, null, 1).slice(0, 3000)}

For each action id, write ONE observational sentence explaining the WHY in plain language.
Tie the reason to the threat it addresses. Mention the structural trigger.`,
      temperature: 0.3,
      maxTokens: 1200,
    });

    const parsed = safeParseJSON(result.text) || {};
    const narratives = (parsed && typeof parsed === "object" && parsed.narratives) || {};

    return new Response(JSON.stringify({ narratives }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("fortress-intelligence error:", err);
    return new Response(JSON.stringify({ narratives: {}, error: (err as Error).message }), {
      status: 200, // graceful degradation — UI falls back to deterministic rationale
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
