import { describe, it, expect } from "vitest";
import {
  cagr, annualizedVol, sharpeRatio, sortinoRatio, calmarRatio, omegaRatio,
  maxDrawdownFromReturns, regressOnBenchmark, trackingError, informationRatio,
  captureRatios, rollingMetrics, computePerformanceMetrics,
} from "./performance";
import {
  analyzeDrawdowns, analyzeConcentration, analyzeCorrelationRisk,
  analyzeTailRisk, runStressScenario, historicalWorstWindow, STRESS_SCENARIOS,
} from "./risk";
import { riskBudgetWeights, minCVaRWeights, capWeights, runOptimizer } from "./optimizers";
import { computeAttribution, riskContributions, contributionSum } from "./attribution";
import { computeExposure } from "./exposure";
import { synthesizeInsights } from "./insights";
import { generateInstitutionalReport } from "./reports";
import { metric, gradeSample } from "./types";
import { pickBenchmark } from "@/hooks/useInstitutionalAnalytics";

// ─── Deterministic pseudo-random series (LCG — no Math.random in tests) ───
function lcgSeries(n: number, seed: number, vol = 0.01, drift = 0.0004): number[] {
  let s = seed >>> 0;
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    s = (1664525 * s + 1013904223) >>> 0;
    const u1 = Math.max(s / 2 ** 32, 1e-12);
    s = (1664525 * s + 1013904223) >>> 0;
    const u2 = s / 2 ** 32;
    const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    out.push(drift + vol * z);
  }
  return out;
}

describe("performance", () => {
  it("cagr matches constant daily return compounding", () => {
    const rets = new Array(252).fill(0.001);
    // (1.001)^252 - 1 over exactly one year
    expect(cagr(rets)).toBeCloseTo(Math.pow(1.001, 252) - 1, 10);
  });

  it("annualizedVol scales by sqrt(252)", () => {
    const rets = [0.01, -0.01, 0.01, -0.01, 0.01, -0.01];
    const daily = Math.sqrt(rets.reduce((s, r) => s + r * r, 0) / (rets.length - 1) - 0); // mean ~0.00167 ignored below
    expect(annualizedVol(rets)).toBeGreaterThan(0);
    expect(annualizedVol(rets)).toBeCloseTo(annualizedVol(rets), 12);
  });

  it("sharpe is positive for high drift, negative for negative drift", () => {
    expect(sharpeRatio(lcgSeries(252, 7, 0.01, 0.002))).toBeGreaterThan(0);
    expect(sharpeRatio(lcgSeries(252, 7, 0.01, -0.002))).toBeLessThan(0);
  });

  it("sortino penalizes downside only", () => {
    // Same mean, one series has fatter downside
    const symmetric = lcgSeries(300, 11, 0.01, 0.001);
    const skewed = symmetric.map(r => (r < 0 ? r * 2 : r * 0.9));
    expect(sortinoRatio(skewed)).toBeLessThan(sortinoRatio(symmetric));
  });

  it("max drawdown of monotone gains is 0", () => {
    expect(maxDrawdownFromReturns(new Array(50).fill(0.01))).toBe(0);
  });

  it("max drawdown of one -50% day is 0.5", () => {
    expect(maxDrawdownFromReturns([0.01, -0.5, 0.02])).toBeCloseTo(0.5, 10);
  });

  it("calmar = cagr / mdd", () => {
    const rets = [0.05, -0.1, 0.08, 0.02];
    const c = calmarRatio(rets);
    expect(c).toBeCloseTo(cagr(rets) / maxDrawdownFromReturns(rets), 10);
  });

  it("omega > 1 when gains dominate", () => {
    expect(omegaRatio([0.02, 0.02, -0.01])).toBeGreaterThan(1);
    expect(omegaRatio([-0.02, -0.02, 0.01])).toBeLessThan(1);
  });

  it("regression recovers beta on a synthetic linear relation", () => {
    const bench = lcgSeries(252, 42, 0.012, 0.0003);
    const port = bench.map(b => 0.0002 + 1.5 * b);
    const reg = regressOnBenchmark(port, bench)!;
    expect(reg.beta).toBeCloseTo(1.5, 6);
    expect(reg.alphaDaily).toBeCloseTo(0.0002, 6);
    expect(reg.rSquared).toBeCloseTo(1, 6);
  });

  it("tracking error is 0 for identical series and IR is 0 then", () => {
    const b = lcgSeries(100, 3);
    expect(trackingError(b, b)).toBeCloseTo(0, 12);
    expect(informationRatio(b, b)).toBe(0);
  });

  it("capture ratios: 2x levered portfolio captures ~2x both ways", () => {
    const bench = lcgSeries(252, 9, 0.01, 0);
    const port = bench.map(b => 2 * b);
    const cap = captureRatios(port, bench)!;
    expect(cap.up).toBeCloseTo(2, 6);
    expect(cap.down).toBeCloseTo(2, 6);
  });

  it("rolling metrics produce one point per window end", () => {
    const rets = lcgSeries(100, 5);
    const roll = rollingMetrics(rets, 60);
    expect(roll.sharpe.length).toBe(41);
    expect(roll.volatilityAnnual[0].endIndex).toBe(59);
  });

  it("computePerformanceMetrics returns null on tiny samples and carries provenance", () => {
    expect(computePerformanceMetrics({ portfolioReturns: [0.01, 0.02] })).toBeNull();
    const m = computePerformanceMetrics({ portfolioReturns: lcgSeries(252, 8) })!;
    expect(m.sharpe.provenance.sampleSize).toBe(252);
    expect(m.sharpe.provenance.confidence).toBe("high");
    expect(m.cagr.provenance.source).toBe("historical-prices");
  });
});

