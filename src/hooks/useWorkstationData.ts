import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { governedInvoke } from "@/lib/apiGovernor";
import type { Bars } from "@/lib/evidence/build";
import type { DeskAnalysis, Dossier, Financials, Quote } from "@/lib/evidence/inputs";

/**
 * Workstation data layer — resilient by contract.
 *
 * Every source resolves to { data, state, fetchedAt } and can only be in
 * one of four states: loading / live / cached / unavailable. Failures fall
 * back to the last good payload (however old) before they fall back to
 * "unavailable", and no raw error string ever leaves this hook — the UI
 * renders designed states, not transport errors.
 */

export type SourceState = "loading" | "live" | "cached" | "unavailable";

export interface SourceStatus {
  state: SourceState;
  fetchedAt: number | null;
}

export interface WorkstationData {
  quote: Quote | null;
  analysis: DeskAnalysis | null;
  bars: Bars | null;
  dossier: Dossier | null;
  financials: Financials | null;
  status: {
    quote: SourceStatus;
    analysis: SourceStatus;
    bars: SourceStatus;
    dossier: SourceStatus;
    financials: SourceStatus;
  };
  /** True while nothing at all is available yet (first paint skeletons). */
  bootstrapping: boolean;
}

const VERSION = "v1";
const TTL = {
  analysis: 6 * 60 * 60 * 1000, // 6h
  bars: 12 * 60 * 60 * 1000, // 12h
  dossier: 24 * 60 * 60 * 1000, // 24h — shared with the desk dossier cache
  financials: 24 * 60 * 60 * 1000, // 24h — statements move quarterly
} as const;

/* ── localStorage cache (versioned, never throws) ─────────────── */

function cacheKey(source: string, ticker: string): string {
  // Dossier shares the desk's existing cache so one AI generation serves both.
  if (source === "dossier") return `ci_dossier_${ticker.toUpperCase()}`;
  return `ws_${VERSION}_${source}_${ticker.toUpperCase()}`;
}

interface CacheEntry<T> {
  data: T;
  ts: number;
}

function cacheGet<T>(source: string, ticker: string): CacheEntry<T> | null {
  try {
    const raw = localStorage.getItem(cacheKey(source, ticker));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.ts === "number" && parsed.data != null) return parsed as CacheEntry<T>;
    return null;
  } catch {
    return null;
  }
}

function cacheSet<T>(source: string, ticker: string, data: T) {
  try {
    localStorage.setItem(cacheKey(source, ticker), JSON.stringify({ data, ts: Date.now() }));
  } catch {
    /* storage full — cache is an optimization, never a requirement */
  }
}

/** Bound any transport call so a hanging request can never stall a source. */
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error("timeout")), ms)),
  ]);
}

/* ── hook ─────────────────────────────────────────────────────── */

