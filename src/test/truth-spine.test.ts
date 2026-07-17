/**
 * Truth-spine consistency tests.
 *
 * The single most important invariant after the credibility rebuild:
 * the EDGE canonical stats (supabase/functions/_shared/stats.ts) and the
 * CLIENT canonical stats (src/lib/quant-engine.ts) must produce IDENTICAL
 * numbers for the same input series. If these tests fail, the system has
 * re-grown a second definition of truth somewhere.
 */
import { describe, it, expect } from "vitest";

import {
  mean as edgeMean,
  sampleStd,
  logReturns as edgeLogReturns,
  sharpeRatio as edgeSharpe,
  sortinoRatio as edgeSortino,
  maxDrawdown as edgeMaxDD,
  annualizedVol as edgeAnnVol,
  historicalVaRCVaR,
  ANNUAL_RISK_FREE as EDGE_RF,
} from "../../supabase/functions/_shared/stats";

import {
  mean as clientMean,
  stdev as clientStdev,
  logReturns as clientLogReturns,
  sharpe as clientSharpe,
  sortino as clientSortino,
  maxDrawdown as clientMaxDD,
  historicalVaR,
  historicalCVaR,
  ANNUAL_RISK_FREE as CLIENT_RF,
  TRADING_DAYS,
} from "../lib/quant-engine";

/** Deterministic pseudo-random walk (LCG) — no Math.random in tests. */
function lcgCloses(n: number, seed = 42, drift = 0.0004, vol = 0.015): number[] {
  let s = seed;
  const next = () => {
    s = (s * 1103515245 + 12345) % 2147483648;
    return s / 2147483648;
  };
  const closes = [100];
  for (let i = 0; i < n; i++) {
    // Box-Muller-lite via two uniforms
    const u1 = Math.max(next(), 1e-12);
    const u2 = next();
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    closes.push(closes[closes.length - 1] * Math.exp(drift + vol * z));
  }
  return closes;
}

describe("edge/client truth-spine agreement", () => {
  const closes = lcgCloses(252);

  it("shares one risk-free convention", () => {
    expect(EDGE_RF).toBe(CLIENT_RF);
  });

  it("computes identical log returns", () => {
    expect(edgeLogReturns(closes)).toEqual(clientLogReturns(closes));
  });

  it("computes identical mean and sample stdev", () => {
    const rets = clientLogReturns(closes);
    expect(edgeMean(rets)).toBeCloseTo(clientMean(rets), 12);
    expect(sampleStd(rets)).toBeCloseTo(clientStdev(rets), 12);
  });

  it("computes identical annualized Sharpe", () => {
    const rets = clientLogReturns(closes);
    expect(edgeSharpe(rets)).toBeCloseTo(clientSharpe(rets), 12);
  });

  it("computes identical annualized Sortino", () => {
    const rets = clientLogReturns(closes);
    expect(edgeSortino(rets)).toBeCloseTo(clientSortino(rets), 12);
  });

  it("computes the same max drawdown (client is negative, edge positive)", () => {
    expect(edgeMaxDD(closes)).toBeCloseTo(-clientMaxDD(closes), 12);
  });

  it("computes identical historical VaR/CVaR at 95%", () => {
    const rets = clientLogReturns(closes);
    const notional = 1_000_000;
    const { varPct, cvarPct } = historicalVaRCVaR(rets, 0.95);
    expect(notional * varPct).toBeCloseTo(historicalVaR(notional, rets, 0.95), 6);
    expect(notional * cvarPct).toBeCloseTo(historicalCVaR(notional, rets, 0.95), 6);
  });

  it("annualizes vol with √252 sample stdev", () => {
    const rets = clientLogReturns(closes);
    expect(edgeAnnVol(rets)).toBeCloseTo(clientStdev(rets) * Math.sqrt(TRADING_DAYS), 12);
  });
});

describe("canonical conventions hold on degenerate inputs", () => {
  it("returns 0 vol for constant series (n < 2 returns)", () => {
    expect(sampleStd([])).toBe(0);
    expect(sampleStd([0.01])).toBe(0);
  });

  it("skips non-positive prices in log returns", () => {
    expect(edgeLogReturns([100, 0, 110])).toEqual([]);
    expect(edgeLogReturns([100, 110])).toHaveLength(1);
  });

  it("refuses VaR on tiny samples instead of fabricating it", () => {
    const { varPct, cvarPct } = historicalVaRCVaR([0.01, -0.02, 0.005], 0.95);
    expect(varPct).toBe(0);
    expect(cvarPct).toBe(0);
  });

  it("drawdown of a monotonic rally is 0, not negative-noise", () => {
    expect(edgeMaxDD([1, 2, 3, 4, 5])).toBe(0);
  });
});
