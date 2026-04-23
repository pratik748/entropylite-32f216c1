
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
      provider,
      systemPrompt: `You are a senior fundamental + structural analyst writing the "Four Dimensions" sheet a PM reads alongside a position. You score each holding across (1) Management DNA, (2) Capital Flow dynamics, (3) Narrative / Reflexivity risk, and (4) Structural risk — and EVERY score must be defended by the data given (PE, PBV, dividend, ROE, beta, sector, market cap).

SCORING DISCIPLINE (0–100 per axis):
• Management DNA — capitalAllocation tied to ROE + reinvestment; decisionReliability tied to size and beta; ceoScore tied to multi-cycle ROE consistency. Insight = 1 sentence naming the edge or weakness.
• Capital Flow — flowPressure rises with beta + sector momentum + index inclusion; gammaExposure Positive when retail/options heavy with rising IV, Negative for dealer-short gamma; etfRebalanceRisk High for mid-caps; indexInclusionProb tied to market-cap trajectory.
• Narrative — sentimentVelocity peaks around earnings/revisions; crowdedTradeScore high for momentum darlings; reflexivityRisk High when price shapes fundamentals; analystConsensus aligned with valuation + sector.
• Structural — geopolitical / regulatory / techDisruption / supplyChain weighted by SECTOR (semis: tech-disruption + supply-chain; banks: regulatory; energy: geopolitical; consumer: supply-chain). hiddenDrawdownRisk = aggregate tail score.

radarData: aggregate the 4 dimensions into 6 portfolio-weighted radar axes (Management, Flow, Narrative, Structural, Quality, Risk).

CALIBRATION GUARDS: never write a flat 50 unless the input is genuinely missing. Every score must be defended by a number from the data. Strings ≤ 200 chars. Return ONLY valid JSON in the schema below:
{
  "managementScores": [{ "ticker": string, "capitalAllocation": number (0-100), "decisionReliability": number (0-100), "ceoScore": number (0-100), "insight": string }],
  "capitalFlow": [{ "ticker": string, "flowPressure": number (0-100), "gammaExposure": "Positive" | "Negative" | "Neutral", "etfRebalanceRisk": "High" | "Low", "indexInclusionProb": number (0-100) }],
  "narrative": [{ "ticker": string, "sentimentVelocity": number (0-100), "crowdedTradeScore": number (0-100), "reflexivityRisk": "High" | "Medium" | "Low", "analystConsensus": "Buy" | "Hold" | "Sell" }],
  "structural": [{ "ticker": string, "geopolitical": number (0-100), "regulatory": number (0-100), "techDisruption": number (0-100), "supplyChain": number (0-100), "hiddenDrawdownRisk": number (0-100) }],
  "radarData": [{ "factor": string, "value": number (0-100) }]
}`,
      userPrompt: `Portfolio: ${JSON.stringify(summary)}

For each ticker:
(a) Use PE/PBV/divYield/ROE to anchor Management DNA — high ROE + low PE = capital efficiency edge.
(b) Use beta + sector + market cap to derive flowPressure, gammaExposure, ETF risk, indexInclusionProb.
(c) Use sector + size + momentum proxies for narrative crowding and reflexivity.
(d) Use sector to weight structural risks (semis vs banks vs energy vs consumer).
(e) Defend every score with a number from the data — never write a flat 50.

radarData: 6 portfolio-weighted axes (Management, Flow, Narrative, Structural, Quality, Risk).`,
      temperature: 0.4,
      maxTokens: 4096,
    });

    const data = safeParseJSON(result.text);
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
