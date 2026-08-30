/**
 * Admin AI Configuration Types
 *
 * These types define the shape of the admin-configured global AI provider.
 * API keys are NEVER included in frontend-facing types to prevent exposure.
 */

export type AIProvider = "mistral" | "openai" | "gemini" | "anthropic" | "openrouter" | "custom";

/**
 * Admin AI Configuration (Frontend-safe, excludes API key)
 */
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

/**
 * Admin AI Configuration with API key (Backend only, NEVER send to frontend)
 */
export interface AdminAIConfigWithKey extends AdminAIConfig {
  apiKey: string;
}

/**
 * Request payload for saving/updating admin AI configuration
 */
export interface SaveAdminAIConfigRequest {
  provider: AIProvider;
  model: string;
  apiKey: string;
  baseUrl?: string;
  apiVersion?: string;
  enabled?: boolean;
}

/**
 * Response from test connection endpoint
 */
export interface TestConnectionResponse {
  success: boolean;
  message: string;
  latencyMs?: number;
  modelInfo?: {
    name: string;
    contextWindow?: number;
  };
}

/**
 * Connection status metadata
 */
export interface ConnectionStatus {
  connected: boolean;
  lastSuccessful?: string;
  lastError?: string;
  lastTestedAt?: string;
}

/**
 * Admin audit log entry
 */
export interface AdminAuditLogEntry {
  id: string;
  userId: string;
  userEmail: string;
  action: AdminAuditAction;
  details?: Record<string, any>;
  createdAt: string;
}

export type AdminAuditAction =
  | "CONFIG_CREATED"
  | "CONFIG_UPDATED"
  | "CONFIG_ENABLED"
  | "CONFIG_DISABLED"
  | "CONFIG_DELETED"
  | "CONNECTION_TESTED";
