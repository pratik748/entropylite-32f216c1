/**
 * Admin AI Configuration Types for Deno/Edge Functions
 */

export type AIProvider = "mistral" | "openai" | "gemini" | "anthropic" | "openrouter" | "custom";

export interface AdminAIConfig {
  id: string;
  provider: AIProvider;
  model: string;
  baseUrl?: string;
  apiVersion?: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
  updatedBy?: string;
}

export interface AdminAIConfigWithKey extends AdminAIConfig {
  apiKey: string;
}

export interface SaveAdminAIConfigRequest {
  provider: AIProvider;
  model: string;
  apiKey: string;
  baseUrl?: string;
  apiVersion?: string;
  enabled?: boolean;
}

export type AdminAuditAction =
  | "CONFIG_CREATED"
  | "CONFIG_UPDATED"
  | "CONFIG_ENABLED"
  | "CONFIG_DISABLED"
  | "CONFIG_DELETED"
  | "CONNECTION_TESTED";
