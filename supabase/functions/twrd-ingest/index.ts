// TWRD ingest — cleaners → TRUTH → Reality store. Accepts raw claims or
// engine-shaped payloads (news/flows/sentiment) and persists scored claims.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { cleanAll } from "../_shared/twrd/cleaners/index.ts";
import { admitClaims } from "../_shared/twrd/admission.ts";
import { scoreAndStore } from "../_shared/twrd/store.ts";
import { extractFromNews, extractFromFlows, extractFromSentiment } from "../_shared/twrd/extract.ts";
import type { RawClaim } from "../_shared/twrd/types.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    const raw: RawClaim[] = [
      ...(Array.isArray(body.claims) ? body.claims : []),
      ...extractFromNews(body.news ?? []),
      ...extractFromFlows(body.flows ?? []),
      ...extractFromSentiment(body.sentiment ?? []),
    ];
    if (!raw.length) {
      return new Response(JSON.stringify({ scored: 0, results: [] }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const cleaned = cleanAll(raw);
    // Simulation-grounded admission (TRUTH §5.3): hard gates + sybil dedup
    // BEFORE probabilistic scoring. Rejections are reported, never silent.
    const { admitted, rejected, evidenceDeduped } = admitClaims(cleaned);
    const results = [];
    for (const c of admitted) {
      try { results.push(await scoreAndStore(c)); }
      catch (e) { console.warn("scoreAndStore failed:", (e as Error).message); }
    }
    return new Response(JSON.stringify({
      scored: results.length,
      results,
      rejected: rejected.length,
      rejectionReasons: rejected.map((r) => ({
        subject: r.claim.subject, relation: r.claim.relation, reasons: r.reasons,
      })),
      evidenceDeduped,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});