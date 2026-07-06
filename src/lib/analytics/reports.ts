/**
 * Report generation — composable, typed institutional reports.
 * ────────────────────────────────────────────────────────────
 * Each generator assembles ReportSections from already-computed analytics.
 * Sections declare which question they answer (what happened / why / what
 * changed / what matters / what to do). Generators never compute new
 * numbers: they select, phrase, and cite. Rendering is the UI's job.
 */

import type {
  InstitutionalReport, ReportSection, ReportBlock, Insight,
  PerformanceMetrics, RiskMetrics, ExposureAnalysis, AttributionAnalysis,
  OptimizerResult, StressResult, HistoricalReplayResult, DataSource, MetricValue,
} from "./types";

export interface ReportContext {
  asOf: number;
  baseCurrency: string;
  totalValue: number;
  totalInvested: number;
  totalPnl: number;
  positionCount: number;
  lookbackDays: number;
  fmt: (v: number) => string;
}

const kpi = (label: string, m: MetricValue, format: "currency" | "percent" | "ratio" | "number"): ReportBlock =>
  ({ kind: "kpi", label, metric: m, format });
const text = (t: string): ReportBlock => ({ kind: "text", text: t });
const insightBlock = (i: Insight): ReportBlock => ({ kind: "insight", insight: i });

function collectSources(sections: ReportSection[]): DataSource[] {
  const set = new Set<DataSource>();
  for (const s of sections)
    for (const b of s.blocks) {
      if (b.kind === "kpi") set.add(b.metric.provenance.source);
      if (b.kind === "insight") set.add(b.insight.provenance.source);
    }
  return Array.from(set);
}

// ─────────────────────────────────────────────────────────────────
// Section builders
// ─────────────────────────────────────────────────────────────────

export function executiveSummarySection(
  ctx: ReportContext,
  perf: PerformanceMetrics | null,
  risk: RiskMetrics | null,
  insights: Insight[],
): ReportSection {
  const blocks: ReportBlock[] = [];
  const ret = ctx.totalInvested > 0 ? ctx.totalPnl / ctx.totalInvested : 0;

  const parts: string[] = [];
  parts.push(
    `The portfolio holds ${ctx.positionCount} position(s) valued at ${ctx.fmt(ctx.totalValue)}, ` +
    `${ctx.totalPnl >= 0 ? "up" : "down"} ${ctx.fmt(Math.abs(ctx.totalPnl))} (${(ret * 100).toFixed(1)}%) against invested capital.`,
  );
  if (perf) {
    parts.push(
      `Over the ${perf.sharpe.provenance.sampleSize}-day history the portfolio compounded at ` +
      `${(perf.cagr.value * 100).toFixed(1)}% annualized with ${(perf.annualVol.value * 100).toFixed(1)}% volatility ` +
      `(Sharpe ${perf.sharpe.value.toFixed(2)}, Sortino ${perf.sortino.value.toFixed(2)}, ` +
      `max drawdown ${(perf.maxDrawdown.value * 100).toFixed(1)}%).`,
    );
    if (perf.benchmark) {
      const b = perf.benchmark;
      parts.push(
        `Against ${b.benchmarkTicker}: beta ${b.beta.value.toFixed(2)}, annualized alpha ` +
        `${(b.alphaAnnual.value * 100).toFixed(1)}%, information ratio ${b.informationRatio.value.toFixed(2)}.`,
      );
    }
  }
  if (risk) {
    parts.push(
      `Risk posture: 1-day 95% VaR of ${(risk.tail.var95.value * 100).toFixed(2)}% of NAV, ` +
      `${risk.concentration.effectiveN.value.toFixed(1)} effective positions, ` +
      `average pairwise correlation ${risk.correlation.avgPairwise.value.toFixed(2)}.`,
    );
  }
  blocks.push(text(parts.join(" ")));

  const actionable = insights.filter(i => i.severity !== "info").slice(0, 3);
  for (const i of actionable) blocks.push(insightBlock(i));

  return {
    id: "executive-summary",
    title: "Executive Summary",
    answers: "What happened, and what matters right now.",
    blocks,
  };
}

