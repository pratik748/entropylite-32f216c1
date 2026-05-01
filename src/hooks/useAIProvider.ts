/**
 * AI provider hook — locked to Mistral. Multi-provider toggle has been removed.
 * Kept as a stable API so existing imports continue to compile.
 */

export type AIProvider = "mistral";

const STORAGE_KEY = "entropy-ai-provider";

// Ensure persisted value is always "mistral" so apiGovernor's localStorage
// read sends the correct provider hint to edge functions.
try {
  if (typeof localStorage !== "undefined") {
    localStorage.setItem(STORAGE_KEY, "mistral");
  }
} catch {}

const NOOP = () => {};

export function useAIProvider() {
  return {
    provider: "mistral" as AIProvider,
    setProvider: NOOP as (p: AIProvider) => void,
    providerLabel: "M",
    options: ["mistral"] as AIProvider[],
    toggle: NOOP,
  };
}

/** Read provider (always mistral). */
export function getAIProvider(): AIProvider {
  return "mistral";
}
