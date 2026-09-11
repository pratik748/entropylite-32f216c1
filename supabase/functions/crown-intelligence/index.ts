import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { generateDeterministicCrownOpportunities } from "../_shared/crownDeterministic.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { portfolio } = await req.json();

    const opportunities = generateDeterministicCrownOpportunities(portfolio || []);

    return new Response(JSON.stringify(opportunities), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("crown-intelligence fallback:", err);
    const fallback = generateDeterministicCrownOpportunities([]);
    return new Response(JSON.stringify(fallback), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
