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
      systemPrompt: `You are a regime-modelling quant at a systematic macro fund. You produce live-calibrated continuous simulation parameters: a 4-branch scenario tree, a Markov regime-transition matrix, a per-name liquidity stress map, and a forward risk surface — all conditioned on the current portfolio + VIX + regime tag.

REASONING FRAMEWORK:
1. Scenario branches MUST sum to probability 1.0 and reflect the regime: in CRISIS regime, stress_down rises to 0.35–0.5; in CALM regime, base + rally dominate.
2. expected_return_pct per branch is portfolio-level over a 5-day window — derive from VIX-implied σ and avg beta. Stress branches typically -3% to -8%, rally +1% to +3%.
3. Regime transitions: build a row-stochastic matrix (each state's outgoing probabilities sum to 1). Sticky states (high → high ≈ 0.6) reflect vol clustering.
4. expected_duration_days: low ≈ 25, normal ≈ 18, high ≈ 10, crisis ≈ 5 (regimes shorten as vol rises).
5. liquidity_stress: rank holdings by float × ADV proxy. trigger_price is the level below which forced selling cascades start (typically 8–15% below current). forced_selling_risk: high for low-float / high-momentum / heavily-shorted names.
6. risk_surface VaR must scale with VIX: var_1d_pct ≈ -1.65 × (VIX/100) / √252 × 100; var_5d ≈ var_1d × √5. correlation_stress 0–1 (1 = everything-correlates-to-1 crisis).

CALIBRATION GUARDS: every number must defend against the inputs. Strings ≤ 200 chars. Return ONLY valid JSON in the schema below.

Schema:
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
      userPrompt: `Live calibration inputs:
${ctx}

Walk the framework:
(a) Tag the regime from VIX (<15 calm, 15–22 normal, 22–32 high, >32 crisis) and tilt scenario probabilities accordingly.
(b) Compute portfolio σ_5d from VIX + avg beta and propagate into expected_return_pct per branch.
(c) Build the regime transition matrix — sticky on the diagonal, faster decay from extreme states.
(d) Pick the 3–5 holdings with the highest forced-selling exposure for liquidity_stress.
(e) Risk surface numbers must be internally consistent (var_5d ≈ var_1d × √5).
(f) calibration_note: 1 sentence on the dominant driver of these parameters.`,
      maxTokens: 3000,
      temperature: 0.6,
    });

    const data = safeParseJSON(result.text);
    return new Response(JSON.stringify({ ...data, timestamp: Date.now(), provider: "mistral" }), {
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
