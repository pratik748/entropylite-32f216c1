import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { requireAuth } from "../_shared/auth.ts";
import { callAI } from "../_shared/callAI.ts";
import { safeParseJSON } from "../_shared/safeParseJSON.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { user } = await requireAuth(req, corsHeaders);
    const { tickers, weights, prices, volatilities, sectors, baseCurrency, provider, discovery_mode, news_context, macro_context } = await req.json();

    if (!tickers?.length) {
      return new Response(JSON.stringify({ error: "No tickers provided" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const portfolioSummary = tickers.map((t: string, i: number) => ({
      ticker: t,
      weight: weights?.[i] ?? (1 / tickers.length),
      price: prices?.[i] ?? 0,
      volatility: volatilities?.[i] ?? 0.25,
      sector: sectors?.[i] ?? "Unknown",
    }));

    const n = tickers.length;
    const pairCount = Math.max(5, Math.min(n * (n - 1) / 2, 15));
    const pairTradeCount = Math.max(3, Math.min(Math.floor(n / 2), 8));
    const futuresCount = Math.max(2, Math.min(n, 6));
    const oppCount = Math.max(5, Math.min(n * 2, 12));
    const simCount = Math.max(3, Math.min(n, 8));
    const discoveryCount = discovery_mode ? Math.max(5, Math.min(n * 2, 10)) : 0;
    const seed = Math.floor(Math.random() * 99999);

    const maxTokens = Math.min(16000, 5000 + n * 600 + (discovery_mode ? 3000 : 0));

    const discoveryContext = discovery_mode ? `

MARKET CONTEXT FOR GOD'S EYE DISCOVERY:
${news_context ? `Recent news themes: ${news_context.slice(0, 500)}` : "Use your knowledge of current market themes, geopolitical events, and sector trends."}
${macro_context ? `Macro regime: ${macro_context.slice(0, 300)}` : "Consider current interest rate environment, inflation, and macro conditions."}

DISCOVERY MODE ACTIVE — You MUST find opportunities BEYOND the portfolio tickers. Think like a hedge fund CIO scanning the entire market:
- Find correlated ETFs, sector futures, cross-asset plays (e.g., LMT futures + ITA defense ETF for leveraged sector exposure)
- Identify macro trades triggered by news (e.g., oil shock → long XLE futures / short airline ETF)
- Spot relative value: if portfolio holds NVDA, suggest SOXX/SMH ETF pair trades or correlated semiconductor futures
- Look for riskless leverage via futures + ETF combinations in the same sector
- Consider commodity futures (gold, oil, copper) that hedge or amplify portfolio exposures
- Find cross-border opportunities (e.g., US defense stocks + European defense ETFs like EUAD)
` : "";

    const discoverySchema = discovery_mode ? `,
  "discoveries": [
    {
      "asset_a": "LMT", "asset_b": "ITA",
      "type": "futures_etf_leverage|sector_pair|macro_hedge|relative_value|cross_asset",
      "thesis": "Defence spending escalation creates leveraged opportunity...",
      "instrument_a": "LMT futures (front month)",
      "instrument_b": "ITA ETF (iShares US Aerospace & Defense)",
      "structure": "Long LMT futures / Long ITA for capital-efficient sector exposure",
      "capital_efficiency": 4.5,
      "catalyst": "geopolitical|news|earnings|macro|structural",
      "confidence": 0.75,
      "reasoning": "detailed explanation with specific market rationale",
      "risk_reward": 3.2,
      "urgency": "high|medium|low"
    }
  ]` : "";

    const discoveryMinimum = discovery_mode ? `
- ${discoveryCount} discovery opportunities BEYOND portfolio tickers (mix of: futures_etf_leverage, sector_pair, macro_hedge, relative_value, cross_asset). These must involve at least one asset NOT in the portfolio. Be specific about instruments (futures contracts, ETF tickers, etc).` : "";

    const systemPrompt = `You are a GOD'S EYE derivatives intelligence engine for institutional portfolio management. You see the ENTIRE market, not just what's in the portfolio. Return ONLY valid JSON. No commentary, no markdown.

CRITICAL RULES:
- All numeric values must be plain numbers (no +, ~, ≈, "approximately")
- All probabilities 0-1, percentages 0-100
- Confidence scores 0-1
- Use null for unavailable data, never hallucinate
- You MUST generate data for EVERY ticker in the portfolio, not just the first few
- For DISCOVERIES: look BEYOND the portfolio. Find opportunities in correlated assets, sector ETFs, commodity futures, cross-market plays
- Think like a Bloomberg terminal scanning every market for structural opportunities
- Seed=${seed} for variety`;

    const userPrompt = `Analyze this FULL portfolio of ${n} assets AND scan the broader market for derivatives opportunities:

PORTFOLIO (${n} assets): ${JSON.stringify(portfolioSummary)}
BASE CURRENCY: ${baseCurrency || "USD"}
${discoveryContext}

Return this exact JSON structure. IMPORTANT: Generate data for ALL ${n} tickers, not just 5.

{
  "correlations": {
    "pairs": [
      {"asset_a": "TICKER", "asset_b": "TICKER", "correlation": 0.85, "window": "1d", "stability": 0.9, "trend": "stable"}
    ],
    "divergences": [
      {"asset_a": "TICKER", "asset_b": "TICKER", "historical_corr": 0.85, "current_corr": 0.3, "divergence_magnitude": 0.55, "signal": "mean_reversion_opportunity"}
    ]
  },
  "pair_trades": [
    {
      "long": "TICKER", "short": "TICKER",
      "z_score": 2.1, "spread_mean": 0.05, "spread_std": 0.02,
      "reversion_prob": 0.72, "win_rate": 0.65, "expected_return": 0.04,
      "reasoning": "why this pair trade works",
      "sector_neutral": true
    }
  ],
  "options_intel": [
    {
      "ticker": "TICKER",
      "iv_rank": 75, "iv_percentile": 80,
      "historical_vol": 0.25, "implied_vol": 0.35,
      "skew": -0.05, "gamma_exposure": 1500000,
      "signal": "overpriced_puts",
      "signal_type": "vol_expansion",
      "opportunity": "Sell put spreads — IV elevated vs HV",
      "confidence": 0.7
    }
  ],
  "futures": [
    {
      "ticker": "TICKER", "futures_symbol": "ES",
      "basis_pct": 0.3, "leverage_ratio": 10,
      "cost_of_carry": 0.02, "margin_requirement": 15000,
      "capital_efficiency_vs_spot": 2.5,
      "recommendation": "Use futures for capital-efficient exposure",
      "confidence": 0.65
    }
  ],
  "neutrality": {
    "beta_exposure": 1.15,
    "sector_tilts": [{"sector": "Tech", "weight": 0.45, "benchmark": 0.30, "overweight": 0.15}],
    "factor_exposures": [{"factor": "Momentum", "loading": 0.3}],
    "hedge_suggestions": [
      {"instrument": "SPY puts", "action": "Buy", "size": "5% of portfolio", "reasoning": "Reduce beta from 1.15 to 0.95", "confidence": 0.7}
    ]
  },
  "opportunities": [
    {
      "type": "correlation_breakdown",
      "title": "Pair Trade: X vs Y",
      "confidence": 0.75,
      "risk_reward": 2.5,
      "capital_efficiency": 3.0,
      "expected_return": 0.06,
      "max_loss": -0.03,
      "reasoning": "detailed explanation",
      "urgency": "medium",
      "category": "pair_trade"
    }
  ],
  "simulations": [
    {
      "strategy_name": "Long X / Short Y Pair Trade",
      "strategy_type": "pair_trade",
      "expected_return_low": -0.02,
      "expected_return_mid": 0.04,
      "expected_return_high": 0.08,
      "win_probability": 0.68,
      "sharpe": 1.2,
      "max_dd": 0.05,
      "capital_required": 10000,
      "holding_period_days": 20,
      "confidence": 0.7
    }
  ]${discoverySchema}
}

MANDATORY MINIMUMS — generate AT LEAST these counts:
- ${pairCount} correlation pairs (mix of positive and inverse, covering ALL tickers)
- ${Math.max(2, Math.floor(n / 3))} divergence signals
- ${pairTradeCount} pair trades (using different ticker combinations)
- Options intel for EVERY ticker (${n} entries, one per ticker: ${tickers.join(", ")})
- ${futuresCount} futures opportunities
- ${oppCount} ranked opportunities (mix of categories: pair_trade, vol_arb, correlation_breakdown, options_mispricing, futures_efficiency)
- ${simCount} strategy simulations${discoveryMinimum}

Use real market knowledge for these tickers. Be specific and actionable. Each ticker must appear in options_intel.`;

    const result = await callAI({
      systemPrompt,
      userPrompt,
      maxTokens,
      temperature: 0.5,
      provider: provider || "mistral",
      jsonMode: true,
    });

    const parsed = safeParseJSON(result.text);

    return new Response(JSON.stringify({ ...parsed, provider: result.provider }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("derivatives-intelligence error:", err);
    return new Response(JSON.stringify({ error: err.message || "Internal error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
