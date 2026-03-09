import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import { governedInvoke } from "@/lib/apiGovernor";
import { toast } from "@/hooks/use-toast";
import type { PortfolioStock } from "@/components/PortfolioPanel";

export interface ConflictEvent {
  name: string; lat: number; lng: number; severity: number; type: string;
  affectedAssets: string[]; summary: string; nearTradeHub?: string;
  distanceKm?: number; escalationProb?: number; actionableIntel?: string;
}

export interface GeoData {
  conflictEvents: ConflictEvent[];
  forexVolatility: any[];
  highEntropyZones: any[];
  tradeHubs: any[];
  supplyChainRisks: any[];
  globalRiskScore: number;
  regimeSignal: string;
  capitalFlowDirection: string;
  safeHavenDemand?: string;
  intelligenceSummary?: string;
  keyThreats: string[];
  timestamp: number;
}

export interface TickerThreat {
  ticker: string;
  threatLevel: "critical" | "high" | "medium" | "low" | "none";
  score: number; // 0-100
  threats: string[];
  topConflict?: string;
}

const POLL_INTERVAL = 20_000; // 20s — near real-time geo updates

function stripSuffix(ticker: string): string {
  return ticker.replace(/\.(NS|BO|L|T|TYO|HK|SS|SZ|DE|F|PA)$/i, "").replace(/[-=].*$/, "");
}

function computeTickerThreats(stocks: PortfolioStock[], data: GeoData | null): Record<string, TickerThreat> {
  if (!data) return {};
  const result: Record<string, TickerThreat> = {};

  for (const stock of stocks) {
    const bare = stripSuffix(stock.ticker);
    const matchingConflicts = data.conflictEvents.filter(c =>
      c.affectedAssets?.some(a => {
        const al = a.toLowerCase(), tl = stock.ticker.toLowerCase(), bl = bare.toLowerCase();
        return al === tl || al === bl || tl.includes(al) || al.includes(bl);
      })
    );

    // Also check entropy zones
    const matchingZones = data.highEntropyZones.filter((z: any) =>
      z.affectedCurrencies?.some((cur: string) => {
        const tickerCur = stock.analysis?.currency;
        return tickerCur && cur === tickerCur;
      })
    );

    const threats: string[] = [];
    let score = 0;

    for (const c of matchingConflicts) {
      score += c.severity * 40 + (c.escalationProb || 0) * 30;
      threats.push(`${c.name} (${c.type})`);
    }

    for (const z of matchingZones) {
      score += z.severity * 15;
      threats.push(`FX stress: ${z.name}`);
    }

    // Cap at 100
    score = Math.min(100, Math.round(score));

    const threatLevel: TickerThreat["threatLevel"] =
      score >= 70 ? "critical" : score >= 45 ? "high" : score >= 20 ? "medium" : score > 0 ? "low" : "none";

    result[stock.ticker] = {
      ticker: stock.ticker,
      threatLevel,
      score,
      threats,
      topConflict: matchingConflicts[0]?.name,
    };
  }

  return result;
}

