
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
    const { portfolio, vix, marketRegime, provider } = await req.json();

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
      provider,
      systemPrompt: `You are the head of risk at an institutional buy-side fund (think Bridgewater / Citadel risk desk). You translate raw portfolio composition into a defensible, decision-grade risk picture that a CIO can act on within minutes.

REASONING FRAMEWORK — apply in this order, every time:
1. Decompose the portfolio's true risk drivers: idiosyncratic (single-name beta × weight²) vs systematic (factor loadings) vs tail (jump/regime). Concentration > 25% in any single name compounds idiosyncratic risk non-linearly — flag it.
2. VaR/CVaR must be GROUNDED in the data given: weighted average risk score, beta exposure, sector clustering, and the current VIX regime. Do NOT pick round numbers. Show that VaR scales with both volatility regime AND concentration.
   - 1-day 95% VaR ≈ portfolioValue × σ_daily × 1.645 × concentrationPenalty
   - CVaR (Expected Shortfall) is always larger than VaR — typically 1.25–1.6× VaR depending on tail fatness
   - liquidityVar adds slippage cost: thinly-traded names → 1.3–1.8× headline VaR
3. Volatility regime classification must reference VIX bands: <15 LOW, 15–22 NORMAL, 22–32 HIGH, >32 CRISIS — and be CONSISTENT with the VaR magnitudes you produce.
4. Factor decomposition uses the standard Fama-French + Quality + Low-Vol axes. Each factor's "contribution" must roughly sum to portfolioRiskScore.
5. Stress scenarios must be portfolio-specific: a tech-heavy book bleeds more in a rate shock; a cyclical book bleeds more in a recession scenario; an FII-flow scenario hurts EM-exposed positions. Generic textbook impacts are unacceptable.
6. Hedging recommendations must be EXECUTABLE: name the instrument (SPY puts, VIX calls, sector ETF short, gold, treasuries) AND tie it to a specific risk identified above. No generic "diversify more" advice.

CALIBRATION GUARDS:
- Every number must defend itself against the inputs. If you cannot justify it from the portfolio + VIX + regime, do not write it.
- portfolioRiskScore: 0–30 conservative, 30–55 balanced, 55–75 aggressive, 75–100 fragile.
- Strings must be ≤ 220 chars and reference the data (a ticker, a sector, a number).

Return ONLY valid JSON matching this exact schema (no prose, no markdown):
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
      userPrompt: `LIVE PORTFOLIO under risk review (total value: $${totalValue.toLocaleString()}):
${JSON.stringify(portfolioSummary, null, 1)}

Current VIX: ${vix || "N/A"}
Market Regime: ${marketRegime || "Unknown"}

Produce the risk dossier. WORK THROUGH THE FRAMEWORK:
(a) Concentration check — what single names exceed 20–25% weight, and how does that distort idiosyncratic risk?
(b) Beta-weighted market exposure given the current VIX regime — derive σ_portfolio from beta × VIX × √(1/252).
(c) VaR/CVaR sized to the portfolio's actual dollar value AND its concentration penalty.
(d) Factor exposures across {Market Beta, Size SMB, Value HML, Momentum MOM, Quality QMJ, Low-Vol BAB} — exposures should reflect the sectors and market caps actually held.
(e) Six stress scenarios — 2008 GFC, COVID-2020 crash, +200bp rate shock, oil spike, FII outflow / EM stress, USD/INR currency crisis — each with a portfolio-specific impact % derived from sector/beta exposure (NOT a textbook number) and a recovery horizon.
(f) correlationInsight: name the cluster (e.g. "SemiCap names move 0.8 with each other — single-factor risk").
(g) hedgingRecommendations: 3–5 EXECUTABLE hedges, each naming the instrument AND the risk it neutralises.`,
      temperature: 0.4,
      maxTokens: 4096,
    });

    const riskData = safeParseJSON(result.text);
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
