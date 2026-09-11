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
let cacheAt = 0;
let inflight: Promise<Record<string, string>> | null = null;

async function load(): Promise<Record<string, string>> {
  const url = Deno.env.get("SUPABASE_URL");
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !service) return {};
  try {
    const admin = createClient(url, service, { auth: { persistSession: false } });
    const { data, error } = await admin
      .from("api_credentials")
      .select("name, value, is_active")
      .eq("is_active", true);
    if (error) throw error;
    const map: Record<string, string> = {};
    for (const row of data || []) {
      const name = String((row as any).name || "").trim();
      const value = String((row as any).value || "").trim();
      if (name && value) map[name] = value;
    }
    return map;
  } catch (e) {
    console.error("managedKeys load failed:", e instanceof Error ? e.message : e);
    return {};
  }
}

/** Warm the managed-credential cache. Cheap, cached per isolate for 60s. */
export async function refreshManagedKeys(force = false): Promise<Record<string, string>> {
  const fresh = Date.now() - cacheAt < CACHE_TTL_MS;
  if (!force && fresh && Object.keys(cache).length >= 0 && cacheAt > 0) return cache;
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