export function useGeoIntelligence(stocks: PortfolioStock[], refreshKey = 0) {
  const [data, setData] = useState<GeoData | null>(null);
  const [loading, setLoading] = useState(true);
  const prevDataRef = useRef<GeoData | null>(null);
  const alertedRef = useRef<Set<string>>(new Set());

  const fetchData = useCallback(async (showLoading = true) => {
    if (showLoading) setLoading(true);
    try {
      const { data: result, error } = await governedInvoke("geopolitical-data");
      if (error) throw error;

      // Detect escalations vs previous data
      if (prevDataRef.current && result) {
        detectEscalations(prevDataRef.current, result);
      }

      prevDataRef.current = result;
      setData(result);
    } catch (e) {
      console.error("Geo fetch error:", e);
    } finally {
      setLoading(false);
    }
  }, []);

  // Detect and alert on escalations
  const detectEscalations = useCallback((prev: GeoData, next: GeoData) => {
    // 1. Global risk spike
    if (next.globalRiskScore - prev.globalRiskScore >= 10) {
      toast({
        title: "⚠️ Global Risk Spike",
        description: `Risk score surged from ${prev.globalRiskScore} → ${next.globalRiskScore}. Regime: ${next.regimeSignal}`,
        variant: "destructive",
      });
    }

    // 2. Regime change
    if (prev.regimeSignal !== next.regimeSignal) {
      const isWorse = next.regimeSignal === "crisis" || (next.regimeSignal === "transition" && prev.regimeSignal === "stable");
      if (isWorse) {
        toast({
          title: "🔴 Regime Shift Detected",
          description: `Market regime changed: ${prev.regimeSignal} → ${next.regimeSignal}. ${next.capitalFlowDirection === "risk-off" ? "Capital fleeing to safe havens." : ""}`,
          variant: "destructive",
        });
      }
    }

    // 3. New conflicts or severity spikes
    for (const conflict of next.conflictEvents) {
      const prevConflict = prev.conflictEvents.find(c => c.name === conflict.name);
      const alertKey = `${conflict.name}-${Math.round(conflict.severity * 10)}`;

      if (!prevConflict && !alertedRef.current.has(alertKey)) {
        alertedRef.current.add(alertKey);
        toast({
          title: `🆕 New Threat: ${conflict.name}`,
          description: `Severity: ${(conflict.severity * 100).toFixed(0)}% — ${conflict.summary?.slice(0, 100)}`,
        });
      } else if (prevConflict && conflict.severity - prevConflict.severity >= 0.15 && !alertedRef.current.has(alertKey)) {
        alertedRef.current.add(alertKey);
        toast({
          title: `📈 Escalation: ${conflict.name}`,
          description: `Severity increased ${(prevConflict.severity * 100).toFixed(0)}% → ${(conflict.severity * 100).toFixed(0)}%${conflict.actionableIntel ? `. ${conflict.actionableIntel}` : ""}`,
          variant: "destructive",
        });
      }
    }

    // 4. Portfolio-specific threat alerts
    for (const stock of stocks) {
      const bare = stripSuffix(stock.ticker);
      const newThreats = next.conflictEvents.filter(c =>
        c.affectedAssets?.some(a => a.toLowerCase().includes(bare.toLowerCase()) || bare.toLowerCase().includes(a.toLowerCase()))
      );
      const oldThreats = prev.conflictEvents.filter(c =>
        c.affectedAssets?.some(a => a.toLowerCase().includes(bare.toLowerCase()) || bare.toLowerCase().includes(a.toLowerCase()))
      );

      if (newThreats.length > oldThreats.length) {
        const newOnes = newThreats.filter(n => !oldThreats.some(o => o.name === n.name));
        for (const threat of newOnes) {
          const key = `portfolio-${stock.ticker}-${threat.name}`;
          if (!alertedRef.current.has(key)) {
            alertedRef.current.add(key);
            toast({
              title: `🎯 ${stock.ticker} Under Threat`,
              description: `${threat.name} now affects your position.${threat.actionableIntel ? ` Intel: ${threat.actionableIntel}` : ""}`,
              variant: "destructive",
            });
          }
        }
      }
    }
  }, [stocks]);

  // Poll on mount + interval + refreshKey change
  useEffect(() => {
    fetchData();
    const i = setInterval(() => fetchData(false), POLL_INTERVAL);
    return () => clearInterval(i);
  }, [fetchData, refreshKey]);

  // Compute ticker-level threat scores
  const tickerThreats = useMemo(() => computeTickerThreats(stocks, data), [stocks, data]);

  // Exposed tickers (those affected by conflicts)
  const exposedTickers = useMemo(() => {
    if (!data) return [];
    return stocks.filter(s => s.analysis && data.conflictEvents.some(c =>
      c.affectedAssets?.some(a => s.ticker.includes(a) || a.includes(stripSuffix(s.ticker)))
    )).map(s => s.ticker);
  }, [stocks, data]);

  return {
    data,
    loading,
    tickerThreats,
    exposedTickers,
    refresh: fetchData,
  };
}
