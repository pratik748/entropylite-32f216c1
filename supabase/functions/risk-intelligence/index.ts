import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { callAI } from "../_shared/callAI.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { portfolio, vix, marketRegime } = await req.json();

    if (!portfolio || portfolio.length === 0) {
      return new Response(JSON.stringify({ error: "No portfolio data" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const portfolioSummary = portfolio.map((s: any) => ({
      ticker: s.ticker,
      qty: s.quantity,
      buyPrice: s.buyPrice,
      currentPrice: s.currentPrice || s.buyPrice,
      risk: s.riskScore || 40,
      beta: s.beta || 1,
      sector: s.sector || "Unknown",
      pe: s.pe || 0,
      marketCap: s.marketCap || "Unknown",
    }));

    const totalValue = portfolioSummary.reduce((s: number, p: any) => s + p.currentPrice * p.qty, 0);

    const result = await callAI({
      systemPrompt: `You are an institutional risk intelligence engine. Analyze the portfolio and produce a comprehensive risk assessment.
Return ONLY valid JSON matching this exact schema:
{
  "var95": number (dollar value at risk 95%),
  "var99": number (dollar value at risk 99%),
  "cvar95": number (conditional VaR 95%),
  "cvar99": number (conditional VaR 99%),
  "liquidityVar": number (liquidity-adjusted VaR),
  "portfolioRiskScore": number (0-100),
  "volatilityRegime": "LOW" | "NORMAL" | "HIGH" | "CRISIS",
  "riskBreakdown": { "volatility": number, "sector": number, "regulatory": number, "financial": number, "macro": number },
  "factorExposure": [{ "factor": string, "exposure": number, "contribution": number }],
  "stressScenarios": [{ "scenario": string, "impact": number (negative %), "recovery": string, "pnlLoss": number }],
  "correlationInsight": string,
  "regimeAnalysis": string,
  "topRisks": [string],
  "hedgingRecommendations": [string]
}`,
      userPrompt: `Portfolio (total value: $${totalValue.toLocaleString()}):
${JSON.stringify(portfolioSummary, null, 1)}

Current VIX: ${vix || "N/A"}
Market Regime: ${marketRegime || "Unknown"}

Analyze:
1. Compute realistic VaR/CVaR based on the portfolio's actual composition, betas, and risk scores
2. Identify the current volatility regime
3. Decompose risk into factors (Market Beta, Size SMB, Value HML, Momentum, Quality, Low Vol)
4. Run stress scenarios (2008 GFC, COVID crash, rate shock, oil spike, FII outflow, currency crisis) with portfolio-specific impact
5. Assess correlation risk and concentration
6. Provide specific hedging recommendations`,
      temperature: 0.4,
      maxTokens: 4096,
    });

    const riskData = JSON.parse(result.text);
    return new Response(JSON.stringify(riskData), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("risk-intelligence error:", err);
    return new Response(JSON.stringify({ error: err.message || "Risk intelligence failed" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
