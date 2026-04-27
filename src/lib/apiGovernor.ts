/**
 * API Governor, Central intelligent request controller for Entropy Lite.
 *
 * Responsibilities:
 *  • In-memory cache with configurable TTL per endpoint
 *  • Request deduplication (inflight coalescing)
 *  • Rate limiting / cooldown enforcement
 *  • Usage metrics tracking (requests/hr, blocked, cost estimate)
 *  • Change-detection: skip refresh if data hasn't meaningfully changed
 */

import { supabase } from "@/integrations/supabase/client";

// --------------- Types ---------------

interface CacheEntry<T = any> {
  data: T;
  timestamp: number;
  hash: string;
}

interface GovernorMetrics {
  requestsTotal: number;
  requestsBlocked: number;
  cacheHits: number;
  endpointCounts: Record<string, number>;
  aiCallsTotal: number;
  lastAiCall: number;
  windowStart: number;           // rolling 1-hour window start
  requestsInWindow: number;
}

type Tier = "realtime" | "frequent" | "slow" | "static" | "ai" | "continuous" | "evolution" | "heavy" | "reflexivity";

const TTL: Record<Tier, number> = {
  realtime:    8_000,       // 8s, prices
  frequent:    15_000,      // 15s, market overview, ticker strip
  slow:        60_000,      // 1 min, news, geopolitical, desirable assets
  static:      Infinity,    // permanent, historical data
  ai:          30_000,      // 30s cooldown for AI calls
  continuous:  60_000,      // 60s, background simulation loops
  evolution:   120_000,     // 120s, strategy discovery
  heavy:       1_800_000,   // 30 min, expensive analytical modules (derivatives, deep intel, risk)
  reflexivity: 21_600_000,  // 6h, reflexivity belief map (persisted to localStorage)
};

// Tiers that should survive page reloads (persisted to localStorage)
const PERSISTENT_TIERS: Set<Tier> = new Set(["reflexivity"]);
const PERSIST_PREFIX = "entropy-cache-v1::";

const ENDPOINT_TIER: Record<string, Tier> = {
  "price-feed":              "realtime",
  "market-data":             "frequent",
  "fx-rates":                "slow",
  "fetch-news":              "slow",
  "geopolitical-data":       "frequent",
  "desirable-assets":        "slow",
  "analyze-stock":           "ai",
  "direct-profit":           "ai",
  "strategy-generate":       "ai",
  "causal-effects":          "ai",
  "sentiment-intel":         "slow",
  "risk-intelligence":       "heavy",
  "flow-intelligence":       "heavy",
  "portfolio-intelligence":  "heavy",
  "monte-carlo-intelligence":"ai",
  "crown-intelligence":      "ai",
  "deep-intelligence":       "heavy",
  "parallel-intelligence":   "heavy",
  "continuous-simulation":   "continuous",
  "clank-detection":         "ai",
  "strategy-evolution":      "evolution",
  "macro-intelligence":      "slow",
  "sec-filings":             "slow",
  "alternative-signals":     "slow",
  "institutional-flows":     "slow",
  "data-pipeline-status":    "frequent",
  "derivatives-intelligence":"heavy",
  "historical-prices":        "slow",
  "reflexivity-engine":      "reflexivity",
  // company-intelligence removed, uses its own 24h localStorage cache
};

// Rough cost weights for monitoring (relative units)
const COST_WEIGHT: Record<Tier, number> = {
  realtime:    0.1,
  frequent:    0.2,
  slow:        0.5,
  static:      0,
  ai:          5,
  continuous:  3,
  evolution:   4,
  heavy:       8,
  reflexivity: 8,
};

// --------------- Singleton State ---------------

const cache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<any>>();

const metrics: GovernorMetrics = {
  requestsTotal: 0,
  requestsBlocked: 0,
  cacheHits: 0,
  endpointCounts: {},
  aiCallsTotal: 0,
  lastAiCall: 0,
  windowStart: Date.now(),
  requestsInWindow: 0,
};

// --------------- Helpers ---------------

function cacheKey(fn: string, body?: any): string {
  if (!body) return fn;
  // Stable JSON key, sort keys for consistency
  try {
    const sorted = JSON.stringify(body, Object.keys(body).sort());
    return `${fn}::${sorted}`;
  } catch {
    return fn;
  }
}

// --------------- Persistent cache (localStorage) ---------------

