import { supabase } from "@/integrations/supabase/client";
import type {
  AdminAIConfig,
  SaveAdminAIConfigRequest,
  TestConnectionResponse,
} from "@/types/adminAIConfig";

/**
 * Fetch the current admin AI configuration (metadata only, no API key).
 */
export async function fetchAdminAIConfig(): Promise<AdminAIConfig | null> {
  const { data, error } = await supabase.functions.invoke("admin-ai-config", {
    method: "GET",
  });

  if (error) {
    console.error("Failed to fetch admin AI config:", error);
    throw error;
  }

  return data?.config || null;
}

/**
 * Save or update the admin AI configuration.
 */
export async function saveAdminAIConfig(
  config: SaveAdminAIConfigRequest
): Promise<{ success: boolean; message: string }> {
  const { data, error } = await supabase.functions.invoke("admin-ai-config", {
    method: "POST",
    body: config,
  });

  if (error) {
    console.error("Failed to save admin AI config:", error);
    throw error;
  }

  return data;
}

/**
 * Test AI connection with provided or saved configuration.
 */
export async function testAdminAIConnection(
  config?: Partial<SaveAdminAIConfigRequest>
): Promise<TestConnectionResponse> {
  const { data, error } = await supabase.functions.invoke("admin-ai-config/test", {
    method: "POST",
    body: config || {},
  });

  if (error) {
    console.error("Failed to test AI connection:", error);
    return {
      success: false,
      message: error.message || "Connection test failed",
    };
  }

  return data;
}

/**
 * Delete the admin AI configuration.
 */
export async function deleteAdminAIConfig(): Promise<{ success: boolean; message: string }> {
  const { data, error } = await supabase.functions.invoke("admin-ai-config", {
    method: "DELETE",
  });

  if (error) {
    console.error("Failed to delete admin AI config:", error);
    throw error;
  }

  return data;
}
