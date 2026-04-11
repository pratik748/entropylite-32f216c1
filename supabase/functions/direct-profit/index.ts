const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
import { callAIParallel } from "../_shared/callAI.ts";

const INDIA_EXCHANGES = ["NSE", "BSE"];
const INDIA_SUFFIX_RE = /\.(NS|BO)$/i;

function isIndiaTicker(ticker: string): boolean {
  return INDIA_SUFFIX_RE.test(ticker);
}

function normalizeIndiaTicker(ticker: string): string {
  if (INDIA_SUFFIX_RE.test(ticker)) return ticker.toUpperCase();
  return `${ticker.toUpperCase()}.NS`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { ticker, indiaMode } = await req.json();
    if (!ticker || typeof ticker !== "string") {
      return new Response(JSON.stringify({ error: "ticker required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const rawTicker = ticker.trim().toUpperCase();
    const resolvedTicker = indiaMode ? normalizeIndiaTicker(rawTicker) : rawTicker;
    const currency = indiaMode ? "INR" : "USD";
    const market = indiaMode ? "India (NSE/BSE)" : "US/Global";

    const quantContext = indiaMode
      ? `Indian market context:
- Use NSE/BSE listed prices in INR
- Reference NIFTY 50 and SENSEX as benchmarks
- Consider FII/DII flow patterns
- Factor in RBI policy stance and INR strength
- Indian market hours: 9:15 AM – 3:30 PM IST
- Use Indian options expiry cycles (weekly Thursday for NIFTY)
- Consider impact of SGX Nifty for gap analysis
- Typical Indian stock volatility bands are wider than US markets
- For hedging, reference NIFTY PUT options or Gold BEES`
      : `US/Global market context:
- Use NYSE/NASDAQ listed prices in USD
- Reference S&P 500 and VIX as benchmarks
- Consider institutional flow and dark pool activity
- Factor in Fed policy stance and DXY strength
- US market hours: 9:30 AM – 4:00 PM ET
- For hedging, reference SPY PUT options or TLT`;

    const systemPrompt = `You are an institutional-grade quantitative trading decision engine. You MUST respond with ONLY valid JSON, no explanation or markdown.

Your job: Given a stock ticker, produce a complete actionable trade plan backed by quantitative analysis.

QUANTITATIVE FRAMEWORK (apply all):
1. MOMENTUM: Calculate implied momentum score from recent price action (5d, 20d, 50d moving average alignment)
2. VOLATILITY: Estimate current implied volatility percentile (is vol high or low vs 30-day average?)
3. SUPPORT/RESISTANCE: Identify nearest key support and resistance levels from price structure
4. RISK/REWARD: Ensure target/stop ratio is at least 2:1 for BUY/SELL signals
5. VOLUME PROFILE: Consider volume-weighted average price zone for entry
6. REGIME: Is the broader market in risk-on, risk-off, or neutral regime?
7. MEAN REVERSION: If stock is >2 standard deviations from 20d mean, factor in reversion probability

${quantContext}

Rules:
- ALL prices must be realistic current market levels in ${currency}
- Confidence is 0-100, derived from quant signal alignment (more signals agree = higher confidence)
- action is exactly one of: BUY, SELL, WAIT
- direction is exactly one of: UP, DOWN, SIDEWAYS
- timeframe examples: "Intraday", "2-3 days", "1 week", "2 weeks"
- directionReason max 8 words, must reference a quant signal
- positiveNews and negativeNews are single short sentences (no links)
- protection is ONE simple sentence about what to do if trade fails
- quantScore is 0-100 representing how many quant factors align with the trade

JSON schema:
{
  "action": "BUY" | "SELL" | "WAIT",
  "confidence": number,
  "entryLow": number,
  "entryHigh": number,
  "targetPrice": number,
  "stopLoss": number,
  "timeframe": string,
  "direction": "UP" | "DOWN" | "SIDEWAYS",
  "directionReason": string,
  "positiveNews": string,
  "negativeNews": string,
  "protection": string,
  "currentPrice": number,
  "quantScore": number,
  "volatilityRegime": "LOW" | "NORMAL" | "HIGH",
  "riskRewardRatio": number
}`;

    const userPrompt = `Ticker: ${resolvedTicker}
Market: ${market}
Currency: ${currency}
Date: ${new Date().toISOString().split("T")[0]}

Apply full quantitative analysis framework. Produce the trade decision JSON now.`;

    // Fire all 3 AI providers in parallel for consensus
    const results = await callAIParallel({
      systemPrompt,
      userPrompt,
      maxTokens: 2048,
      temperature: 0.3,
      jsonMode: true,
    });

    // Parse all successful results
    const parsed: any[] = [];
    for (const r of results) {
      try {
        let obj: any;
        try {
          obj = JSON.parse(r.text);
        } catch {
          const match = r.text.match(/\{[\s\S]*\}/);
          if (match) obj = JSON.parse(match[0]);
        }
        if (obj && obj.action) {
          obj._provider = r.provider;
          parsed.push(obj);
        }
      } catch {
        console.warn(`Failed to parse result from ${r.provider}`);
      }
    }

    if (parsed.length === 0) {
      throw new Error("All AI providers failed to produce valid output");
    }

    // Consensus logic: if multiple providers agree on action, boost confidence
    const actionVotes: Record<string, number> = { BUY: 0, SELL: 0, WAIT: 0 };
    for (const p of parsed) {
      if (actionVotes[p.action] !== undefined) actionVotes[p.action]++;
    }
    const consensusAction = Object.entries(actionVotes).sort((a, b) => b[1] - a[1])[0][0];
    const consensusCount = actionVotes[consensusAction];
    const consensusBoost = parsed.length > 1 ? (consensusCount / parsed.length) * 10 : 0;

    // Pick the best result (prefer consensus action, then highest confidence)
    const best = parsed
      .filter(p => p.action === consensusAction)
      .sort((a, b) => (Number(b.confidence) || 0) - (Number(a.confidence) || 0))[0]
      || parsed[0];

    const finalConfidence = Math.min(100, Math.max(0, (Number(best.confidence) || 50) + consensusBoost));

    const output = {
      action: ["BUY", "SELL", "WAIT"].includes(best.action) ? best.action : "WAIT",
      confidence: Math.round(finalConfidence),
      entryLow: Number(best.entryLow) || 0,
      entryHigh: Number(best.entryHigh) || 0,
      targetPrice: Number(best.targetPrice) || 0,
      stopLoss: Number(best.stopLoss) || 0,
      timeframe: best.timeframe || "1 week",
      direction: ["UP", "DOWN", "SIDEWAYS"].includes(best.direction) ? best.direction : "SIDEWAYS",
      directionReason: (best.directionReason || "Insufficient data").slice(0, 60),
      positiveNews: (best.positiveNews || "No significant positive catalyst").slice(0, 120),
      negativeNews: (best.negativeNews || "No significant risk detected").slice(0, 120),
      protection: (best.protection || "Exit at stop loss if trade fails").slice(0, 120),
      currentPrice: Number(best.currentPrice) || 0,
      quantScore: Math.min(100, Math.max(0, Number(best.quantScore) || 50)),
      volatilityRegime: ["LOW", "NORMAL", "HIGH"].includes(best.volatilityRegime) ? best.volatilityRegime : "NORMAL",
      riskRewardRatio: Number(best.riskRewardRatio) || 0,
      providersUsed: parsed.length,
      consensus: consensusCount === parsed.length ? "UNANIMOUS" : consensusCount > 1 ? "MAJORITY" : "SPLIT",
    };

    return new Response(JSON.stringify(output), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("direct-profit error:", err);
    return new Response(JSON.stringify({ error: err.message || "Analysis failed" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
