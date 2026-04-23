import { useState, useEffect, useCallback } from "react";
import { flushAICaches } from "@/lib/apiGovernor";

export type AIProvider = "cloudflare" | "mistral" | "groq";

const STORAGE_KEY = "entropy-ai-provider";
const VALID: AIProvider[] = ["cloudflare", "mistral", "groq"];
const CYCLE: AIProvider[] = ["mistral", "cloudflare", "groq"];

function normalize(value: string | null): AIProvider {
  return (VALID as string[]).includes(value ?? "") ? (value as AIProvider) : "mistral";
}

function labelFor(p: AIProvider): string {
  return p === "mistral" ? "M" : p === "cloudflare" ? "C" : "L";
}

function persist(p: AIProvider) {
  try {
    localStorage.setItem(STORAGE_KEY, p);
    window.dispatchEvent(new CustomEvent("entropy-provider-change", { detail: p }));
  } catch {}
  flushAICaches();
}

export function useAIProvider() {
  const [provider, setProviderState] = useState<AIProvider>(() => {
    try {
      return normalize(localStorage.getItem(STORAGE_KEY));
    } catch {
      return "mistral";
    }
  });

  const setProvider = useCallback((p: AIProvider) => {
    setProviderState(p);
    persist(p);
  }, []);

  // Listen for changes from other components (same tab + cross tab)
  useEffect(() => {
    const storageHandler = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setProviderState(normalize(e.newValue));
    };
    const customHandler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      setProviderState(normalize(typeof detail === "string" ? detail : null));
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
    providerLabel: labelFor(provider),
    options: VALID,
    toggle: () => setProviderState(prev => {
      const idx = CYCLE.indexOf(prev);
      const next = CYCLE[(idx + 1) % CYCLE.length];
      persist(next);
      return next;
    }),
  };
}

/** Read provider from localStorage without hook (for apiGovernor) */
export function getAIProvider(): AIProvider {
  try {
    return normalize(localStorage.getItem(STORAGE_KEY));
  } catch {
    return "mistral";
  }
}
