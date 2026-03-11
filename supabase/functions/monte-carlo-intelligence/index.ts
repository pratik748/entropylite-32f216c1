
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { callAI } from "../_shared/callAI.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { portfolio, totalValue, avgRisk, avgBeta, scenario, provider } = await req.json();

    const result = await callAI({
      systemPrompt: `You are a Monte Carlo simulation calibration AI. Given a portfolio and scenario, calibrate simulation parameters and interpret results.
Return ONLY valid JSON:
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
      userPrompt: `Portfolio: $${totalValue?.toLocaleString() || "N/A"}, Avg Risk: ${avgRisk}, Avg Beta: ${avgBeta}
Active scenario: ${scenario || "base"}
Holdings: ${JSON.stringify(portfolio?.slice(0, 10))}
Calibrate Monte Carlo params for this specific portfolio. Consider current market conditions, the portfolio's actual risk profile, and provide scenario-specific parameters.`,
      temperature: 0.5,
      maxTokens: 3072,
    });

    const data = JSON.parse(result.text);
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
