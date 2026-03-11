import { useState, useEffect, useCallback } from "react";

export type AIProvider = "cloudflare" | "mistral";

const STORAGE_KEY = "entropy-ai-provider";

export function useAIProvider() {
  const [provider, setProviderState] = useState<AIProvider>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored === "mistral" ? "mistral" : "cloudflare";
    } catch {
      return "cloudflare";
    }
  });

  const setProvider = useCallback((p: AIProvider) => {
    setProviderState(p);
    try {
      localStorage.setItem(STORAGE_KEY, p);
    } catch {}
  }, []);

  // Listen for changes from other components
  useEffect(() => {
    const handler = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) {
        setProviderState(e.newValue === "mistral" ? "mistral" : "cloudflare");
      }
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, []);

  return {
    provider,
    setProvider,
    providerLabel: provider === "mistral" ? "M" : "C",
    toggle: () => setProvider(provider === "cloudflare" ? "mistral" : "cloudflare"),
  };
}

/** Read provider from localStorage without hook (for apiGovernor) */
export function getAIProvider(): AIProvider {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === "mistral" ? "mistral" : "cloudflare";
  } catch {
    return "cloudflare";
  }
}
