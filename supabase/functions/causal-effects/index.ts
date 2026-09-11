import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { requireAuth } from "../_shared/auth.ts";
import { modelInfo } from "../_shared/modelRegistry.ts";
import { generateDeterministicCausalCascade } from "../_shared/causalDeterministic.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    await requireAuth(req, corsHeaders);
    const { event, portfolio } = await req.json();

    // Deterministic Causal Shock Propagation via Econometric Transmission Channels
    const result = generateDeterministicCausalCascade(event || "Macro Liquidity Shock", portfolio);

    (result as Record<string, unknown>).model = modelInfo("causal-effects");

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    if (error instanceof Response) return error;
    console.error("Causal effects error:", error);
    // Even on error, return deterministic fallback cascade instead of failing
    const fallback = generateDeterministicCausalCascade("Global Macro Shock");
    return new Response(JSON.stringify(fallback), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