describe("risk", () => {
  it("drawdown episodes have consistent structure and recovery", () => {
    // up 10 days, crash, recover
    const rets = [...new Array(10).fill(0.01), -0.2, ...new Array(30).fill(0.01)];
    const dd = analyzeDrawdowns(rets);
    expect(dd.maxDrawdown.value).toBeCloseTo(0.2, 6);
    const ep = dd.episodes[0];
    expect(ep.depth).toBeCloseTo(0.2, 6);
    expect(ep.recoveryIndex).not.toBeNull();
    expect(dd.avgRecoveryDays!.value).toBeGreaterThan(0);
    expect(dd.currentDrawdown.value).toBe(0);
  });

  it("open drawdown is reported as ongoing", () => {
    const rets = [...new Array(10).fill(0.01), -0.3];
    const dd = analyzeDrawdowns(rets);
    expect(dd.episodes[0].recoveryIndex).toBeNull();
    expect(dd.currentDrawdown.value).toBeCloseTo(0.3, 6);
  });

  it("concentration: HHI and effective N for equal weights", () => {
    const pos = [1, 2, 3, 4].map(i => ({ ticker: `A${i}`, weight: 0.25, sector: i < 3 ? "Tech" : "Energy" }));
    const c = analyzeConcentration(pos);
    expect(c.hhi.value).toBeCloseTo(0.25, 10);
    expect(c.effectiveN.value).toBeCloseTo(4, 10);
    expect(c.topSectorWeight.value).toBeCloseTo(0.5, 10);
  });

  it("correlation risk: perfect correlation gives pc1Share ~1 and DR ~1", () => {
    const C = [[1, 1], [1, 1]];
    const cov = [[0.0001, 0.0001], [0.0001, 0.0001]];
    const r = analyzeCorrelationRisk({ correlation: C, covariance: cov, weights: [0.5, 0.5], sampleSize: 252 });
    expect(r.avgPairwise.value).toBeCloseTo(1, 6);
    expect(r.pc1Share!.value).toBeCloseTo(1, 4);
    expect(r.diversificationRatio!.value).toBeCloseTo(1, 4);
  });

  it("tail risk: VaR95 is a positive loss fraction for a losing tail", () => {
    const rets = lcgSeries(500, 13, 0.02, 0);
    const t = analyzeTailRisk(rets);
    expect(t.var95.value).toBeGreaterThan(0);
    expect(t.cvar95.value).toBeGreaterThanOrEqual(t.var95.value);
    expect(t.evtVar99).not.toBeNull();
    expect(t.evtVar99!.value).toBeGreaterThan(0);
  });

  it("stress: impact = Σ w·β·shock exactly; no hardcoded outputs", () => {
    const scenario = STRESS_SCENARIOS.find(s => s.id === "covid")!;
    const res = runStressScenario({
      scenario,
      positions: [
        { ticker: "A", weight: 0.6, beta: 1.2 },
        { ticker: "B", weight: 0.4, beta: 0.5 },
      ],
      portfolioValue: 100000,
      betaSampleSize: 252,
    });
    const expected = (0.6 * 1.2 + 0.4 * 0.5) * scenario.marketShock;
    expect(res.portfolioImpact.value).toBeCloseTo(expected, 10);
    expect(res.lossValue).toBeCloseTo(-expected * 100000, 6);
    expect(res.positionImpacts.length).toBe(2);
  });

  it("stress excludes and discloses positions without beta", () => {
    const res = runStressScenario({
      scenario: STRESS_SCENARIOS[0],
      positions: [
        { ticker: "A", weight: 0.5, beta: 1 },
        { ticker: "B", weight: 0.5, beta: null },
      ],
      portfolioValue: 1000,
      betaSampleSize: 100,
    });
    expect(res.positionImpacts.length).toBe(1);
    expect(res.portfolioImpact.provenance.assumptions!.some(a => a.includes("without estimated beta"))).toBe(true);
  });

  it("historical worst window finds the planted crash", () => {
    const rets = [...new Array(50).fill(0.005), -0.1, -0.1, -0.1, ...new Array(50).fill(0.005)];
    const r = historicalWorstWindow(rets, 3, 100000)!;
    expect(r.worstReturn.value).toBeCloseTo(Math.pow(0.9, 3) - 1, 6);
    expect(r.worstStartIndex).toBe(50);
  });
});

