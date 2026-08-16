// Deterministic tests for the Deno twin of src/lib/discovery.
// Seeded, no network: the whole point of removing model calls from a path is
// that the path becomes testable.

import { assert, assertAlmostEquals, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { bhQValues, pRealFromScan, driftPValue, futureSurvival, futureSurvivalScore, regimeStability } from "./robustness.ts";
import { cusum, gaussianHMM, robustZ } from "./changepoint.ts";
import { opportunityScore, publishGate, blendForecasts, expectedEdge, payoffAsymmetry, timeliness, liquidityFactor, confidenceFactor } from "./scoring.ts";
import { propagateImpact } from "./propagate.ts";
import { grangerLite } from "./leadlag.ts";
import { admitBar } from "./admission.ts";
import { jaccard, claimNovelty } from "./novelty.ts";
import { reliabilityOf } from "./store.ts";
import type { OpportunityFactors } from "./types.ts";

/** mulberry32, matching src/lib/quant/validation.ts so numbers are comparable. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

Deno.test("bhQValues is monotone and matches the step-up definition", () => {
  const { qValues, rejected } = bhQValues([0.001, 0.02, 0.4, 0.9]);
  assertAlmostEquals(qValues[0], 0.004, 1e-9);
  assertAlmostEquals(qValues[1], 0.04, 1e-9);
  assert(qValues[2] > qValues[1] && qValues[3] >= qValues[2]);
  assertEquals(rejected, [true, true, false, false]);
});

Deno.test("pRealFromScan stays inside the humility clip", () => {
  for (const p of pRealFromScan([0, 0, 0, 1, 1, 1])) {
    assert(p >= 0.05 && p <= 0.95, `p_real out of bounds: ${p}`);
  }
});

Deno.test("driftPValue separates real drift from noise", () => {
  const up = Array.from({ length: 150 }, (_, i) => 100 * Math.exp(0.004 * i));
  const rng = mulberry32(7);
  const flat: number[] = [100];
  for (let i = 1; i < 150; i++) flat.push(flat[i - 1] * Math.exp((rng() - 0.5) * 0.02));
  assert(driftPValue(up).p < 0.01, "trend should be significant");
  assert(driftPValue(flat).p > 0.1, "noise should not be significant");
  assertEquals(driftPValue([1, 2, 3]).p, 1, "short series must return no evidence");
});

Deno.test("futureSurvival ranks favourable drift above adverse drift", () => {
  const good = futureSurvival({ entry: 100, target: 110, stop: 94, muDaily: 0.0015, sigmaDaily: 0.015, days: 60, paths: 3000 });
  const bad = futureSurvival({ entry: 100, target: 110, stop: 94, muDaily: -0.002, sigmaDaily: 0.015, days: 60, paths: 3000 });
  assert(good.fss > bad.fss + 0.2, `expected separation, got ${good.fss} vs ${bad.fss}`);
  assert(good.nFeasible > 2500);
  assert(good.asymmetry > bad.asymmetry);
});

Deno.test("futureSurvival rejects an impossible thesis outright", () => {
  const r = futureSurvival({ entry: 100, target: 90, stop: 94, muDaily: 0.001, sigmaDaily: 0.02, days: 30, paths: 100 });
  assertEquals(r.fss, 0);
});

Deno.test("futureSurvivalScore excludes constraint-infeasible paths", () => {
  const clean = [100, 101, 103, 111];
  const gapped = [100, 400, 402, 111]; // violates the per-step log bound
  const r = futureSurvivalScore([clean, gapped], { entry: 100, target: 110, stop: 94, direction: 1 }, { maxAbsLogStep: 0.25 });
  assertEquals(r.nFeasible, 1);
  assertEquals(r.nRejected, 1);
  assertEquals(r.fss, 1);
});

Deno.test("regimeStability is neutral without enough cells", () => {
  assertEquals(regimeStability([{ hitRate: 0.6, n: 3 }]), 0.5);
  assertAlmostEquals(regimeStability([{ hitRate: 0.6, n: 50 }, { hitRate: 0.5, n: 50 }]), 0.9, 1e-9);
});

Deno.test("CUSUM alarms on a real mean shift and stays quiet on noise", () => {
  const rng = mulberry32(11);
  const quiet = Array.from({ length: 200 }, () => (rng() - 0.5) * 2);
  const shifted = quiet.map((v, i) => (i > 120 ? v + 6 : v));
  assertEquals(cusum(robustZ(quiet)).alarms.length, 0);
  assert(cusum(robustZ(shifted)).alarms.length > 0);
});

Deno.test("gaussianHMM orders states by volatility and reports switch risk", () => {
  const rng = mulberry32(3);
  const xs: number[] = [];
  for (let i = 0; i < 400; i++) xs.push((rng() - 0.5) * (i < 200 ? 0.01 : 0.08));
  const fit = gaussianHMM(xs, 3);
  assert(fit !== null, "HMM should fit 400 points");
  if (fit) {
    for (let k = 1; k < fit.sigma.length; k++) assert(fit.sigma[k] >= fit.sigma[k - 1]);
    assert(fit.pChange >= 0 && fit.pChange <= 1);
    assertEquals(fit.transition.length, 3);
    for (const row of fit.transition) assertAlmostEquals(row.reduce((a, b) => a + b, 0), 1, 1e-6);
  }
  assertEquals(gaussianHMM([1, 2, 3], 3), null);
});

Deno.test("opportunityScore gates on non-positive edge", () => {
  const base: OpportunityFactors = {
    eNet: 0.05, robustness: 0.5, conviction: 0.6, asymmetry: 1.2,
    timeliness: 0.9, liquidity: 1, novelty: 0.7, confidence: 0.5,
  };
  assert(opportunityScore(base).os > 0);
  assertEquals(opportunityScore({ ...base, eNet: 0 }).os, 0);
  assertEquals(opportunityScore({ ...base, eNet: -0.01 }).bottleneck.factor, "eNet");
});

Deno.test("opportunityScore names the true bottleneck", () => {
  const factors: OpportunityFactors = {
    eNet: 0.05, robustness: 0.9, conviction: 0.9, asymmetry: 1,
    timeliness: 0.95, liquidity: 0.02, novelty: 0.9, confidence: 0.9,
  };
  assertEquals(opportunityScore(factors).bottleneck.factor, "liquidity");
});

Deno.test("a dead factor collapses the score multiplicatively", () => {
  const factors: OpportunityFactors = {
    eNet: 0.2, robustness: 0, conviction: 0.9, asymmetry: 1.5,
    timeliness: 1, liquidity: 1, novelty: 1, confidence: 1,
  };
  assert(opportunityScore(factors).os < 1e-5, "zero robustness must kill the score");
});

Deno.test("inverse-variance blend favours the precise engine", () => {
  const b = blendForecasts([{ mu: 0.10, s2: 0.01 }, { mu: 0.02, s2: 1.0 }]);
  assert(b !== null);
  if (b) assert(b.mu > 0.09, `blend should sit near the precise forecast, got ${b.mu}`);
  assertEquals(blendForecasts([{ mu: 0.1, s2: 0 }]), null);
});

Deno.test("expectedEdge shrinks toward zero and subtracts costs", () => {
  const e = expectedEdge([{ mu: 0.10, s2: 0.01 }], { costRoundTrip: 0.005, priorKappa: 0.25 });
  assert(e !== null);
  if (e) {
    assertAlmostEquals(e.eNet, 0.25 * 0.10 - 0.005, 1e-9);
    assert(e.eNet < e.muBlend, "shrunken edge must be below the raw forecast");
  }
  const killed = expectedEdge([{ mu: 0.01, s2: 0.01 }], { costRoundTrip: 0.05, priorKappa: 0.25 });
  assertEquals(killed?.eNet, 0, "costs above edge must zero it, not flip it");
});

Deno.test("factor helpers respect their documented ranges", () => {
  assertEquals(payoffAsymmetry([]), 1);
  assert(payoffAsymmetry([0.1, 0.1, -0.02]) > 1);
  assert(payoffAsymmetry([-0.1, -0.1, 0.02]) < 1);
  assertAlmostEquals(timeliness(21, 21), 0.5, 1e-9);
  assertEquals(liquidityFactor(1e9), 1);
  assertEquals(liquidityFactor(0), 0.01);
  assert(confidenceFactor(0.5, 0.01) < confidenceFactor(0.001, 0.01));
});

Deno.test("publishGate reports every failing reason", () => {
  const ok = publishGate({ eNet: 0.02, pReal: 0.8, fss: 0.6, bucketsAgreeing: 3 });
  assertEquals(ok.publish, true);
  const bad = publishGate({ eNet: -1, pReal: 0.1, fss: 0.1, bucketsAgreeing: 0 });
  assertEquals(bad.publish, false);
  assertEquals(bad.reasons.length, 4);
});

Deno.test("propagateImpact attenuates with hop distance", () => {
  const edges = [
    { src: "A", dst: "B", type: "supply_chain" as const, weight: 0.8 },
    { src: "B", dst: "C", type: "supply_chain" as const, weight: 0.8 },
  ];
  const out = propagateImpact([{ symbol: "A", impact: 1 }], edges, { maxHops: 2, rho: 0.5 });
  const b = out.find((o) => o.symbol === "B");
  const c = out.find((o) => o.symbol === "C");
  assert(b && c && Math.abs(b.impact) > Math.abs(c.impact), "second-order impact must be smaller");
  assertEquals(b?.hops, 1);
  assertEquals(c?.hops, 2);
});

Deno.test("grangerLite finds a planted lead-lag and rejects noise", () => {
  const rng = mulberry32(5);
  const x: number[] = [];
  const y: number[] = [];
  for (let i = 0; i < 300; i++) {
    x.push(rng() - 0.5);
    y.push(i === 0 ? rng() - 0.5 : 0.8 * x[i - 1] + 0.05 * (rng() - 0.5));
  }
  assert(grangerLite(x, y).p < 0.01, "planted relationship should be detected");
  const n1 = Array.from({ length: 300 }, () => rng() - 0.5);
  const n2 = Array.from({ length: 300 }, () => rng() - 0.5);
  assert(grangerLite(n1, n2).p > 0.05, "independent noise should not register");
});

Deno.test("admitBar rejects impossible bars", () => {
  assertEquals(admitBar({ open: 10, high: 11, low: 9, close: 10.5, volume: 100 }).admitted, true);
  assertEquals(admitBar({ open: 10, high: 9, low: 11, close: 10, volume: 100 }).admitted, false);
  assertEquals(admitBar({ open: -1, high: 1, low: -2, close: 0, volume: 1 }).admitted, false);
});

Deno.test("novelty treats syndication as one source", () => {
  assertEquals(jaccard(new Set(["a", "b"]), new Set(["a", "b"])), 1);
  const dup = claimNovelty("RBI holds repo rate steady at 6.5 percent", ["RBI holds repo rate steady at 6.5 percent"]);
  assert(dup < 0.2, `syndicated copy should score low novelty, got ${dup}`);
  const fresh = claimNovelty("Cement volumes fall 12 percent in the south", ["RBI holds repo rate steady"]);
  assert(fresh > 0.8);
});

Deno.test("reliabilityOf returns the prior for an unseen cell", () => {
  const empty = reliabilityOf(new Map(), "drift");
  assertAlmostEquals(empty.hitRate, 0.55, 1e-9);
  assertEquals(empty.known, false);
  const seen = reliabilityOf(new Map([["drift", { alpha: 30, beta: 10, n: 40 }]]), "drift");
  assertAlmostEquals(seen.hitRate, 0.75, 1e-9);
  assertEquals(seen.known, true);
});
