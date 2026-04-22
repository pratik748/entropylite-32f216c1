import { useCallback, useState } from "react";
import { useHistoricalPrices } from "@/hooks/useHistoricalPrices";
import { computeAssetStats } from "@/lib/quant-engine";
import { type ScarBias } from "@/components/sandbox/ScarMemory";
import { kellySize } from "@/lib/lodgers-math";
import { type RegimeType } from "@/hooks/useMarketRegime";

export type ValidatorVerdict = "GO" | "SHRINK" | "SKIP";

export interface ValidatorResult {
  ticker: string;
  verdict: ValidatorVerdict;
  edgeScore: number;        // 0..100
  pHitTarget: number;       // probability of hitting +target%
  expectedReturnPct: number;
  expectedHoldMin: number;
  cvar5Pct: number;         // expected shortfall, %
  sizePct: number;          // suggested position size as % of capital
  capitalAtRisk: number;
  reasoning: string;
  paths: { tMin: number; p10: number; p50: number; p90: number }[];
  vol: number;              // σ at entry (intraday %)
  liquidityScore: number;   // 0..1 proxy
  reflexScore: number;      // 0..1 proxy
  regime: string;
}

const REGIME_DRIFT: Record<string, number> = {
  "Trending Bull": 0.0008,
  "Trending Bear": -0.0008,
  "High Volatility": 0,
  "Range-Bound": 0,
  "Crisis": -0.0015,
  "Rotation": 0,
  "unknown": 0,
};

