import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { requireAuth } from "../_shared/auth.ts";
import { generateDerivativesIntelligence } from "../_shared/derivativesDeterministic.ts";
import { z } from "npm:zod@3.25.76";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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

    const parsed = generateDerivativesIntelligence({
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

    return new Response(JSON.stringify({ ...parsed, user_id: user.id }), {
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
