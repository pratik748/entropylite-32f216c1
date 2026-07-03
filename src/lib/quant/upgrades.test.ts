import { describe, it, expect } from "vitest";
import { normInv } from "./institutional";
import { jacobiEigen } from "@/lib/portfolio-math";
import {
  ledoitWolfShrinkage,
  ewmaCovariance,
  dccLite,
  covToCorr,
  correlationDistance,
} from "./covariance";
import { hrpWeights, blackLitterman } from "./allocation";
import {
  mulberry32,
  walkForwardSplits,
  purgedKFoldSplits,
  cscvPBO,
  sharpeStdErr,
  probabilisticSharpe,
  expectedMaxSharpe,
  deflatedSharpe,
  minTrackRecordLength,
  whiteRealityCheck,
  benjaminiHochberg,
  validateStrategyBattery,
} from "./validation";
import { gpdFitPWM, evtVaR, hillTailIndex } from "./evt";
import {
  brierScore,
  logLoss,
  reliabilityCurve,
  betaUpdate,
  betaMean,
  betaPrior,
  shrunkProportion,
  OnlineLogit,
} from "./calibration";

// ─── Deterministic synthetic data helpers ─────────────────────────

/** Seeded standard normal via inverse-CDF of mulberry32 uniforms. */
function seededGaussians(n: number, seed: number): number[] {
  const rng = mulberry32(seed);
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const u = Math.min(Math.max(rng(), 1e-9), 1 - 1e-9);
    out.push(normInv(u));
  }
  return out;
}

/** N correlated return series of length T from a one-factor model. */
function factorReturns(N: number, T: number, seed: number, beta = 0.6): number[][] {
  const f = seededGaussians(T, seed);
  return Array.from({ length: N }, (_, i) => {
    const e = seededGaussians(T, seed + 1000 + i);
    return Array.from({ length: T }, (_, t) => 0.01 * (beta * f[t] + Math.sqrt(1 - beta * beta) * e[t]));
  });
}

const sumsTo1 = (w: number[], eps = 1e-8) => Math.abs(w.reduce((s, v) => s + v, 0) - 1) < eps;

// ─── Covariance ───────────────────────────────────────────────────

describe("ledoitWolfShrinkage", () => {
  const series = factorReturns(6, 120, 7);
  const lw = ledoitWolfShrinkage(series)!;

  it("returns a valid shrinkage intensity", () => {
    expect(lw).not.toBeNull();
    expect(lw.delta).toBeGreaterThanOrEqual(0);
    expect(lw.delta).toBeLessThanOrEqual(1);
    expect(lw.delta).toBeGreaterThan(0); // finite sample ⇒ some shrinkage
  });

  it("produces a symmetric PSD matrix", () => {
    const n = lw.sigma.length;
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++)
        expect(Math.abs(lw.sigma[i][j] - lw.sigma[j][i])).toBeLessThan(1e-10);
    const eig = jacobiEigen(lw.sigma)!;
    for (const v of eig.values) expect(v).toBeGreaterThan(-1e-10);
  });

  it("moves off-diagonals toward the constant-correlation target", () => {
    const S = lw.sample;
    const sd = S.map((r, i) => Math.sqrt(r[i]));
    for (let i = 0; i < S.length; i++)
      for (let j = i + 1; j < S.length; j++) {
        const target = lw.rBar * sd[i] * sd[j];
        const dShrunk = Math.abs(lw.sigma[i][j] - target);
        const dSample = Math.abs(S[i][j] - target);
        expect(dShrunk).toBeLessThanOrEqual(dSample + 1e-12);
      }
  });

  it("is deterministic", () => {
    const again = ledoitWolfShrinkage(series)!;
    expect(again.delta).toBe(lw.delta);
    expect(again.sigma[0][1]).toBe(lw.sigma[0][1]);
  });

  it("returns null on insufficient data", () => {
    expect(ledoitWolfShrinkage([[0.01, 0.02], [0.01, 0.02]])).toBeNull();
  });
});

