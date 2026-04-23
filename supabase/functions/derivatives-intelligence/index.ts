import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { requireAuth } from "../_shared/auth.ts";
import { callAIParallel } from "../_shared/callAI.ts";
import { generateDerivativesIntelligence } from "../_shared/derivativesDeterministic.ts";
import { safeParseJSON } from "../_shared/safeParseJSON.ts";
import { z } from "npm:zod@3.25.76";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function asRecord(value: unknown): Record<string, any> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, any>)
    : null;
}

function chooseArray<T>(candidate: unknown, fallback: T[]): T[] {
  return Array.isArray(candidate) && candidate.length > 0 ? (candidate as T[]) : fallback;
}

function chooseString(candidate: unknown, fallback: string) {
  return typeof candidate === "string" && candidate.trim() ? candidate.trim() : fallback;
}

function mergeDerivativesPayload(fallback: any, candidate: unknown, provider: string) {
  const root = asRecord(candidate) ?? {};
  const correlations = asRecord(root.correlations) ?? {};
  const neutrality = asRecord(root.neutrality) ?? {};

  return {
    correlations: {
      pairs: chooseArray(correlations.pairs, fallback.correlations.pairs),
      divergences: chooseArray(correlations.divergences, fallback.correlations.divergences),
    },
    pair_trades: chooseArray(root.pair_trades, fallback.pair_trades),
    options_intel: chooseArray(root.options_intel, fallback.options_intel),
    futures: chooseArray(root.futures, fallback.futures),
    neutrality: {
      beta_exposure: typeof neutrality.beta_exposure === "number"
        ? neutrality.beta_exposure
        : fallback.neutrality.beta_exposure,
      sector_tilts: chooseArray(neutrality.sector_tilts, fallback.neutrality.sector_tilts),
      factor_exposures: chooseArray(neutrality.factor_exposures, fallback.neutrality.factor_exposures),
      hedge_suggestions: chooseArray(neutrality.hedge_suggestions, fallback.neutrality.hedge_suggestions),
    },
    opportunities: chooseArray(root.opportunities, fallback.opportunities),
    simulations: chooseArray(root.simulations, fallback.simulations),
    discoveries: chooseArray(root.discoveries, fallback.discoveries ?? []),
    provider,
    engine: "live-ai-v1",
    generated_at: new Date().toISOString(),
    market_bias: chooseString(root.market_bias, fallback.market_bias),
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { user } = await requireAuth(req, corsHeaders);
    const BodySchema = z.object({
      tickers: z.array(z.string().min(1)).min(1).max(50),
      weights: z.array(z.number()).optional(),
      prices: z.array(z.number()).optional(),
      volatilities: z.array(z.number()).optional(),
      sectors: z.array(z.string()).optional(),
      baseCurrency: z.string().optional(),
      provider: z.string().optional(),
      discovery_mode: z.boolean().optional(),
      news_context: z.string().optional(),
      macro_context: z.string().optional(),
      sentiment_context: z.string().optional(),
      indiaMode: z.boolean().optional(),
    });

    const parsedBody = BodySchema.safeParse(await req.json());
    if (!parsedBody.success) {
      return new Response(JSON.stringify({ error: parsedBody.error.flatten().fieldErrors }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { tickers, weights, prices, volatilities, sectors, baseCurrency, discovery_mode, news_context, macro_context, sentiment_context, indiaMode } = parsedBody.data;

    if (!tickers?.length) {
      return new Response(JSON.stringify({ error: "No tickers provided" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const fallback = generateDerivativesIntelligence({
      tickers,
      weights,
      prices,
      volatilities,
      sectors,
      baseCurrency,
      discovery_mode,
      news_context,
      macro_context,
      sentiment_context,
      indiaMode,
    });

    let payload = {
      ...fallback,
      provider: fallback.provider || "deterministic",
      engine: fallback.engine || "rules-v1",
      generated_at: new Date().toISOString(),
    };

    try {
      const portfolioSnapshot = tickers.map((ticker, index) => ({
        ticker,
        weight: Number(weights?.[index] ?? 0),
        price: Number(prices?.[index] ?? 0),
        volatility: Number(volatilities?.[index] ?? 0),
        sector: sectors?.[index] || "Unknown",
      }));

      const aiResults = await callAIParallel({
        systemPrompt: `You are a senior derivatives strategist on an institutional cross-asset desk. You upgrade a deterministic derivatives baseline with an AI-layered narrative: spot the pair-trade opportunities, identify options-vol mispricings, surface factor exposures the PM may have missed, and recommend EXECUTABLE hedges.

REASONING FRAMEWORK (each section grounded in the portfolio snapshot + baseline):
1. CORRELATIONS — rank top 3 pair correlations and top 3 divergences. Divergences > 2σ from rolling mean = pair-trade candidate.
2. PAIR_TRADES — long/short the divergence; specify both legs, entry z-score, target z-score, stop z-score. Sector-neutral and beta-neutral where possible.
3. OPTIONS_INTEL — name expensive vs cheap implied vol relative to realized; flag skew dislocations, gamma pins, vol-of-vol regimes.
4. FUTURES — surface curve shape (contango/backwardation), term-structure plays, calendar spread opportunities.
5. NEUTRALITY — quantify beta_exposure, sector_tilts, factor_exposures (Value, Growth, Quality, Momentum, Size, Low-Vol). hedge_suggestions must be EXECUTABLE: instrument + size + tenor.
6. OPPORTUNITIES — top 3 asymmetric setups (vol-short, dispersion, gamma scalp, calendar, basis trade). Each with edge in bps + risk-reward ≥ 1:2.
7. SIMULATIONS — name 1–2 forward scenarios and the implied derivative response.
8. DISCOVERIES — 1–2 non-obvious signals (cross-asset basis, vol-of-vol regime, term-structure inversion).
9. MARKET_BIAS — 1-line directional bias for the next 5 sessions tied to the dominant signal above.

CALIBRATION: respect the deterministic baseline as ground truth where it provides numbers. Add interpretation, do not replace numbers blindly. Strings ≤ 200 chars. Return ONLY valid JSON in the exact schema given.`,
        userPrompt: `Portfolio snapshot:
${JSON.stringify(portfolioSnapshot)}

Context: news=${news_context||"none"} | macro=${macro_context||"none"} | sentiment=${sentiment_context||"none"} | discovery=${discovery_mode} | region=${indiaMode?"India":"Global"} | ccy=${baseCurrency||"USD"}

Deterministic baseline (treat as ground truth for numbers — augment with interpretation):
${JSON.stringify(fallback)}

Walk the 9-section framework above. Every pair-trade and hedge must specify both legs, sizing, and risk gates. Reject ideas with risk:reward below 1:2.`,
        temperature: 0.25,
        maxTokens: Math.min(4000, 2000 + tickers.length * 200 + (discovery_mode ? 800 : 0)),
        jsonMode: true,
      });

      for (const result of [...aiResults].sort((a, b) => b.text.length - a.text.length)) {
        try {
          const parsed = safeParseJSON(result.text);
          payload = mergeDerivativesPayload(fallback, parsed, result.provider);
          break;
        } catch (parseError) {
          console.warn("derivatives-intelligence parse fallback:", parseError);
        }
      }
    } catch (aiError) {
      console.warn("derivatives-intelligence AI fallback engaged:", aiError);
    }

    return new Response(JSON.stringify({ ...payload, user_id: user.id }), {
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
