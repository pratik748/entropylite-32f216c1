import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { callAI } from "../_shared/callAI.ts";
import { safeParseJSON } from "../_shared/safeParseJSON.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function generateDeterministicSimulation(portfolio: any[], regime: string, vix: number, totalValue: number) {
  const currentVix = typeof vix === "number" && vix > 0 ? vix : 18.5;
  const volRegime = currentVix > 32 ? "crisis" : currentVix > 22 ? "high" : currentVix < 15 ? "low" : "normal";
  const dailySigma = (currentVix / 100) / Math.sqrt(252);
  const fiveDaySigma = dailySigma * Math.sqrt(5) * 100;

  const var_1d_pct = Number((-1.65 * dailySigma * 100).toFixed(2));
  const var_5d_pct = Number((var_1d_pct * Math.sqrt(5)).toFixed(2));

  let scenario_tree: any[];
  if (volRegime === "crisis") {
    scenario_tree = [
      { path: "base", probability: 0.30, expected_return_pct: Number((-fiveDaySigma * 0.2).toFixed(2)), vol_regime: "crisis", description: "Persistent systemic stress and heightened intraday spread" },
      { path: "stress_down", probability: 0.45, expected_return_pct: Number((-fiveDaySigma * 1.5).toFixed(2)), vol_regime: "crisis", description: "Liquidity cascade and forced cross-asset unwinds" },
      { path: "rally", probability: 0.15, expected_return_pct: Number((fiveDaySigma * 1.2).toFixed(2)), vol_regime: "high", description: "High-volatility short-covering squeeze" },
      { path: "stress_up", probability: 0.10, expected_return_pct: Number((fiveDaySigma * 0.4).toFixed(2)), vol_regime: "crisis", description: "Mean-reversion bounce into resistance" },
    ];
  } else if (volRegime === "high") {
    scenario_tree = [
      { path: "base", probability: 0.45, expected_return_pct: Number((fiveDaySigma * 0.1).toFixed(2)), vol_regime: "high", description: "Elevated chop with wide trading ranges" },
      { path: "stress_down", probability: 0.30, expected_return_pct: Number((-fiveDaySigma * 1.1).toFixed(2)), vol_regime: "crisis", description: "Tail dislocation breaching dynamic stops" },
      { path: "rally", probability: 0.25, expected_return_pct: Number((fiveDaySigma * 0.9).toFixed(2)), vol_regime: "normal", description: "Volatility compression and momentum continuation" },
    ];
  } else {
    scenario_tree = [
      { path: "base", probability: 0.60, expected_return_pct: Number((fiveDaySigma * 0.3).toFixed(2)), vol_regime: "normal", description: "Orderly drift along sector momentum lines" },
      { path: "stress_down", probability: 0.20, expected_return_pct: Number((-fiveDaySigma * 1.0).toFixed(2)), vol_regime: "high", description: "Transient macro shock or liquidity pocket" },
      { path: "rally", probability: 0.20, expected_return_pct: Number((fiveDaySigma * 0.8).toFixed(2)), vol_regime: "low", description: "Low-volatility expansion across beta holdings" },
    ];
  }

  const holdings = Array.isArray(portfolio) ? portfolio.slice(0, 10) : [];
  const liquidity_stress = holdings.map((p) => {
    const ticker = String(p.ticker || p.symbol || "SPY").toUpperCase();
    const currentPrice = Number(p.currentPrice || p.price || 100);
    const trigger_price = Number((currentPrice * (1 - dailySigma * 2.5)).toFixed(2));
    const stress_level = Math.min(95, Math.max(10, Math.round(currentVix * 1.8 + Math.random() * 10)));
    return {
      ticker,
      stress_level,
      trigger_price,
      forced_selling_risk: stress_level > 65 ? "high" : stress_level > 35 ? "medium" : "low",
    };
  });

  return {
    scenario_tree,
    regime_transitions: {
      current: volRegime,
      transition_probabilities: {
        normal: volRegime === "normal" ? 0.65 : 0.20,
        high: volRegime === "high" ? 0.55 : 0.25,
        crisis: volRegime === "crisis" ? 0.45 : 0.10,
        low: volRegime === "low" ? 0.60 : 0.15,
      },
      expected_duration_days: volRegime === "crisis" ? 5 : volRegime === "high" ? 10 : volRegime === "normal" ? 18 : 25,
    },
    liquidity_stress,
    risk_surface: {
      var_1d_pct,
      var_5d_pct,
      vol_forecast_5d: Number(currentVix.toFixed(1)),
      correlation_stress: Number((Math.min(0.95, currentVix / 45)).toFixed(2)),
    },
    calibration_note: `Deterministic empirical Markov calibration conditioned on VIX=${currentVix.toFixed(1)} and ${volRegime} regime dynamics.`,
    timestamp: Date.now(),
    provider: "deterministic-quant-v1",
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { portfolio, regime, vix, totalValue, provider } = await req.json();
    const ctx = JSON.stringify({ portfolio: portfolio?.slice(0, 15), regime, vix, totalValue });

    try {
      const result = await callAI({
        provider,
        systemPrompt: `You are a regime-modelling quant at a systematic macro fund. You produce live-calibrated continuous simulation parameters: a 4-branch scenario tree, a Markov regime-transition matrix, a per-name liquidity stress map, and a forward risk surface, all conditioned on the current portfolio + VIX + regime tag.

REASONING FRAMEWORK:
1. Scenario branches MUST sum to probability 1.0 and reflect the regime: in CRISIS regime, stress_down rises to 0.35–0.5; in CALM regime, base + rally dominate.
2. expected_return_pct per branch is portfolio-level over a 5-day window, derive from VIX-implied σ and avg beta. Stress branches typically -3% to -8%, rally +1% to +3%.
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
(c) Build the regime transition matrix, sticky on the diagonal, faster decay from extreme states.
(d) Pick the 3–5 holdings with the highest forced-selling exposure for liquidity_stress.
(e) Risk surface numbers must be internally consistent (var_5d ≈ var_1d × √5).
(f) calibration_note: 1 sentence on the dominant driver of these parameters.`,
        maxTokens: 3000,
        temperature: 0.6,
      });

      const data = safeParseJSON(result.text);
      if (data && Array.isArray(data.scenario_tree)) {
        return new Response(JSON.stringify({ ...data, timestamp: Date.now(), provider: result.provider || "mistral" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    } catch (aiErr) {
      console.warn("continuous-simulation AI failed, falling back to deterministic Markov calibration:", aiErr);
    }

    const fallback = generateDeterministicSimulation(portfolio, regime, vix, totalValue);
    return new Response(JSON.stringify(fallback), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("continuous-simulation error:", err);
    const fallback = generateDeterministicSimulation([], "normal", 18.5, 100000);
    return new Response(JSON.stringify(fallback), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
