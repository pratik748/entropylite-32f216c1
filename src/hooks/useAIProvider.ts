import { useState, useEffect, useCallback } from "react";
import { flushAICaches } from "@/lib/apiGovernor";

export type AIProvider = "cloudflare" | "mistral";

const STORAGE_KEY = "entropy-ai-provider";

export function useAIProvider() {
  const [provider, setProviderState] = useState<AIProvider>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored === "cloudflare" ? "cloudflare" : "mistral";
    } catch {
      return "mistral";
    }
  });

  const setProvider = useCallback((p: AIProvider) => {
    setProviderState(p);
    try {
      localStorage.setItem(STORAGE_KEY, p);
      // Dispatch for same-tab listeners (StorageEvent only fires cross-tab)
      window.dispatchEvent(new CustomEvent("entropy-provider-change", { detail: p }));
    } catch {}
    // Flush AI caches so new provider takes effect immediately
    flushAICaches();
  }, []);

  // Listen for changes from other components (same tab + cross tab)
  useEffect(() => {
    const storageHandler = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) {
        setProviderState(e.newValue === "cloudflare" ? "cloudflare" : "mistral");
      }
    };
    const customHandler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      setProviderState(detail === "cloudflare" ? "cloudflare" : "mistral");
    };
    window.addEventListener("storage", storageHandler);
    window.addEventListener("entropy-provider-change", customHandler);
    return () => {
      window.removeEventListener("storage", storageHandler);
      window.removeEventListener("entropy-provider-change", customHandler);
    };
  }, []);

  return {
    provider,
    setProvider,
    providerLabel: provider === "mistral" ? "M" : "C",
    toggle: () => setProviderState(prev => {
      const next: AIProvider = prev === "mistral" ? "cloudflare" : "mistral";
      try {
        localStorage.setItem(STORAGE_KEY, next);
        window.dispatchEvent(new CustomEvent("entropy-provider-change", { detail: next }));
      } catch {}
      flushAICaches();
      return next;
    }),
  };
}

/** Read provider from localStorage without hook (for apiGovernor) */
export function getAIProvider(): AIProvider {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === "cloudflare" ? "cloudflare" : "mistral";
  } catch {
    return "mistral";
  }
}
