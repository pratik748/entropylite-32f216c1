// Discovery v2 test suite — deterministic (seeded mulberry32, same
// convention as quant/upgrades.test.ts). The critical test is noise
// rejection: on pure noise the robustness stack must reject nearly
// everything.

import { describe, it, expect } from "vitest";
import { mulberry32 } from "@/lib/quant/validation";
import { cusum, gaussianHMM, robustZ } from "./changepoint";
import { admitBar, admitNumericClaim } from "./admission";
import { claimNovelty, sybilDedup, jaccard, tokenSet } from "./novelty";
import { epistemicMomentum } from "./momentum";
import { grangerLite, leadLagScan } from "./leadlag";
import { propagateImpact } from "./propagate";
import { bhQValues, pRealFromScan, futureSurvivalScore, regimeStability } from "./robustness";
import {
  blendForecasts,
  expectedEdge,
  payoffAsymmetry,
  timeliness,
  liquidityFactor,
  confidenceFactor,
  opportunityScore,
  publishGate,
} from "./scoring";
import {
  newReliabilityCell,
  updateReliability,
  reliabilityEstimate,
  scarScore,
  shouldScar,
  quantileOf,
} from "./learning";
import type { AssetEdge, OpportunityFactors } from "./types";

const rng = (seed: number) => mulberry32(seed);

