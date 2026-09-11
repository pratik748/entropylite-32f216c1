import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { generateDeterministicStrategy } from "../_shared/strategyDeterministic.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { portfolio, regime, vix } = await req.json();

    const data = generateDeterministicStrategy({
      portfolio,
      regime,
      vix,
    });

    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: any) {
    console.error("Strategy generate fallback:", error);
    const fallback = generateDeterministicStrategy({});
    return new Response(JSON.stringify(fallback), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
