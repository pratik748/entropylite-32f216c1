/**
 * Exit-Signal Engine
 * ──────────────────
 * Decides when a position should be virtually exited to lock in profit
 * (or cut a loss) using REAL historical statistics from the quant engine.
 *
 * Triggers (first one wins):
 *   1. chandelier  — price < peak − k·ATR(14)
 *   2. drawdown    — (peak − price)/peak ≥ max(0.5·σ_daily·√5, 1.5%)
 *   3. momentum    — last log-return z-score < −1.0 AND 5-day slope < 0
 *   4. risk        — analysis.riskScore ≥ 75 AND in profit
 *   5. ai          — analysis.suggestion contains "sell" or "exit"
 *
 * The function is pure: peak tracking is owned by the caller.
 */

import type { AssetStats } from "@/lib/quant-engine";

export type ExitTrigger = "chandelier" | "drawdown" | "momentum" | "risk" | "ai";

export interface ExitDecision {
  trigger: ExitTrigger;
  reason: string;
}

export interface ExitInputs {
  currentPrice: number;
  buyPrice: number;
  peakPrice: number;
  closes?: number[];           // 1y daily closes (most recent last)
  highs?: number[];            // optional; falls back to closes
  lows?: number[];             // optional; falls back to closes
  stats?: AssetStats | null;
  riskScore?: number;
  suggestion?: string;
  aggressiveness?: "conservative" | "balanced" | "aggressive";
  minProfitPct?: number;       // default 0.5 — lock only fires after profit cushion
}

function atr(highs: number[], lows: number[], closes: number[], period = 14): number {
  const n = closes.length;
  if (n < period + 1) return 0;
  const trs: number[] = [];
  for (let i = n - period; i < n; i++) {
    const h = highs[i] ?? closes[i];
    const l = lows[i] ?? closes[i];
    const pc = closes[i - 1];
    const tr = Math.max(h - l, Math.abs(h - pc), Math.abs(l - pc));
    trs.push(tr);
  }
  return trs.reduce((a, b) => a + b, 0) / trs.length;
}

function slope(xs: number[]): number {
  // simple linear regression slope
  const n = xs.length;
  if (n < 2) return 0;
  const meanX = (n - 1) / 2;
  const meanY = xs.reduce((a, b) => a + b, 0) / n;
  let num = 0, den = 0;
  for (let i = 0; i < n; i++) {
    num += (i - meanX) * (xs[i] - meanY);
    den += (i - meanX) ** 2;
  }
  return den === 0 ? 0 : num / den;
}

export function evaluateExit(input: ExitInputs): ExitDecision | null {
  const {
    currentPrice, buyPrice, peakPrice, closes = [], highs, lows,
    stats, riskScore, suggestion,
    aggressiveness = "balanced", minProfitPct = 0.5,
  } = input;

  if (!currentPrice || !buyPrice || currentPrice <= 0 || buyPrice <= 0) return null;
  const pnlPct = ((currentPrice - buyPrice) / buyPrice) * 100;
  const peakPnlPct = ((peakPrice - buyPrice) / buyPrice) * 100;

  // Need a profit cushion to lock — but allow risk/ai signals to trigger even at small loss.
  const inProfit = pnlPct >= minProfitPct;

  // 5. AI sell suggestion
  if (suggestion) {
    const s = suggestion.toLowerCase();
    if (s.includes("sell") || s.includes("exit")) {
      return { trigger: "ai", reason: `AI verdict: ${suggestion}` };
    }
  }

  // 4. Risk regime shift
  if (typeof riskScore === "number" && riskScore >= 75 && pnlPct > 0) {
    return { trigger: "risk", reason: `Risk score ${riskScore.toFixed(0)}/100 with +${pnlPct.toFixed(2)}% on the table` };
  }

  if (!inProfit) return null;

  // 1. Chandelier
  const k = aggressiveness === "conservative" ? 3 : aggressiveness === "aggressive" ? 1.5 : 2.5;
  if (closes.length >= 15) {
    const a = atr(highs ?? closes, lows ?? closes, closes, 14);
    if (a > 0) {
      // Tighten when running well above 1σ_annual gain
      const tighten = stats && peakPnlPct / 100 > stats.sigmaAnnual ? 0.6 : 1.0;
      const stop = peakPrice - k * a * tighten;
      if (currentPrice < stop) {
        return {
          trigger: "chandelier",
          reason: `Trailing stop breached (peak ${peakPrice.toFixed(2)} − ${(k * tighten).toFixed(1)}·ATR ${a.toFixed(2)})`,
        };
      }
    }
  }

  // 2. Volatility-adaptive drawdown from peak
  if (stats && stats.sigma > 0 && peakPrice > 0) {
    const ddThreshold = Math.max(0.5 * stats.sigma * Math.sqrt(5), 0.015);
    const dd = (peakPrice - currentPrice) / peakPrice;
    if (dd >= ddThreshold) {
      return {
        trigger: "drawdown",
        reason: `Drawdown ${(dd * 100).toFixed(2)}% from peak exceeds adaptive limit ${(ddThreshold * 100).toFixed(2)}%`,
      };
    }
  } else if (peakPrice > 0) {
    const dd = (peakPrice - currentPrice) / peakPrice;
    if (dd >= 0.025) {
      return { trigger: "drawdown", reason: `Drawdown ${(dd * 100).toFixed(2)}% from peak` };
    }
  }

  // 3. Momentum reversal
  if (closes.length >= 7 && stats && stats.sigma > 0) {
    const last = closes[closes.length - 1];
    const prev = closes[closes.length - 2];
    if (prev > 0 && last > 0) {
      const lastRet = Math.log(last / prev);
      const z = (lastRet - stats.mu) / stats.sigma;
      const recent = closes.slice(-5);
      const sl = slope(recent);
      if (z < -1.0 && sl < 0) {
        return {
          trigger: "momentum",
          reason: `Momentum reversal (z=${z.toFixed(2)}, 5d slope ${sl.toFixed(3)})`,
        };
      }
    }
  }

  return null;
}
