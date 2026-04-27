// TWRD query — read truth-weighted view of a subject/relation, with decay applied.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { readLiveTruth } from "../_shared/twrd/store.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const url = new URL(req.url);
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const subject = (body.subject ?? url.searchParams.get("subject") ?? "").toString();
    const relation = (body.relation ?? url.searchParams.get("relation") ?? "").toString();
    const object = (body.object ?? url.searchParams.get("object") ?? undefined) as string | undefined;
    if (!subject || !relation) {
      return new Response(JSON.stringify({ error: "subject + relation required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    const t = await readLiveTruth(subject, relation, object);
    return new Response(JSON.stringify({ subject, relation, object, truth: t }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: (e as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});