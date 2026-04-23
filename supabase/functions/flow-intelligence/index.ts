
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
    const { portfolio, vix, marketRegime, provider, polymarketSignals } = await req.json();

    if (!portfolio || portfolio.length === 0) {
      return new Response(JSON.stringify({ error: "No portfolio data" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const summary = portfolio.map((s: any) => ({
      ticker: s.ticker, beta: s.beta || 1, risk: s.riskScore || 40,
      sector: s.sector || "Unknown", weight: s.weight || 0,
    }));

    // Build Polymarket context if available
    const polyContext = polymarketSignals && Array.isArray(polymarketSignals) && polymarketSignals.length > 0
      ? `\nPrediction Market Signals (Polymarket):\n${polymarketSignals.map((s: any) => `- "${s.market}": ${(s.probability * 100).toFixed(0)}% prob, ${s.direction}, $${(s.volume24h / 1000).toFixed(0)}K vol`).join("\n")}`
      : "";

    const result = await callAI({
      provider,
      systemPrompt: `You are the flows desk strategist at a global macro fund. Your job: given a book + market context + prediction-market priors, surface the institutional flow signals that will REPRICE the book in the next 1–10 sessions. You think like a dealer who sees the order tape.

REASONING FRAMEWORK — for every signal:
1. Name the mechanism: ETF Rebalancing (index quarterly + style drift), Vol Targeting (risk-parity de/leveraging vs realized vol), CTA Momentum (trend-follower trigger levels), Gamma Exposure (dealer hedging into pin), Dark Pool / Block Activity, Risk Parity (vol-weighted bond/equity rotation), Pension Rebalance (quarter-end mean reversion), Liquidity Stress, Polymarket Macro Skew (prediction-market priors).
2. Direction MUST follow the mechanism — vol-spike → vol-target sells equities → SELL; gamma-pin under spot → dealer buys → BUY; pension end-of-quarter overshoot → mean revert.
3. Intensity (0–100) reflects the size of the implied flow vs. average daily liquidity. Impact (0–100) reflects expected price displacement on the affected names.
4. Reasoning: 1 sentence naming the mechanism + the trigger condition. NOT generic ("flows are positive") — must be specific ("VIX +3pts in 2d → vol-target funds shed ~$8bn equities, pressuring high-beta tech").
5. If polymarket priors are provided, include 2–3 PRED signals tied to the highest-conviction macro markets — direction follows whether the bearish-keyword market is rising/falling.

CALIBRATION GUARDS:
• 6–12 signals total, covering at least 4 of the 8 mechanisms above.
• Each signal must defend itself against the portfolio's beta, sector mix, or VIX level.
• Strings ≤ 200 chars.

Return ONLY valid JSON array:
[{
  "name": string (signal name like "ETF Rebalancing", "Vol Targeting", "CTA Momentum", "Polymarket Macro Skew", etc.),
  "category": "STRUCT" | "FLOW" | "RISK" | "OPTIONS" | "PRED",
  "intensity": number (0-100),
  "direction": "BUY" | "SELL" | "NEUTRAL",
  "impact": number (0-100),
  "reasoning": string (1 sentence explanation)
}]`,
      userPrompt: `Portfolio holdings: ${JSON.stringify(summary)}
VIX: ${vix || "N/A"}, Regime: ${marketRegime || "Unknown"}${polyContext}

Walk the framework:
(a) From VIX level + change, infer vol-targeting and risk-parity flows.
(b) From sector concentration in the book, infer ETF rebalance / sector rotation pressure.
(c) From beta + size profile, infer CTA + gamma exposure relative to dealer positioning.
(d) If polymarket priors given, encode 2–3 PRED signals from the highest-volume macro markets.
(e) Each signal must name a mechanism + trigger and tie its direction to the portfolio's actual exposure.`,
      temperature: 0.5,
      maxTokens: 2048,
    });

    const signals = safeParseJSON(result.text);
    return new Response(JSON.stringify(signals), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("flow-intelligence error:", err);
    return new Response(JSON.stringify({ error: err.message || "Flow intelligence failed" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
