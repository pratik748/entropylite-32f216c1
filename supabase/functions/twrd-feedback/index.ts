// TWRD feedback — accepts (claim_id, outcome) and updates source posteriors + weights.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { requireAuth } from "../_shared/auth.ts";
import { applyFeedback } from "../_shared/twrd/feedback.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const auth = await requireAuth(req, corsHeaders);
    const body = await req.json();
    const claimId = String(body.claim_id ?? "");
    const outcome = body.outcome === 1 || body.outcome === "1" ? 1 : 0;
    if (!claimId) {
      return new Response(JSON.stringify({ error: "claim_id required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const res = await applyFeedback({ claimId, outcome, userId: auth.user.id });
    return new Response(JSON.stringify({ ok: true, weights: res.updatedWeights }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    if (e instanceof Response) return e;
    return new Response(JSON.stringify({ error: (e as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});