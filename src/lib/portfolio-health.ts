/**
 * Portfolio Health — a single 0–100 vital sign composed from the real quant
 * snapshot. Deterministic, transparent, and honest: each sub-gauge is a named
 * function of quantities the platform already computes (useQuantSnapshot,
 * useMarketRegime). No opaque score — every point is explainable, which is
 * Doctrine P2 (every claim shows its work).
 *
 * Sub-gauges (each 0–100, higher = healthier):
 *   1. Diversification — effective breadth 1/Σwᵢ² vs the holding count.
 *   2. Tail risk       — 95% daily VaR as a share of portfolio value.
 *   3. Return quality  — annualised Sharpe mapped through a smooth curve.
 *   4. Regime fit      — portfolio σ penalised in stressed regimes.
 *
 * Health = weighted mean of the available sub-gauges (missing ones drop out,
 * weights renormalise). Feeds the SCR-01 briefing and the SCR-02 portfolio
 * vital in the behavioral spec.
 */

export interface HealthInput {
  weights: number[];         // portfolio weights (need not sum to 1; normalised here)
  var95Daily: number;        // 95% 1-day VaR in currency
  totalValue: number;        // portfolio market value
  sharpeAnnual: number;      // annualised Sharpe
  sigmaAnnual: number;       // annualised portfolio vol (fraction, e.g. 0.22)
  regime?: string;           // current regime label
}

export interface HealthGauge { key: string; label: string; score: number; detail: string; }
export interface HealthResult { score: number; band: "strong" | "steady" | "fragile" | "critical"; gauges: HealthGauge[]; }

const clamp = (v: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, v));

/** Smoothly map a value in [lo,hi] to [0,100], clamped. */
function ramp(v: number, lo: number, hi: number): number {
  if (hi === lo) return 50;
  return clamp(((v - lo) / (hi - lo)) * 100);
}

export function computePortfolioHealth(input: HealthInput): HealthResult | null {
  const { weights, var95Daily, totalValue, sharpeAnnual, sigmaAnnual, regime } = input;
  const n = weights.length;
  if (n === 0 || totalValue <= 0) return null;

  const gauges: HealthGauge[] = [];

  // 1. Diversification — effective number of holdings via inverse Herfindahl.
  const sum = weights.reduce((s, w) => s + Math.abs(w), 0) || 1;
  const w = weights.map((x) => Math.abs(x) / sum);
  const hhi = w.reduce((s, x) => s + x * x, 0);
  const effN = hhi > 0 ? 1 / hhi : 1;
  // effN ranges [1, n]; healthy when it approaches the holding count.
  const divScore = n > 1 ? ramp(effN, 1, Math.max(2, n * 0.7)) : 30;
  gauges.push({
    key: "diversification",
    label: "Diversification",
    score: divScore,
    detail: `${effN.toFixed(1)} effective of ${n} holdings`,
  });

  // 2. Tail risk — daily 95% VaR as % of book. 1% → healthy, 6%+ → critical.
  if (totalValue > 0 && var95Daily >= 0) {
    const varPct = (var95Daily / totalValue) * 100;
    const tailScore = ramp(6 - varPct, 0, 5); // 1% loss → 100, 6% → 0
    gauges.push({
      key: "tail",
      label: "Tail risk",
      score: tailScore,
      detail: `${varPct.toFixed(2)}% 1-day VaR₉₅`,
    });
  }

  // 3. Return quality — annualised Sharpe. 0 → 40, 1.5+ → 100, negative → low.
  if (Number.isFinite(sharpeAnnual)) {
    const sharpeScore = ramp(sharpeAnnual, -0.5, 1.8);
    gauges.push({
      key: "return",
      label: "Return quality",
      score: sharpeScore,
      detail: `Sharpe ${sharpeAnnual.toFixed(2)}`,
    });
  }

  // 4. Regime fit — penalise high vol when the regime is stressed.
  const r = (regime || "").toLowerCase();
  const stressed = r.includes("crisis") || r.includes("high vol") || r.includes("bear");
  if (Number.isFinite(sigmaAnnual) && sigmaAnnual > 0) {
    const volPct = sigmaAnnual * 100;
    // In calm regimes tolerate ~35% vol; in stress, tolerate only ~20%.
    const tolerance = stressed ? 20 : 35;
    const regimeScore = ramp(tolerance + 10 - volPct, 0, tolerance);
    gauges.push({
      key: "regime",
      label: "Regime fit",
      score: regimeScore,
      detail: `${volPct.toFixed(0)}% ann. vol · ${stressed ? "stressed" : "benign"} regime`,
    });
  }

  const score = gauges.length
    ? Math.round(gauges.reduce((s, g) => s + g.score, 0) / gauges.length)
    : 0;

  const band: HealthResult["band"] =
    score >= 75 ? "strong" : score >= 55 ? "steady" : score >= 35 ? "fragile" : "critical";

  return { score, band, gauges };
}