/** Box-Muller normal sample */
function randn(): number {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

export function useIntradayValidator() {
  const { prices, fetchHistorical } = useHistoricalPrices();
  const [validating, setValidating] = useState(false);
  const [result, setResult] = useState<ValidatorResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const validate = useCallback(async (opts: {
    ticker: string;
    capital: number;
    targetPct: number;       // e.g. 1.5 (= +1.5%)
    horizonMin: number;      // e.g. 30
    stopPct: number;         // e.g. 0.8
    regime: RegimeType | "unknown";
    scarBiases: ScarBias[];
    dailyBudgetPct: number;  // residual loss budget
  }) => {
    setValidating(true);
    setError(null);
    setResult(null);
    try {
      await fetchHistorical([opts.ticker], "1y");
      const series = prices[opts.ticker];
      if (!series || series.closes.length < 30) {
        // Re-fetch path may have updated state; one micro-delay then retry once
        await new Promise(r => setTimeout(r, 500));
      }
      const s = (prices[opts.ticker] || series);
      if (!s || s.closes.length < 30) {
        throw new Error("Insufficient historical data for micro-sim. Try a more liquid ticker.");
      }
      const stats = computeAssetStats(opts.ticker, s);
      if (!stats) throw new Error("Could not compute base stats.");

      // Convert daily σ to intraday-step σ. Assume ~26 thirty-minute steps per session.
      // step σ = daily σ / √steps; here use per-minute approximation.
      const steps = Math.max(5, Math.round(opts.horizonMin / 5)); // 5-min steps
      const stepsPerDay = 78; // 6.5h × 12 5-min bars
      const stepSigma = stats.sigma / Math.sqrt(stepsPerDay / steps); // σ per simulation step
      const stepMu = (REGIME_DRIFT[opts.regime] ?? 0) + stats.mu / (stepsPerDay / steps);

      // Reflexivity & liquidity scoring (proxies)
      const recentVol = stats.sigmaAnnual; // annualized
      const liquidityScore = Math.min(1, Math.max(0.1, (s.volumes?.slice(-20).reduce((a, b) => a + b, 0) || 0) / 1e8));
      const reflexScore = Math.min(1, Math.max(0.1, recentVol * 2)); // rough proxy: high vol → high reflexivity

      // Slippage: spread proxy = max(2 bps, vol-scaled)
      const slippageBpsPerSide = Math.max(2, recentVol * 50);
      const slippageDecimal = (slippageBpsPerSide * 2) / 10_000; // round-trip

      // Reflexive impact term: own size punishes price (we ignore size here, just regime drag)
      const impactDrag = -reflexScore * stepSigma * 0.05;

      // 2,000-path GBM sim
      const N_PATHS = 2000;
      const finalReturns: number[] = new Array(N_PATHS);
      const stepReturns: number[][] = Array.from({ length: steps }, () => []);
      let hits = 0;
      const targetLog = Math.log(1 + opts.targetPct / 100);
      const stopLog = Math.log(1 - opts.stopPct / 100);
      let totalHoldMin = 0;
      let hitsCounted = 0;
      for (let p = 0; p < N_PATHS; p++) {
        let lr = 0;
        let hitTarget = false;
        let hitStop = false;
        let stepsTaken = steps;
        for (let k = 0; k < steps; k++) {
          lr += (stepMu + impactDrag) + stepSigma * randn();
          stepReturns[k].push(lr);
          if (!hitTarget && !hitStop) {
            if (lr >= targetLog) { hitTarget = true; stepsTaken = k + 1; }
            else if (lr <= stopLog) { hitStop = true; stepsTaken = k + 1; }
          }
        }
        const ret = (Math.exp(lr) - 1) * 100 - slippageDecimal * 100;
        finalReturns[p] = ret;
        if (hitTarget) {
          hits++;
          totalHoldMin += (stepsTaken / steps) * opts.horizonMin;
          hitsCounted++;
        }
      }

      const pHit = hits / N_PATHS;
      const expected = finalReturns.reduce((s, r) => s + r, 0) / N_PATHS;
      const sortedFinal = [...finalReturns].sort((a, b) => a - b);
      const cvarCutoff = Math.max(1, Math.floor(0.05 * N_PATHS));
      const cvar5 = sortedFinal.slice(0, cvarCutoff).reduce((s, r) => s + r, 0) / cvarCutoff;
      const expectedHold = hitsCounted > 0 ? totalHoldMin / hitsCounted : opts.horizonMin;

      // Path quantiles for chart
      const stepLabels = Array.from({ length: steps }, (_, i) => Math.round(((i + 1) / steps) * opts.horizonMin));
      const pathsOut = stepLabels.map((tMin, i) => {
        const sorted = [...stepReturns[i]].sort((a, b) => a - b);
        const q = (p: number) => (Math.exp(sorted[Math.floor(p * sorted.length)] || 0) - 1) * 100;
        return { tMin, p10: q(0.1), p50: q(0.5), p90: q(0.9) };
      });

      // Scar penalty for this ticker
      const scar = opts.scarBiases.find(b => b.ticker.toUpperCase() === opts.ticker.toUpperCase());
      const scarPenalty = scar?.penalty ?? 0;

      // Edge score blends p(hit), payoff/loss, cvar, scar, reflexivity penalty
      const payoffLossRatio = Math.max(0.1, opts.targetPct / Math.max(0.1, opts.stopPct));
      const rawEdge = (pHit * payoffLossRatio - (1 - pHit)) * 100; // can be negative
      const reflexPenalty = reflexScore * 5;
      const edgeScore = Math.max(0, Math.min(100, rawEdge - reflexPenalty - scarPenalty * 30));

      // Sizing
      const { sizePct, capitalAtRisk, reasoning: sizingReason } = kellySize({
        pHit,
        payoff: opts.targetPct,
        loss: opts.stopPct,
        capital: opts.capital,
        stopPct: opts.stopPct,
        dailyBudgetPct: opts.dailyBudgetPct,
        scarPenalty,
      });

      // Verdict
      let verdict: ValidatorVerdict = "SKIP";
      let reasoning = sizingReason;
      if (edgeScore >= 35 && sizePct >= 0.05) {
        verdict = "GO";
        reasoning = `Strong edge (${edgeScore.toFixed(0)}/100) with workable size. ${sizingReason}`;
      } else if (edgeScore >= 18 && sizePct >= 0.02) {
        verdict = "SHRINK";
        reasoning = `Marginal edge — half-size only. ${sizingReason}`;
      } else {
        verdict = "SKIP";
        reasoning = edgeScore < 18
          ? `Edge ${edgeScore.toFixed(0)}/100 below threshold.`
          : `Size too small (${(sizePct * 100).toFixed(2)}%) given budget.`;
      }

      const out: ValidatorResult = {
        ticker: opts.ticker,
        verdict,
        edgeScore,
        pHitTarget: pHit,
        expectedReturnPct: expected,
        expectedHoldMin: expectedHold,
        cvar5Pct: cvar5,
        sizePct,
        capitalAtRisk,
        reasoning,
        paths: pathsOut,
        vol: stats.sigma * 100,
        liquidityScore,
        reflexScore,
        regime: opts.regime,
      };
      setResult(out);
      return out;
    } catch (e: any) {
      setError(e?.message || "Validator failed.");
      return null;
    } finally {
      setValidating(false);
    }
  }, [prices, fetchHistorical]);

  return { validate, validating, result, error, reset: () => { setResult(null); setError(null); } };
}