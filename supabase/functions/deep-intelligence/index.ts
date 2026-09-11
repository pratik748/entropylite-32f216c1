import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { generateDeterministicDeepIntelligence } from "../_shared/deepDeterministic.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { portfolio } = await req.json();

    const data = generateDeterministicDeepIntelligence(portfolio || []);

    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("deep-intelligence fallback:", err);
    const fallback = generateDeterministicDeepIntelligence([]);
    return new Response(JSON.stringify(fallback), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
