import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { generateDeterministicFlowSignals } from "../_shared/flowDeterministic.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { portfolio, vix, marketRegime, polymarketSignals } = await req.json();

    const signals = generateDeterministicFlowSignals({
      portfolio,
      vix,
      marketRegime,
      polymarketSignals,
    });

    return new Response(JSON.stringify(signals), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("flow-intelligence fallback:", err);
    const fallback = generateDeterministicFlowSignals({});
    return new Response(JSON.stringify(fallback), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