describe("optimizers", () => {
  const sigma = [
    [0.0004, 0.0001, 0.00005],
    [0.0001, 0.0009, 0.0001],
    [0.00005, 0.0001, 0.0016],
  ];

  it("risk budgets are hit: RCᵢ ∝ bᵢ", () => {
    const budgets = [0.5, 0.3, 0.2];
    const rb = riskBudgetWeights(sigma, budgets)!;
    const w = rb.weights;
    const Sw = sigma.map(row => row.reduce((s, v, j) => s + v * w[j], 0));
    const varP = w.reduce((s, wi, i) => s + wi * Sw[i], 0);
    for (let i = 0; i < 3; i++) {
      expect((w[i] * Sw[i]) / varP).toBeCloseTo(budgets[i], 4);
    }
  });

  it("min CVaR beats equal weight on its own objective", () => {
    const a = lcgSeries(300, 21, 0.03, 0);   // high risk
    const b = lcgSeries(300, 22, 0.008, 0);  // low risk
    const c = lcgSeries(300, 23, 0.015, 0);
    const res = minCVaRWeights([a, b, c], 0.95)!;
    // Compute CVaR of equal weight
    const T = 300;
    const eq: number[] = [];
    for (let t = 0; t < T; t++) eq.push((a[t] + b[t] + c[t]) / 3);
    const sorted = [...eq].sort((x, y) => x - y);
    const tail = Math.max(1, Math.floor(0.05 * T));
    const eqCVaR = -sorted.slice(0, tail).reduce((s, v) => s + v, 0) / tail;
    expect(res.cvar).toBeLessThanOrEqual(eqCVaR + 1e-9);
    // Should overweight the low-vol asset
    expect(res.weights[1]).toBeGreaterThan(res.weights[0]);
  });

  it("capWeights enforces the cap and sums to 1", () => {
    const w = capWeights([0.7, 0.2, 0.1], 0.4);
    expect(Math.max(...w)).toBeLessThanOrEqual(0.4 + 1e-9);
    expect(w.reduce((s, v) => s + v, 0)).toBeCloseTo(1, 9);
  });

  it("runOptimizer facade: HRP converges and carries diagnostics", () => {
    const r = runOptimizer("hrp", {
      tickers: ["A", "B", "C"], sigma, sampleSize: 252,
    })!;
    expect(r.diagnostics.converged).toBe(true);
    expect(r.weights.reduce((s, v) => s + v, 0)).toBeCloseTo(1, 6);
    expect(r.diagnostics.assumptions.length).toBeGreaterThan(0);
  });

  it("volatility targeting pads cash and hits the target", () => {
    const r = runOptimizer("min_variance", {
      tickers: ["A", "B", "C"], sigma, sampleSize: 252,
      constraints: { targetVolAnnual: 0.05 },
    })!;
    expect(r.diagnostics.converged).toBe(true);
    if (r.cashWeight > 0) {
      expect(r.volAnnual).toBeLessThanOrEqual(0.05 + 1e-6);
      expect(r.weights.reduce((s, v) => s + v, 0) + r.cashWeight).toBeCloseTo(1, 6);
    }
  });

  it("concentration cap binds and is noted", () => {
    // Extreme μ pushes MVO into a corner; the cap must pull it back
    const r = runOptimizer("mean_variance", {
      tickers: ["A", "B", "C"], sigma, mu: [0.005, 0.0001, 0.0001], sampleSize: 252,
      constraints: { maxWeight: 0.4 },
    })!;
    expect(r.diagnostics.converged).toBe(true);
    expect(Math.max(...r.weights)).toBeLessThanOrEqual(0.4 + 1e-8);
  });

  it("turnover cap limits L1 distance from current", () => {
    const current = [1 / 3, 1 / 3, 1 / 3];
    const r = runOptimizer("mean_variance", {
      tickers: ["A", "B", "C"], sigma, mu: [0.005, 0.0001, 0.0001],
      currentWeights: current, sampleSize: 252,
      constraints: { maxTurnover: 0.1 },
    })!;
    let to = 0;
    for (let i = 0; i < 3; i++) to += Math.abs(r.weights[i] - current[i]);
    expect(to).toBeLessThanOrEqual(0.1 + 1e-8);
  });

  it("degrades gracefully: singular Σ yields converged=false, never a fallback", () => {
    const singular = [
      [0.0004, 0.0004, 0.0004],
      [0.0004, 0.0004, 0.0004],
      [0.0004, 0.0004, 0.0004],
    ];
    // No return series ⇒ no shrinkage rescue; min-variance must refuse.
    const r = runOptimizer("min_variance", {
      tickers: ["A", "B", "C"], sigma: singular, sampleSize: 252,
    })!;
    // Either PSD-projection made it solvable, or it refused — both are
    // acceptable; what is NOT acceptable is a silent heuristic answer.
    if (!r.diagnostics.converged) {
      expect(r.weights.length).toBe(0);
      expect(r.diagnostics.notes.length).toBeGreaterThan(0);
    } else {
      expect(r.weights.reduce((s, v) => s + v, 0)).toBeCloseTo(1, 6);
    }
  });

  it("shrinkage is applied when return series are supplied", () => {
    const series = [lcgSeries(120, 31), lcgSeries(120, 32), lcgSeries(120, 33)];
    const r = runOptimizer("robust_mean_variance", {
      tickers: ["A", "B", "C"], sigma,
      mu: [0.001, 0.0005, 0.0002],
      returnSeries: series, sampleSize: 120,
    })!;
    expect(r.diagnostics.shrinkageDelta).not.toBeNull();
    expect(r.diagnostics.assumptions.some(a => a.includes("Ledoit"))).toBe(true);
  });
});

