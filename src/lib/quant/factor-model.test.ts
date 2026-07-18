import { describe, it, expect } from "vitest";
import {
  ridgeOls, sampleCovariance, computeFactorModel, rollingBetaSeries, selectFactors,
  CORE_FACTORS, INDIA_FACTOR,
} from "./factor-model";
import { liquidityProfile } from "./liquidity";

/** Deterministic pseudo-noise (no Math.random in tests either). */
const noise = (t: number, scale = 1e-4) => Math.sin(t * 12.9898) * scale;

const T = 250;
const f1 = Array.from({ length: T }, (_, t) => 0.01 * Math.sin(t / 7) + 0.002 * Math.cos(t / 3));
const f2 = Array.from({ length: T }, (_, t) => 0.008 * Math.cos(t / 11) - 0.001 * Math.sin(t / 5));

describe("ridgeOls", () => {
  it("recovers known betas from a linear data-generating process", () => {
    const y = f1.map((v, t) => 0.5 * v - 0.3 * f2[t] + noise(t));
    const X = f1.map((v, t) => [v, f2[t]]);
    const fit = ridgeOls(y, X);
    expect(fit).not.toBeNull();
    expect(fit!.betas[0]).toBeCloseTo(0.5, 2);
    expect(fit!.betas[1]).toBeCloseTo(-0.3, 2);
    expect(fit!.r2).toBeGreaterThan(0.95);
    expect(fit!.n).toBe(T);
  });

  it("returns null on degenerate input instead of a fabricated fit", () => {
    expect(ridgeOls([1, 2, 3], [[1], [2], [3]])).toBeNull(); // too few obs
    expect(ridgeOls([], [])).toBeNull();
  });
});

describe("sampleCovariance", () => {
  it("matches variance on the diagonal", () => {
    const cov = sampleCovariance([f1, f2]);
    const mean = f1.reduce((s, v) => s + v, 0) / T;
    const varF1 = f1.reduce((s, v) => s + (v - mean) ** 2, 0) / (T - 1);
    expect(cov[0][0]).toBeCloseTo(varF1, 10);
    expect(cov[0][1]).toBeCloseTo(cov[1][0], 12);
  });
});

describe("computeFactorModel", () => {
  const factors = [CORE_FACTORS[0], CORE_FACTORS[1]]; // mkt_us, rates
  const factorReturns = { mkt_us: f1, rates: f2 };

  it("decomposes a two-asset book and Euler contributions sum to 1", () => {
    const assetReturns = {
      AAA: f1.map((v, t) => 1.2 * v + noise(t + 1)),           // pure market
      BBB: f1.map((v, t) => 0.4 * v + 0.8 * f2[t] + noise(t + 2)), // mixed
    };
    const model = computeFactorModel({
      assetReturns,
      weights: { AAA: 0.6, BBB: 0.4 },
      factorReturns,
      factors,
    });
    expect(model).not.toBeNull();
    expect(model!.portfolio).not.toBeNull();
    const p = model!.portfolio!;
    // Exposure = w-weighted betas: mkt 0.6·1.2 + 0.4·0.4 = 0.88
    expect(p.exposures.mkt_us).toBeCloseTo(0.88, 1);
    expect(p.exposures.rates).toBeCloseTo(0.32, 1);
    const contribSum = Object.values(p.contributions).reduce((s, v) => s + v, 0);
    expect(contribSum).toBeCloseTo(1, 6);
    // Nearly-noiseless DGP → almost all risk is systematic.
    expect(p.systematicShare).toBeGreaterThan(0.9);
    expect(model!.coveredWeight).toBeCloseTo(1);
  });

  it("skips assets with thin overlap and discloses reduced coverage", () => {
    const model = computeFactorModel({
      assetReturns: {
        AAA: f1.map((v, t) => v + noise(t)),
        THIN: f1.slice(0, 20), // 20 obs < minObs
      },
      weights: { AAA: 0.5, THIN: 0.5 },
      factorReturns,
      factors,
    });
    expect(model).not.toBeNull();
    expect(model!.perAsset.map((a) => a.ticker)).toEqual(["AAA"]);
    expect(model!.coveredWeight).toBeCloseTo(0.5);
  });

  it("returns null when fewer than two factor series exist", () => {
    expect(
      computeFactorModel({
        assetReturns: { AAA: f1 },
        weights: { AAA: 1 },
        factorReturns: { mkt_us: f1 },
        factors,
      }),
    ).toBeNull();
  });

  it("orders scenarios worst-first with impact = exposure × shock", () => {
    const model = computeFactorModel({
      assetReturns: { AAA: f1.map((v, t) => v + noise(t)) },
      weights: { AAA: 1 },
      factorReturns,
      factors,
    })!;
    for (const s of model.scenarios) {
      expect(s.shockPct).toBeLessThan(0);
      expect(s.impactPct).toBeCloseTo(model.portfolio!.exposures[s.factorId] * s.shockPct, 8);
    }
    const impacts = model.scenarios.map((s) => s.impactPct);
    expect([...impacts].sort((a, b) => a - b)).toEqual(impacts);
  });
});