export function performanceSection(ctx: ReportContext, perf: PerformanceMetrics): ReportSection {
  const blocks: ReportBlock[] = [
    kpi("CAGR", perf.cagr, "percent"),
    kpi("Annual Volatility", perf.annualVol, "percent"),
    kpi("Sharpe", perf.sharpe, "ratio"),
    kpi("Sortino", perf.sortino, "ratio"),
    kpi("Calmar", perf.calmar, "ratio"),
    kpi("Omega", perf.omega, "ratio"),
    kpi("Max Drawdown", perf.maxDrawdown, "percent"),
  ];
  if (perf.benchmark) {
    const b = perf.benchmark;
    blocks.push(
      kpi(`Alpha vs ${b.benchmarkTicker}`, b.alphaAnnual, "percent"),
      kpi("Beta", b.beta, "ratio"),
      kpi("Tracking Error", b.trackingError, "percent"),
      kpi("Information Ratio", b.informationRatio, "ratio"),
      kpi("Up Capture", b.upCapture, "ratio"),
      kpi("Down Capture", b.downCapture, "ratio"),
    );
  }
  return {
    id: "performance",
    title: "Performance",
    answers: "What happened — absolute and benchmark-relative results.",
    blocks,
  };
}

export function riskSection(ctx: ReportContext, risk: RiskMetrics): ReportSection {
  const t = risk.tail;
  const blocks: ReportBlock[] = [
    kpi("VaR 95% (1d)", t.var95, "percent"),
    kpi("VaR 99% (1d)", t.var99, "percent"),
    kpi("CVaR 95% (1d)", t.cvar95, "percent"),
    ...(t.evtVar99 ? [kpi("EVT VaR 99%", t.evtVar99, "percent")] : []),
    ...(t.evtEs99 ? [kpi("EVT ES 99%", t.evtEs99, "percent")] : []),
    kpi("Skewness", t.skewness, "ratio"),
    kpi("Excess Kurtosis", t.excessKurtosis, "ratio"),
    kpi("HHI", risk.concentration.hhi, "ratio"),
    kpi("Effective N", risk.concentration.effectiveN, "ratio"),
    kpi("Avg Pairwise ρ", risk.correlation.avgPairwise, "ratio"),
    ...(risk.correlation.pc1Share ? [kpi("PC1 Variance Share", risk.correlation.pc1Share, "percent")] : []),
    ...(risk.correlation.diversificationRatio ? [kpi("Diversification Ratio", risk.correlation.diversificationRatio, "ratio")] : []),
    kpi("Current Drawdown", risk.drawdown.currentDrawdown, "percent"),
  ];
  const episodes = risk.drawdown.episodes.filter(e => e.depth >= 0.03).slice(0, 5);
  if (episodes.length > 0) {
    blocks.push({
      kind: "table",
      columns: ["Depth", "Length (days)", "Recovery (days)"],
      rows: episodes.map(e => [
        `${(e.depth * 100).toFixed(1)}%`,
        e.lengthDays,
        e.recoveryDays != null ? e.recoveryDays : "ongoing",
      ]),
    });
  }
  return {
    id: "risk-summary",
    title: "Risk Summary",
    answers: "What could go wrong, and how badly — measured, not assumed.",
    blocks,
  };
}

