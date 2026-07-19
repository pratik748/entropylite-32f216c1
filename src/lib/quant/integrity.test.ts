import { describe, it, expect } from "vitest";
import {
  kupiecBacktest, chi2Sf1, sharpeReport, sampleMoments, volatilityCI, chi2QuantileWH,
} from "./integrity";
import { ridgeOls } from "./factor-model";

/** Deterministic noise, no Math.random. */
const noise = (t: number, scale: number) => Math.sin(t * 12.9898 + 78.233) * scale;

describe("chi2Sf1", () => {
  it("matches known χ²(1) tail probabilities", () => {
    expect(chi2Sf1(3.841)).toBeCloseTo(0.05, 2); // 95% critical value
    expect(chi2Sf1(6.635)).toBeCloseTo(0.01, 2); // 99% critical value
    expect(chi2Sf1(0)).toBe(1);
  });
});

describe("kupiecBacktest", () => {
  it("accepts a well-behaved return series as consistent", () => {
    // Smooth bounded oscillation: the trailing 5th percentile predicts the
    // future lower tail well, so breaches stay near the promised 5%.
    const rets = Array.from({ length: 300 }, (_, t) => noise(t, 0.01) + noise(t * 3, 0.004));
    const res = kupiecBacktest(rets, { window: 60, confidence: 0.95 });
    expect(res).not.toBeNull();
    expect(res!.tests).toBe(240);
    expect(res!.expectedRate).toBeCloseTo(0.05);
    expect(res!.pValue).toBeGreaterThan(0.05);
    expect(res!.verdict).toBe("consistent");
  });

  it("flags a model that underestimates risk when tails keep escalating", () => {
    // Every 10th day a shock LARGER than anything in the trailing window
    // (magnitudes escalate), so the walking VaR is always one step behind:
    // realized breaches ≈ 10% against a promised 5% → Kupiec must reject.
    const rets = Array.from({ length: 300 }, (_, t) =>
      t % 10 === 0 ? -(0.02 + t * 0.0005) : 0.002 + noise(t, 0.001),
    );
    const res = kupiecBacktest(rets, { window: 60, confidence: 0.95 });
    expect(res).not.toBeNull();
    expect(res!.breachRate).toBeGreaterThan(res!.expectedRate * 1.5);
    expect(res!.pValue).toBeLessThan(0.05);
    expect(res!.verdict).toBe("underestimates risk");
  });

  it("returns null on insufficient history", () => {
    expect(kupiecBacktest(Array(50).fill(0.001))).toBeNull();
  });
});

describe("sampleMoments / sharpeReport", () => {
  it("computes near-Gaussian moments for a symmetric series", () => {
    const rets = Array.from({ length: 250 }, (_, t) => noise(t, 0.01));
    const m = sampleMoments(rets);
    expect(m).not.toBeNull();
    expect(Math.abs(m!.skew)).toBeLessThan(0.5);
  });

  it("reports Sharpe with a finite SE and a coherent PSR", () => {
    // Positive-drift series → positive Sharpe, PSR vs 0 above one half.
    const rets = Array.from({ length: 250 }, (_, t) => 0.0008 + noise(t, 0.01));
    const rep = sharpeReport(rets);
    expect(rep).not.toBeNull();
    expect(rep!.sharpeAnnual).toBeGreaterThan(0);
    expect(rep!.seAnnual).toBeGreaterThan(0);
    expect(rep!.psrVsZero).toBeGreaterThan(0.5);
    expect(rep!.n).toBe(250);
  });

  it("returns null when the sample is too thin", () => {
    expect(sharpeReport([0.01, -0.01])).toBeNull();
  });
});

describe("volatilityCI", () => {
  it("brackets the point estimate and narrows with more data", () => {
    const wide = volatilityCI(0.01, 60)!;
    const tight = volatilityCI(0.01, 250)!;
    for (const ci of [wide, tight]) {
      expect(ci.lowAnnual).toBeLessThan(ci.sigmaAnnual);
      expect(ci.highAnnual).toBeGreaterThan(ci.sigmaAnnual);
    }
    expect(tight.highAnnual - tight.lowAnnual).toBeLessThan(wide.highAnnual - wide.lowAnnual);
  });

  it("Wilson–Hilferty quantiles are sane", () => {
    // Median of χ²(k) ≈ k(1−2/(9k))³ — WH at q=0.5 reproduces it exactly.
    const k = 59;
    expect(chi2QuantileWH(0.5, k)).toBeCloseTo(k * Math.pow(1 - 2 / (9 * k), 3), 6);
  });
});

describe("ridgeOls t-stats", () => {
  it("gives large |t| for a real driver and small |t| for an irrelevant one", () => {
    const T = 250;
    const f1 = Array.from({ length: T }, (_, t) => 0.01 * Math.sin(t / 7) + 0.002 * Math.cos(t / 3));
    const f2 = Array.from({ length: T }, (_, t) => 0.008 * Math.cos(t / 11) - 0.001 * Math.sin(t / 5));
    // y loads on f1 only; f2 is noise to the regression.
    const y = f1.map((v, t) => 0.8 * v + noise(t, 0.003));
    const fit = ridgeOls(y, f1.map((v, t) => [v, f2[t]]));
    expect(fit).not.toBeNull();
    expect(Math.abs(fit!.tStats[0])).toBeGreaterThan(2);
    expect(Math.abs(fit!.tStats[0])).toBeGreaterThan(Math.abs(fit!.tStats[1]) * 3);
  });
});