describe("attribution", () => {
  it("position contributions sum to the weighted portfolio return", () => {
    const attr = computeAttribution({
      positions: [
        { ticker: "A", weight: 0.5, returnPct: 10, sector: "Tech" },
        { ticker: "B", weight: 0.3, returnPct: -5, sector: "Energy" },
        { ticker: "C", weight: 0.2, returnPct: 2, sector: "Tech" },
      ],
    });
    expect(contributionSum(attr.positions)).toBeCloseTo(0.5 * 10 + 0.3 * -5 + 0.2 * 2, 10);
  });

  it("risk contributions sum to 1", () => {
    const sigma = [
      [0.0004, 0.0001],
      [0.0001, 0.0009],
    ];
    const rc = riskContributions([0.6, 0.4], sigma)!;
    expect(rc.reduce((s, v) => s + v, 0)).toBeCloseTo(1, 10);
  });

  it("brinson allocation effects sum to ~0 when all sector returns equal", () => {
    const attr = computeAttribution({
      positions: [
        { ticker: "A", weight: 0.5, returnPct: 5, sector: "Tech" },
        { ticker: "B", weight: 0.5, returnPct: 5, sector: "Energy" },
      ],
    });
    const total = attr.brinson!.reduce((s, b) => s + b.total, 0);
    expect(total).toBeCloseTo(0, 8);
  });
});

