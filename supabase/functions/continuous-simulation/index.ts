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
    const { portfolio, regime, vix, totalValue, provider } = await req.json();
    const ctx = JSON.stringify({ portfolio: portfolio?.slice(0, 15), regime, vix, totalValue });

    const result = await callAI({
      provider,
      systemPrompt: `You are a continuous market simulation engine. Generate scenario trees with branching probabilities, volatility regime transition forecasts, and liquidity stress levels. Return JSON:
{
  "scenario_tree": [
    { "path": "base", "probability": 0.5, "expected_return_pct": 0, "vol_regime": "normal", "description": "..." },
    { "path": "stress_up", "probability": 0.15, "expected_return_pct": 0, "vol_regime": "high", "description": "..." },
    { "path": "stress_down", "probability": 0.2, "expected_return_pct": 0, "vol_regime": "crisis", "description": "..." },
    { "path": "rally", "probability": 0.15, "expected_return_pct": 0, "vol_regime": "low", "description": "..." }
  ],
  "regime_transitions": {
    "current": "normal|high|crisis|low",
    "transition_probabilities": { "normal": 0, "high": 0, "crisis": 0, "low": 0 },
    "expected_duration_days": 0
  },
  "liquidity_stress": [
    { "ticker": "...", "stress_level": 0, "trigger_price": 0, "forced_selling_risk": "low|medium|high" }
  ],
  "risk_surface": {
    "var_1d_pct": 0, "var_5d_pct": 0, "vol_forecast_5d": 0, "correlation_stress": 0
  },
  "calibration_note": "..."
}`,
      userPrompt: `Generate live simulation parameters for:\n${ctx}`,
      maxTokens: 3000,
      temperature: 0.6,
    });

    const data = safeParseJSON(result.text);
    return new Response(JSON.stringify({ ...data, timestamp: Date.now(), provider: "cloudflare" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("continuous-simulation error:", err);
    return new Response(JSON.stringify({
      scenario_tree: [
        { path: "base", probability: 0.55, expected_return_pct: 0.3, vol_regime: "normal", description: "Steady state" },
        { path: "stress_down", probability: 0.25, expected_return_pct: -3.5, vol_regime: "high", description: "Moderate stress" },
        { path: "rally", probability: 0.20, expected_return_pct: 2.1, vol_regime: "low", description: "Risk-on rally" },
      ],
      regime_transitions: { current: "normal", transition_probabilities: { normal: 0.6, high: 0.25, crisis: 0.05, low: 0.1 }, expected_duration_days: 15 },
      liquidity_stress: [],
      risk_surface: { var_1d_pct: -1.8, var_5d_pct: -4.2, vol_forecast_5d: 18, correlation_stress: 0.4 },
      calibration_note: "Fallback — static parameters",
      timestamp: Date.now(),
      provider: "fallback",
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