export function exposureSection(ctx: ReportContext, exposure: ExposureAnalysis): ReportSection {
  const blocks: ReportBlock[] = [];
  const bucketTable = (title: string, buckets: { label: string; weight: number; value: number; count: number }[]) => {
    blocks.push(text(title));
    blocks.push({
      kind: "table",
      columns: ["Bucket", "Weight", "Value", "Positions"],
      rows: buckets.map(b => [b.label, `${(b.weight * 100).toFixed(1)}%`, ctx.fmt(b.value), b.count]),
    });
  };
  bucketTable("Sector exposure", exposure.sector);
  bucketTable("Currency exposure", exposure.currency);
  if (exposure.volatilityStyle) bucketTable("Volatility style (realized terciles)", exposure.volatilityStyle);
  if (exposure.momentumStyle) bucketTable("Momentum style (trailing-return terciles)", exposure.momentumStyle);
  if (exposure.marketBeta) blocks.push(kpi("Portfolio Beta", exposure.marketBeta, "ratio"));
  return {
    id: "exposure",
    title: "Exposure",
    answers: "Where the capital actually sits — sector, currency, style, beta.",
    blocks,
  };
}

export function attributionSection(ctx: ReportContext, attribution: AttributionAnalysis): ReportSection {
  const blocks: ReportBlock[] = [
    {
      kind: "table",
      columns: ["Position", "Weight", "Return", "Return Contribution", "Risk Contribution"],
      rows: attribution.positions.map(p => [
        p.ticker,
        `${(p.weight * 100).toFixed(1)}%`,
        `${p.returnPct >= 0 ? "+" : ""}${p.returnPct.toFixed(1)}%`,
        `${p.contributionPct >= 0 ? "+" : ""}${p.contributionPct.toFixed(2)}pp`,
        p.riskContributionPct != null ? `${(p.riskContributionPct * 100).toFixed(1)}%` : "—",
      ]),
    },
  ];
  if (attribution.brinson) {
    blocks.push(text(`Sector attribution basis: ${attribution.brinsonBenchmarkBasis}.`));
    blocks.push({
      kind: "table",
      columns: ["Sector", "Portfolio W", "Benchmark W", "Allocation", "Total"],
      rows: attribution.brinson.map(b => [
        b.sector,
        `${(b.portfolioWeight * 100).toFixed(1)}%`,
        `${(b.benchmarkWeight * 100).toFixed(1)}%`,
        `${b.allocation >= 0 ? "+" : ""}${b.allocation.toFixed(2)}pp`,
        `${b.total >= 0 ? "+" : ""}${b.total.toFixed(2)}pp`,
      ]),
    });
  }
  return {
    id: "attribution",
    title: "Attribution",
    answers: "Why it happened — which positions and sectors drove the result.",
    blocks,
  };
}

export function scenarioSection(
  ctx: ReportContext,
  stresses: StressResult[],
  replays: HistoricalReplayResult[],
): ReportSection {
  const blocks: ReportBlock[] = [];
  if (stresses.length > 0) {
    blocks.push(text(
      "Scenario impacts are propagated through each position's regression beta " +
      "(single-factor first-order term); shock sizes are documented historical episodes.",
    ));
    blocks.push({
      kind: "table",
      columns: ["Scenario", "Market Shock", "Portfolio Impact", "Est. Loss"],
      rows: stresses.map(s => [
        s.scenario.name,
        `${(s.scenario.marketShock * 100).toFixed(0)}%`,
        `${(s.portfolioImpact.value * 100).toFixed(1)}%`,
        s.lossValue > 0 ? `−${ctx.fmt(s.lossValue)}` : `+${ctx.fmt(-s.lossValue)}`,
      ]),
    });
  }
  if (replays.length > 0) {
    blocks.push(text("Historical replay: worst realized windows in this portfolio's own return history."));
    blocks.push({
      kind: "table",
      columns: ["Window", "Worst Return", "Loss at Current NAV"],
      rows: replays.map(r => [
        `${r.windowDays}d`,
        `${(r.worstReturn.value * 100).toFixed(1)}%`,
        `−${ctx.fmt(r.lossValue)}`,
      ]),
    });
  }
  return {
    id: "scenario",
    title: "Scenario & Stress",
    answers: "What a repeat of known stress episodes would do to this specific book.",
    blocks,
  };
}