export function useWorkstationData(ticker: string): WorkstationData & { refresh: () => void } {
  const [quote, setQuote] = useState<{ price: number; currency: string } | null>(null);
  const [analysis, setAnalysis] = useState<DeskAnalysis | null>(null);
  const [bars, setBars] = useState<Bars | null>(null);
  const [dossier, setDossier] = useState<Dossier | null>(null);
  const [financials, setFinancials] = useState<Financials | null>(null);
  const [status, setStatus] = useState<WorkstationData["status"]>({
    quote: { state: "loading", fetchedAt: null },
    analysis: { state: "loading", fetchedAt: null },
    bars: { state: "loading", fetchedAt: null },
    dossier: { state: "loading", fetchedAt: null },
    financials: { state: "loading", fetchedAt: null },
  });
  const [refreshTick, setRefreshTick] = useState(0);
  const aliveRef = useRef(true);

  const setSource = useCallback(
    (source: keyof WorkstationData["status"], state: SourceState, fetchedAt: number | null) => {
      if (!aliveRef.current) return;
      setStatus((prev) => ({ ...prev, [source]: { state, fetchedAt } }));
    },
    [],
  );

  useEffect(() => {
    aliveRef.current = true;
    let quoteInterval: ReturnType<typeof setInterval> | null = null;

    if (!ticker.trim()) {
      setQuote(null);
      setAnalysis(null);
      setBars(null);
      setDossier(null);
      setFinancials(null);
      setStatus({
        quote: { state: "unavailable", fetchedAt: null },
        analysis: { state: "unavailable", fetchedAt: null },
        bars: { state: "unavailable", fetchedAt: null },
        dossier: { state: "unavailable", fetchedAt: null },
        financials: { state: "unavailable", fetchedAt: null },
      });
      return () => {
        aliveRef.current = false;
      };
    }

    // Reset per ticker.
    setQuote(null);
    setAnalysis(null);
    setBars(null);
    setDossier(null);
    setFinancials(null);
    setStatus({
      quote: { state: "loading", fetchedAt: null },
      analysis: { state: "loading", fetchedAt: null },
      bars: { state: "loading", fetchedAt: null },
      dossier: { state: "loading", fetchedAt: null },
      financials: { state: "loading", fetchedAt: null },
    });

    /* quote — poll every 15s; keep last good value on failures */
    const lastGoodQuote = { current: null as { price: number; currency: string } | null };
    const fetchQuote = async (): Promise<{ price: number; currency: string } | null> => {
      try {
        const { data, error } = await withTimeout(
          governedInvoke("price-feed", { body: { tickers: [ticker] } }),
          10_000,
        );
        const q = data?.prices?.[ticker];
        if (!error && q?.price > 0) {
          const val = { price: q.price, currency: q.currency || "USD" };
          lastGoodQuote.current = val;
          if (aliveRef.current) {
            setQuote(val);
            setSource("quote", "live", Date.now());
          }
          return val;
        }
      } catch {
        /* fall through to stale handling */
      }
      if (aliveRef.current && lastGoodQuote.current) {
        setSource("quote", "cached", null);
      } else if (aliveRef.current) {
        setSource("quote", lastGoodQuote.current ? "cached" : "unavailable", null);
      }
      return lastGoodQuote.current;
    };

    /* bars — cached 12h, stale-on-error */
    const loadBars = async () => {
      const cached = cacheGet<Bars>("bars", ticker);
      if (cached && Date.now() - cached.ts < TTL.bars) {
        setBars(cached.data);
        setSource("bars", "cached", cached.ts);
        return;
      }
      try {
        const { data, error } = await withTimeout(
          governedInvoke("historical-prices", { body: { tickers: [ticker], range: "2y", interval: "1d" } }),
          25_000,
        );
        const b = data?.data?.[ticker];
        if (!error && b?.closes?.length >= 30) {
          cacheSet("bars", ticker, b);
          if (aliveRef.current) {
            setBars(b);
            setSource("bars", "live", Date.now());
          }
          return;
        }
      } catch {
        /* fall through */
      }
      if (!aliveRef.current) return;
      if (cached) {
        setBars(cached.data);
        setSource("bars", "cached", cached.ts);
      } else {
        setSource("bars", "unavailable", null);
      }
    };

    /* analysis — cached 6h; needs a price anchor for a clean neutral run.
       The cache check runs before awaiting the quote so a slow price feed
       never delays cached hydration. */
    const loadAnalysis = async (quotePromise: Promise<{ price: number } | null>) => {
      const cached = cacheGet<DeskAnalysis>("analysis", ticker);
      if (cached && Date.now() - cached.ts < TTL.analysis) {
        setAnalysis(cached.data);
        setSource("analysis", "cached", cached.ts);
        return;
      }
      try {
        const quoteNow = await quotePromise.catch(() => null);
        const anchor = quoteNow?.price ?? cached?.data?.currentPrice ?? 0;
        if (anchor > 0) {
          const { data, error } = await withTimeout(
            governedInvoke("analyze-stock", { body: { ticker, buyPrice: anchor, quantity: 1 } }),
            60_000,
          );
          if (!error && data?.currentPrice > 0 && data?.suggestion) {
            cacheSet("analysis", ticker, data);
            if (aliveRef.current) {
              setAnalysis(data);
              setSource("analysis", "live", Date.now());
            }
            return;
          }
        }
      } catch {
        /* fall through */
      }
      if (!aliveRef.current) return;
      if (cached) {
        setAnalysis(cached.data);
        setSource("analysis", "cached", cached.ts);
      } else {
        setSource("analysis", "unavailable", null);
      }
    };

    /* dossier — cached 24h (shared with desk), stale-on-error */
    const loadDossier = async () => {
      const cached = cacheGet<Dossier>("dossier", ticker);
      if (cached && Date.now() - cached.ts < TTL.dossier) {
        setDossier(cached.data);
        setSource("dossier", "cached", cached.ts);
        return;
      }
      try {
        const provider = (() => {
          try {
            return localStorage.getItem("entropy-ai-provider") || "mistral";
          } catch {
            return "mistral";
          }
        })();
        const { data, error } = await withTimeout(
          governedInvoke("company-intelligence", { body: { ticker, provider } }),
          90_000,
        );
        if (!error && data && !data.error && (data.companyName || data.sector)) {
          cacheSet("dossier", ticker, data);
          if (aliveRef.current) {
            setDossier(data);
            setSource("dossier", "live", Date.now());
          }
          return;
        }
      } catch {
        /* fall through */
      }
      if (!aliveRef.current) return;
      if (cached) {
        setDossier(cached.data);
        setSource("dossier", "cached", cached.ts);
      } else {
        setSource("dossier", "unavailable", null);
      }
    };

    /* financials — real statements; cached 24h, stale-on-error. Until the
       function is deployed a 404 resolves to "unavailable" and the sections
       keep their designed pending state — never an error. */
    const loadFinancials = async () => {
      const cached = cacheGet<Financials>("financials", ticker);
      if (cached && Date.now() - cached.ts < TTL.financials) {
        setFinancials(cached.data);
        setSource("financials", "cached", cached.ts);
        return;
      }
      try {
        const { data, error } = await withTimeout(
          governedInvoke("company-financials", { body: { ticker } }),
          20_000,
        );
        const ok = !error && data && !data.error && (data.income?.length || data.ratios);
        if (ok) {
          cacheSet("financials", ticker, data);
          if (aliveRef.current) {
            setFinancials(data);
            setSource("financials", "live", Date.now());
          }
          return;
        }
      } catch {
        /* fall through */
      }
      if (!aliveRef.current) return;
      if (cached) {
        setFinancials(cached.data);
        setSource("financials", "cached", cached.ts);
      } else {
        setSource("financials", "unavailable", null);
      }
    };

    // Everything runs in parallel; cached sources hydrate instantly and the
    // analysis loader only awaits the quote when its own cache misses.
    const quotePromise = fetchQuote();
    void loadBars();
    void loadDossier();
    void loadFinancials();
    void loadAnalysis(quotePromise);
    quoteInterval = setInterval(fetchQuote, 15000);

    return () => {
      aliveRef.current = false;
      if (quoteInterval) clearInterval(quoteInterval);
    };
  }, [ticker, refreshTick, setSource]);

  const bootstrapping = useMemo(() => {
    const anyData = !!(quote || analysis || bars || dossier || financials);
    const allSettled = Object.values(status).every((s) => s.state !== "loading");
    return !anyData && !allSettled;
  }, [quote, analysis, bars, dossier, financials, status]);

  const refresh = useCallback(() => setRefreshTick((t) => t + 1), []);

  return { quote, analysis, bars, dossier, financials, status, bootstrapping, refresh };
}
