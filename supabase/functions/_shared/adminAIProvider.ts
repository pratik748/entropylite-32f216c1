import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { decryptApiKey } from "./crypto.ts";
import type { AdminAIConfigWithKey } from "./adminTypes.ts";

/**
 * Cache admin config in memory for a short TTL (30s) to avoid querying
 * the database on every single AI invocation.
 */
let cachedConfig: AdminAIConfigWithKey | null = null;
let cacheExpiry = 0;
const CACHE_TTL_MS = 30000;

export function invalidateAdminConfigCache() {
  cachedConfig = null;
  cacheExpiry = 0;
}

/**
 * Fetch the admin global AI configuration from the database using service role.
 * Returns null if no configuration exists or if it is disabled.
 */
export async function getAdminGlobalAIConfig(): Promise<AdminAIConfigWithKey | null> {
  const now = Date.now();
  if (cachedConfig && now < cacheExpiry) {
    return cachedConfig;
  }

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !serviceRoleKey) {
    return null;
  }

  try {
    const supabase = createClient(supabaseUrl, serviceRoleKey);
    const { data, error } = await supabase
      .from("admin_ai_config")
      .select("*")
      .eq("enabled", true)
      .maybeSingle();

    if (error || !data) {
      cachedConfig = null;
      cacheExpiry = now + CACHE_TTL_MS;
      return null;
    }

    const decryptedKey = await decryptApiKey(data.api_key_encrypted);
    cachedConfig = {
      id: data.id,
      provider: data.provider,
      model: data.model,
      apiKey: decryptedKey,
      baseUrl: data.base_url || undefined,
      apiVersion: data.api_version || undefined,
      enabled: data.enabled,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
      updatedBy: data.updated_by || undefined,
    };
    cacheExpiry = now + CACHE_TTL_MS;
    return cachedConfig;
  } catch (err) {
    console.error("Failed to load admin AI config:", err);
    return null;
  }
}
