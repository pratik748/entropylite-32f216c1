import { useState, useEffect, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface CompanyIntelligence {
  companyName: string;
  sector: string;
  industry: string;
  headquarters: string;
  founded: string;
  overview: string;
  marketCap: string;
  employees: string;
  revenueSegments: { segment: string; percentage: number; trend: string }[];
  geographicRevenue: { region: string; percentage: number }[];
  supplyChain: {
    suppliers: { name: string; role: string; riskLevel: string }[];
    distributors: { name: string; region: string }[];
    manufacturers: { name: string; type: string; location: string }[];
  };
  ownership: {
    insiderPct: number;
    institutionalPct: number;
    retailPct: number;
    topHolders: { name: string; type: string; pct: number; trend: string }[];
  };
  leadership: { name: string; role: string; since: string; background: string; previousCompanies: string[]; educationBackground: string; boardMemberships: string[]; leadershipStyle: string }[];
  partnerships: { partner: string; type: string; description: string; revenueImpact: string; expirationRisk: string }[];
  competitors: { name: string; ticker: string; marketShare: number; threat: string; strengths: string }[];
  products: { name: string; lifecycle: string; revenueContribution: number; description: string }[];
  regulatoryExposure: { issue: string; severity: string; region: string; status: string }[];
  insiderActivity: { name: string; role: string; action: string; shares: number; date: string; signal: string }[];
  narrative: {
    newsSentiment: number;
    socialSentiment: number;
    analystConsensus: string;
    earningsTone: string;
    narrativeShifts: string[];
    analystTargets: { low: number; median: number; high: number };
  };
  signals: {
    supplyChainRisk: number;
    ownershipStability: number;
    competitiveMoat: number;
    regulatoryRisk: number;
    insiderConfidence: number;
    narrativeMomentum: number;
  };
}

const CACHE_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const CACHE_PREFIX = "ci_dossier_";

function getCachedIntel(ticker: string, allowStale = false): CompanyIntelligence | null {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + ticker.toUpperCase());
    if (!raw) return null;
    const { data, ts } = JSON.parse(raw);
    if (!allowStale && Date.now() - ts > CACHE_TTL_MS) {
      // Keep the stale entry in storage — it is the fallback when the live
      // fetch fails. It is only replaced by a successful refresh.
      return null;
    }
    return data;
  } catch {
    return null;
  }
}

function setCachedIntel(ticker: string, data: CompanyIntelligence) {
  try {
    localStorage.setItem(
      CACHE_PREFIX + ticker.toUpperCase(),
      JSON.stringify({ data, ts: Date.now() })
    );
  } catch { /* storage full, ignore */ }
}

export function useCompanyIntelligence(ticker: string | null) {
  const [data, setData] = useState<CompanyIntelligence | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastTicker = useRef<string | null>(null);

  useEffect(() => {
    if (!ticker) return;

    // Check 24h localStorage cache first
    const cached = getCachedIntel(ticker);
    if (cached) {
      setData(cached);
      setLoading(false);
      setError(null);
      lastTicker.current = ticker;
      return;
    }

    // Prevent duplicate fetches for same ticker
    if (ticker === lastTicker.current && data) return;
    lastTicker.current = ticker;

    let alive = true;
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    // 90-second timeout for long AI generations
    const timeout = setTimeout(() => controller.abort(), 90_000);

    const provider = (() => {
      try { return localStorage.getItem("entropy-ai-provider") || "mistral"; } catch { return "mistral"; }
    })();

    // On any failure, fall back to the last good dossier (however old)
    // before surfacing an error — a stale dossier beats an error card.
    const failWithFallback = () => {
      if (!alive) return;
      const stale = getCachedIntel(ticker, true);
      if (stale) {
        setData(stale);
        setError(null);
      } else {
        setError("Intelligence is re-syncing — this fills in automatically on the next pass.");
      }
      setLoading(false);
    };

    supabase.functions.invoke("company-intelligence", {
      body: { ticker, provider },
    }).then(({ data: result, error: err }) => {
      clearTimeout(timeout);
      if (!alive) return;
      if (err || !result || (result as { error?: string }).error) {
        failWithFallback();
        return;
      }
      setCachedIntel(ticker, result);
      setData(result);
      setLoading(false);
    }).catch(() => {
      clearTimeout(timeout);
      failWithFallback();
    });

    return () => { alive = false; clearTimeout(timeout); };
  }, [ticker]);

  return { data, loading, error };
}
