import { callAI } from "../_shared/callAI.ts";
import { safeParseJSON } from "../_shared/safeParseJSON.ts";
import { fetchTickerLiveBundle, bundleToPromptContext } from "../_shared/liveData.ts";
import { isIndianTicker, normalizeTickerInput } from "../_shared/ticker.ts";

const corsH = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsH });

  try {
    const { ticker: rawTicker, provider } = await req.json();
    if (!rawTicker) throw new Error("ticker required");
    const ticker = normalizeTickerInput(rawTicker);
    const isIndian = isIndianTicker(ticker);

    // Step 1: Fetch live structured data from Screener / Yahoo / Finviz / Filings / Moneycontrol
    let scrapedContext = "";
    try {
      const bundle = await fetchTickerLiveBundle(ticker, isIndian);
      scrapedContext = bundleToPromptContext(bundle);
      console.log(`company-intelligence live bundle for ${ticker}: ${scrapedContext.length} chars`);
    } catch (e: any) {
      console.warn("Live bundle failed, proceeding with AI-only:", e.message);
    }

    const systemPrompt = `You are a senior equity research analyst at a tier-1 sell-side desk producing the deep dossier a portfolio manager reads before sizing a position. Your job is to fuse LIVE SCRAPED DATA (provided below) with your structural knowledge of the company into a single defensible JSON dossier.

REASONING DISCIPLINE:
1. The scraped block is GROUND TRUTH for current numbers (price, market cap, recent filings, current ownership, recent news). Where your training data conflicts, the scraped data wins — silently update.
2. Every signal score (0–100) must be defensible from the data: supplyChainRisk reflects supplier concentration + geographic exposure; competitiveMoat reflects market share + switching costs + IP; insiderConfidence reflects net insider buying vs selling over recent quarters.
3. Revenue segments and geographic splits must reconcile to ~100% each. Unknown → estimate from the most recent annual report and tag the trend.
4. Leadership entries must include real names + roles; if scraped data lacks tenure or background, infer from credible public bios — never fabricate education or board seats.
5. narrative.analystConsensus and narrative.analystTargets must align with the scraped sell-side data when present; otherwise infer conservatively from sector + recent guidance.
6. regulatoryExposure: only include items with a real, current basis (active inquiry, recent settlement, sector-wide rule). Generic risks ("subject to SEC rules") are NOT acceptable.
7. Every string ≤ 240 chars. Output ONLY valid JSON — no markdown, no preamble, no commentary.`;

    const userPrompt = `Generate a comprehensive deep intelligence dossier for ${ticker}.${scrapedContext ? `\n\n${scrapedContext.slice(0, 6000)}` : ""}\n\nReturn a single JSON object with these keys:

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

    // Retry up to 2 times on parse failures
    let lastErr: any;
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const result = await callAI({
          systemPrompt,
          userPrompt,
          maxTokens: 8192,
          temperature: 0.4,
          provider: provider || "mistral",
        });

        const parsed = safeParseJSON(result.text);

        // Validate essential fields exist
        if (!parsed || (!parsed.companyName && !parsed.sector)) {
          throw new Error("Incomplete response — missing companyName/sector");
        }

        return new Response(JSON.stringify(parsed), {
          headers: { ...corsH, "Content-Type": "application/json" },
        });
      } catch (err: any) {
        lastErr = err;
        console.error(`company-intelligence attempt ${attempt + 1} failed:`, err.message || err);
        if (attempt === 0) {
          // Brief pause before retry
          await new Promise(r => setTimeout(r, 500));
        }
      }
    }

    console.error("company-intelligence all attempts failed:", lastErr?.message);
    return new Response(JSON.stringify({ error: lastErr?.message || "Failed to generate intelligence" }), {
      status: 500,
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
