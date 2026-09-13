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
let providerCache: Record<string, string> = {};
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
      .select("name, value, provider, is_active")
      .eq("is_active", true);
    if (error) throw error;
    const map: Record<string, string> = {};
    const providers: Record<string, string> = {};
    for (const row of data || []) {
      const name = String((row as any).name || "").trim();
      const value = String((row as any).value || "").trim();
      const provider = String((row as any).provider || "").trim().toLowerCase();
      if (name && value) {
        map[name] = value;
        if (provider) providers[name] = provider;
      }
    }
    providerCache = providers;
    return map;
  } catch (e) {
    console.error("managedKeys load failed:", e instanceof Error ? e.message : e);
    return {};
  }
}

/** Warm the managed-credential cache. Cheap, cached per isolate for 60s. */
export async function refreshManagedKeys(force = false): Promise<Record<string, string>> {
  const fresh = Date.now() - cacheAt < CACHE_TTL_MS;
  if (!force && fresh && Object.keys(cache).length > 0 && cacheAt > 0) return cache;
  if (inflight) return await inflight;
  inflight = load().then((map) => {
    cache = map;
    cacheAt = Date.now();
    inflight = null;
    return map;
  });
  return await inflight;
}

const ALIAS_MAP: Record<string, string[]> = {
  GOOGLE_GEMINI_KEY: ["GEMINI_API_KEY", "GEMINI_KEY", "GOOGLE_GEMINI_API_KEY"],
  GEMINI_API_KEY: ["GOOGLE_GEMINI_KEY", "GEMINI_KEY", "GOOGLE_GEMINI_API_KEY"],
  GOOGLE_GEMINI_KEY_2: ["GEMINI_API_KEY_2", "GEMINI_KEY_2"],
  MISTRAL_API_KEY: ["MISTRAL_KEY", "MISTRALAI_API_KEY"],
  MISTRAL_API_KEY_2: ["MISTRAL_KEY_2"],
  MISTRAL_API_KEY_3: ["MISTRAL_KEY_3"],
  OPENROUTER_API_KEY: ["OPENROUTER_KEY", "OPEN_ROUTER_API_KEY"],
  GROQ_API_KEY: ["GROQ_KEY"],
  OPENAI_API_KEY: ["OPENAI_KEY"],
  ANTHROPIC_API_KEY: ["ANTHROPIC_KEY", "CLAUDE_API_KEY", "CLAUDE_KEY"],
  NVIDIA_API_KEY: ["NVIDIA_KEY", "NVIDIA_NIM_KEY"],
};

/** Synchronous lookup against the last loaded snapshot, env as fallback, with alias resolution. */
export function getKeySync(name: string): string | undefined {
  if (cache[name]) return cache[name];
  const envVal = Deno.env.get(name);
  if (envVal) return envVal;

  const aliases = ALIAS_MAP[name] || [];
  for (const alias of aliases) {
    if (cache[alias]) return cache[alias];
    const aEnv = Deno.env.get(alias);
    if (aEnv) return aEnv;
  }
  return undefined;
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

export function getManagedProviderSnapshot(): Record<string, string> {
  return { ...providerCache };
}

export type KeyHealthEvent = {
  name: string;
  provider: string;
  source: "manager" | "environment";
  status: "ok" | "error";
  latencyMs: number;
  error?: string;
};

/** Persist provider health without ever storing or returning credential values. */
export async function recordKeyHealth(event: KeyHealthEvent): Promise<void> {
  const url = Deno.env.get("SUPABASE_URL");
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !service) return;
  try {
    const admin = createClient(url, service, { auth: { persistSession: false } });
    const { error } = await admin.rpc("record_key_health", {
      _name: event.name,
      _provider: event.provider,
      _source: event.source,
      _status: event.status,
      _latency_ms: Math.max(0, Math.round(event.latencyMs)),
      _error: event.error?.slice(0, 300) || null,
    });
    if (error) throw error;
  } catch (e) {
    console.error("recordKeyHealth failed:", e instanceof Error ? e.message : e);
  }
}

