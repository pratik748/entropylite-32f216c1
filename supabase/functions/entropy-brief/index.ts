import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { generateDeterministicBrief } from "../_shared/briefDeterministic.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { portfolio = [], regime = "Neutral", vix = 0 } = await req.json();

    const brief = generateDeterministicBrief({
      portfolio,
      regime,
      vix,
    });

    return new Response(JSON.stringify(brief), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("entropy-brief fallback:", err);
    const fallback = generateDeterministicBrief({});
    return new Response(JSON.stringify(fallback), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
