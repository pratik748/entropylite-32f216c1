import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireAuth } from "../_shared/auth.ts";
import { buildLanes, testKey, ENV_AI_KEYS } from "../_shared/callAI.ts";
import { refreshManagedKeys, clearKeyHealth, clearAllKeyHealth, getManagedSnapshot } from "../_shared/managedKeys.ts";

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

    // Always ensure fresh credentials in isolate memory
    await refreshManagedKeys(true);

    if (action === "reset_health") {
      const name = String(body?.name || "").slice(0, 120);
      if (name && name !== "*") {
        await clearKeyHealth(name);
      } else {
        await clearAllKeyHealth();
      }
      await refreshManagedKeys(true);
      return json({ ok: true, message: `Health cleared for ${name || "all"}` });
    }

    if (action === "test") {
      const name = String(body?.name || "").slice(0, 120);
      if (!name) return json({ error: "name required" }, 400);
      return json(await testKey(name));
    }

    if (action === "test_all") {
      const names = buildLanes().map((l) => l.name);
      const results: Record<string, unknown> = {};
      for (const n of names) results[n] = await testKey(n);
      return json({ results });
    }

    // status: every AI key in the chain, plus any configured data API keys
    const lanes = buildLanes().map((l, i) => ({ order: i + 1, name: l.name, provider: l.provider, source: l.source }));
    
    // Also include any data keys from the API Manager (AlphaVantage, NewsData, etc.)
    const managed = getManagedSnapshot();
    let currentOrder = lanes.length;
    for (const [kName, val] of Object.entries(managed)) {
      if (!lanes.some((l) => l.name === kName) && val) {
        currentOrder++;
        const prov = kName.toUpperCase().includes("ALPHAVANTAGE")
          ? "alphavantage"
          : kName.toUpperCase().includes("NEWSDATA")
          ? "newsdata"
          : kName.toUpperCase().includes("POLYMARKET")
          ? "polymarket"
          : "custom";
        lanes.push({ order: currentOrder, name: kName, provider: prov, source: "manager" });
      }
    }

    const { data: health } = await admin.from("api_key_health").select("*");
    const envConfigured = ENV_AI_KEYS.filter(([n]) => !!Deno.env.get(n)).map(([n, p]) => ({ name: n, provider: p }));
    return json({ lanes, health: health || [], envConfigured });
  } catch (e) {
    if (e instanceof Response) return e;
    console.error("api-key-admin:", e);
    return json({ error: e instanceof Error ? e.message : "error" }, 500);
  }
});
