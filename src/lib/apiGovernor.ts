/**
 * API Governor — Central intelligent request controller for Entropy Lite.
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

type Tier = "realtime" | "frequent" | "slow" | "static" | "ai";

const TTL: Record<Tier, number> = {
  realtime: 15_000,   // 15s — prices
  frequent: 30_000,   // 30s — market overview, ticker strip
  slow:     600_000,  // 10 min — news, geopolitical, desirable assets
  static:   Infinity, // permanent — historical data
  ai:       60_000,   // 60s cooldown for AI calls
};

const ENDPOINT_TIER: Record<string, Tier> = {
  "price-feed":        "realtime",
  "market-data":       "frequent",
  "fx-rates":          "slow",
  "fetch-news":        "slow",
  "geopolitical-data": "slow",
  "desirable-assets":  "slow",
  "analyze-stock":     "ai",
  "strategy-generate": "ai",
  "causal-effects":    "ai",
  "sentiment-intel":   "slow",
};

// Rough cost weights for monitoring (relative units)
const COST_WEIGHT: Record<Tier, number> = {
  realtime: 0.1,
  frequent: 0.2,
  slow:     0.5,
  static:   0,
  ai:       5,
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
  // Stable JSON key — sort keys for consistency
  try {
    const sorted = JSON.stringify(body, Object.keys(body).sort());
    return `${fn}::${sorted}`;
  } catch {
    return fn;
  }
}

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
}

/**
 * Governed supabase.functions.invoke — all API calls should go through here.
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
  const key = cacheKey(functionName, opts.body);

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
      // No cache — allow through but log
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

  // 4. Execute request
  const promise = (async () => {
    const { data, error } = await supabase.functions.invoke(functionName, {
      body: opts.body,
    });
    if (error) throw error;

    // Update cache
    const hash = fastHash(data);
    cache.set(key, { data, timestamp: Date.now(), hash });

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
