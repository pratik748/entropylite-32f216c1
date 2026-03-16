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
    const { tickers, weights, prices, volatilities, sectors, baseCurrency, provider } = await req.json();

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

    const seed = Math.floor(Math.random() * 99999);

    const systemPrompt = `You are a derivatives intelligence engine for institutional portfolio management. Return ONLY valid JSON. No commentary.

CRITICAL RULES:
- All numeric values must be plain numbers (no +, ~, ≈, "approximately")
- All probabilities 0-1, percentages 0-100
- Confidence scores 0-1
- Use null for unavailable data, never hallucinate
- Seed=${seed} for variety`;

    const userPrompt = `Analyze this portfolio for derivatives opportunities:

PORTFOLIO: ${JSON.stringify(portfolioSummary)}
BASE CURRENCY: ${baseCurrency || "USD"}

Return this exact JSON structure:

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
  ]
}

Generate AT LEAST:
- 5 correlation pairs (mix of positive and inverse)
- 2 divergence signals
- 3 pair trades
- Options intel for each ticker
- 2 futures opportunities
- 5 ranked opportunities
- 3 strategy simulations

Use real market knowledge for these tickers. Be specific and actionable.`;

    const result = await callAI({
      systemPrompt,
      userPrompt,
      maxTokens: 5000,
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
