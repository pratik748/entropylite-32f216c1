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
    const { portfolio } = await req.json();

    if (!portfolio || portfolio.length === 0) {
      return new Response(JSON.stringify({ error: "No portfolio data" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const summary = portfolio.map((s: any) => ({
      ticker: s.ticker, pe: s.pe || 0, pbv: s.pbv || 0,
      divYield: s.dividendYield || 0, risk: s.riskScore || 40,
      beta: s.beta || 1, sector: s.sector || "Unknown",
      marketCap: s.marketCap || "Unknown", roe: s.roe || 0,
    }));

    const result = await callAI({
      systemPrompt: `You are a deep intelligence layer AI. Produce institutional-grade assessments across 4 dimensions for each stock.
Return ONLY valid JSON:
{
  "managementScores": [{ "ticker": string, "capitalAllocation": number (0-100), "decisionReliability": number (0-100), "ceoScore": number (0-100), "insight": string }],
  "capitalFlow": [{ "ticker": string, "flowPressure": number (0-100), "gammaExposure": "Positive" | "Negative" | "Neutral", "etfRebalanceRisk": "High" | "Low", "indexInclusionProb": number (0-100) }],
  "narrative": [{ "ticker": string, "sentimentVelocity": number (0-100), "crowdedTradeScore": number (0-100), "reflexivityRisk": "High" | "Medium" | "Low", "analystConsensus": "Buy" | "Hold" | "Sell" }],
  "structural": [{ "ticker": string, "geopolitical": number (0-100), "regulatory": number (0-100), "techDisruption": number (0-100), "supplyChain": number (0-100), "hiddenDrawdownRisk": number (0-100) }],
  "radarData": [{ "factor": string, "value": number (0-100) }]
}`,
      userPrompt: `Portfolio: ${JSON.stringify(summary)}
Analyze each stock across Management DNA, Capital Flow dynamics, Narrative/Reflexivity risk, and Structural risk. Base scores on fundamentals and sector context.`,
      temperature: 0.4,
      maxTokens: 4096,
    });

    const data = JSON.parse(result.text);
    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("deep-intelligence error:", err);
    return new Response(JSON.stringify({ error: err.message || "Deep intelligence failed" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
