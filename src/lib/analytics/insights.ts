/**
 * Insight synthesis — deterministic rules over computed metrics only.
 * ───────────────────────────────────────────────────────────────────
 * Every insight is generated from a MetricValue that already carries its
 * provenance; the rule threshold is stated in the insight text. There is no
 * generative step and no way to emit a claim that is not backed by a number
 * computed upstream. Confidence is inherited from the underlying metric.
 */

import type {
  Insight, PerformanceMetrics, RiskMetrics, ExposureAnalysis,
  AttributionAnalysis, OptimizerResult, MetricValue,
} from "./types";

const pct = (v: number, dp = 1) => `${(v * 100).toFixed(dp)}%`;

function fromMetric(
  id: string,
  severity: Insight["severity"],
  title: string,
  statement: string,
  recommendation: string | null,
  m: MetricValue,
): Insight {
  return { id, severity, title, statement, recommendation, provenance: m.provenance };
}

export function synthesizeInsights(opts: {
  performance: PerformanceMetrics | null;
  risk: RiskMetrics | null;
  exposure: ExposureAnalysis | null;
  attribution: AttributionAnalysis | null;
  recommended?: OptimizerResult | null;
}): Insight[] {
  const { performance: perf, risk, exposure, attribution, recommended } = opts;
  const out: Insight[] = [];

  // ── Performance ────────────────────────────────────────────────
  if (perf) {
    const sharpe = perf.sharpe;
    if (sharpe.value < 0) {
      out.push(fromMetric("perf-sharpe-neg", "action", "Negative risk-adjusted return",
        `Sharpe ratio is ${sharpe.value.toFixed(2)} over ${sharpe.provenance.sampleSize} trading days — the portfolio has not compensated for the risk taken relative to the risk-free rate.`,
        "Review the loss drivers in the attribution section before adding risk.", sharpe));
    } else if (sharpe.value >= 1) {
      out.push(fromMetric("perf-sharpe-strong", "info", "Strong risk-adjusted performance",
        `Sharpe ratio of ${sharpe.value.toFixed(2)} over ${sharpe.provenance.sampleSize} trading days (≥ 1.0 is institutionally strong).`,
        null, sharpe));
    }

    if (perf.benchmark) {
      const b = perf.benchmark;
      if (Math.abs(b.alphaAnnual.value) > 0.02 && b.rSquared.value > 0.3) {
        const sign = b.alphaAnnual.value > 0 ? "positive" : "negative";
        out.push(fromMetric("perf-alpha", b.alphaAnnual.value > 0 ? "info" : "watch",
          `${sign === "positive" ? "Positive" : "Negative"} alpha vs ${b.benchmarkTicker}`,
          `Annualized alpha of ${pct(b.alphaAnnual.value)} vs ${b.benchmarkTicker} (β=${b.beta.value.toFixed(2)}, R²=${b.rSquared.value.toFixed(2)}).`,
          b.alphaAnnual.value < 0 ? "Active positions are underperforming a passive holding of the benchmark at the same beta." : null,
          b.alphaAnnual.value !== 0 ? b.alphaAnnual : b.beta));
      }
      if (b.downCapture.value > 1.1 && b.upCapture.value < b.downCapture.value) {
        out.push(fromMetric("perf-capture-asym", "watch", "Unfavorable capture asymmetry",
          `Down-capture of ${(b.downCapture.value * 100).toFixed(0)}% exceeds up-capture of ${(b.upCapture.value * 100).toFixed(0)}% vs ${b.benchmarkTicker} — the portfolio amplifies benchmark losses more than gains.`,
          "Consider reducing high-beta positions or adding defensive weight.", b.downCapture));
      }
    }
  }

  // ── Risk ───────────────────────────────────────────────────────
  if (risk) {
    const conc = risk.concentration;
    if (conc.topPositionWeight.value > 0.35) {
      out.push(fromMetric("risk-conc-pos", "action", "Single-position concentration",
        `Largest position is ${pct(conc.topPositionWeight.value)} of the portfolio; effective diversification is ${conc.effectiveN.value.toFixed(1)} positions across ${conc.positionCount} holdings.`,
        "Trim the top position toward the optimizer target to reduce idiosyncratic risk.", conc.topPositionWeight));
    } else if (conc.hhi.value > 0.30) {
      out.push(fromMetric("risk-conc-hhi", "watch", "Elevated concentration",
        `HHI of ${conc.hhi.value.toFixed(2)} implies only ${conc.effectiveN.value.toFixed(1)} effective positions.`,
        "Diversification benefit is limited; review the rebalancing recommendations.", conc.hhi));
    }

    if (risk.correlation.pc1Share && risk.correlation.pc1Share.value > 0.55) {
      out.push(fromMetric("risk-pc1", "action", "Systemic factor dominance",
        `${pct(risk.correlation.pc1Share.value, 0)} of portfolio variance sits in the first principal component — holdings move together and diversification is largely illusory.`,
        "Add assets with low correlation to the existing cluster, or reduce gross exposure.", risk.correlation.pc1Share));
    }

    if (risk.correlation.avgPairwise.value > 0.6) {
      out.push(fromMetric("risk-corr", "watch", "High average correlation",
        `Average pairwise correlation is ${risk.correlation.avgPairwise.value.toFixed(2)} across the book.`,
        null, risk.correlation.avgPairwise));
    }

    const dd = risk.drawdown;
    if (dd.currentDrawdown.value > 0.10) {
      out.push(fromMetric("risk-dd-current", "watch", "Portfolio underwater",
        `Currently ${pct(dd.currentDrawdown.value)} below its equity peak (max historical drawdown ${pct(dd.maxDrawdown.value)}).`,
        dd.avgRecoveryDays
          ? `Comparable drawdowns historically took ~${Math.round(dd.avgRecoveryDays.value)} trading days to recover.`
          : null,
        dd.currentDrawdown));
    }

    const t = risk.tail;
    if (t.evtVar99 && t.var99.value > 0 && t.evtVar99.value > t.var99.value * 1.3) {
      out.push(fromMetric("risk-evt", "watch", "Fat tail beyond the sample",
        `EVT-extrapolated 99% VaR (${pct(t.evtVar99.value)}) is ${(t.evtVar99.value / t.var99.value).toFixed(1)}× the empirical 99% VaR (${pct(t.var99.value)}) — the historical sample understates tail risk.`,
        "Size positions against the EVT number, not the empirical percentile.", t.evtVar99));
    }
    if (t.skewness.value < -0.5) {
      out.push(fromMetric("risk-skew", "info", "Negatively skewed returns",
        `Return skewness of ${t.skewness.value.toFixed(2)} with excess kurtosis ${t.excessKurtosis.value.toFixed(1)} — losses cluster larger than gains.`,
        null, t.skewness));
    }
  }

  // ── Exposure ───────────────────────────────────────────────────
  if (exposure) {
    const topSector = exposure.sector[0];
    if (topSector && topSector.weight > 0.5) {
      out.push({
        id: "exp-sector", severity: "watch", title: "Sector concentration",
        statement: `${topSector.label} is ${pct(topSector.weight)} of the portfolio (${topSector.count} position(s)).`,
        recommendation: "A sector-level shock would dominate portfolio outcomes; consider cross-sector diversification.",
        provenance: { source: "portfolio-state", calculation: "sector value / total value", sampleSize: exposure.sector.length, confidence: "high" },
      });
    }
    if (exposure.currency.length > 1) {
      const nonBase = exposure.currency.slice(1).reduce((s, c) => s + c.weight, 0);
      if (nonBase > 0.3) {
        out.push({
          id: "exp-fx", severity: "info", title: "Material currency exposure",
          statement: `${pct(nonBase)} of portfolio value is denominated outside the largest currency bucket (${exposure.currency[0].label}).`,
          recommendation: "FX moves are an unhedged return driver at this weight.",
          provenance: { source: "portfolio-state", calculation: "currency value / total value", sampleSize: exposure.currency.length, confidence: "high" },
        });
      }
    }
    if (exposure.marketBeta && exposure.marketBeta.value > 1.3) {
      out.push(fromMetric("exp-beta", "watch", "High market beta",
        `Value-weighted portfolio beta of ${exposure.marketBeta.value.toFixed(2)} — expect ~${exposure.marketBeta.value.toFixed(1)}× market moves in both directions.`,
        "Stress results scale with this beta; see scenario analysis.", exposure.marketBeta));
    }
  }

  // ── Attribution ────────────────────────────────────────────────
  if (attribution && attribution.positions.length >= 2) {
    const best = attribution.positions[0];
    const worst = attribution.positions[attribution.positions.length - 1];
    if (best.contributionPct > 0) {
      out.push({
        id: "attr-best", severity: "info", title: "Top contributor",
        statement: `${best.ticker} contributed ${best.contributionPct.toFixed(1)}pp of portfolio return (weight ${pct(best.weight)}, position return ${best.returnPct.toFixed(1)}%).`,
        recommendation: null,
        provenance: { source: "portfolio-state", calculation: "weight × position return vs cost basis", sampleSize: attribution.positions.length, confidence: "high" },
      });
    }
    if (worst.contributionPct < 0) {
      out.push({
        id: "attr-worst", severity: "watch", title: "Largest detractor",
        statement: `${worst.ticker} cost ${Math.abs(worst.contributionPct).toFixed(1)}pp of portfolio return (weight ${pct(worst.weight)}, position return ${worst.returnPct.toFixed(1)}%).`,
        recommendation: worst.riskContributionPct != null && worst.riskContributionPct > worst.weight * 1.5
          ? `It also consumes ${pct(worst.riskContributionPct)} of portfolio risk — outsized on both dimensions.`
          : null,
        provenance: { source: "portfolio-state", calculation: "weight × position return vs cost basis", sampleSize: attribution.positions.length, confidence: "high" },
      });
    }
  }

  // ── Optimizer ──────────────────────────────────────────────────
  if (recommended && recommended.diagnostics.converged && recommended.turnoverFromCurrent > 0.15) {
    out.push({
      id: "opt-drift", severity: "watch", title: "Allocation drift vs target",
      statement: `Moving to the ${recommended.label} allocation requires ${pct(recommended.turnoverFromCurrent)} one-way turnover (target σₐ ${pct(recommended.volAnnual)}).`,
      recommendation: "See the rebalancing recommendations for the trade list.",
      provenance: {
        source: "covariance-estimate",
        calculation: `Σ|w_target − w_current|; ${recommended.label} on shrunk Σ`,
        sampleSize: 0,
        confidence: recommended.diagnostics.confidence,
        assumptions: recommended.diagnostics.assumptions,
      },
    });
  }

  const order = { action: 0, watch: 1, info: 2 } as const;
  return out.sort((a, b) => order[a.severity] - order[b.severity]);
}
