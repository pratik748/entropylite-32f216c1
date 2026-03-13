import { corsHeaders } from "../_shared/cors.ts";
import { callAI } from "../_shared/callAI.ts";
import { safeParseJSON } from "../_shared/safeParseJSON.ts";

const corsH = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsH });

  try {
    const { ticker, provider } = await req.json();
    if (!ticker) throw new Error("ticker required");

    const systemPrompt = `You are a Bloomberg-grade corporate intelligence analyst. Return ONLY valid JSON — no markdown, no commentary. The JSON must match the exact structure specified.`;

    const userPrompt = `Generate a comprehensive deep intelligence dossier for ${ticker}. Return a single JSON object with these keys:

{
  "companyName": "string",
  "sector": "string",
  "industry": "string",
  "headquarters": "string",
  "founded": "string",
  "overview": "2-3 sentence overview",
  "marketCap": "string",
  "employees": "string",
  "revenueSegments": [{"segment":"string","percentage":number,"trend":"growing|stable|declining"}],
  "geographicRevenue": [{"region":"string","percentage":number}],
  "supplyChain": {
    "suppliers": [{"name":"string","role":"string","riskLevel":"low|medium|high|critical"}],
    "distributors": [{"name":"string","region":"string"}],
    "manufacturers": [{"name":"string","type":"owned|contract|outsourced","location":"string"}]
  },
  "ownership": {
    "insiderPct": number,
    "institutionalPct": number,
    "retailPct": number,
    "topHolders": [{"name":"string","type":"institution|insider|activist","pct":number,"trend":"accumulating|holding|distributing"}]
  },
  "leadership": [{"name":"string","role":"string","since":"string","background":"string","previousCompanies":["string"],"educationBackground":"string","boardMemberships":["string"],"leadershipStyle":"string"}],
  "partnerships": [{"partner":"string","type":"technology|government|licensing|joint_venture|cloud","description":"string","revenueImpact":"high|medium|low","expirationRisk":"low|medium|high"}],
  "competitors": [{"name":"string","ticker":"string","marketShare":number,"threat":"direct|emerging|substitute","strengths":"string"}],
  "products": [{"name":"string","lifecycle":"growth|mature|declining|launch","revenueContribution":number,"description":"string"}],
  "regulatoryExposure": [{"issue":"string","severity":"low|medium|high|critical","region":"string","status":"active|resolved|pending"}],
  "insiderActivity": [{"name":"string","role":"string","action":"buy|sell|grant","shares":number,"date":"string","signal":"bullish|bearish|neutral"}],
  "narrative": {
    "newsSentiment": number,
    "socialSentiment": number,
    "analystConsensus": "strong_buy|buy|hold|sell|strong_sell",
    "earningsTone": "positive|neutral|cautious|negative",
    "narrativeShifts": ["string"],
    "analystTargets": {"low":number,"median":number,"high":number}
  },
  "signals": {
    "supplyChainRisk": number,
    "ownershipStability": number,
    "competitiveMoat": number,
    "regulatoryRisk": number,
    "insiderConfidence": number,
    "narrativeMomentum": number
  }
}

All number fields for signals should be 0-100. Revenue percentages should sum to ~100. Be factually accurate for ${ticker}. Use real company data where known, make informed estimates where not.`;

    const result = await callAI({
      systemPrompt,
      userPrompt,
      maxTokens: 8192,
      temperature: 0.4,
      provider: provider || "mistral",
    });

    const parsed = safeParseJSON(result.text);

    return new Response(JSON.stringify(parsed), {
      headers: { ...corsH, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("company-intelligence error:", err);
    return new Response(JSON.stringify({ error: err.message || "Failed" }), {
      status: 500,
      headers: { ...corsH, "Content-Type": "application/json" },
    });
  }
});