export function rebalancingSection(
  ctx: ReportContext,
  recommended: OptimizerResult | null,
  currentWeights: Array<{ ticker: string; weight: number }>,
): ReportSection {
  const blocks: ReportBlock[] = [];
  if (!recommended || !recommended.diagnostics.converged || recommended.weights.length === 0) {
    blocks.push(text(
      recommended
        ? `The ${recommended.label} optimizer did not converge: ${recommended.diagnostics.notes.join("; ") || "insufficient data"}. No recommendation is issued rather than a heuristic fallback.`
        : "Insufficient return history to produce an allocation recommendation.",
    ));
  } else {
    blocks.push(text(
      `Recommended allocation: ${recommended.label} (confidence: ${recommended.diagnostics.confidence}). ` +
      `Assumptions: ${recommended.diagnostics.assumptions.join("; ")}.` +
      (recommended.diagnostics.notes.length > 0 ? ` Notes: ${recommended.diagnostics.notes.join("; ")}.` : ""),
    ));
    const byTicker: Record<string, number> = {};
    recommended.tickers.forEach((t, i) => { byTicker[t] = recommended.weights[i]; });
    blocks.push({
      kind: "table",
      columns: ["Position", "Current", "Target", "Drift", "Action", "Est. Trade"],
      rows: currentWeights.map(c => {
        const target = byTicker[c.ticker] ?? 0;
        const drift = c.weight - target;
        const action = drift > 0.02 ? "TRIM" : drift < -0.02 ? "ADD" : "HOLD";
        return [
          c.ticker,
          `${(c.weight * 100).toFixed(1)}%`,
          `${(target * 100).toFixed(1)}%`,
          `${drift >= 0 ? "+" : ""}${(drift * 100).toFixed(1)}%`,
          action,
          action !== "HOLD" ? ctx.fmt(Math.abs(drift) * ctx.totalValue) : "—",
        ];
      }),
    });
    if (recommended.cashWeight > 0.005) {
      blocks.push(text(`Volatility targeting allocates ${(recommended.cashWeight * 100).toFixed(1)}% to cash.`));
    }
  }
  return {
    id: "rebalancing",
    title: "Rebalancing Recommendations",
    answers: "What the investor should do — target weights, drifts, and the trade list.",
    blocks,
  };
}

// ─────────────────────────────────────────────────────────────────
// Full report assembly
// ─────────────────────────────────────────────────────────────────

export function generateInstitutionalReport(opts: {
  ctx: ReportContext;
  performance: PerformanceMetrics | null;
  risk: RiskMetrics | null;
  exposure: ExposureAnalysis | null;
  attribution: AttributionAnalysis | null;
  insights: Insight[];
  stresses: StressResult[];
  replays: HistoricalReplayResult[];
  recommended: OptimizerResult | null;
  currentWeights: Array<{ ticker: string; weight: number }>;
}): InstitutionalReport {
  const { ctx } = opts;
  const sections: ReportSection[] = [
    executiveSummarySection(ctx, opts.performance, opts.risk, opts.insights),
  ];
  if (opts.performance) sections.push(performanceSection(ctx, opts.performance));
  if (opts.risk) sections.push(riskSection(ctx, opts.risk));
  if (opts.attribution) sections.push(attributionSection(ctx, opts.attribution));
  if (opts.exposure) sections.push(exposureSection(ctx, opts.exposure));
  if (opts.stresses.length > 0 || opts.replays.length > 0) {
    sections.push(scenarioSection(ctx, opts.stresses, opts.replays));
  }
  sections.push(rebalancingSection(ctx, opts.recommended, opts.currentWeights));

  return {
    id: "institutional-report",
    title: "Portfolio Intelligence Report",
    asOf: ctx.asOf,
    baseCurrency: ctx.baseCurrency,
    sections,
    sources: collectSources(sections),
  };
}
