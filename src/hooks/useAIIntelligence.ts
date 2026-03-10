import { useState, useEffect, useRef } from "react";
import { governedInvoke } from "@/lib/apiGovernor";

/**
 * Hook to call an AI intelligence edge function with caching and fallback.
 */
export function useAIIntelligence<T>(
  functionName: string,
  body: any,
  fallback: T,
  enabled: boolean = true
) {
  const [data, setData] = useState<T>(fallback);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bodyRef = useRef(JSON.stringify(body));

  useEffect(() => {
    const newBody = JSON.stringify(body);
    if (newBody === bodyRef.current && data !== fallback) return;
    bodyRef.current = newBody;

    if (!enabled || !body) return;

    let cancelled = false;
    setLoading(true);
    setError(null);

    governedInvoke<T>(functionName, { body })
      .then(({ data: result, error: err }) => {
        if (cancelled) return;
        if (err || !result) {
          console.warn(`${functionName} failed, using fallback:`, err);
          setError(err?.message || "AI call failed");
        } else {
          setData(result);
        }
      })
      .catch((e) => {
        if (!cancelled) setError(e.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => { cancelled = true; };
  }, [functionName, body, enabled]);

  return { data, loading, error, isAI: !error && data !== fallback };
}