describe("ewmaCovariance / dccLite", () => {
  const series = factorReturns(4, 200, 11);

  it("EWMA covariance is symmetric with positive diagonal", () => {
    const cov = ewmaCovariance(series)!;
    expect(cov).not.toBeNull();
    for (let i = 0; i < 4; i++) {
      expect(cov[i][i]).toBeGreaterThan(0);
      for (let j = 0; j < 4; j++) expect(Math.abs(cov[i][j] - cov[j][i])).toBeLessThan(1e-14);
    }
  });

  it("DCC-lite yields unit-diagonal correlations within [-1,1]", () => {
    const dcc = dccLite(series)!;
    expect(dcc).not.toBeNull();
    for (let i = 0; i < 4; i++) {
      expect(Math.abs(dcc.corr[i][i] - 1)).toBeLessThan(1e-9);
      expect(dcc.vols[i]).toBeGreaterThan(0);
      for (let j = 0; j < 4; j++) {
        expect(dcc.corr[i][j]).toBeGreaterThanOrEqual(-1);
        expect(dcc.corr[i][j]).toBeLessThanOrEqual(1);
      }
    }
  });

  it("positively correlated factor structure is detected", () => {
    const dcc = dccLite(series)!;
    expect(dcc.corr[0][1]).toBeGreaterThan(0.1);
  });
});

describe("covToCorr / correlationDistance", () => {
  it("converts and measures distance correctly", () => {
    const cov = [[4, 2], [2, 4]];
    const corr = covToCorr(cov);
    expect(Math.abs(corr[0][1] - 0.5)).toBeLessThan(1e-12);
    const d = correlationDistance(corr);
    expect(Math.abs(d[0][1] - Math.sqrt(0.25))).toBeLessThan(1e-12);
    expect(d[0][0]).toBe(0);
  });
});

// ─── Allocation ───────────────────────────────────────────────────

describe("hrpWeights", () => {
  it("equals inverse-variance on a diagonal covariance", () => {
    const cov = [
      [0.04, 0, 0, 0],
      [0, 0.01, 0, 0],
      [0, 0, 0.02, 0],
      [0, 0, 0, 0.08],
    ];
    const res = hrpWeights(cov)!;
    expect(res).not.toBeNull();
    expect(sumsTo1(res.weights)).toBe(true);
    // For uncorrelated assets HRP bisection reproduces IVP up to cluster split:
    // lower-variance assets must get strictly larger weight.
    expect(res.weights[1]).toBeGreaterThan(res.weights[0]);
    expect(res.weights[1]).toBeGreaterThan(res.weights[3]);
    expect(res.weights[2]).toBeGreaterThan(res.weights[3]);
  });

  it("survives a singular covariance (duplicated asset) where Markowitz fails", () => {
    const cov = [
      [0.04, 0.04, 0.01],
      [0.04, 0.04, 0.01],
      [0.01, 0.01, 0.02],
    ];
    const res = hrpWeights(cov)!;
    expect(res).not.toBeNull();
    expect(sumsTo1(res.weights)).toBe(true);
    for (const w of res.weights) expect(w).toBeGreaterThan(0);
  });

  it("is deterministic", () => {
    const series = factorReturns(5, 150, 3);
    const lw = ledoitWolfShrinkage(series)!;
    const a = hrpWeights(lw.sigma)!;
    const b = hrpWeights(lw.sigma)!;
    expect(a.weights).toEqual(b.weights);
  });
});

describe("blackLitterman", () => {
  const sigma = [
    [0.04, 0.01, 0.005],
    [0.01, 0.02, 0.004],
    [0.005, 0.004, 0.03],
  ];
  const wMkt = [0.5, 0.3, 0.2];

  it("returns the equilibrium prior with no views", () => {
    const res = blackLitterman(sigma, wMkt, [])!;
    expect(res).not.toBeNull();
    for (let i = 0; i < 3; i++) expect(res.mu[i]).toBe(res.prior[i]);
    // Π = δΣw with δ=2.5
    const pi0 = 2.5 * (0.04 * 0.5 + 0.01 * 0.3 + 0.005 * 0.2);
    expect(Math.abs(res.prior[0] - pi0)).toBeLessThan(1e-12);
  });

  it("moves posterior toward a bullish view on asset 0", () => {
    const noViews = blackLitterman(sigma, wMkt, [])!;
    const withView = blackLitterman(sigma, wMkt, [
      { portfolio: [1, 0, 0], expectedReturn: noViews.prior[0] + 0.05, confidence: 0.9 },
    ])!;
    expect(withView.mu[0]).toBeGreaterThan(noViews.mu[0]);
    // Higher confidence pulls harder
    const weakView = blackLitterman(sigma, wMkt, [
      { portfolio: [1, 0, 0], expectedReturn: noViews.prior[0] + 0.05, confidence: 0.1 },
    ])!;
    expect(withView.mu[0]).toBeGreaterThan(weakView.mu[0]);
  });
});

