import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { evolveStrategiesDeterministically } from "../_shared/strategyEvolutionDeterministic.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { portfolio, regime, vix, memory, generation } = await req.json();

    const data = evolveStrategiesDeterministically({
      portfolio,
      regime,
      vix,
      memory,
      generation,
    });

    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("strategy-evolution fallback:", err);
    const fallback = evolveStrategiesDeterministically({});
    return new Response(JSON.stringify(fallback), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
