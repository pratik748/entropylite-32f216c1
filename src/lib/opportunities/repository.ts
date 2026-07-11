// OpportunityRepository — the single client-side gateway to the shared
// Opportunity Engine. Every module (Discover, Direct Profit, Desirable
// Assets, alerts, future portfolio modules) queries THIS repository; none
// of them call the backend directly or maintain their own opportunity
// state. That guarantees a #1-ranked asset in one module is the same
// object, with the same score, everywhere else.

import { governedInvoke } from "@/lib/apiGovernor";
import { runLocalEngine } from "./localEngine";
import { updateLifecycle } from "./lifecycle";
import type { EngineResponse } from "./types";

const CACHE_KEY = "opportunity-engine-snapshot-v3";
const CACHE_TTL_MS = 30 * 60 * 1000; // engine output is slow-moving evidence, not a ticker

// ── Portfolio context ───────────────────────────────────────────────
// Registered once by the host app (Index) so EVERY consumer's slate is
// ranked with the same portfolio-aware diversification adjustment.

export interface PortfolioContext {
  positions: Array<{ symbol: string; weight: number }>;
  value?: number;
}

let portfolioContext: PortfolioContext | null = null;

export function setPortfolioContext(ctx: PortfolioContext | null) {
  portfolioContext = ctx && ctx.positions.length > 0 ? ctx : null;
}

function portfolioHash(): string {
  if (!portfolioContext) return "np";
  return portfolioContext.positions
    .map((p) => `${p.symbol}:${p.weight.toFixed(2)}`)
    .sort()
    .join(",");
}

interface Snapshot {
  response: EngineResponse;
  fetchedAt: number;
  indiaMode: boolean;
  horizonDays: number;
}

type Listener = (snapshot: Snapshot | null) => void;

let current: Snapshot | null = null;
let inflight: Promise<Snapshot> | null = null;
const listeners = new Set<Listener>();

function loadPersisted(): Snapshot | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Snapshot;
    if (!parsed?.response || !Array.isArray(parsed.response.opportunities)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function persist(snapshot: Snapshot) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(snapshot));
  } catch { /* storage full — in-memory cache still works */ }
}

function notify() {
  for (const l of listeners) l(current);
}

export function subscribeOpportunities(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getSnapshot(): Snapshot | null {
  if (!current) current = loadPersisted();
  return current;
}

function isFresh(snapshot: Snapshot | null, indiaMode: boolean, horizonDays: number): snapshot is Snapshot {
  return Boolean(
    snapshot &&
    snapshot.indiaMode === indiaMode &&
    (snapshot.horizonDays ?? 21) === horizonDays &&
    Date.now() - snapshot.fetchedAt < CACHE_TTL_MS,
  );
}

/**
 * Fetch (or reuse) the engine's validated opportunity set. All consumers
 * share one inflight request and one cache entry — server-side filters are
 * intentionally NOT passed here so every module sees the identical slate;
 * use `filterOpportunities` for per-module views.
 *
 * Execution venues, tried in order:
 *   1. The `opportunity-engine` edge function (full universe).
 *   2. The SAME pipeline executed locally against the deployed
 *      `historical-prices` proxy (reduced universe) — used automatically
 *      while the edge function isn't deployed. Marked in the response as
 *      executionVenue: "local_fallback".
 */
export async function fetchOpportunities(opts: {
  indiaMode: boolean;
  force?: boolean;
  horizonDays?: number;
}): Promise<Snapshot> {
  const horizonDays = opts.horizonDays ?? 21;
  const cached = getSnapshot();
  if (!opts.force && isFresh(cached, opts.indiaMode, horizonDays)) return cached;
  if (inflight) return inflight;

  inflight = (async () => {
    let response: EngineResponse | null = null;
    let edgeError: Error | null = null;

    const { data, error } = await governedInvoke<EngineResponse>("opportunity-engine", {
      body: {
        mode: "discover",
        horizonDays,
        ...(portfolioContext ? { portfolio: portfolioContext } : {}),
      },
      cacheKey: `discover|${opts.indiaMode ? "in" : "gl"}|h${horizonDays}|${portfolioHash()}`,
      force: opts.force,
    });
    if (!error && data && Array.isArray(data.opportunities)) {
      response = data;
    } else {
      edgeError = new Error((error as Error | null)?.message || "Opportunity engine unreachable.");
      // Edge venue unavailable (typically: function not deployed yet) —
      // run the same pipeline locally against the deployed data proxies.
      try {
        response = await runLocalEngine({
          indiaMode: opts.indiaMode,
          horizonDays,
          portfolio: portfolioContext,
        });
      } catch {
        response = null;
      }
    }

    if (!response) throw edgeError ?? new Error("Opportunity engine unreachable.");

    const snapshot: Snapshot = { response, fetchedAt: Date.now(), indiaMode: opts.indiaMode, horizonDays };
    current = snapshot;
    persist(snapshot);
    // Fold this run into the conviction lifecycle before notifying
    // subscribers, so views render state transitions consistently.
    try { updateLifecycle(response); } catch { /* lifecycle is derived, never blocking */ }
    notify();
    return snapshot;
  })();

  try {
    return await inflight;
  } finally {
    inflight = null;
  }
}

/**
 * Evaluate specific tickers through the exact same pipeline (used by
 * Direct Profit for on-demand names). Same models, same validator, same
 * ranking math — mode:"single" only changes the candidate source.
 */
export async function evaluateTickers(opts: {
  tickers: string[];
  indiaMode: boolean;
}): Promise<EngineResponse> {
  const tickers = opts.tickers.map((t) => t.trim().toUpperCase()).filter(Boolean);
  const { data, error } = await governedInvoke<EngineResponse>("opportunity-engine", {
    body: { mode: "single", tickers, horizonDays: 21 },
    cacheKey: `single|${opts.indiaMode ? "in" : "gl"}|${tickers.slice().sort().join(",")}`,
  });
  if (error || !data) {
    throw new Error((error as Error | null)?.message || "Opportunity engine unreachable.");
  }
  return data;
}

// Pure view helpers live in ./view (import-safe for tests); re-exported
// here so consumers have a single import surface.
export { filterOpportunities, newOpportunities } from "./view";