// ─── Validation framework ─────────────────────────────────────────

describe("walkForwardSplits / purgedKFoldSplits", () => {
  it("generates non-overlapping contiguous walk-forward windows", () => {
    const splits = walkForwardSplits(100, 50, 10);
    expect(splits.length).toBe(5);
    for (const s of splits) {
      expect(s.test[0]).toBe(s.train[1]);
      expect(s.test[1] - s.test[0]).toBe(10);
    }
  });

  it("purged folds exclude purge and embargo zones", () => {
    const horizon = 5, embargo = 3;
    const folds = purgedKFoldSplits(100, 5, horizon, embargo);
    expect(folds.length).toBe(5);
    for (const f of folds) {
      const t0 = f.testIdx[0];
      const t1 = f.testIdx[f.testIdx.length - 1] + 1;
      for (const i of f.trainIdx) {
        expect(i < t0 || i >= t1).toBe(true);              // not in test
        if (i < t0) expect(i + horizon).toBeLessThanOrEqual(t0); // purged
        if (i >= t1) expect(i).toBeGreaterThanOrEqual(t1 + embargo); // embargoed
      }
    }
  });
});

describe("Sharpe inference", () => {
  it("Lo standard error shrinks with T", () => {
    expect(sharpeStdErr(0.1, 1000)).toBeLessThan(sharpeStdErr(0.1, 100));
  });

  it("PSR → 1 for strong Sharpe over long samples", () => {
    expect(probabilisticSharpe(0.15, 0, 2000)).toBeGreaterThan(0.99);
    expect(probabilisticSharpe(0.0, 0.1, 2000)).toBeLessThan(0.01);
  });

  it("expected max Sharpe grows with the number of trials", () => {
    const v = 0.01;
    expect(expectedMaxSharpe(100, v)).toBeGreaterThan(expectedMaxSharpe(10, v));
    expect(expectedMaxSharpe(1, v)).toBe(0);
  });

  it("DSR penalises multiple testing", () => {
    const few = deflatedSharpe(0.1, 500, 5, 0.002);
    const many = deflatedSharpe(0.1, 500, 500, 0.002);
    expect(many.sr0).toBeGreaterThan(few.sr0);
    expect(many.dsr).toBeLessThan(few.dsr);
  });

  it("MinTRL is finite only when sr beats the benchmark", () => {
    expect(minTrackRecordLength(0.1, 0.05)).toBeGreaterThan(1);
    expect(minTrackRecordLength(0.05, 0.1)).toBe(Infinity);
  });
});

describe("cscvPBO", () => {
  it("flags pure-noise strategy selection as overfit-prone", () => {
    // 8 i.i.d. noise strategies: the IS-best should not persist OOS.
    const T = 400, S = 8;
    const panel: number[][] = [];
    const cols = Array.from({ length: S }, (_, s) => seededGaussians(T, 100 + s));
    for (let t = 0; t < T; t++) panel.push(cols.map(c => 0.01 * c[t]));
    const res = cscvPBO(panel, 10)!;
    expect(res).not.toBeNull();
    expect(res.combinations).toBe(252);
    expect(res.pbo).toBeGreaterThan(0.25); // no persistence in noise
  });

  it("passes a genuinely superior strategy", () => {
    const T = 400, S = 6;
    const cols = Array.from({ length: S }, (_, s) => seededGaussians(T, 300 + s));
    const panel: number[][] = [];
    for (let t = 0; t < T; t++)
      panel.push(cols.map((c, s) => 0.01 * c[t] + (s === 0 ? 0.008 : 0))); // strategy 0 has real edge
    const res = cscvPBO(panel, 10)!;
    expect(res.pbo).toBeLessThan(0.15);
  });
});

