import { useState, useEffect, useRef } from "react";
import { governedInvoke } from "@/lib/apiGovernor";

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

const tickerCache = new Map<string, CompanyIntelligence>();

export function useCompanyIntelligence(ticker: string | null) {
  const [data, setData] = useState<CompanyIntelligence | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const lastTicker = useRef<string | null>(null);

  useEffect(() => {
    if (!ticker || ticker === lastTicker.current) return;
    lastTicker.current = ticker;

    // Check local cache
    const cached = tickerCache.get(ticker);
    if (cached) {
      setData(cached);
      setLoading(false);
      setError(null);
      return;
    }

    let alive = true;
    setLoading(true);
    setError(null);

    governedInvoke<CompanyIntelligence>("company-intelligence", {
      body: { ticker },
      tier: "slow",
    }).then(({ data: result, error: err }) => {
      if (!alive) return;
      if (err || !result || result.error) {
        setError(err?.message || (result as any)?.error || "Failed to load intelligence");
        setLoading(false);
        return;
      }
      tickerCache.set(ticker, result);
      setData(result);
      setLoading(false);
    });

    return () => { alive = false; };
  }, [ticker]);

  return { data, loading, error };
}
