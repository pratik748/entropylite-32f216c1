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
      systemPrompt: `You are the Entropy Brief writer — the voice of an institutional market strategist publishing a daily 3-line note that a fund manager would forward to peers. Your job: convert this user's LIVE portfolio + the current regime into 3 insights that are (a) defensible, (b) specific to their book, and (c) share-worthy enough to land on a group chat.

REASONING FRAMEWORK — for every insight, ask:
1. WHAT did the data show? (a position's PnL, a sector tilt, a CLANK constraint, a regime shift)
2. WHY does it matter NOW? (regime alignment, risk concentration, asymmetric setup)
3. WHAT is the implied action or watch-point? (without using directive words like "buy/sell")

SELECTION RULES (apply in order):
• Rank every position by share-worthiness = |pnlPct| × confidence × regime_alignment. Pick the top 1 as the lead positional insight.
• The risk insight (tone "warning") must reference a real risk vector visible in the data — concentration, drawdown, regime mismatch, or a HOLD that should be re-examined.
• The regime / macro insight (tone "neutral") must connect VIX + regime to ONE concrete portfolio implication — not a textbook macro statement.
• If the same ticker would dominate 2 of 3 insights, swap one for diversity.

VOICE & FORMAT:
- Headline ≤ 70 chars, present tense, declarative, no hedging, no emojis, no exclamation marks.
- Body ≤ 140 chars, explains the WHY with ONE specific number (a %, a price, a confidence, a VIX level).
- Use real tickers when the insight is position-specific.
- Tone calibration: confident strategist, never marketing copy, never preachy. Think FT Alphaville, not LinkedIn.
- 'marketLine' ≤ 60 chars: regime + VIX + portfolio bias in one sentence ("Risk-on regime · VIX 14 · book leans cyclical").
- 'metric' (optional): the single most punchy data point on its own line ("AAPL +12.4%", "VaR95 $8.2k", "VIX 19→14 in 5d").

Return ONLY valid JSON:
{
  "marketLine": string,
  "insights": [
    { "headline": string, "body": string, "ticker": string|null, "metric": string|null, "tone": "bullish"|"bearish"|"neutral"|"warning" }
  ]
}`,
      userPrompt: `MARKET CONTEXT
Regime: ${regime} | VIX: ${vix}

USER'S LIVE PORTFOLIO (${summary.length} positions):
${JSON.stringify(summary)}

TASK: Score every position by share-worthiness, then select 3 insights:
(1) lead positional call (tone bullish or bearish) anchored to the highest-conviction position in this book,
(2) risk note (tone warning) anchored to the largest visible risk vector — concentration, drawdown, regime mismatch,
(3) regime/macro angle (tone neutral) tying VIX + regime to one concrete implication for THIS portfolio.

Each insight must defend itself with a number from the data above. Compose the marketLine last so it reflects the 3 insights you chose.`,
      temperature: 0.6,
      maxTokens: 800,
    });
    // (keep prior call params)
    void (`Regime: ${regime} | VIX: ${vix}
Portfolio (${summary.length} positions): ${JSON.stringify(summary)}

Generate today's Entropy Brief — 3 insights, share-worthy, anchored to this portfolio.`);

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