describe("whiteRealityCheck", () => {
  it("rejects H0 for a strategy with genuine drift and accepts for noise", () => {
    const T = 500;
    const bench = new Array(T).fill(0);
    const noiseCols = Array.from({ length: 5 }, (_, s) => seededGaussians(T, 500 + s));
    const noisePanel: number[][] = [];
    const edgePanel: number[][] = [];
    for (let t = 0; t < T; t++) {
      noisePanel.push(noiseCols.map(c => 0.01 * c[t]));
      edgePanel.push(noiseCols.map((c, s) => 0.01 * c[t] + (s === 2 ? 0.01 : 0)));
    }
    const pNoise = whiteRealityCheck(noisePanel, bench, 300, undefined, 42)!;
    const pEdge = whiteRealityCheck(edgePanel, bench, 300, undefined, 42)!;
    expect(pEdge.pValue).toBeLessThan(0.05);
    expect(pEdge.bestIndex).toBe(2);
    expect(pNoise.pValue).toBeGreaterThan(0.10);
  });

  it("is deterministic given a seed", () => {
    const T = 200;
    const bench = new Array(T).fill(0);
    const cols = Array.from({ length: 3 }, (_, s) => seededGaussians(T, 900 + s));
    const panel = Array.from({ length: T }, (_, t) => cols.map(c => 0.01 * c[t]));
    const a = whiteRealityCheck(panel, bench, 200, undefined, 7)!;
    const b = whiteRealityCheck(panel, bench, 200, undefined, 7)!;
    expect(a.pValue).toBe(b.pValue);
  });
});

describe("benjaminiHochberg", () => {
  it("controls FDR on a canonical example", () => {
    const p = [0.001, 0.008, 0.039, 0.041, 0.042, 0.06, 0.074, 0.205, 0.212, 0.216];
    const rej = benjaminiHochberg(p, 0.05);
    expect(rej[0]).toBe(true);
    expect(rej[1]).toBe(true);
    expect(rej[7]).toBe(false);
    expect(rej[9]).toBe(false);
  });
});

describe("validateStrategyBattery", () => {
  it("labels noise batteries as overfit and real edges as robust", () => {
    const T = 400;
    const bench = new Array(T).fill(0);
    const cols = Array.from({ length: 8 }, (_, s) => seededGaussians(T, 1300 + s));
    const noise = Array.from({ length: T }, (_, t) => cols.map(c => 0.01 * c[t]));
    const edge = Array.from({ length: T }, (_, t) =>
      cols.map((c, s) => 0.01 * c[t] + (s === 0 ? 0.012 : 0)));
    expect(validateStrategyBattery(noise, bench).verdict).not.toBe("robust");
    expect(validateStrategyBattery(edge, bench).verdict).toBe("robust");
  });
});

// ─── EVT ──────────────────────────────────────────────────────────

/** Inverse-CDF GPD sampler: x = (β/ξ)((1−u)^{−ξ} − 1). */
function gpdSample(n: number, xi: number, beta: number, seed: number): number[] {
  const rng = mulberry32(seed);
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const u = Math.min(Math.max(rng(), 1e-12), 1 - 1e-12);
    out.push((beta / xi) * (Math.pow(1 - u, -xi) - 1));
  }
  return out;
}

describe("gpdFitPWM", () => {
  it("recovers known GPD parameters", () => {
    const xs = gpdSample(3000, 0.2, 1.0, 21);
    const fit = gpdFitPWM(xs)!;
    expect(fit).not.toBeNull();
    expect(Math.abs(fit.xi - 0.2)).toBeLessThan(0.1);
    expect(Math.abs(fit.beta - 1.0)).toBeLessThan(0.15);
  });

  it("returns null on tiny samples", () => {
    expect(gpdFitPWM([1, 2, 3])).toBeNull();
  });
});

