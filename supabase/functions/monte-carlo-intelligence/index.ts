
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
    const { portfolio, totalValue, avgRisk, avgBeta, scenario, provider } = await req.json();

    const result = await callAI({
      provider,
      systemPrompt: `You are a quantitative simulation engineer (think Renaissance / DE Shaw modelling desk). Your job is to CALIBRATE Geometric Brownian Motion + jump-diffusion parameters for a 10,000-path Monte Carlo so the simulated distribution is faithful to the portfolio's real-world risk profile and the named scenario.

CALIBRATION FRAMEWORK — derive each number, never guess:
1. drift (μ_daily) — annual expected return / 252. Default ≈ risk-free + equity premium adjusted for beta. Negative for crisis scenarios.
2. volMult — multiplier on the portfolio's baseline σ (which is implied by avgBeta × VIX/100/√252).
   • base: 1.0
   • rate_shock: 1.4–1.7 (rates re-price duration)
   • fx_shock: 1.2–1.5 (selective hit, broader for EM-heavy)
   • liquidity_freeze: 1.6–2.0 with negative drift (bid/ask widens, forced selling)
   • black_swan: 2.2–3.0 (fat-tailed regime)
   • war: 1.8–2.4 with negative drift and elevated jump risk
3. jumpProb (Poisson intensity per day, 0–0.05) — how often a discontinuity occurs.
   • base 0.005, rate_shock 0.01, fx_shock 0.012, liquidity_freeze 0.025, black_swan 0.04, war 0.03
4. jumpSize — typical move when a jump fires. Negative for crashes (-0.03 to -0.12). Asymmetric: crashes are larger than rallies.
5. The 'calibratedParams' must match the ACTIVE scenario passed in. The 'scenarios' object holds the full menu so the front-end can re-run with any one.

OUTPUT REASONING:
- 'suggestions' (3–5 items) must be portfolio-actionable: protect (hedge instrument named), opportunity (specific entry idea), wait (specific trigger to watch).
- 'narrativeSummary' must read like a quant's 2-sentence email to PM — what the sim says and what to do about it.
- All numbers must be defensible against avgBeta, avgRisk, and the scenario tag.

Return ONLY valid JSON (no prose, no markdown):
{
  "calibratedParams": {
    "drift": number (daily, e.g. 0.0003),
    "volMult": number (multiplier, 1.0 = normal),
    "jumpProb": number (daily probability 0-0.05),
    "jumpSize": number (negative for crashes, e.g. -0.04)
  },
  "scenarios": {
    "base": { "drift": number, "volMult": number, "jumpProb": number, "jumpSize": number, "label": string, "desc": string },
    "rate_shock": { "drift": number, "volMult": number, "jumpProb": number, "jumpSize": number, "label": string, "desc": string },
    "fx_shock": { "drift": number, "volMult": number, "jumpProb": number, "jumpSize": number, "label": string, "desc": string },
    "liquidity_freeze": { "drift": number, "volMult": number, "jumpProb": number, "jumpSize": number, "label": string, "desc": string },
    "black_swan": { "drift": number, "volMult": number, "jumpProb": number, "jumpSize": number, "label": string, "desc": string },
    "war": { "drift": number, "volMult": number, "jumpProb": number, "jumpSize": number, "label": string, "desc": string }
  },
  "suggestions": [{ "label": string, "type": "protect" | "opportunity" | "wait", "detail": string }],
  "narrativeSummary": string
}`,
      userPrompt: `Calibrate the simulation for THIS portfolio:
• Total value: $${totalValue?.toLocaleString() || "N/A"}
• Avg risk score: ${avgRisk} (0–100)
• Avg beta: ${avgBeta}
• Active scenario: ${scenario || "base"}
• Holdings (top 10): ${JSON.stringify(portfolio?.slice(0, 10))}

Step through the framework:
1. Estimate baseline σ_daily from avgBeta × VIX-implied vol. Adjust drift for beta exposure and the named scenario.
2. Pick volMult, jumpProb, jumpSize from the bands above — but TILT them by avgRisk (high-risk book gets the upper end of each band).
3. Fill ALL six scenarios so the front-end can switch between them. Each label/desc must be 1 line, scenario-specific (no generic 'market downturn').
4. suggestions: 3–5 items grounded in the actual holdings — name a ticker or sector when possible.
5. narrativeSummary: PM-ready, 2 sentences max, leads with the most material insight.`,
      temperature: 0.5,
      maxTokens: 3072,
    });

    const data = safeParseJSON(result.text);
    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("monte-carlo-intelligence error:", err);
    return new Response(JSON.stringify({ error: err.message || "Monte Carlo intelligence failed" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
