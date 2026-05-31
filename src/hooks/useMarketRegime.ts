import { useState, useEffect, useRef, useCallback } from "react";
import { governedInvoke } from "@/lib/apiGovernor";
import { hmmRegimeDetect, returns as logReturns } from "@/lib/statarb-math";

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
  hmm?: {
    state: number;
    stateMu: number;
    stateSd: number;
    posterior: number[];
    persistence: number;
    logLik: number;
  };
}

function heuristicRegime(vix: number, moodScore: number, sectors: { changePct: number }[]): RegimeType {
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

/**
 * Map a fitted HMM state to a RegimeType using its learned mean/std relative to peers.
 * `means` and `stds` are state-level parameters from the Baum-Welch fit, expressed in
 * daily log returns. We also blend in VIX so a high-σ state in calm tape is not
 * mislabeled "Crisis".
 */
function mapHmmStateToRegime(stateIdx: number, means: number[], stds: number[], vix: number, moodScore: number): RegimeType {
  // Sort states by mean return: bear (lowest) → neutral → bull (highest)
  const order = means.map((m, i) => ({ i, m, s: stds[i] })).sort((a, b) => a.m - b.m);
  const rank = order.findIndex(o => o.i === stateIdx); // 0 = most bearish
  const sd = stds[stateIdx];
  const avgSd = stds.reduce((a, b) => a + b, 0) / stds.length;
  const highVol = sd > avgSd * 1.4;

  if (vix > 35 || (highVol && rank === 0)) return "Crisis";
  if (vix > 28 || highVol) return "High Volatility";
  if (means.length >= 3) {
    if (rank === 0) return "Trending Bear";
    if (rank === order.length - 1) return "Trending Bull";
    // middle state: rotation if dispersion is high, else range-bound
    return Math.abs(moodScore) < 25 ? "Range-Bound" : "Rotation";
  }
  return rank === 0 ? "Trending Bear" : "Trending Bull";
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

export function useMarketRegime(pollIntervalMs = 15000, refreshKey = 0): MarketRegime | null {
  const [regime, setRegime] = useState<MarketRegime | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval>>();

  const fetchData = useCallback(async () => {
    try {
      const { data, error } = await governedInvoke("market-data", {
        body: {
          tickers: ["^GSPC", "^IXIC", "^DJI", "^N225", "^STOXX50E", "^HSI", "GC=F", "CL=F", "BTC-USD", "ETH-USD", "^TNX", "DX-Y.NYB", "SI=F", "EURUSD=X", "^FTSE"],
          includeHistory: ["^GSPC"],
          historyRange: "1y",
        },
      });
      if (error || !data) return;

      const sectors = (data.sectors || []).map((s: any) => ({ name: s.name, changePct: s.changePct }));
      const macro = data.macro || {};
      const vix = macro.vix || 20;
      const moodScore = macro.moodScore || 0;

      // ── Real Baum-Welch HMM on SPX log-returns ──
      // Fall back to the heuristic only when history is unavailable.
      let hmmInfo: MarketRegime["hmm"] | undefined;
      let detected: RegimeType;
      const spxCloses: number[] | undefined = data.history?.["^GSPC"]?.closes;
      if (spxCloses && spxCloses.length >= 100) {
        try {
          const rets = logReturns(spxCloses);
          const fit = hmmRegimeDetect(rets, 3, 30);
          const tail = fit.regimeProbs[fit.regimeProbs.length - 1];
          const persistence = fit.transitionMatrix[fit.currentRegime][fit.currentRegime];
          hmmInfo = {
            state: fit.currentRegime,
            stateMu: fit.means[fit.currentRegime],
            stateSd: fit.stds[fit.currentRegime],
            posterior: tail,
            persistence,
            logLik: fit.logLik,
          };
          detected = mapHmmStateToRegime(fit.currentRegime, fit.means, fit.stds, vix, moodScore);
        } catch (e) {
          console.warn("HMM regime fit failed, using heuristic:", e);
          detected = heuristicRegime(vix, moodScore, sectors);
        }
      } else {
        detected = heuristicRegime(vix, moodScore, sectors);
      }
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
        hmm: hmmInfo,
      });
    } catch (e) {
      console.error("Market regime fetch error:", e);
    }
  }, []);

  useEffect(() => {
    fetchData();
    timerRef.current = setInterval(fetchData, pollIntervalMs);
    return () => clearInterval(timerRef.current);
  }, [fetchData, pollIntervalMs, refreshKey]);

  return regime;
}