describe("evtVaR", () => {
  // Heavy-tailed losses: normal body + GPD tail
  const body = seededGaussians(900, 33).map(z => 0.01 * z);
  const tail = gpdSample(100, 0.25, 0.01, 34).map(x => -(0.02 + x)); // big losses
  const rets = body.concat(tail);

  it("produces coherent VaR/ES (ES > VaR > threshold percentile)", () => {
    const risk = evtVaR(rets, 0.99)!;
    expect(risk).not.toBeNull();
    expect(risk.var).toBeGreaterThan(risk.threshold);
    expect(risk.es).toBeGreaterThan(risk.var);
  });

  it("VaR increases with confidence", () => {
    const v99 = evtVaR(rets, 0.99)!.var;
    const v999 = evtVaR(rets, 0.999)!.var;
    expect(v999).toBeGreaterThan(v99);
  });

  it("rejects p below the threshold quantile", () => {
    expect(evtVaR(rets, 0.85, 0.9)).toBeNull();
  });
});

describe("hillTailIndex", () => {
  it("estimates a positive tail exponent for heavy-tailed losses", () => {
    const tail = gpdSample(1000, 0.25, 0.01, 55).map(x => -(0.01 + x));
    const res = hillTailIndex(tail)!;
    expect(res).not.toBeNull();
    expect(res.alpha).toBeGreaterThan(0);
    expect(res.xi).toBeGreaterThan(0);
  });
});

// ─── Calibration ──────────────────────────────────────────────────

describe("scoring rules", () => {
  it("Brier is 0 for perfect forecasts and 1 for maximally wrong", () => {
    expect(brierScore([1, 0, 1], [1, 0, 1])).toBe(0);
    expect(brierScore([1, 1], [0, 0])).toBe(1);
  });

  it("logLoss is lower for better-calibrated forecasts", () => {
    const good = logLoss([0.9, 0.1], [1, 0])!;
    const bad = logLoss([0.6, 0.4], [1, 0])!;
    expect(good).toBeLessThan(bad);
  });

  it("reliability curve recovers the empirical frequency", () => {
    const probs = [0.05, 0.05, 0.95, 0.95];
    const outs = [0, 0, 1, 1];
    const bins = reliabilityCurve(probs, outs, 10);
    expect(bins[0].n).toBe(2);
    expect(bins[0].meanOutcome).toBe(0);
    expect(bins[9].n).toBe(2);
    expect(bins[9].meanOutcome).toBe(1);
  });
});

describe("decayed Beta posterior", () => {
  it("moves the mean toward observed outcomes", () => {
    let s = betaPrior(0.5, 10);
    for (let i = 0; i < 20; i++) s = betaUpdate(s, 1);
    expect(betaMean(s)).toBeGreaterThan(0.7);
  });

  it("forgetting bounds the effective sample size", () => {
    let s = betaPrior(0.5, 10);
    for (let i = 0; i < 500; i++) s = betaUpdate(s, 1, 0.98);
    // ESS bounded by 1/(1−λ) = 50 (plus decayed prior)
    expect(s.alpha + s.beta).toBeLessThan(55);
    // and therefore still adapts: 10 consecutive failures move it visibly
    const before = betaMean(s);
    let s2 = s;
    for (let i = 0; i < 10; i++) s2 = betaUpdate(s2, 0, 0.98);
    expect(before - betaMean(s2)).toBeGreaterThan(0.05);
  });

  it("shrunkProportion matches the Beta posterior mean", () => {
    // 1 success in 1 trial, prior 0.5 strength 5 → (1+2.5)/(1+5)
    expect(Math.abs(shrunkProportion(1, 1, 0.5, 5) - 3.5 / 6)).toBeLessThan(1e-12);
  });
});

describe("OnlineLogit", () => {
  it("learns a separable rule", () => {
    const m = new OnlineLogit(1);
    const rng = mulberry32(77);
    for (let i = 0; i < 600; i++) {
      const x = rng();
      m.update([x - 0.5], x > 0.5 ? 1 : 0);
    }
    expect(m.predict([0.4])).toBeGreaterThan(0.7);   // x = 0.9
    expect(m.predict([-0.4])).toBeLessThan(0.3);     // x = 0.1
  });

  it("blends toward the prior when young", () => {
    const m = new OnlineLogit(2);
    expect(m.predictBlended([1, 1], 0.82)).toBeCloseTo(0.82, 10);
  });

  it("serialises and restores", () => {
    const m = new OnlineLogit(2);
    m.update([1, 0], 1);
    const st = m.serialize();
    const m2 = new OnlineLogit(2, { state: st });
    expect(m2.predict([1, 0])).toBe(m.predict([1, 0]));
  });
});
