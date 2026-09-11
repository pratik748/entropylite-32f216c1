import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { calibrateMonteCarloDeterministically } from "../_shared/monteCarloDeterministic.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { portfolio, totalValue, avgRisk, avgBeta, scenario } = await req.json();

    // Deterministic Monte Carlo & Jump-Diffusion Calibration
    const data = calibrateMonteCarloDeterministically({
      portfolio,
      totalValue,
      avgRisk,
      avgBeta,
      scenario,
    });

    return new Response(JSON.stringify(data), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("monte-carlo-intelligence fallback:", err);
    const fallback = calibrateMonteCarloDeterministically({});
    return new Response(JSON.stringify(fallback), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
