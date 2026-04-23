
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
    const { portfolio, provider } = await req.json();

    if (!portfolio || portfolio.length === 0) {
      return new Response(JSON.stringify([]), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const summary = portfolio.map((s: any) => ({
      ticker: s.ticker, risk: s.riskScore || 40, beta: s.beta || 1,
      pnlPct: s.pnlPct || 0, currentPrice: s.currentPrice || s.buyPrice,
      sector: s.sector || "Unknown",
    }));

    const result = await callAI({
      provider,
      systemPrompt: `You are a senior opportunistic trader on an institutional desk. You scan a portfolio for ASYMMETRIC setups — places where structural inefficiencies, crowding, or forced flows create skewed payoffs. Each opportunity must be a TRADE you'd put on, not a generic observation.

REASONING FRAMEWORK — for every opportunity:
1. Identify the structural inefficiency: who is the forced buyer/seller? Why now? (ETF rebalance, vol-target deleveraging, options pin, earnings drift, sector rotation, factor unwind).
2. Quantify the edge in basis points or % — derived from the size of the flow vs. the asset's daily liquidity.
3. Specify the EXACT trade: instrument, direction, entry price/zone, stop, target. No "monitor for opportunity" filler.
4. risk-reward must be ≥ 1:2 to qualify as crown-tier. Compute as (target − entry) / (entry − stop). Do not write a trade that fails this gate.
5. urgency reflects time-decay of the edge: High = today/this week (gamma squeeze, earnings drift), Medium = 1–2 weeks (rotation), Low = structural multi-week.
6. confidence calibration: 70–85 strong evidence + multiple signals; 50–65 single strong signal; 35–50 thesis only — never below 35.

OPPORTUNITY TYPES — pick the right tag:
• Crowded Trade — fade extreme positioning before squeeze/unwind.
• Forced Seller — buy from a mechanical liquidator (margin, vol-target, ETF outflow).
• Vol Spike — long premium when realized > implied or vice-versa.
• Momentum — ride a flow with a tight invalidation level.
• Mean Reversion — fade an overshoot at a defined statistical band.
• Structural Dislocation — exploit an index/ETF/options structural mispricing.

VOICE: trader's-pad concise. Strings ≤ 200 chars. Tickers must be real and present in the portfolio (or directly related).

Return ONLY valid JSON array — find 3–8 opportunities, sorted by edge × confidence:
[{
  "type": "Crowded Trade" | "Forced Seller" | "Vol Spike" | "Momentum" | "Mean Reversion" | "Structural Dislocation",
  "signal": string (what you detected),
  "asset": string (ticker),
  "action": string (specific actionable trade),
  "expectedEdge": string (expected profit),
  "confidence": number (0-100),
  "urgency": "High" | "Medium" | "Low",
  "riskReward": string (e.g. "1:3.2")
}]`,
      userPrompt: `Portfolio: ${JSON.stringify(summary)}

Scan THIS book for asymmetric setups. For each candidate:
(a) Name the mechanical or behavioural inefficiency causing the edge.
(b) Quantify the edge in % or bps — defended by the position's beta, sector, and risk score.
(c) Specify entry zone, stop level, and target. Compute risk:reward and reject anything below 1:2.
(d) Tag urgency by time-decay of the edge. Tag confidence by signal strength.

Reject generic ideas. Every entry must be a ticket the desk could write today.`,
      temperature: 0.5,
      maxTokens: 3072,
    });

    const opportunities = safeParseJSON(result.text);
    return new Response(JSON.stringify(opportunities), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("crown-intelligence error:", err);
    return new Response(JSON.stringify({ error: err.message || "Crown intelligence failed" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
