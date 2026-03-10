import { useState, useEffect, useRef, useCallback } from "react";
import { flushAllCaches } from "@/lib/apiGovernor";
import { toast } from "@/hooks/use-toast";

const DEBOUNCE_MS = 10_000; // ignore refocus within 10s of last refresh

export function useIntelligenceRefresh() {
  const [refreshKey, setRefreshKey] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const lastRefresh = useRef(0);
  const toastRef = useRef<ReturnType<typeof toast> | null>(null);

  const triggerRefresh = useCallback(() => {
    const now = Date.now();
    if (now - lastRefresh.current < DEBOUNCE_MS) return;
    lastRefresh.current = now;

    // Flush caches so all modules re-fetch live data
    flushAllCaches();
    setIsRefreshing(true);
    setRefreshKey((k) => k + 1);

    // Show brief toast
    toastRef.current = toast({
      title: "⚡ Updating Intelligence…",
      description: "Refreshing all modules with live market data",
    });

    // Auto-dismiss after a reasonable window
    setTimeout(() => {
      setIsRefreshing(false);
      toastRef.current?.dismiss();
    }, 6000);
  }, []);

  const markRefreshComplete = useCallback(() => {
    setIsRefreshing(false);
    toastRef.current?.dismiss();
  }, []);

  useEffect(() => {
    // Trigger on initial mount (page load / reload)
    triggerRefresh();

    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        triggerRefresh();
      }
    };

    const onFocus = () => triggerRefresh();

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("focus", onFocus);

    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("focus", onFocus);
    };
  }, [triggerRefresh]);

  return { refreshKey, isRefreshing, markRefreshComplete, triggerRefresh };
}