function gauss(r: () => number): number {
  // Box-Muller
  const u = Math.max(r(), 1e-12);
  const v = r();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// ─── changepoint ─────────────────────────────────────────────────

describe("cusum", () => {
  it("detects an injected mean shift and stays quiet on noise", () => {
    const r = rng(42);
    const calm = Array.from({ length: 400 }, () => gauss(r));
    expect(cusum(calm).alarms.length).toBeLessThanOrEqual(2); // ARL≈370 design

    const shifted = [...Array.from({ length: 200 }, () => gauss(r)), ...Array.from({ length: 60 }, () => 1.5 + gauss(r))];
    const res = cusum(shifted);
    expect(res.alarms.length).toBeGreaterThan(0);
    expect(res.alarms[0]).toBeGreaterThanOrEqual(200); // fires after the break
    expect(res.alarms[0]).toBeLessThan(240); // and promptly
  });
});

describe("gaussianHMM", () => {
  it("recovers three volatility states on synthetic data", () => {
    const r = rng(7);
    const xs: number[] = [];
    const sig = [0.5, 1.5, 4];
    for (let block = 0; block < 9; block++) {
      const s = sig[block % 3];
      for (let i = 0; i < 100; i++) xs.push(s * gauss(r));
    }
    const fit = gaussianHMM(xs, 3);
    expect(fit).not.toBeNull();
    // ordered by sigma ascending, separated
    expect(fit!.sigma[0]).toBeLessThan(fit!.sigma[1]);
    expect(fit!.sigma[1]).toBeLessThan(fit!.sigma[2]);
    expect(fit!.sigma[2] / fit!.sigma[0]).toBeGreaterThan(2);
    // posteriors are distributions
    for (const row of fit!.posterior) {
      expect(Math.abs(row.reduce((a, b) => a + b, 0) - 1)).toBeLessThan(1e-6);
    }
    expect(fit!.pChange).toBeGreaterThanOrEqual(0);
    expect(fit!.pChange).toBeLessThanOrEqual(1);
  });

  it("returns null on short series", () => {
    expect(gaussianHMM([1, 2, 3], 3)).toBeNull();
  });
});

describe("robustZ", () => {
  it("is outlier-resistant", () => {
    const xs = [...Array.from({ length: 99 }, (_, i) => (i % 2 ? 1 : -1)), 1000];
    const z = robustZ(xs);
    expect(Math.abs(z[0])).toBeLessThan(3);
    expect(z[99]).toBeGreaterThan(100);
  });
});

// ─── admission ───────────────────────────────────────────────────

describe("admission", () => {
  it("admits a sane bar and rejects impossible ones", () => {
    const good = { open: 100, high: 102, low: 99, close: 101, volume: 1e6 };
    expect(admitBar(good, 100.5).admitted).toBe(true);

    expect(admitBar({ ...good, low: 103 }, 100.5).reasons).toContain("high_below_low");
    expect(admitBar({ ...good, close: -5 }, 100.5).reasons).toContain("non_positive_price");
    expect(admitBar({ ...good, volume: -1 }, 100.5).reasons).toContain("negative_volume");
    expect(admitBar(good, 20).reasons).toContain("return_exceeds_bound"); // 5x jump
    expect(admitBar({ ...good, high: NaN }, 100.5).reasons).toContain("non_finite_field");
  });

  it("bounds numeric claims by relation pattern", () => {
    expect(admitNumericClaim("fed_funds_rate", 0.055).admitted).toBe(true);
    expect(admitNumericClaim("fed_funds_rate", 12).admitted).toBe(false);
    expect(admitNumericClaim("close_price", -3).admitted).toBe(false);
    expect(admitNumericClaim("sentiment_score", 0.4).admitted).toBe(true);
    // future timestamps rejected
    const future = Date.now() + 3_600_000;
    expect(admitNumericClaim("close_price", 100, future).reasons).toContain("timestamp_in_future");
    // non-numeric objects pass through (TWRD's job)
    expect(admitNumericClaim("acquired", "Acme Corp").admitted).toBe(true);
  });
});

// ─── novelty / sybil ─────────────────────────────────────────────

describe("novelty & sybil dedup", () => {
  const c = { subject: "AAPL", relation: "guidance_cut", object: "q3 revenue -5%" };

  it("identical claim → zero novelty; unrelated → full novelty", () => {
    expect(claimNovelty(c, [c])).toBeLessThan(0.01);
    expect(claimNovelty(c, [{ subject: "XOM", relation: "dividend_raise", object: "2%" }])).toBeGreaterThan(0.8);
    expect(claimNovelty(c, [])).toBe(1);
  });

  it("collapses syndicated copies to one source", () => {
    const text = "Apple cuts Q3 revenue guidance by five percent citing weak demand";
    const evidence = [
      { source_id: "reuters", raw_text: text },
      { source_id: "site-a", raw_text: text + "." },
      { source_id: "site-b", raw_text: text },
      { source_id: "ft", raw_text: "Completely different analysis of European bank capital ratios today" },
    ];
    const deduped = sybilDedup(evidence);
    expect(deduped.length).toBe(2);
    expect(deduped.map((e) => e.source_id)).toEqual(["reuters", "ft"]);
  });

  it("jaccard sanity", () => {
    expect(jaccard(tokenSet("a b c"), tokenSet("a b c"))).toBe(1);
    expect(jaccard(tokenSet("aa bb"), tokenSet("cc dd"))).toBe(0);
  });
});

// ─── epistemic momentum ──────────────────────────────────────────

describe("epistemicMomentum", () => {
  it("positive slope on rising T, ~zero on flat", () => {
    const day = 86_400_000;
    const rising = Array.from({ length: 10 }, (_, i) => ({ t: i * day, T: 0.4 + 0.03 * i }));
    const m = epistemicMomentum(rising)!;
    expect(m.muPerDay).toBeGreaterThan(0.02);
    expect(m.r2).toBeGreaterThan(0.95);

    const flat = Array.from({ length: 10 }, (_, i) => ({ t: i * day, T: 0.6 }));
    expect(Math.abs(epistemicMomentum(flat)!.muPerDay)).toBeLessThan(1e-9);
    expect(epistemicMomentum(rising.slice(0, 2))).toBeNull();
  });
});

// ─── lead-lag ────────────────────────────────────────────────────

describe("grangerLite / leadLagScan", () => {
  it("finds a planted 1-bar lead and FDR-rejects noise pairs", () => {
    const r = rng(11);
    const T = 400;
    const x: number[] = [];
    const y: number[] = [];
    let xPrev = 0;
    for (let t = 0; t < T; t++) {
      const xt = gauss(r);
      y.push(0.5 * xPrev + 0.5 * gauss(r)); // x leads y strongly
      x.push(xt);
      xPrev = xt;
    }
    const lead = grangerLite(y, x)!;
    expect(Math.abs(lead.tStat)).toBeGreaterThan(4);
    expect(lead.pValue).toBeLessThan(0.001);

    // scan: 6 noise series + the planted pair
    const series: Record<string, number[]> = { x, y };
    for (let i = 0; i < 6; i++) series[`n${i}`] = Array.from({ length: T }, () => gauss(r));
    const scan = leadLagScan(series, 0.05);
    const found = scan.edges.some((e) => e.src === "x" && e.dst === "y");
    expect(found).toBe(true);
    // noise-only edges should be rare after FDR
    const noiseEdges = scan.edges.filter((e) => e.src !== "x" || e.dst !== "y");
    expect(noiseEdges.length).toBeLessThanOrEqual(3);
    // caps: lead-lag weight never exceeds 0.4
    for (const e of scan.edges) expect(e.weight).toBeLessThanOrEqual(0.4);
  });

  it("returns null on short series", () => {
    expect(grangerLite([1, 2], [1, 2])).toBeNull();
  });
});

// ─── propagation ─────────────────────────────────────────────────

describe("propagateImpact", () => {
  const edges: AssetEdge[] = [
    { src: "TSM", dst: "SOXX", type: "sector_member", weight: 1.0 },
    { src: "SOXX", dst: "NVDA", type: "sector_member", weight: 0.8 },
    { src: "TSM", dst: "AAPL", type: "supply_chain", weight: 0.6 },
    { src: "TSM", dst: "WEAK", type: "lead_lag", weight: 0.2 }, // below minWeight
  ];

  it("attenuates by hop and respects weight floor", () => {
    const out = propagateImpact(edges, { TSM: -0.8 });
    const soxx = out.find((o) => o.symbol === "SOXX")!;
    const nvda = out.find((o) => o.symbol === "NVDA")!;
    const aapl = out.find((o) => o.symbol === "AAPL")!;
    expect(soxx.impact).toBeCloseTo(-0.8 * 1.0 * 0.6, 6);
    expect(nvda.impact).toBeCloseTo(-0.8 * 1.0 * 0.6 * 0.8 * 0.6, 6);
    expect(nvda.hops).toBe(2);
    expect(aapl.impact).toBeCloseTo(-0.8 * 0.6 * 0.6, 6);
    expect(out.find((o) => o.symbol === "WEAK")).toBeUndefined();
    // never touches seeds; sorted by |impact|
    expect(out.find((o) => o.symbol === "TSM")).toBeUndefined();
    expect(Math.abs(out[0].impact)).toBeGreaterThanOrEqual(Math.abs(out[out.length - 1].impact));
  });
});

// ─── robustness ──────────────────────────────────────────────────

describe("FDR robustness", () => {
  it("q-values: uniform noise gets low pReal, real signal high", () => {
    const r = rng(23);
    const noise = Array.from({ length: 200 }, () => r());
    const ps = [1e-8, ...noise];
    const pr = pRealFromScan(ps);
    expect(pr[0]).toBeGreaterThan(0.9);
    const noiseHigh = pr.slice(1).filter((v) => v > 0.5).length;
    expect(noiseHigh / 200).toBeLessThan(0.1); // ≥90% of noise rejected
  });

  it("bhQValues mask matches BH ordering", () => {
    const { rejected } = bhQValues([0.001, 0.9, 0.02, 0.8], 0.1);
    expect(rejected[0]).toBe(true);
    expect(rejected[1]).toBe(false);
  });
});

describe("futureSurvivalScore", () => {
  it("high FSS on drifting-up paths, low on drifting-down; filters infeasible", () => {
    const r = rng(5);
    const mkPaths = (drift: number) =>
      Array.from({ length: 300 }, () => {
        const p: number[] = [100];
        for (let t = 0; t < 40; t++) p.push(p[t] * Math.exp(drift + 0.01 * gauss(r)));
        return p;
      });
    const thesis = { entry: 100, target: 106, stop: 96, direction: 1 as const };
    const up = futureSurvivalScore(mkPaths(0.004), thesis);
    const down = futureSurvivalScore(mkPaths(-0.004), thesis);
    expect(up.fss).toBeGreaterThan(0.6);
    expect(down.fss).toBeLessThan(0.25);
    expect(up.fss + up.stopRate).toBeLessThanOrEqual(1 + 1e-9);

    // a path with an impossible jump is excluded from the denominator
    const paths = [[100, 101, 102], [100, 500, 102], [100, -4, 102]];
    const res = futureSurvivalScore(paths, thesis);
    expect(res.nRejected).toBe(2);
    expect(res.nFeasible).toBe(1);
  });
});

describe("regimeStability", () => {
  it("penalises dispersion, neutral when unknown", () => {
    expect(
      regimeStability([
        { hitRate: 0.6, n: 50 },
        { hitRate: 0.58, n: 40 },
      ]),
    ).toBeGreaterThan(0.9);
    expect(
      regimeStability([
        { hitRate: 0.8, n: 50 },
        { hitRate: 0.2, n: 40 },
      ]),
    ).toBeCloseTo(0.4, 6);
    expect(regimeStability([{ hitRate: 0.9, n: 5 }])).toBe(0.5);
  });
});

// ─── scoring ─────────────────────────────────────────────────────

describe("scoring", () => {
  it("blends by precision and shrinks toward zero", () => {
    const b = blendForecasts([
      { mu: 0.10, s2: 0.01 },
      { mu: 0.02, s2: 0.0001 }, // 100x more precise → dominates
    ])!;
    expect(b.mu).toBeGreaterThan(0.02);
    expect(b.mu).toBeLessThan(0.03);

    const e = expectedEdge([{ mu: 0.05, s2: 0.001 }], { costRoundTrip: 0.002, histEdgeVar: 0.004 })!;
    expect(e.kappa).toBeGreaterThan(0.5);
    expect(e.eNet).toBeGreaterThan(0);
    expect(e.eNet).toBeLessThan(0.05); // shrunk AND cost-reduced

    // costs can kill a small edge entirely
    const dead = expectedEdge([{ mu: 0.001, s2: 0.001 }], { costRoundTrip: 0.01 })!;
    expect(dead.eNet).toBe(0);
  });

  it("factor sanity", () => {
    const r = rng(9);
    const sym = Array.from({ length: 2000 }, () => 0.02 * gauss(r));
    expect(payoffAsymmetry(sym)).toBeGreaterThan(0.9);
    expect(payoffAsymmetry(sym)).toBeLessThan(1.1);
    expect(payoffAsymmetry([0.1, 0.2, 0.3])).toBe(2); // no losses
    expect(timeliness(0, 5)).toBe(1);
    expect(timeliness(5, 5)).toBeCloseTo(0.5, 9);
    expect(liquidityFactor(10e6)).toBe(1);
    expect(liquidityFactor(2.5e6)).toBeCloseTo(0.5, 9);
    expect(confidenceFactor(0.01, 0.02)).toBeCloseTo(1 / 1.5, 9);
  });

  it("opportunityScore gates on eNet and finds the bottleneck", () => {
    const base: OpportunityFactors = {
      eNet: 0.03,
      robustness: 0.6,
      conviction: 0.7,
      asymmetry: 1.2,
      timeliness: 0.9,
      liquidity: 1,
      novelty: 0.15, // ← the bottleneck
      confidence: 0.8,
    };
    const s = opportunityScore(base);
    expect(s.os).toBeGreaterThan(0);
    expect(s.bottleneck.factor).toBe("novelty");
    // monotone: improving any factor raises the score
    expect(opportunityScore({ ...base, robustness: 0.9 }).os).toBeGreaterThan(s.os);
    // hard gate
    expect(opportunityScore({ ...base, eNet: -0.01 }).os).toBe(0);
  });

  it("publishGate rejects with explicit reasons", () => {
    const bad = publishGate({ eNet: 0.02, pReal: 0.2, fss: 0.3, bucketsAgreeing: 1 });
    expect(bad.publish).toBe(false);
    expect(bad.reasons.length).toBe(3);
    const good = publishGate({ eNet: 0.02, pReal: 0.6, fss: 0.6, bucketsAgreeing: 2 });
    expect(good.publish).toBe(true);
  });
});

// ─── learning ────────────────────────────────────────────────────

describe("learning", () => {
  it("reliability shrinks to prior at low n, follows evidence at high n", () => {
    let cell = newReliabilityCell(0.55, 10);
    expect(reliabilityEstimate(cell, 0.55)).toBeCloseTo(0.55, 2);
    // 60 straight hits
    for (let i = 0; i < 60; i++) cell = updateReliability(cell, 1);
    expect(reliabilityEstimate(cell, 0.55)).toBeGreaterThan(0.8);
    // decayed memory: 60 straight misses afterwards pulls it back down
    for (let i = 0; i < 60; i++) cell = updateReliability(cell, 0);
    expect(reliabilityEstimate(cell, 0.55)).toBeLessThan(0.4);
  });

  it("scarScore: consequence dominates; permanence is rare and corroborated", () => {
    const big = scarScore({ pnlErrRatio: 1.5, contextNovelty: 0.5, corroboration: 3, ageDays: 0 });
    const small = scarScore({ pnlErrRatio: 0.1, contextNovelty: 0.5, corroboration: 3, ageDays: 0 });
    expect(big).toBeGreaterThan(small + 0.3);
    expect(big).toBeLessThanOrEqual(1);

    // age decays the score
    const old = scarScore({ pnlErrRatio: 1.5, contextNovelty: 0.5, corroboration: 3, ageDays: 900 });
    expect(old).toBeLessThan(big);

    // permanence: needs corroboration ≥ 2 AND top-quantile score
    expect(shouldScar(0.9, [0.1, 0.2, 0.3, 0.4, 0.5, 0.6], 1)).toBe(false);
    expect(shouldScar(0.9, [0.1, 0.2, 0.3, 0.4, 0.5, 0.6], 2)).toBe(true);
    expect(shouldScar(0.2, [0.5, 0.6, 0.7, 0.8, 0.9, 0.95], 3)).toBe(false);
    // cold start: absolute bar
    expect(shouldScar(0.8, [], 2)).toBe(true);
    expect(shouldScar(0.5, [], 2)).toBe(false);
  });

  it("quantileOf", () => {
    expect(quantileOf([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0.85)).toBe(9);
    expect(quantileOf([], 0.5)).toBe(0);
  });
});