function endpointFromKey(key: string): string {
  return key.split("::")[0];
}

function isPersistent(key: string): boolean {
  const tier = ENDPOINT_TIER[endpointFromKey(key)];
  return tier ? PERSISTENT_TIERS.has(tier) : false;
}

function persistEntry(key: string, entry: CacheEntry) {
  if (!isPersistent(key)) return;
  try {
    localStorage.setItem(PERSIST_PREFIX + key, JSON.stringify(entry));
  } catch {}
}

function loadPersistedEntry(key: string): CacheEntry | null {
  if (!isPersistent(key)) return null;
  try {
    const raw = localStorage.getItem(PERSIST_PREFIX + key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as CacheEntry;
    return parsed && typeof parsed.timestamp === "number" ? parsed : null;
  } catch {
    return null;
  }
}

// Hydrate persistent cache entries on module load
(function hydratePersistentCache() {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k || !k.startsWith(PERSIST_PREFIX)) continue;
      const cacheK = k.slice(PERSIST_PREFIX.length);
      const entry = loadPersistedEntry(cacheK);
      if (entry) cache.set(cacheK, entry);
    }
  } catch {}
})();

function fastHash(data: any): string {
  const str = typeof data === "string" ? data : JSON.stringify(data);
  let h = 0;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) - h + str.charCodeAt(i)) | 0;
  }
  return h.toString(36);
}

function resetWindowIfNeeded() {
  const now = Date.now();
  if (now - metrics.windowStart > 3_600_000) {
    metrics.windowStart = now;
    metrics.requestsInWindow = 0;
  }
}

// --------------- Core API ---------------

export interface InvokeOptions {
  body?: any;
  /** Override default tier for this call */
  tier?: Tier;
  /** Force bypass cache (manual refresh) */
  force?: boolean;
  /** Skip this call entirely if true (for conditional fetches) */
  skip?: boolean;
  /**
   * Stable cache key override. Use this when the request body contains noisy
   * live fields (live prices, VIX, intensities) that would otherwise change
   * the auto-generated key on every render and defeat caching. Pass a key
   * derived only from the structural identity of the request (e.g. ticker
   * list, region, mode) so cache hits work as intended.
   */
  cacheKey?: string;
}

/**
 * Governed supabase.functions.invoke, all API calls should go through here.
 */
export async function governedInvoke<T = any>(
  functionName: string,
  opts: InvokeOptions = {}
): Promise<{ data: T | null; error: any; cached: boolean }> {
  if (opts.skip) {
    return { data: null, error: null, cached: false };
  }

  const tier = opts.tier || ENDPOINT_TIER[functionName] || "frequent";
  const ttl = TTL[tier];
  const key = opts.cacheKey
    ? `${functionName}::${opts.cacheKey}`
    : cacheKey(functionName, opts.body);

  resetWindowIfNeeded();

  // 1. Check cache
  if (!opts.force) {
    const cached = cache.get(key);
    if (cached && Date.now() - cached.timestamp < ttl) {
      metrics.cacheHits++;
      return { data: cached.data as T, error: null, cached: true };
    }
  }

  // 2. AI cooldown enforcement
  if (tier === "ai" && !opts.force) {
    const sinceLastAi = Date.now() - metrics.lastAiCall;
    if (sinceLastAi < TTL.ai) {
      // Check if we have stale cache to serve
      const stale = cache.get(key);
      if (stale) {
        metrics.requestsBlocked++;
        return { data: stale.data as T, error: null, cached: true };
      }
      // No cache, allow through but log
    }
  }

  // 3. Inflight deduplication
  const existing = inflight.get(key);
  if (existing) {
    metrics.requestsBlocked++;
    try {
      const result = await existing;
      return { data: result as T, error: null, cached: true };
    } catch (e) {
      return { data: null, error: e, cached: false };
    }
  }

  // 4. Execute request, inject AI provider for AI-tier calls
  const promise = (async () => {
    let body = opts.body;
    // Inject provider and indiaMode for all calls
    {
      try {
        const provider = localStorage.getItem("entropy-ai-provider") || "mistral";
        const indiaMode = localStorage.getItem("entropy-india-mode") === "true";
        body = { ...body, provider, ...(indiaMode ? { indiaMode: true } : {}) };
      } catch {}
    }
    const { data, error } = await supabase.functions.invoke(functionName, {
      body,
    });
    if (error) throw error;

    // Update cache
    const hash = fastHash(data);
    const entry = { data, timestamp: Date.now(), hash };
    cache.set(key, entry);
    persistEntry(key, entry);

    return data;
  })();

  inflight.set(key, promise);

  // Track metrics
  metrics.requestsTotal++;
  metrics.requestsInWindow++;
  metrics.endpointCounts[functionName] = (metrics.endpointCounts[functionName] || 0) + 1;
  if (tier === "ai") {
    metrics.aiCallsTotal++;
    metrics.lastAiCall = Date.now();
  }

  try {
    const data = await promise;
    return { data: data as T, error: null, cached: false };
  } catch (error) {
    return { data: null, error, cached: false };
  } finally {
    inflight.delete(key);
  }
}

