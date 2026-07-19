import { describe, it, expect } from "vitest";
import { runSimulation, runAllEngines, volRegimeLabels, seedFrom } from "./simulation";
import { estimateCovariance, compareCovModels, portfolioSigmaFrom, COV_MODELS } from "./covariance-registry";

const noise = (t: number, scale: number) => Math.sin(t * 12.9898 + 78.233) * scale;

// 250 days of bounded oscillation with mild vol variation
const RETS = Array.from({ length: 250 }, (_, t) => noise(t, 0.01) * (1 + 0.4 * Math.sin(t / 40)));
const INPUTS = { portfolioReturns: RETS, sigmaDaily: 0.01 };

describe("runSimulation", () => {
  it("is deterministic: same inputs produce identical results", () => {
    const a = runSimulation(INPUTS, { engine: "bootstrap_iid", horizonDays: 21 })!;
    const b = runSimulation(INPUTS, { engine: "bootstrap_iid", horizonDays: 21 })!;
    expect(a.seed).toBe(b.seed);
    expect(a.terminal).toEqual(b.terminal);
    expect(a.fan[10]).toEqual(b.fan[10]);
  });

  it("fans widen with horizon and percentiles are ordered", () => {
    const r = runSimulation(INPUTS, { engine: "bootstrap_iid", horizonDays: 21 })!;
    const d5 = r.fan[5], d21 = r.fan[21];
    expect(d21.p95 - d21.p5).toBeGreaterThan(d5.p95 - d5.p5);
    for (const f of r.fan) {
      expect(f.p5).toBeLessThanOrEqual(f.p25);
      expect(f.p25).toBeLessThanOrEqual(f.p50);
      expect(f.p50).toBeLessThanOrEqual(f.p75);
      expect(f.p75).toBeLessThanOrEqual(f.p95);
    }
  });

  it("parametric terminal spread scales like sigma*sqrt(H)", () => {
    const r = runSimulation(INPUTS, { engine: "parametric_normal", horizonDays: 21, nPaths: 4000 })!;
    // p95−p5 of N(0, σ√H) ≈ 2·1.645·σ√H = 15.1% for σ_d=1%, H=21
    const spread = r.terminal.p95 - r.terminal.p5;
    expect(spread).toBeGreaterThan(11);
    expect(spread).toBeLessThan(20);
    expect(Math.abs(r.terminal.p50)).toBeLessThan(2); // zero drift
  });

  it("heavy-tailed engine has fatter tails than Gaussian at matched variance", () => {
    const heavy = Array.from({ length: 250 }, (_, t) => (t % 25 === 0 ? (t % 50 === 0 ? -0.04 : 0.04) : noise(t, 0.004)));
    const inp = { portfolioReturns: heavy, sigmaDaily: 0.01 };
    const tRes = runSimulation(inp, { engine: "heavy_tailed_t", horizonDays: 21, nPaths: 4000 })!;
    const nRes = runSimulation(inp, { engine: "parametric_normal", horizonDays: 21, nPaths: 4000 })!;
    expect(tRes.nu).toBeDefined();
    expect(tRes.nu!).toBeLessThan(12); // kurtosis actually detected
    expect(tRes.terminal.es95).toBeGreaterThan(nRes.terminal.es95); // fatter tail
  });

  it("applies a day-0 shock that shifts the whole distribution", () => {
    const base = runSimulation(INPUTS, { engine: "bootstrap_iid", horizonDays: 5 })!;
    const shocked = runSimulation(INPUTS, {
      engine: "bootstrap_iid", horizonDays: 5,
      shock: { label: "test", day0ReturnPct: -8 },
    })!;
    expect(shocked.fan[0].p50).toBeCloseTo(-8, 0);
    expect(shocked.terminal.p50).toBeLessThan(base.terminal.p50 - 6);
  });

  it("refuses thin history and missing sigma instead of substituting", () => {
    expect(runSimulation({ portfolioReturns: RETS.slice(0, 30) }, { engine: "bootstrap_iid", horizonDays: 21 })).toBeNull();
    expect(runSimulation({ portfolioReturns: RETS, sigmaDaily: null }, { engine: "parametric_normal", horizonDays: 21 })).toBeNull();
  });

  it("regime engine conditions on today's vol tercile", () => {
    const reg = volRegimeLabels(RETS)!;
    expect(reg.labels.length).toBe(RETS.length - 20 + 1);
    const r = runSimulation(INPUTS, { engine: "regime_conditioned", horizonDays: 21 })!;
    expect(r.method).toMatch(/low-vol|mid-vol|high-vol/);
  });

  it("seedFrom differs across engines and shocks", () => {
    const a = seedFrom({ engine: "bootstrap_iid", horizonDays: 21, nPaths: 2000, shockPct: 0, n: 250 });
    const b = seedFrom({ engine: "bootstrap_block", horizonDays: 21, nPaths: 2000, shockPct: 0, n: 250 });
    const c = seedFrom({ engine: "bootstrap_iid", horizonDays: 21, nPaths: 2000, shockPct: -8, n: 250 });
    expect(a).not.toBe(b);
    expect(a).not.toBe(c);
  });
});

describe("runAllEngines", () => {
  it("runs every engine on healthy inputs — the disagreement table", () => {
    const all = runAllEngines(INPUTS, { horizonDays: 21, nPaths: 500 });
    expect(all.length).toBe(5);
    const ids = all.map((r) => r.engine);
    expect(new Set(ids).size).toBe(5);
  });
});

describe("covariance registry", () => {
  const series = [
    Array.from({ length: 200 }, (_, t) => noise(t, 0.01)),
    Array.from({ length: 200 }, (_, t) => 0.6 * noise(t, 0.01) + noise(t * 7 + 3, 0.006)),
    Array.from({ length: 200 }, (_, t) => noise(t * 3 + 11, 0.012)),
  ];
  const w = [0.4, 0.35, 0.25];

  it("every registered model estimates and stamps its metadata", () => {
    for (const m of COV_MODELS) {
      const est = estimateCovariance(m.id, series);
      expect(est, m.id).not.toBeNull();
      expect(est!.meta.id).toBe(m.id);
      expect(est!.meta.window).toBe(200);
      expect(est!.sigma.length).toBe(3);
      expect(portfolioSigmaFrom(est!.sigma, w)).toBeGreaterThan(0);
    }
  });

  it("LW stamps its shrinkage intensity; EWMA stamps its decay", () => {
    expect(estimateCovariance("ledoit_wolf", series)!.meta.shrinkage).not.toBeNull();
    expect(estimateCovariance("ewma", series)!.meta.decay).toBe(0.94);
  });

  it("compareCovModels yields a sigma per model — the disagreement row", () => {
    const cmp = compareCovModels(series, w);
    expect(cmp.length).toBe(COV_MODELS.length);
    for (const c of cmp) expect(c.sigmaAnnual).toBeGreaterThan(0);
  });

  it("returns null on degenerate input, never a substitute estimator", () => {
    expect(estimateCovariance("ledoit_wolf", [series[0]])).toBeNull();
    expect(estimateCovariance("sample", [series[0].slice(0, 10), series[1].slice(0, 10)])).toBeNull();
  });
});
