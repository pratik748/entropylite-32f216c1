import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireAuth } from "../_shared/auth.ts";
import { isAdmin, requireAdmin } from "../_shared/adminAuth.ts";
import { encryptApiKey, decryptApiKey } from "../_shared/crypto.ts";
import type { AdminAIConfigWithKey, SaveAdminAIConfigRequest, AdminAuditAction } from "../_shared/adminTypes.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Edge Function: Admin AI Configuration Management
 *
 * Endpoints:
 * - GET / - Fetch current admin AI configuration (metadata only, no API key)
 * - POST / - Save or update admin AI configuration
 * - DELETE / - Remove admin AI configuration
 * - POST /test - Test connection with provided or saved configuration
 *
 * Security: All endpoints require authenticated admin access.
 */

async function logAudit(
  supabase: any,
  userId: string,
  userEmail: string,
  action: AdminAuditAction,
  details?: Record<string, any>
) {
  await supabase.from("admin_audit_log").insert({
    user_id: userId,
    user_email: userEmail,
    action,
    details: details || {},
  });
}

async function getAdminConfig(supabase: any): Promise<AdminAIConfigWithKey | null> {
  const { data, error } = await supabase
    .from("admin_ai_config")
    .select("*")
    .maybeSingle();

  if (error || !data) return null;

  try {
    const decryptedKey = await decryptApiKey(data.api_key_encrypted);
    return {
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
  } catch (err) {
    console.error("Failed to decrypt admin API key:", err);
    return null;
  }
}

async function testAIConnection(
  provider: string,
  apiKey: string,
  model: string,
  baseUrl?: string
): Promise<{ success: boolean; message: string; latencyMs?: number }> {
  const startTime = Date.now();

  try {
    let endpoint = baseUrl || "";
    let headers: Record<string, string> = { "Content-Type": "application/json" };
    let body: any = {};

    switch (provider.toLowerCase()) {
      case "mistral":
        endpoint = endpoint || "https://api.mistral.ai/v1/chat/completions";
        headers.Authorization = `Bearer ${apiKey}`;
        body = {
          model: model || "mistral-small-latest",
          messages: [{ role: "user", content: "test" }],
          max_tokens: 5,
        };
        break;

      case "openai":
        endpoint = endpoint || "https://api.openai.com/v1/chat/completions";
        headers.Authorization = `Bearer ${apiKey}`;
        body = {
          model: model || "gpt-3.5-turbo",
          messages: [{ role: "user", content: "test" }],
          max_tokens: 5,
        };
        break;

      case "gemini":
        endpoint = endpoint || `https://generativelanguage.googleapis.com/v1beta/models/${model || "gemini-pro"}:generateContent?key=${apiKey}`;
        body = {
          contents: [{ role: "user", parts: [{ text: "test" }] }],
          generationConfig: { maxOutputTokens: 5 },
        };
        break;

      case "anthropic":
        endpoint = endpoint || "https://api.anthropic.com/v1/messages";
        headers["x-api-key"] = apiKey;
        headers["anthropic-version"] = "2023-06-01";
        body = {
          model: model || "claude-3-haiku-20240307",
          messages: [{ role: "user", content: "test" }],
          max_tokens: 5,
        };
        break;

      default:
        if (!endpoint) {
          return { success: false, message: "Custom provider requires baseUrl" };
        }
        headers.Authorization = `Bearer ${apiKey}`;
        body = {
          model: model || "default",
          messages: [{ role: "user", content: "test" }],
          max_tokens: 5,
        };
    }

    const response = await fetch(endpoint, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });

    const latencyMs = Date.now() - startTime;

    if (!response.ok) {
      const errorText = await response.text();
      return {
        success: false,
        message: `HTTP ${response.status}: ${errorText.slice(0, 200)}`,
        latencyMs,
      };
    }

    return {
      success: true,
      message: "Connection successful",
      latencyMs,
    };
  } catch (error: any) {
    return {
      success: false,
      message: error?.message || "Connection failed",
      latencyMs: Date.now() - startTime,
    };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authResult = await requireAuth(req, corsHeaders);
    requireAdmin(authResult.user, corsHeaders);

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const url = new URL(req.url);
    const path = url.pathname.split("/").pop() || "";

    // GET: Fetch current configuration (without API key)
    if (req.method === "GET" && !path) {
      const config = await getAdminConfig(supabaseAdmin);

      if (!config) {
        return new Response(
          JSON.stringify({ config: null }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Never send API key to frontend
      const { apiKey, ...safeConfig } = config;
      return new Response(
        JSON.stringify({ config: safeConfig }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // POST: Save or update configuration
    if (req.method === "POST" && !path) {
      const payload: SaveAdminAIConfigRequest = await req.json();

      if (!payload.provider || !payload.model || !payload.apiKey) {
        return new Response(
          JSON.stringify({ error: "Missing required fields: provider, model, apiKey" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const encryptedKey = await encryptApiKey(payload.apiKey);
      const existingConfig = await getAdminConfig(supabaseAdmin);

      if (existingConfig) {
        // Update existing
        const { error } = await supabaseAdmin
          .from("admin_ai_config")
          .update({
            provider: payload.provider,
            model: payload.model,
            api_key_encrypted: encryptedKey,
            base_url: payload.baseUrl || null,
            api_version: payload.apiVersion || null,
            enabled: payload.enabled ?? true,
            updated_by: authResult.user.id,
          })
          .eq("id", existingConfig.id);

        if (error) throw error;

        await logAudit(supabaseAdmin, authResult.user.id, authResult.user.email!, "CONFIG_UPDATED", {
          provider: payload.provider,
          model: payload.model,
        });

        return new Response(
          JSON.stringify({ success: true, message: "Configuration updated" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } else {
        // Create new
        const { error } = await supabaseAdmin.from("admin_ai_config").insert({
          provider: payload.provider,
          model: payload.model,
          api_key_encrypted: encryptedKey,
          base_url: payload.baseUrl || null,
          api_version: payload.apiVersion || null,
          enabled: payload.enabled ?? true,
          updated_by: authResult.user.id,
        });

        if (error) throw error;

        await logAudit(supabaseAdmin, authResult.user.id, authResult.user.email!, "CONFIG_CREATED", {
          provider: payload.provider,
          model: payload.model,
        });

        return new Response(
          JSON.stringify({ success: true, message: "Configuration created" }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // DELETE: Remove configuration
    if (req.method === "DELETE" && !path) {
      const { error } = await supabaseAdmin.from("admin_ai_config").delete().neq("id", "00000000-0000-0000-0000-000000000000");

      if (error) throw error;

      await logAudit(supabaseAdmin, authResult.user.id, authResult.user.email!, "CONFIG_DELETED");

      return new Response(
        JSON.stringify({ success: true, message: "Configuration deleted" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // POST /test: Test connection
    if (req.method === "POST" && path === "test") {
      const payload = await req.json();

      let provider: string, apiKey: string, model: string, baseUrl: string | undefined;

      if (payload.provider && payload.apiKey) {
        // Test with provided credentials
        provider = payload.provider;
        apiKey = payload.apiKey;
        model = payload.model || "default";
        baseUrl = payload.baseUrl;
      } else {
        // Test with saved configuration
        const config = await getAdminConfig(supabaseAdmin);
        if (!config) {
          return new Response(
            JSON.stringify({ success: false, message: "No configuration found" }),
            { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        provider = config.provider;
        apiKey = config.apiKey;
        model = config.model;
        baseUrl = config.baseUrl;
      }

      const result = await testAIConnection(provider, apiKey, model, baseUrl);

      await logAudit(supabaseAdmin, authResult.user.id, authResult.user.email!, "CONNECTION_TESTED", {
        provider,
        success: result.success,
      });

      return new Response(
        JSON.stringify(result),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ error: "Not found" }),
      { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Admin AI Config Error:", error);
    const status = error?.status || 500;
    return new Response(
      JSON.stringify({ error: error?.message || "Internal server error" }),
      { status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
