import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireAuth } from "../_shared/auth.ts";
import { buildLanes, testKey, ENV_AI_KEYS } from "../_shared/callAI.ts";
import { refreshManagedKeys } from "../_shared/managedKeys.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};
const ADMIN_EMAIL = "pardhan9013334137@gmail.com";
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const { user, demo } = await requireAuth(req, corsHeaders);
    if (demo) return json({ error: "Forbidden" }, 403);
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, { auth: { persistSession: false } });
    let isAdmin = (user.email || "").toLowerCase() === ADMIN_EMAIL;
    if (!isAdmin) {
      const { data } = await admin.from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").maybeSingle();
      isAdmin = !!data;
    }
    if (!isAdmin) return json({ error: "Forbidden" }, 403);

    const body = await req.json().catch(() => ({}));
    const action = String(body?.action || "status");

    if (action === "test") {
      const name = String(body?.name || "").slice(0, 120);
      if (!name) return json({ error: "name required" }, 400);
      return json(await testKey(name));
    }

    await refreshManagedKeys(true);
    if (action === "test_all") {
      const names = buildLanes().map((l) => l.name);
      const results: Record<string, unknown> = {};
      for (const n of names) results[n] = await testKey(n);
      return json({ results });
    }

    // status: every AI key in the chain, in the order it will be tried
    const lanes = buildLanes().map((l, i) => ({ order: i + 1, name: l.name, provider: l.provider, source: l.source }));
    const { data: health } = await admin.from("api_key_health").select("*");
    const envConfigured = ENV_AI_KEYS.filter(([n]) => !!Deno.env.get(n)).map(([n, p]) => ({ name: n, provider: p }));
    return json({ lanes, health: health || [], envConfigured });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("api-key-admin:", e);
    return json({ error: e instanceof Error ? e.message : "error" }, 500);
  }
});
