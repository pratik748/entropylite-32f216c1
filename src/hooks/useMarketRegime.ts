import { useState, useEffect, useRef, useCallback } from "react";
import { governedInvoke } from "@/lib/apiGovernor";

export type RegimeType =
  | "Trending Bull"
  | "Trending Bear"
  | "High Volatility"
  | "Range-Bound"
  | "Crisis"
  | "Rotation";

export interface DetectedCondition {
  id: string;
  label: string;
  severity: "low" | "medium" | "high";
}

export interface MarketRegime {
  regime: RegimeType;
  vix: number;
  moodScore: number;
  sectors: { name: string; changePct: number }[];
  keyEvents: string[];
  outlook: string;
  conditions: DetectedCondition[];
  topMovers: { name: string; change: number }[];
  goldPrice: number;
  btcUsd: number;
  timestamp: number;
}

function classifyRegime(vix: number, moodScore: number, sectors: { changePct: number }[]): RegimeType {
  const avgSectorChange = sectors.length > 0
    ? sectors.reduce((s, x) => s + x.changePct, 0) / sectors.length
    : 0;
  const sectorSpread = sectors.length > 1
    ? Math.max(...sectors.map(s => s.changePct)) - Math.min(...sectors.map(s => s.changePct))
    : 0;

  if (vix > 35) return "Crisis";
  if (vix > 30) return "High Volatility";
  if (sectorSpread > 5 && Math.abs(avgSectorChange) < 1.5) return "Rotation";
  if (vix < 18 && Math.abs(avgSectorChange) < 0.5) return "Range-Bound";
  if (moodScore > 20 && avgSectorChange > 0.3) return "Trending Bull";
  if (moodScore < -20 && avgSectorChange < -0.3) return "Trending Bear";
  if (avgSectorChange > 0.5) return "Trending Bull";
  if (avgSectorChange < -0.5) return "Trending Bear";
  return "Range-Bound";
}

function detectConditions(vix: number, moodScore: number, sectors: { name: string; changePct: number }[]): DetectedCondition[] {
  const conds: DetectedCondition[] = [];
  if (vix > 30) conds.push({ id: "vol-spike", label: "Volatility Spike", severity: "high" });
  else if (vix < 15) conds.push({ id: "vol-compress", label: "Volatility Compression", severity: "medium" });

  if (moodScore < -60) conds.push({ id: "fear", label: "Extreme Fear", severity: "high" });
  else if (moodScore > 60) conds.push({ id: "greed", label: "Extreme Greed", severity: "medium" });

  const gainers = sectors.filter(s => s.changePct > 1).length;
  const losers = sectors.filter(s => s.changePct < -1).length;
  if (gainers > 0 && losers > 0 && Math.abs(gainers - losers) <= 2) {
    conds.push({ id: "rotation", label: "Sector Rotation", severity: "medium" });
  }

  const allDown = sectors.every(s => s.changePct < -0.5);
  if (allDown) conds.push({ id: "corr-selloff", label: "Correlated Selloff", severity: "high" });

  const bigMover = sectors.find(s => Math.abs(s.changePct) > 4);
  if (bigMover) conds.push({ id: "sector-break", label: `${bigMover.name} Breakout`, severity: "high" });

  return conds;
}

export function useMarketRegime(pollIntervalMs = 15000): MarketRegime | null {
  const [regime, setRegime] = useState<MarketRegime | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval>>();

  const fetchData = useCallback(async () => {
    try {
      const { data, error } = await governedInvoke("market-data", {
        body: {
          tickers: ["^GSPC", "^IXIC", "^DJI", "^N225", "^STOXX50E", "^HSI", "GC=F", "CL=F", "BTC-USD", "ETH-USD", "^TNX", "DX-Y.NYB", "SI=F", "EURUSD=X", "^FTSE"],
        },
      });
      if (error || !data) return;

      const sectors = (data.sectors || []).map((s: any) => ({ name: s.name, changePct: s.changePct }));
      const macro = data.macro || {};
      const vix = macro.vix || 20;
      const moodScore = macro.moodScore || 0;

      const detected = classifyRegime(vix, moodScore, sectors);
      const conditions = detectConditions(vix, moodScore, sectors);

      setRegime({
        regime: detected,
        vix,
        moodScore,
        sectors,
        keyEvents: macro.keyEvents || [],
        outlook: macro.outlook || "",
        conditions,
        topMovers: macro.topMovers || [],
        goldPrice: macro.goldPrice || 0,
        btcUsd: macro.btcUsd || 0,
        timestamp: Date.now(),
      });
    } catch (e) {
      console.error("Market regime fetch error:", e);
    }
  }, []);

  useEffect(() => {
    fetchData();
    timerRef.current = setInterval(fetchData, pollIntervalMs);
    return () => clearInterval(timerRef.current);
  }, [fetchData, pollIntervalMs]);

  return regime;
}
