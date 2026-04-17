import { describe, it, expect } from "vitest";
import { cointegrate, ols, adfTest, adfPValue } from "@/lib/statarb/cointegration";
import { fitOU } from "@/lib/statarb/ou";
import { runMCRobustness } from "@/lib/statarb/mcRobustness";
import { composeSignal } from "@/lib/statarb/signalCompose";
import { evaluateKillSwitch } from "@/lib/statarb/killSwitch";
import { defaultModel, buildObservations, decodeRegime, baumWelch } from "@/lib/statarb/hmm";

// ── helpers ──────────────────────────────────────────────────────────
function gauss(): number {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}
function ouSeries(theta: number, mu: number, sigma: number, n: number, x0 = 0): number[] {
  const b = Math.exp(-theta);
  const out = [x0];
  let x = x0;
  const stepStd = Math.sqrt(sigma * sigma * (1 - b * b));
  for (let i = 0; i < n; i++) {
    x = mu * (1 - b) + b * x + stepStd * gauss();
    out.push(x);
  }
  return out;
}
function trendSeries(slope: number, n: number, noise = 0.5): number[] {
  return Array.from({ length: n }, (_, i) => 100 + slope * i + noise * gauss());
}

// ── OLS ──────────────────────────────────────────────────────────────
describe("ols", () => {
  it("recovers a simple linear relationship", () => {
    const x = Array.from({ length: 50 }, (_, i) => i);
    const y = x.map((v) => 3 + 2 * v);
    const { alpha, beta } = ols(x, y);
    expect(alpha).toBeCloseTo(3, 6);
    expect(beta).toBeCloseTo(2, 6);
  });
});

// ── ADF ──────────────────────────────────────────────────────────────
describe("adf", () => {
  it("flags a stationary series with a sufficiently negative t-stat", () => {
    const stationary = ouSeries(0.4, 0, 1, 400);
    const t = adfTest(stationary);
    expect(t).toBeLessThan(-1.5);
    expect(adfPValue(t)).toBeLessThan(0.2);
  });
  it("does NOT flag a random walk (unit root) as stationary", () => {
    const rw = [0];
    for (let i = 0; i < 400; i++) rw.push(rw[rw.length - 1] + gauss());
    const t = adfTest(rw);
    expect(adfPValue(t)).toBeGreaterThan(0.05);
  });
});

// ── Cointegration ────────────────────────────────────────────────────
describe("cointegrate", () => {
  it("identifies a co-moving pair", () => {
    const n = 400;
    const common = ouSeries(0.05, 100, 5, n, 100); // shared random walk-ish
    const x = common.map((v) => v + 0.3 * gauss());
    const y = common.map((v) => 2 * v + 0.3 * gauss()); // beta ~ 2
    const res = cointegrate(x, y);
    expect(res.beta).toBeGreaterThan(1.5);
    expect(res.beta).toBeLessThan(2.5);
    expect(res.isCointegrated).toBe(true);
  });
  it("rejects unrelated random walks (averaged across seeds)", () => {
    // Two independent RWs occasionally cointegrate by chance; require that
    // the engine rejects the MAJORITY of independent draws.
    let rejected = 0;
    const trials = 12;
    for (let t = 0; t < trials; t++) {
      const a = [100], b = [100];
      for (let i = 0; i < 400; i++) {
        a.push(a[a.length - 1] + gauss());
        b.push(b[b.length - 1] + gauss());
      }
      if (!cointegrate(a, b).isCointegrated) rejected++;
    }
    expect(rejected).toBeGreaterThanOrEqual(Math.ceil(trials * 0.6));
  });
});

// ── OU ───────────────────────────────────────────────────────────────
describe("fitOU", () => {
  it("recovers theta within an order of magnitude", () => {
    const series = ouSeries(0.3, 0, 1, 600);
    const ou = fitOU(series);
    expect(ou.isStationary).toBe(true);
    expect(ou.theta).toBeGreaterThan(0.1);
    expect(ou.theta).toBeLessThan(0.6);
    expect(Math.abs(ou.mu)).toBeLessThan(0.5);
    expect(ou.halfLife).toBeGreaterThan(1);
  });
  it("flags a trending series as non-stationary", () => {
    const trend = trendSeries(0.5, 200, 1);
    const ou = fitOU(trend);
    expect(ou.isStationary).toBe(false);
  });
});