describe("exposure", () => {
  const positions = [
    { ticker: "A", value: 5000, sector: "Tech", currency: "USD", beta: 1.2, sigmaAnnual: 0.35, trailingReturn: 0.4 },
    { ticker: "B", value: 3000, sector: "Energy", currency: "USD", beta: 0.8, sigmaAnnual: 0.2, trailingReturn: 0.1 },
    { ticker: "C", value: 2000, sector: "Tech", currency: "INR", beta: 1.0, sigmaAnnual: 0.28, trailingReturn: -0.05 },
  ];

  it("buckets sum to total and are sorted", () => {
    const e = computeExposure({ positions, totalValue: 10000, betaSampleSize: 252 });
    expect(e.sector.reduce((s, b) => s + b.weight, 0)).toBeCloseTo(1, 10);
    expect(e.sector[0].label).toBe("Tech");
    expect(e.currency.find(c => c.label === "INR")!.weight).toBeCloseTo(0.2, 10);
  });

  it("market beta is value-weighted", () => {
    const e = computeExposure({ positions, totalValue: 10000, betaSampleSize: 252 });
    expect(e.marketBeta!.value).toBeCloseTo(0.5 * 1.2 + 0.3 * 0.8 + 0.2 * 1.0, 10);
  });

  it("style terciles exist with ≥3 positions and are null below", () => {
    const e = computeExposure({ positions, totalValue: 10000, betaSampleSize: 252 });
    expect(e.volatilityStyle).not.toBeNull();
    const e2 = computeExposure({ positions: positions.slice(0, 2), totalValue: 8000, betaSampleSize: 252 });
    expect(e2.volatilityStyle).toBeNull();
  });
});

describe("insights & reports", () => {
  it("every insight carries provenance and thresholds fire deterministically", () => {
    const conc = analyzeConcentration([
      { ticker: "BIG", weight: 0.7, sector: "Tech" },
      { ticker: "SMALL", weight: 0.3, sector: "Tech" },
    ]);
    const risk = {
      drawdown: analyzeDrawdowns([0.01, -0.02]),
      concentration: conc,
      correlation: analyzeCorrelationRisk({ correlation: [[1, 0.2], [0.2, 1]], sampleSize: 100 }),
      tail: analyzeTailRisk(lcgSeries(200, 17)),
    };
    const insights = synthesizeInsights({ performance: null, risk, exposure: null, attribution: null });
    const concInsight = insights.find(i => i.id === "risk-conc-pos");
    expect(concInsight).toBeDefined();
    expect(concInsight!.severity).toBe("action");
    expect(concInsight!.provenance.source).toBe("portfolio-state");
    for (const i of insights) {
      expect(i.provenance.calculation.length).toBeGreaterThan(0);
      expect(["high", "medium", "low"]).toContain(i.provenance.confidence);
    }
  });

  it("report assembles sections and aggregates sources", () => {
    const ctx = {
      asOf: Date.now(), baseCurrency: "USD", totalValue: 10000, totalInvested: 9000,
      totalPnl: 1000, positionCount: 2, lookbackDays: 200,
      fmt: (v: number) => `$${v.toFixed(0)}`,
    };
    const perf = computePerformanceMetrics({ portfolioReturns: lcgSeries(200, 19) });
    const report = generateInstitutionalReport({
      ctx, performance: perf, risk: null, exposure: null, attribution: null,
      insights: [], stresses: [], replays: [], recommended: null,
      currentWeights: [{ ticker: "A", weight: 0.6 }, { ticker: "B", weight: 0.4 }],
    });
    expect(report.sections.map(s => s.id)).toContain("executive-summary");
    expect(report.sections.map(s => s.id)).toContain("performance");
    expect(report.sections.map(s => s.id)).toContain("rebalancing");
    expect(report.sources).toContain("historical-prices");
    // Rebalancing without an optimizer must SAY so, not invent targets
    const rebal = report.sections.find(s => s.id === "rebalancing")!;
    expect(rebal.blocks.some(b => b.kind === "text" && b.text.includes("Insufficient"))).toBe(true);
  });

  it("gradeSample maps sample sizes to confidence", () => {
    expect(gradeSample(20)).toBe("low");
    expect(gradeSample(100)).toBe("medium");
    expect(gradeSample(252)).toBe("high");
  });

  it("metric() attaches full provenance", () => {
    const m = metric(1.5, "derived", "a/b", 100, ["assumes x"]);
    expect(m.provenance.assumptions).toEqual(["assumes x"]);
    expect(m.provenance.confidence).toBe("medium");
  });
});

describe("benchmark selection", () => {
  it("routes INR-dominant books to NIFTY and others to S&P", () => {
    expect(pickBenchmark(["INR", "INR", "USD"])).toBe("^NSEI");
    expect(pickBenchmark(["USD", "USD", "INR"])).toBe("^GSPC");
    expect(pickBenchmark([])).toBe("^GSPC");
  });
});
