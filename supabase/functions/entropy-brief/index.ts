import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { callAI } from "../_shared/callAI.ts";
import { safeParseJSON } from "../_shared/safeParseJSON.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface Insight {
  headline: string; // <= 70 chars, punchy, no hedging
  body: string; // <= 140 chars, the why
  ticker?: string;
  metric?: string; // optional one-liner data point
  tone: "bullish" | "bearish" | "neutral" | "warning";
}

interface BriefResponse {
  generatedAt: number;
  regime: string;
  marketLine: string; // one-line market mood
  insights: Insight[]; // exactly 3
}

serve(async (req) => {
  if (req.method === "OPTIONS")
    return new Response(null, { headers: corsHeaders });

  try {
    const { portfolio = [], regime = "Neutral", vix = 0, provider } =
      await req.json();

    const summary = (portfolio || []).slice(0, 12).map((s: any) => ({
      ticker: s.ticker,
      pnlPct: Number(s.pnlPct || 0).toFixed(2),
      currentPrice: s.currentPrice,
      buyPrice: s.buyPrice,
      suggestion: s.suggestion || "HOLD",
      confidence: s.confidence || 0,
      riskLevel: s.riskLevel || "MEDIUM",
      sector: s.sector || "Unknown",
      verdict: s.verdict || "",
    }));

    const fallback: BriefResponse = {
      generatedAt: Date.now(),
      regime,
      marketLine: `${regime} regime · VIX ${vix.toFixed(1)}`,
      insights: [
        {
          headline: "Add positions to generate today's brief",
          body: "Analyze at least one asset and we'll surface 3 conviction-weighted insights from your live session.",
          tone: "neutral",
        },
        {
          headline: "Probabilities, not predictions",
          body: "Every Entropy insight is calibrated to the current market regime and your own portfolio context.",
          tone: "neutral",
        },
        {
          headline: "Composed for the independent thinker",
          body: "10K-path Monte Carlo, CLANK constraints, and causal cascades — distilled into 3 lines you can share.",
          tone: "neutral",
        },
      ],
    };

    if (!summary.length) {
      return new Response(JSON.stringify(fallback), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const result = await callAI({
      provider,
      systemPrompt: `You are the Entropy Brief writer — a Bloomberg-grade market voice. Your job: distill the user's live portfolio session into exactly 3 share-worthy insights.

RULES (strict):
- Each headline ≤ 70 characters, present tense, no hedging, no emojis
- Each body ≤ 140 characters, explains the WHY with one number when possible
- Pick the 3 MOST share-worthy signals from this user's actual positions and the regime
- Mix tones: at least one positional call (bullish/bearish), one risk note (warning), one regime/macro angle (neutral)
- Reference real tickers when relevant
- Sound like a confident analyst, not a marketing copywriter
- Also write a single 'marketLine' (≤ 60 chars) summarizing the regime + VIX + portfolio bias

Return ONLY valid JSON:
{
  "marketLine": string,
  "insights": [
    { "headline": string, "body": string, "ticker": string|null, "metric": string|null, "tone": "bullish"|"bearish"|"neutral"|"warning" }
  ]
}`,
      userPrompt: `Regime: ${regime} | VIX: ${vix}
Portfolio (${summary.length} positions): ${JSON.stringify(summary)}

Generate today's Entropy Brief — 3 insights, share-worthy, anchored to this portfolio.`,
      temperature: 0.6,
      maxTokens: 800,
    });

    const parsed = safeParseJSON<{
      marketLine?: string;
      insights?: Insight[];
    }>(result.text);

    if (!parsed?.insights || parsed.insights.length === 0) {
      return new Response(JSON.stringify(fallback), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const brief: BriefResponse = {
      generatedAt: Date.now(),
      regime,
      marketLine:
        parsed.marketLine || `${regime} regime · VIX ${vix.toFixed(1)}`,
      insights: parsed.insights.slice(0, 3),
    };

    return new Response(JSON.stringify(brief), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("entropy-brief error:", err);
    return new Response(
      JSON.stringify({ error: err.message || "Brief generation failed" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});