// ── Monte Carlo ──────────────────────────────────────────────────────
describe("runMCRobustness", () => {
  it("produces high reversion probability for a fast-reverting OU spread", () => {
    const series = ouSeries(0.6, 0, 1, 400, 2.5); // start far from mean
    const ou = fitOU(series);
    const mc = runMCRobustness(series, ou, { paths: 500, horizon: 40 });
    expect(mc.pReversion).toBeGreaterThan(0.6);
    expect(mc.pathsP50.length).toBe(40);
  });
  it("returns zeros when OU is non-stationary", () => {
    const trend = trendSeries(0.5, 200, 1);
    const ou = fitOU(trend);
    const mc = runMCRobustness(trend, ou, { paths: 200, horizon: 20 });
    expect(mc.pReversion).toBe(0);
  });
});

// ── HMM ──────────────────────────────────────────────────────────────
describe("hmm", () => {
  it("buildObservations produces (return, vol) pairs with expected length", () => {
    const prices = ouSeries(0.2, 100, 1, 300, 100);
    const obs = buildObservations(prices, 10);
    expect(obs.length).toBeGreaterThan(280);
    expect(obs[0]).toHaveLength(2);
  });
  it("decodeRegime returns probabilities that sum to ~1", () => {
    const prices = ouSeries(0.2, 100, 1, 300, 100);
    const obs = buildObservations(prices, 10);
    const model = defaultModel(obs);
    const post = decodeRegime(model, prices);
    const sum =
      post.probabilities["mean-reverting"] +
      post.probabilities.trending +
      post.probabilities.volatile +
      post.probabilities.broken;
    expect(sum).toBeCloseTo(1, 5);
  });
  it("baumWelch runs without throwing on a small series", () => {
    const prices = ouSeries(0.3, 100, 1, 200, 100);
    const obs = buildObservations(prices, 8);
    const fit = baumWelch(obs, 5);
    expect(fit.transitions).toHaveLength(4);
    expect(fit.emissionMeans).toHaveLength(4);
  });
});

// ── Compose / Kill-switch ────────────────────────────────────────────
describe("composeSignal", () => {
  it("produces a non-zero S_final when all gates pass", () => {
    const series = ouSeries(0.4, 0, 1, 400, 2);
    const ou = fitOU(series);
    const coint = { beta: 1, alpha: 0, adfStat: -3, pValue: 0.01, isCointegrated: true, residuals: series };
    const mc = runMCRobustness(series, ou, { paths: 300 });
    const regime = { state: "mean-reverting" as const, probabilities: { "mean-reverting": 0.8, trending: 0.05, volatile: 0.1, broken: 0.05 }, stability: 0.85 };
    const out = composeSignal({ sBase: 0.7, cointegration: coint, ou, mc, regime });
    expect(out.sBase).toBe(0.7);
    expect(Math.abs(out.sFinal)).toBeLessThanOrEqual(Math.abs(out.sBase));
    expect(out.killSwitch.active).toBe(false);
    expect(out.why.spreadDeviation.length).toBeGreaterThan(0);
  });
  it("kill-switch zeros S_final when cointegration fails", () => {
    const series = ouSeries(0.4, 0, 1, 200, 1);
    const ou = fitOU(series);
    const coint = { beta: 1, alpha: 0, adfStat: -0.5, pValue: 0.4, isCointegrated: false, residuals: series };
    const mc = runMCRobustness(series, ou, { paths: 300 });
    const regime = { state: "mean-reverting" as const, probabilities: { "mean-reverting": 0.7, trending: 0.1, volatile: 0.1, broken: 0.1 }, stability: 0.7 };
    const out = composeSignal({ sBase: 0.7, cointegration: coint, ou, mc, regime });
    expect(out.killSwitch.active).toBe(true);
    expect(out.sFinal).toBe(0);
    expect(out.sBase).toBe(0.7); // base is preserved untouched
  });
});

describe("evaluateKillSwitch", () => {
  it("flags trending regimes", () => {
    const v = evaluateKillSwitch({
      cointegration: { beta: 1, alpha: 0, adfStat: -3, pValue: 0.01, isCointegrated: true, residuals: [] },
      ou: { theta: 0.3, mu: 0, sigmaEq: 1, halfLife: 5, zScore: 2, isStationary: true },
      mc: { pReversion: 0.8, tailRisk5: 0.1, expectedMaxDD: 0.05, pathsP5: [], pathsP50: [], pathsP95: [] },
      regime: { state: "trending", probabilities: { "mean-reverting": 0.1, trending: 0.7, volatile: 0.1, broken: 0.1 }, stability: 0.8 },
    });
    expect(v.active).toBe(true);
    expect(v.reasons.some((r) => /trending/i.test(r))).toBe(true);
  });
});