describe("selectFactors", () => {
  it("adds NIFTY only for books with INR exposure", () => {
    expect(selectFactors(false).some((f) => f.id === INDIA_FACTOR.id)).toBe(false);
    expect(selectFactors(true)[1].id).toBe(INDIA_FACTOR.id);
  });
});

describe("rollingBetaSeries", () => {
  it("tracks a constant true beta", () => {
    const asset = f1.map((v, t) => 1.5 * v + noise(t));
    const series = rollingBetaSeries(asset, f1, 60);
    expect(series.length).toBe(T - 60 + 1);
    expect(series[series.length - 1]).toBeCloseTo(1.5, 1);
  });

  it("returns empty for insufficient history", () => {
    expect(rollingBetaSeries(f1.slice(0, 30), f1.slice(0, 30), 60)).toEqual([]);
  });
});

describe("liquidityProfile", () => {
  const vols = (adv: number) => Array.from({ length: 30 }, () => adv);

  it("computes days-to-exit at the participation cap", () => {
    const prof = liquidityProfile(
      [
        { ticker: "LIQ", quantity: 1000, valueBase: 500_000, volumes: vols(100_000) },
        { ticker: "ILLQ", quantity: 60_000, valueBase: 500_000, volumes: vols(10_000) },
      ],
      0.2,
    );
    expect(prof).not.toBeNull();
    const liq = prof!.perPosition.find((p) => p.ticker === "LIQ")!;
    const illq = prof!.perPosition.find((p) => p.ticker === "ILLQ")!;
    expect(liq.daysToExit).toBeCloseTo(1000 / (100_000 * 0.2)); // 0.05 days
    expect(illq.daysToExit).toBeCloseTo(60_000 / (10_000 * 0.2)); // 30 days
    // Half the covered value exits within a day; the illiquid half does not.
    expect(prof!.shareWithin.d1).toBeCloseTo(0.5);
    expect(prof!.shareWithin.d20).toBeCloseTo(0.5);
    // Illiquid positions sort first — they are the capacity risk.
    expect(prof!.perPosition[0].ticker).toBe("ILLQ");
  });

  it("excludes assets without volume history and discloses coverage", () => {
    const prof = liquidityProfile(
      [
        { ticker: "EQ", quantity: 100, valueBase: 300_000, volumes: vols(50_000) },
        { ticker: "FX", quantity: 5, valueBase: 700_000 }, // no volumes
      ],
      0.2,
    );
    expect(prof).not.toBeNull();
    expect(prof!.coveredValueShare).toBeCloseTo(0.3);
    expect(prof!.perPosition.find((p) => p.ticker === "FX")!.daysToExit).toBeNull();
  });

  it("returns null when nothing is covered", () => {
    expect(liquidityProfile([{ ticker: "X", quantity: 1, valueBase: 100 }])).toBeNull();
  });
});
