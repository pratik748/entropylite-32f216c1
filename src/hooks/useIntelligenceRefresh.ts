import { useState, useEffect, useRef, useCallback } from "react";
import { flushAllCaches } from "@/lib/apiGovernor";
import { toast } from "@/hooks/use-toast";

// Refocus debounce raised to 5 min. Previous 10s window caused a refresh
// stampede every time the tab came back from background, which timed out
// heavy modules like Desirable Assets and made the app feel "crashed".
const DEBOUNCE_MS = 5 * 60_000;
// Only treat a return-to-foreground as a refresh trigger if the tab was
// hidden long enough to plausibly have stale data.
const MIN_HIDDEN_MS = 60_000;

export function useIntelligenceRefresh() {
  const [refreshKey, setRefreshKey] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const lastRefresh = useRef(0);
  const hiddenSince = useRef<number | null>(null);
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
      title: "Updating Intelligence…",
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
    // NOTE: do NOT trigger on initial mount. Each module already fetches its
    // own data on mount with its own cache layer. Calling triggerRefresh here
    // would (a) flush every cache the moment the dashboard loads, and
    // (b) bump refreshKey from 0→1, remounting every module mid-fetch and
    // leaving Desirable Assets / Analysis stuck on a loading spinner whose
    // owning component was already unmounted. The first natural fetch IS
    // the refresh.

    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        hiddenSince.current = Date.now();
        return;
      }
      if (document.visibilityState === "visible") {
        const hiddenFor = hiddenSince.current ? Date.now() - hiddenSince.current : 0;
        hiddenSince.current = null;
        // Skip refresh on quick tab-switches or backgrounding — avoids
        // hammering edge functions every time the user alt-tabs.
        if (hiddenFor < MIN_HIDDEN_MS) return;
        triggerRefresh();
      }
    };

    // Window focus alone is too noisy (fires on devtools toggle, popup close,
    // etc.). Rely on visibilitychange + the manual refresh button instead.

    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [triggerRefresh]);

  return { refreshKey, isRefreshing, markRefreshComplete, triggerRefresh };
}
