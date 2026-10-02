/**
 * Global API credential resolver.
 *
 * Keys added by an admin in the in-app API Manager live in
 * public.api_credentials and take precedence over environment variables, so a
 * key can be rotated or added at any time without a redeploy. Environment
 * variables remain the fallback.
 *
 * Values are read with the service-role client, never exposed to the browser.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const CACHE_TTL_MS = 60_000;

let cache: Record<string, string> = {};
let providerHints: Record<string, string> = {};
let updatedAts: Record<string, number> = {};
export interface KeyHealth {
  status: string | null;
  error: string | null;
  errorAt: number;
  okAt: number;
  latency: number | null;
}
let health: Record<string, KeyHealth> = {};
let cacheAt = 0;
let inflight: Promise<Record<string, string>> | null = null;

async function load(): Promise<Record<string, string>> {
  const url = Deno.env.get("SUPABASE_URL");
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !service) return {};

  try {
    const admin = createClient(url, service, { auth: { persistSession: false } });

    // 1. Resilient query for active api_credentials.
    // Try with provider & updated_at; fall back if schema differs.
    let credRows: any[] = [];
    const { data: primaryData, error: primaryErr } = await admin
      .from("api_credentials")
      .select("name, value, is_active, provider, updated_at")
      .eq("is_active", true);

    if (!primaryErr && primaryData) {
      credRows = primaryData;
    } else {
      const { data: fallbackData, error: fallbackErr } = await admin
        .from("api_credentials")
        .select("name, value, is_active, updated_at")
        .eq("is_active", true);
      if (!fallbackErr && fallbackData) {
        credRows = fallbackData;
      } else {
        console.warn("managedKeys: api_credentials query failed:", primaryErr?.message || fallbackErr?.message);
      }
    }

    const map: Record<string, string> = {};
    const hints: Record<string, string> = {};
    const uAts: Record<string, number> = {};

    for (const row of credRows || []) {
      const name = String(row.name || "").trim();
      const value = String(row.value || "").trim();
      if (name && value) map[name] = value;
      const p = String(row.provider || "").trim().toLowerCase();
      if (name && p) hints[name] = p;
      if (name && row.updated_at) {
        const parsed = Date.parse(row.updated_at);
        if (!isNaN(parsed)) uAts[name] = parsed;
      }
    }
    providerHints = hints;
    updatedAts = uAts;

    // 2. Query api_key_health in its own independent try/catch block.
    // Telemetry failures must NEVER crash or block credential loading.
    try {
      const { data: hRows, error: hErr } = await admin
        .from("api_key_health")
        .select("credential_name, last_status, last_error, last_error_at, last_used_at, last_latency_ms");

      if (!hErr && hRows) {
        const h: Record<string, KeyHealth> = {};
        for (const r of (hRows || []) as any[]) {
          h[r.credential_name] = {
            status: r.last_status,
            error: r.last_error,
            errorAt: r.last_error_at ? Date.parse(r.last_error_at) : 0,
            okAt: r.last_status === "ok" && r.last_used_at ? Date.parse(r.last_used_at) : 0,
            latency: r.last_latency_ms,
          };
        }
        health = h;
      }
    } catch (hErr) {
      console.warn("managedKeys: api_key_health read failed (non-fatal):", hErr);
    }

    return map;
  } catch (e) {
    console.error("managedKeys load failed:", e instanceof Error ? e.message : e);
    return {};
  }
}

/** Warm the managed-credential cache. Cheap, cached per isolate for 60s. */
export async function refreshManagedKeys(force = false): Promise<Record<string, string>> {
  if (force) cacheAt = 0;
  const fresh = Date.now() - cacheAt < CACHE_TTL_MS;
  if (!force && fresh && cacheAt > 0) return cache;
  if (inflight) return await inflight;

  inflight = load().then((map) => {
    cache = map;
    cacheAt = Date.now();
    inflight = null;
    return map;
  });
  return await inflight;
}

/** Synchronous lookup against the last loaded snapshot, env as fallback. */
export function getKeySync(name: string): string | undefined {
  return cache[name] || Deno.env.get(name) || undefined;
}

/** Await-safe lookup: refreshes the snapshot first, then resolves. */
export async function getKey(name: string): Promise<string | undefined> {
  await refreshManagedKeys();
  return getKeySync(name);
}

/** All admin-managed credentials from the last loaded snapshot. */
export function getManagedSnapshot(): Record<string, string> {
  return { ...cache };
}

/** Admin-declared provider per managed credential name (lowercase). */
export function getProviderHints(): Record<string, string> {
  return { ...providerHints };
}

/** Updated timestamps per credential name. */
export function getUpdatedAts(): Record<string, number> {
  return { ...updatedAts };
}

/** Last persisted health per credential name. */
export function getHealthSnapshot(): Record<string, KeyHealth> {
  return { ...health };
}

/** Reset or clear health for a specific credential so newly rotated keys start fresh. */
export async function clearKeyHealth(name: string): Promise<void> {
  delete health[name];
  const url = Deno.env.get("SUPABASE_URL");
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !service) return;
  try {
    const admin = createClient(url, service, { auth: { persistSession: false } });
    await admin.from("api_key_health").delete().eq("credential_name", name);
  } catch (e) {
    console.warn("clearKeyHealth failed:", e);
  }
}

/** Clear health for all credentials. */
export async function clearAllKeyHealth(): Promise<void> {
  health = {};
  const url = Deno.env.get("SUPABASE_URL");
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !service) return;
  try {
    const admin = createClient(url, service, { auth: { persistSession: false } });
    await admin.from("api_key_health").delete().neq("credential_name", "");
  } catch (e) {
    console.warn("clearAllKeyHealth failed:", e);
  }
}

/** Persist one key attempt. Never throws, never blocks the caller for long. */
export function recordKeyHealth(name: string, provider: string, source: "manager" | "environment", ok: boolean, latencyMs: number, error?: string) {
  const url = Deno.env.get("SUPABASE_URL");
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !service) return;
  const admin = createClient(url, service, { auth: { persistSession: false } });
  const p = admin.rpc("record_key_health", {
    _name: name, _provider: provider, _source: source,
    _status: ok ? "ok" : "error", _latency_ms: Math.round(latencyMs),
    _error: ok ? null : (error || "error").slice(0, 300),
  }).then(({ error: e }) => { if (e) console.warn("record_key_health:", e.message); });
  try { (globalThis as any).EdgeRuntime?.waitUntil?.(p); } catch { /* ignore */ }
  if (ok) health[name] = { status: "ok", error: null, errorAt: health[name]?.errorAt || 0, okAt: Date.now(), latency: latencyMs };
  else health[name] = { status: "error", error: error || "error", errorAt: Date.now(), okAt: health[name]?.okAt || 0, latency: latencyMs };
}
