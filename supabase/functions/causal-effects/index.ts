import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { callAI } from "../_shared/callAI.ts";
import { safeParseJSON } from "../_shared/safeParseJSON.ts";
import { requireAuth } from "../_shared/auth.ts";
import { modelInfo } from "../_shared/modelRegistry.ts";


const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

function extractTickers(portfolio: unknown): string[] {
  if (typeof portfolio !== "string") return [];
  return Array.from(new Set((portfolio.match(/\b[A-Z]{1,5}(?:\.[A-Z]{1,3})?\b/g) || [])
    .filter((t) => !["BUY", "SELL", "HOLD", "USD", "INR", "NYSE", "NSE", "BSE"].includes(t))
    .slice(0, 8)));
}

async function fetchYahooQuote(symbol: string): Promise<{ symbol: string; price: number; prevClose: number; changePct: number; currency: string } | null> {
  try {
    const res = await fetch(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=5d&_t=${Date.now()}`, {
      headers: { "User-Agent": UA, "Cache-Control": "no-cache, no-store" },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const meta = data?.chart?.result?.[0]?.meta;
    const price = Number(meta?.regularMarketPrice);
    const prevClose = Number(meta?.chartPreviousClose || meta?.previousClose || 0);
    if (!Number.isFinite(price) || price <= 0) return null;
    return { symbol, price, prevClose, changePct: prevClose > 0 ? ((price - prevClose) / prevClose) * 100 : 0, currency: meta?.currency || "USD" };
  } catch {
    return null;
  }
}

function deterministicCascade(event: string, quotes: Array<{ symbol: string; price: number; changePct: number; currency: string }>, vix: number) {
  const avgMove = quotes.length ? quotes.reduce((s, q) => s + q.changePct, 0) / quotes.length : 0;
  const stress = Math.max(0, Math.min(100, (vix > 0 ? (vix - 14) * 3 : 15) + Math.abs(avgMove) * 8));
  const direction = avgMove >= 0 ? "up" : "down";
  const names = quotes.length ? quotes : [{ symbol: "SPY", price: 0, changePct: avgMove, currency: "USD" }];
  const first = names.slice(0, 4).map((q) => ({
    order: 1,
    effect: `${q.symbol} reprices through observed tape (${q.changePct >= 0 ? "+" : ""}${q.changePct.toFixed(2)}% day move)`,
    asset_class: "equities",
    direction: q.changePct >= 0 ? "up" : "down",
    magnitude: `${q.changePct >= 0 ? "+" : ""}${q.changePct.toFixed(2)}% observed` ,
    confidence: 0.8,
    time_horizon: "intraday",
  }));
  return {
    event,
    first_order: first,
    second_order: [
      { order: 2, effect: `Portfolio beta channel follows the average observed move (${avgMove >= 0 ? "+" : ""}${avgMove.toFixed(2)}%)`, asset_class: "equities", direction, magnitude: `${(avgMove * 0.7).toFixed(2)}% measured-beta channel`, confidence: 0.62, time_horizon: "1-2 weeks" },
      { order: 2, effect: `Volatility channel ${vix > 0 ? `uses VIX ${vix.toFixed(1)}` : "uses unavailable VIX, lower confidence"}`, asset_class: "bonds", direction: stress > 35 ? "volatile" : direction, magnitude: `${Math.round(stress)} stress score`, confidence: vix > 0 ? 0.65 : 0.35, time_horizon: "1-2 weeks" },
    ],
    third_order: [
      { order: 3, effect: "Risk-budget feedback can force de-risking if volatility and drawdown rise together", asset_class: "equities", direction: stress > 45 ? "down" : "volatile", magnitude: `${Math.round(stress)} stress score`, confidence: 0.52, time_horizon: "1-3 months" },
    ],
    scenario_tree: [
      { label: "Bull", probability: 0.2, capital_impact_pct: Number(Math.max(0.5, avgMove * 0.8).toFixed(2)), key_moves: names.slice(0, 2).map((q) => `${q.symbol} stabilizes above ${q.currency} ${q.price}`) },
      { label: "Base", probability: 0.45, capital_impact_pct: Number((avgMove * 0.35).toFixed(2)), key_moves: names.slice(0, 2).map((q) => `${q.symbol} tracks observed tape`) },
      { label: "Bear", probability: 0.25, capital_impact_pct: Number((-Math.max(1, Math.abs(avgMove) * 0.9)).toFixed(2)), key_moves: names.slice(0, 2).map((q) => `${q.symbol} extends risk-off`) },
      { label: "Tail Risk", probability: 0.1, capital_impact_pct: Number((-Math.max(3, stress / 10)).toFixed(2)), key_moves: ["Volatility shock forces cross-asset de-risking"] },
    ],
    reflexivity_score: Math.round(stress),
    scar_tag: stress > 50 ? "vol shock" : "tape transmission",
    model: modelInfo("causal-effects"),
    data_provenance: { quotes, vix, generated_from: "measured market data" },
    disclaimer: "Deterministic cascade from measured market data. Effects are transmission hypotheses, not established causes or forecasts.",
  };
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    await requireAuth(req, corsHeaders);
    const { event, portfolio, provider } = await req.json();
    const tickers = extractTickers(portfolio);
    const [quotes, vixQuote] = await Promise.all([
      Promise.all(tickers.map((t) => fetchYahooQuote(t))),
      fetchYahooQuote("^VIX"),
    ]);
    const measuredQuotes = quotes.filter(Boolean) as Array<{ symbol: string; price: number; prevClose: number; changePct: number; currency: string }>;

    let result;
    try {
      result = await callAI({
      provider,
      systemPrompt: `You are a senior macro strategist at a sovereign wealth fund (think GIC / Norges Bank). You model how a single shock propagates across asset classes through 1st, 2nd, and 3rd-order channels — and you ground every effect in a real transmission mechanism, not vibes.

REASONING FRAMEWORK — for every effect you write:
1. Identify the transmission channel (rates, credit, FX, commodities, supply chain, sentiment, regulatory, fiscal).
2. Name the mechanism in one clause ("USD strengthens → EM debt service costs rise → BRL/ZAR/TRY underperform").
3. Calibrate magnitude to historical analogues — a Fed +50bp surprise moves 2Y ~15–25bp; a crude +10% shock hits airlines ~3–6%; an EM currency crisis bleeds equities 8–15% over 2–4 weeks. These are ANALOGUES, not forecasts — say so.
4. Confidence reflects how mechanical the link is (rates → bond prices ≈ 0.9; geopolitical → sentiment ≈ 0.4–0.6). It is your subjective read of mechanism strength, NOT a calibrated probability. Use lower confidence freely; do not manufacture precision.
5. Time horizons must escalate by order: 1st-order intraday→days, 2nd-order weeks, 3rd-order months/structural.

HONESTY RULES (a sovereign fund audits these):
- Every effect is a HYPOTHESIS about a mechanism, not an established fact. Do not assert that the event "will" cause a move; assert that the mechanism, IF it operates as in past analogues, points a given direction.
- If a link is speculative or the mechanism is unclear, say so and lower confidence — an honest "uncertain" beats a fabricated number.
- Never invent a specific magnitude you cannot tie to a named analogue.

SCENARIO TREE RULES:
- Probabilities across Bull/Base/Bear/Tail-Risk MUST sum to 1.0 (±0.02).
- capital_impact_pct is portfolio-level expected % impact in each branch — Bull positive, Base near 0, Bear negative single-digits, Tail Risk double-digit negative.
- key_moves must name a concrete instrument or pair (SPY -3%, USDJPY +2%, NVDA -8%) — NOT generic "stocks fall".

VOICE: tight, sell-side, numerate. Strings ≤ 220 chars. Return ONLY valid JSON.`,
      userPrompt: `Event: "${event}"
Portfolio: ${portfolio || "No portfolio loaded"}
Measured quotes: ${measuredQuotes.map((q) => `${q.symbol} ${q.currency} ${q.price} (${q.changePct >= 0 ? "+" : ""}${q.changePct.toFixed(2)}%)`).join(", ") || "none"}
VIX: ${vixQuote?.price ? vixQuote.price.toFixed(2) : "unavailable"}
Date: ${new Date().toISOString().split("T")[0]}

Walk the cascade end-to-end:
(a) FIRST-ORDER (4–6 effects): direct re-pricing — the assets that move within hours because their pricing model takes the event as a direct input.
(b) SECOND-ORDER (4–6 effects): correlated re-pricing — assets that move because of the 1st-order moves (carry trades unwind, hedges fire, sector rotation).
(c) THIRD-ORDER (4–6 effects): structural / behavioural — capex cuts, policy responses, supply-chain rewiring, narrative shifts that take weeks to months.
(d) Build the 4-branch scenario tree with probabilities summing to 1 and portfolio-level capital impact per branch.
(e) reflexivity_score: how self-reinforcing is this cascade? 0=one-shot, 100=full feedback loop (margin calls → forced selling → more margin calls).
(f) scar_tag: a 2-3 word pattern label so the system can match this to historical analogues.

Be specific with tickers, currencies, percentages, and time windows in every entry.

Return JSON:
{
  "event": "<event name>",
  "first_order": [{ "order": 1, "effect": "<effect>", "asset_class": "<equities|bonds|commodities|forex|crypto>", "direction": "<up|down|volatile>", "magnitude": "<specific %>", "confidence": <0-1>, "time_horizon": "<intraday|1-3 days|1 week>" }],
  "second_order": [{ "order": 2, "effect": "<ripple effect>", "asset_class": "<type>", "direction": "<up|down|volatile>", "magnitude": "<specific>", "confidence": <0-1>, "time_horizon": "<1-2 weeks|2-4 weeks>" }],
  "third_order": [{ "order": 3, "effect": "<structural consequence>", "asset_class": "<type>", "direction": "<up|down|volatile>", "magnitude": "<specific>", "confidence": <0-1>, "time_horizon": "<1-3 months|3-6 months|structural>" }],
  "scenario_tree": [
    { "label": "Bull", "probability": <0-1>, "capital_impact_pct": <number>, "key_moves": ["<move1>", "<move2>"] },
    { "label": "Base", "probability": <0-1>, "capital_impact_pct": <number>, "key_moves": ["<move1>", "<move2>"] },
    { "label": "Bear", "probability": <0-1>, "capital_impact_pct": <number>, "key_moves": ["<move1>", "<move2>"] },
    { "label": "Tail Risk", "probability": <0-1>, "capital_impact_pct": <number>, "key_moves": ["<move1>", "<move2>"] }
  ],
  "reflexivity_score": <0-100>,
  "scar_tag": "<pattern tag>"
}`,
      maxTokens: 4096,
      temperature: 0.3,
      });
    } catch (e) {
      if (measuredQuotes.length === 0) throw e;
      return new Response(JSON.stringify(deterministicCascade(event, measuredQuotes, vixQuote?.price || 0)), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    console.log(`causal-effects used provider: ${result.provider}`);
    const parsed = safeParseJSON(result.text) ?? {};

    // Ship the honest semantics with the payload: this is a model-authored
    // hypothesis tree with uncalibrated confidence, never established causality.
    (parsed as Record<string, unknown>).model = modelInfo("causal-effects");
    (parsed as Record<string, unknown>).data_provenance = { quotes: measuredQuotes, vix: vixQuote?.price || null };
    (parsed as Record<string, unknown>).disclaimer =
      "Model-generated hypothetical cascade. Effects are proposed transmission mechanisms, not established causes; confidence and branch probabilities are uncalibrated model estimates, not forecasts.";

    return new Response(JSON.stringify(parsed), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (error: any) {
    // requireAuth throws a Response object directly
    if (error instanceof Response) return error;
    console.error("Causal effects error:", error);
    if (error.status === 429) return new Response(JSON.stringify({ error: "Rate limited" }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    return new Response(JSON.stringify({ error: error.message || "Internal error" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
