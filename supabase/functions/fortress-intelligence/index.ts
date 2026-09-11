import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { generateDeterministicFortressNarratives } from "../_shared/fortressDeterministic.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { holdings, threats, actions, baseCurrency, totalValue } = await req.json();

    const narratives = generateDeterministicFortressNarratives({
      holdings,
      threats,
      actions,
      baseCurrency,
      totalValue,
    });

    return new Response(JSON.stringify({ narratives }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("fortress-intelligence fallback:", err);
    return new Response(JSON.stringify({ narratives: {}, error: err.message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
