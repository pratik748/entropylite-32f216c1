
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
    const { portfolio, totalValue, baseCurrency, provider } = await req.json();

    if (!portfolio || portfolio.length === 0) {
      return new Response(JSON.stringify({ error: "No portfolio data" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const result = await callAI({
      provider,
      systemPrompt: `You are the execution + portfolio construction lead at an institutional desk. You translate a holdings list into (a) a Command Center risk overlay, (b) a market-impact / aftermath model, (c) an execution algo recommendation, and (d) liquidity / rebalancing actions. Every output must be defensible against the holdings provided.

REASONING FRAMEWORK:
1. Command Center per asset
   • weight = positionValue / totalValue (must sum to ~100).
   • flowPressure (0–100): institutional crowding proxy — high beta + high weight + concentrated sector → higher pressure.
   • reflexivity (0–100): self-reinforcing risk — tighter when float-light, momentum-heavy, or narrative-driven.
   • structural (0–100): mechanical risk (index reweight, options pin, ETF flow). Liquid mega-caps score lower.
   • worstCase (negative $): 21-day 95% downside ≈ -1.65 × σ_21d × positionValue.
   • suggestion: Add (under-weight high-conviction), Hold (in-balance), Trim (overweight + flow risk), Exit (structural break).

2. Aftermath (market-impact model)
   • priceImpactBps ≈ √(orderSize / ADV) × σ_daily × 10000. Mid-caps and small-caps get 1.5–3× large-cap impact.
   • slippageCost = positionValue × priceImpactBps / 10000.
   • daysToUnwind = positionValue / (0.20 × ADV × price). Use sector liquidity priors when ADV unknown.
   • narrativeRisk: High when ticker is meme/crowded/news-driven; Low for boring large-caps.
   • selfDefeatRisk: HIGH when totalSlippage > 50 bps of portfolio.

3. Execution algo
   • VWAP for liquid, low-urgency, full-day fills.
   • TWAP for mid-liquidity or when avoiding signaling.
   • POV (participation-of-volume) for size > 5% ADV with patience.
   • Adaptive when book has mixed liquidity tiers.
   • reasoning must reference the slippage estimate AND the most illiquid name in the book.

4. liquidityRadar must rank EVERY holding (not just a sample). daysToExit ties to the aftermath model.

5. rebalancingSuggestions + concentrationWarnings: each must name a TICKER or sector and the % action ("Trim NVDA from 32% to 18% — single-name concentration above factor-risk limit").

CALIBRATION GUARDS: no round numbers, no generic advice, every string ≤ 240 chars, every percentage realistic.

Return ONLY valid JSON (no markdown, no prose):
{
  "commandCenter": {
    "assets": [{
      "ticker": string, "weight": number, "flowPressure": number (0-100),
      "reflexivity": number (0-100), "structural": number (0-100),
      "worstCase": number (negative dollar loss 21-day), "suggestion": "Add" | "Hold" | "Trim" | "Exit"
    }]
  },
  "aftermath": {
    "assets": [{
      "ticker": string, "priceImpactBps": number, "slippageCost": number,
      "daysToUnwind": number, "narrativeRisk": "High" | "Medium" | "Low",
      "competitorReaction": number (0-100), "optimalSizePct": number
    }],
    "totalSlippage": number, "avgImpact": number, "selfDefeatRisk": "HIGH" | "MEDIUM" | "LOW"
  },
  "execution": {
    "recommendedAlgo": "VWAP" | "TWAP" | "POV" | "Adaptive",
    "reasoning": string,
    "estimatedSlippage": number, "completionHours": number,
    "optimalParticipation": number (percent)
  },
  "liquidityRadar": [{
    "ticker": string, "liquidityScore": number (0-100), "daysToExit": number
  }],
  "rebalancingSuggestions": [string],
  "concentrationWarnings": [string]
}`,
      userPrompt: `LIVE PORTFOLIO (${baseCurrency || "USD"}, total: $${totalValue?.toLocaleString() || "N/A"}):
${JSON.stringify(portfolio, null, 1)}

Walk the framework end-to-end:
(1) Compute weights and flag any single-name > 20% — these dominate the risk picture.
(2) For each holding produce flow / reflexivity / structural / worstCase / suggestion grounded in its sector + size + likely ADV.
(3) Build the Aftermath block — slippage and unwind days must be position-size-aware, not constants.
(4) Pick ONE recommended execution algo and justify it against the most illiquid position in the book.
(5) liquidityRadar covers every ticker. Sort by daysToExit descending so the front-end shows worst-first.
(6) Rebalancing + concentration warnings name tickers and target weights — no platitudes.`,
      temperature: 0.4,
      maxTokens: 4096,
    });

    const data = safeParseJSON(result.text);
    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("portfolio-intelligence error:", err);
    return new Response(JSON.stringify({ error: err.message || "Portfolio intelligence failed" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