/**
 * Check if cached data exists and is fresh for an endpoint.
 */
export function hasFreshCache(functionName: string, body?: any): boolean {
  const tier = ENDPOINT_TIER[functionName] || "frequent";
  const key = cacheKey(functionName, body);
  const entry = cache.get(key);
  if (!entry) return false;
  return Date.now() - entry.timestamp < TTL[tier];
}

/**
 * Get cached data without making a request.
 */
export function getCached<T = any>(functionName: string, body?: any): T | null {
  const key = cacheKey(functionName, body);
  const entry = cache.get(key);
  return entry ? (entry.data as T) : null;
}

/**
 * Invalidate cache for a specific endpoint.
 */
export function invalidateCache(functionName: string, body?: any) {
  const key = cacheKey(functionName, body);
  cache.delete(key);
  try { localStorage.removeItem(PERSIST_PREFIX + key); } catch {}
}

// --------------- Metrics API ---------------

export function getGovernorMetrics() {
  resetWindowIfNeeded();
  const hourlyRate = metrics.requestsInWindow;
  const totalCost = Object.entries(metrics.endpointCounts).reduce((sum, [ep, count]) => {
    const tier = ENDPOINT_TIER[ep] || "frequent";
    return sum + count * COST_WEIGHT[tier];
  }, 0);

  return {
    requestsTotal: metrics.requestsTotal,
    requestsBlocked: metrics.requestsBlocked,
    cacheHits: metrics.cacheHits,
    requestsPerHour: hourlyRate,
    estimatedCostUnits: Math.round(totalCost * 10) / 10,
    endpointCounts: { ...metrics.endpointCounts },
    aiCallsTotal: metrics.aiCallsTotal,
    savingsPercent: metrics.requestsTotal > 0
      ? Math.round(((metrics.cacheHits + metrics.requestsBlocked) / (metrics.requestsTotal + metrics.cacheHits + metrics.requestsBlocked)) * 100)
      : 0,
  };
}

/**
 * Auto-throttle: returns recommended poll interval multiplier
 * based on current usage rate. >100 req/hr → slow down.
 */
export function getThrottleMultiplier(): number {
  const rpm = getGovernorMetrics().requestsPerHour;
  if (rpm > 200) return 3;
  if (rpm > 100) return 2;
  return 1;
}

/**
 * Flush ALL cached data, used on page load / tab refocus to force live recomputation.
 */
export function flushAllCaches() {
  cache.clear();
  metrics.lastAiCall = 0;
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (k && k.startsWith(PERSIST_PREFIX)) localStorage.removeItem(k);
    }
  } catch {}
}

/**
 * Flush analytical caches only (keep raw price-feed cache intact).
 */
export function flushAnalyticalCaches() {
  for (const key of Array.from(cache.keys())) {
    if (!key.startsWith("price-feed")) {
      cache.delete(key);
      try { localStorage.removeItem(PERSIST_PREFIX + key); } catch {}
    }
  }
  metrics.lastAiCall = 0;
}

/**
 * Flush AI-tier caches only, called when provider is switched.
 */
export function flushAICaches() {
  const aiTiers: Tier[] = ["ai", "continuous", "evolution", "heavy", "reflexivity"];
  for (const key of Array.from(cache.keys())) {
    const fn = key.split("::")[0];
    const tier = ENDPOINT_TIER[fn];
    if (tier && aiTiers.includes(tier)) {
      cache.delete(key);
      try { localStorage.removeItem(PERSIST_PREFIX + key); } catch {}
    }
  }
  metrics.lastAiCall = 0;
}
