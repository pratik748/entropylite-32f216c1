import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { callAI } from "../_shared/callAI.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { portfolio, regime, vix, sectors } = await req.json();
    const ctx = JSON.stringify({ portfolio: portfolio?.slice(0, 15), regime, vix, sectors: sectors?.slice(0, 5) });

    // Run 4 parallel AI models with different perspectives
    const [market, anomaly, optimization, risk] = await Promise.all([
      callAI({
        systemPrompt: `You are a macro market interpretation model. Analyze the portfolio context and produce a market narrative. Return JSON: { "narrative": "...", "regime_assessment": "bull|bear|transition|volatile", "key_drivers": ["..."], "confidence": 0-100, "outlook_weeks": 1-12, "sector_rotation": "..." }`,
        userPrompt: `Portfolio & market context:\n${ctx}`,
        maxTokens: 2048,
        temperature: 0.5,
      }).catch(e => ({ text: JSON.stringify({ narrative: "Market interpretation unavailable", regime_assessment: regime || "unknown", key_drivers: [], confidence: 30, outlook_weeks: 4, sector_rotation: "neutral" }), provider: "cloudflare" as const })),

      callAI({
        systemPrompt: `You are an anomaly detection model for investment portfolios. Scan for concentration risk, unusual correlations, sector imbalances, and hidden risks. Return JSON: { "anomalies": [{ "type": "concentration|correlation|sector|liquidity|momentum", "severity": "low|medium|high|critical", "description": "...", "affected_tickers": ["..."], "recommendation": "..." }], "portfolio_health": 0-100, "diversification_score": 0-100 }`,
        userPrompt: `Scan this portfolio for anomalies:\n${ctx}`,
        maxTokens: 2048,
        temperature: 0.4,
      }).catch(e => ({ text: JSON.stringify({ anomalies: [], portfolio_health: 70, diversification_score: 60 }), provider: "cloudflare" as const })),

      callAI({
        systemPrompt: `You are a portfolio optimization model. Given holdings, suggest optimal weight adjustments. Return JSON: { "suggested_weights": [{ "ticker": "...", "current_pct": 0, "optimal_pct": 0, "action": "increase|decrease|hold|exit", "rationale": "..." }], "expected_sharpe_improvement": 0, "rebalance_urgency": "none|low|medium|high", "optimization_method": "..." }`,
        userPrompt: `Optimize this portfolio:\n${ctx}`,
        maxTokens: 2048,
        temperature: 0.4,
      }).catch(e => ({ text: JSON.stringify({ suggested_weights: [], expected_sharpe_improvement: 0, rebalance_urgency: "none", optimization_method: "fallback" }), provider: "cloudflare" as const })),

      callAI({
        systemPrompt: `You are a tail risk assessment model. Evaluate extreme downside scenarios for this portfolio. Return JSON: { "tail_risks": [{ "scenario": "...", "probability_pct": 0, "portfolio_impact_pct": 0, "severity": "moderate|severe|catastrophic", "hedge_suggestion": "..." }], "overall_tail_risk_score": 0-100, "stress_test_summary": "...", "max_loss_1pct": 0 }`,
        userPrompt: `Assess tail risks:\n${ctx}`,
        maxTokens: 2048,
        temperature: 0.5,
      }).catch(e => ({ text: JSON.stringify({ tail_risks: [], overall_tail_risk_score: 50, stress_test_summary: "Assessment unavailable", max_loss_1pct: -15 }), provider: "cloudflare" as const })),
    ]);

    // Parse results
    const parse = (r: any) => { try { return JSON.parse(r.text); } catch { return null; } };
    const marketResult = parse(market);
    const anomalyResult = parse(anomaly);
    const optimizationResult = parse(optimization);
    const riskResult = parse(risk);

    // Cross-validate: find agreement/disagreement
    const signals = [];
    if (marketResult?.regime_assessment && riskResult?.overall_tail_risk_score) {
      const bearish = marketResult.regime_assessment === "bear" || marketResult.regime_assessment === "volatile";
      const highRisk = riskResult.overall_tail_risk_score > 70;
      if (bearish && highRisk) signals.push({ type: "agreement", message: "Both market and risk models flag elevated danger", confidence: 90 });
      else if (bearish !== highRisk) signals.push({ type: "disagreement", message: "Market narrative and risk model diverge — investigate", confidence: 50 });
    }
    if (anomalyResult?.portfolio_health < 50 && optimizationResult?.rebalance_urgency === "high") {
      signals.push({ type: "agreement", message: "Anomaly detection and optimizer both flag urgent rebalancing", confidence: 85 });
    }

    const consensus = {
      market: marketResult,
      anomaly: anomalyResult,
      optimization: optimizationResult,
      risk: riskResult,
      cross_validation: signals,
      models_active: 4,
      timestamp: Date.now(),
    };

    return new Response(JSON.stringify(consensus), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (err) {
    console.error("parallel-intelligence error:", err);
    return new Response(JSON.stringify({ error: err.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
