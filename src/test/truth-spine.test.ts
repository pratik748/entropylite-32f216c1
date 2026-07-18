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
  sharpeWithSE as edgeSharpeSE,
  volWithSE as edgeVolSE,
  betaRegression as edgeBetaReg,
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

import { RISK_FREE_SNAPSHOT as EDGE_RF_TABLE, riskFreeFor as edgeRiskFreeFor } from "../../supabase/functions/_shared/riskFree";
import { RISK_FREE_SNAPSHOT as CLIENT_RF_TABLE, riskFreeFor as clientRiskFreeFor } from "../lib/riskFree";
import { sharpeWithSE as clientSharpeSE, volWithSE as clientVolSE, betaRegression as clientBetaReg } from "../lib/quant-engine";

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

describe("uncertainty estimators agree across spines and behave sanely", () => {
  const closes = lcgCloses(252, 7);
  const rets = clientLogReturns(closes);
  const benchCloses = lcgCloses(252, 99, 0.0003, 0.01);
  const benchRets = clientLogReturns(benchCloses);

  it("Sharpe SE identical on both spines and shrinks with sample size", () => {
    const e = edgeSharpeSE(rets)!;
    const c = clientSharpeSE(rets)!;
    expect(e.sharpe).toBeCloseTo(c.sharpe, 12);
    expect(e.se).toBeCloseTo(c.se, 12);
    const short = clientSharpeSE(rets.slice(0, 60))!;
    expect(short.se).toBeGreaterThan(c.se);
  });

  it("vol SE identical on both spines", () => {
    const e = edgeVolSE(rets)!;
    const c = clientVolSE(rets)!;
    expect(e.vol).toBeCloseTo(c.vol, 12);
    expect(e.se).toBeCloseTo(c.se, 12);
  });

  it("beta regression identical on both spines with a finite CI", () => {
    const e = edgeBetaReg(rets, benchRets)!;
    const c = clientBetaReg(rets, benchRets)!;
    expect(e.beta).toBeCloseTo(c.beta, 12);
    expect(e.se).toBeCloseTo(c.se, 12);
    expect(e.ci95[0]).toBeLessThan(e.beta);
    expect(e.ci95[1]).toBeGreaterThan(e.beta);
  });

  it("uncertainty functions refuse tiny samples instead of guessing", () => {
    expect(clientSharpeSE(rets.slice(0, 10))).toBeNull();
    expect(clientVolSE(rets.slice(0, 5))).toBeNull();
    expect(clientBetaReg(rets.slice(0, 10), benchRets.slice(0, 10))).toBeNull();
  });

  it("regression of a series on itself has beta 1 and R² 1", () => {
    const r = clientBetaReg(rets, rets)!;
    expect(r.beta).toBeCloseTo(1, 9);
    expect(r.r2).toBeCloseTo(1, 9);
  });
});

describe("risk-free architecture", () => {
  it("edge and client snapshots are identical (mirrored modules)", () => {
    expect(CLIENT_RF_TABLE).toEqual(EDGE_RF_TABLE);
  });

  it("resolves per-currency rates and never silently shares them", () => {
    expect(edgeRiskFreeFor("INR").annualRate).not.toBe(edgeRiskFreeFor("USD").annualRate);
    expect(clientRiskFreeFor("INR")).toEqual(edgeRiskFreeFor("INR"));
  });

  it("declares USD fallback for unknown currencies instead of hiding it", () => {
    const r = edgeRiskFreeFor("XXX");
    expect(r.currency).toBe("USD");
    expect(r.fallbackFrom).toBe("XXX");
  });

  it("every snapshot entry carries provenance (asOf, source, basis)", () => {
    for (const rate of Object.values(EDGE_RF_TABLE)) {
      expect(rate.asOf).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(rate.source.length).toBeGreaterThan(10);
      expect(rate.basis).toBe("static_snapshot");
    }
  });

  it("the default ANNUAL_RISK_FREE equals the USD snapshot on both spines", () => {
    expect(EDGE_RF).toBe(edgeRiskFreeFor("USD").annualRate);
    expect(CLIENT_RF).toBe(clientRiskFreeFor("USD").annualRate);
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
