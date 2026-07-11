/**
 * Portfolio analytics tools — thin wrappers over the deterministic engines
 * in src/lib/analytics and src/lib/quant. No calculation happens here; these
 * tools assemble inputs (holdings + governed history fetches), invoke the
 * engines, and record provenance facts from the engines' MetricValues.
 */

import { computePerformanceMetrics } from "@/lib/analytics/performance";
import { computeRiskMetrics, runStressScenario, STRESS_SCENARIOS } from "@/lib/analytics/risk";
import { runOptimizer, OPTIMIZER_LABELS } from "@/lib/analytics/optimizers";
import type { OptimizerId, StressScenario } from "@/lib/analytics/types";
import { ledoitWolfShrinkage, covToCorr } from "@/lib/quant/covariance";
import { registerTool } from "../registry";
import type { PortfolioPosition } from "../types";
import {
  alignSeries, estimateBetas, fetchHistory, logReturns, metricToFact,
  portfolioReturns, positionWeights, round,
} from "./dataHub";

function requirePositions(positions: PortfolioPosition[]): PortfolioPosition[] {
  if (positions.length === 0) throw new Error("The portfolio is empty — nothing to analyze.");
  return positions;
}

/** Fetch + align holdings history; shared by every returns-based tool. */
async function holdingsReturns(positions: PortfolioPosition[], range: string) {
  const { tickers, weights, totalValue } = positionWeights(positions);
  const { data, cached } = await fetchHistory(tickers, range);
  const present = tickers.map((t, i) => ({ t, i })).filter(({ t }) => (data[t]?.closes?.length || 0) >= 21);
  if (present.length === 0) throw new Error("No usable price history for the current holdings.");
  const series = alignSeries(present.map(({ t }) => logReturns(data[t].closes)));
  const usedTickers = present.map(({ t }) => t);
  const rawWeights = present.map(({ i }) => weights[i]);
  const wSum = rawWeights.reduce((s, w) => s + w, 0) || 1;
  const usedWeights = rawWeights.map((w) => w / wSum);
  const missing = tickers.filter((t) => !usedTickers.includes(t));
  return {
    tickers: usedTickers, weights: usedWeights, series,
    portRets: portfolioReturns(series, usedWeights),
    totalValue, cached, missing,
  };
}

registerTool({
  name: "portfolio.snapshot",
  description: "Current holdings: tickers, quantities, cost basis, live P&L, value weights. Always cheap — reads application state.",
  category: "portfolio",
  permission: "read",
  keywords: ["holdings", "positions", "pnl", "portfolio", "weights", "conviction"],
  parameters: {},
  execute: async (_params, ctx) => {
    const positions = requirePositions(ctx.host.getPositions());
    const { weights, totalValue } = positionWeights(positions);
    const rows = positions.map((p, i) => {
      const last = p.currentPrice ?? p.buyPrice;
      const pnlPct = p.buyPrice > 0 ? ((last - p.buyPrice) / p.buyPrice) * 100 : 0;
      const a = (p.analysis || {}) as Record<string, unknown>;
      return {
        id: p.id, ticker: p.ticker, quantity: p.quantity, buyPrice: p.buyPrice,
        lastPrice: last, currency: p.currency,
        pnlPct: round(pnlPct, 2), weightPct: round(weights[i] * 100, 2),
        suggestion: (a.suggestion as string) || null,
        confidence: typeof a.confidence === "number" ? a.confidence : null,
      };
    });
    ctx.recordFact({ label: "portfolio total value (base ccy)", value: round(totalValue, 2), tool: "portfolio.snapshot" });
    for (const r of rows) {
      ctx.recordFact({ label: `${r.ticker} P&L`, value: r.pnlPct, unit: "%", tool: "portfolio.snapshot" });
      ctx.recordFact({ label: `${r.ticker} weight`, value: r.weightPct, unit: "%", tool: "portfolio.snapshot" });
    }
    return { data: { totalValue: round(totalValue, 2), positions: rows }, source: "portfolio-state" };
  },
});

registerTool({
  name: "portfolio.performance",
  description: "Institutional performance metrics for the whole portfolio from real return history: CAGR, vol, Sharpe, Sortino, Calmar, Omega, max drawdown; optional benchmark regression (alpha, beta, tracking error).",
  category: "portfolio",
  permission: "read",
  keywords: ["sharpe", "returns", "cagr", "volatility", "drawdown", "alpha", "beta", "performance"],
  parameters: {
    range: { type: "enum", values: ["3mo", "6mo", "1y", "2y"], default: "6mo" },
    benchmark: { type: "string", description: "Optional benchmark ticker, e.g. SPY or ^NSEI" },
  },
  execute: async (params, ctx) => {
    const positions = requirePositions(ctx.host.getPositions());
    const h = await holdingsReturns(positions, params.range as string);
    let benchmarkReturns: number[] | undefined;
    const benchmark = params.benchmark as string | undefined;
    const caveats: string[] = [];
    if (h.missing.length) caveats.push(`excluded (no history): ${h.missing.join(", ")}`);
    if (benchmark) {
      try {
        const b = await fetchHistory([benchmark], params.range as string);
        const key = Object.keys(b.data)[0];
        const bRets = logReturns(b.data[key]?.closes || []);
        benchmarkReturns = bRets.slice(-h.portRets.length);
      } catch {
        caveats.push(`benchmark ${benchmark} history unavailable — benchmark stats omitted`);
      }
    }
    const perf = computePerformanceMetrics({
      portfolioReturns: h.portRets,
      benchmarkReturns,
      benchmarkTicker: benchmark,
    });
    if (!perf) throw new Error(`Need ≥20 daily observations; got ${h.portRets.length}.`);
    ctx.recordFact(metricToFact("portfolio CAGR", perf.cagr, "portfolio.performance"));
    ctx.recordFact(metricToFact("portfolio annual vol", perf.annualVol, "portfolio.performance"));
    ctx.recordFact(metricToFact("portfolio Sharpe", perf.sharpe, "portfolio.performance"));
    ctx.recordFact(metricToFact("portfolio Sortino", perf.sortino, "portfolio.performance"));
    ctx.recordFact(metricToFact("portfolio max drawdown", perf.maxDrawdown, "portfolio.performance"));
    if (perf.benchmark) {
      ctx.recordFact(metricToFact(`beta vs ${benchmark}`, perf.benchmark.beta, "portfolio.performance"));
      ctx.recordFact(metricToFact(`annual alpha vs ${benchmark}`, perf.benchmark.alphaAnnual, "portfolio.performance"));
    }
    const { rolling: _rolling, ...compact } = perf;
    return { data: compact, cached: h.cached, source: `historical-prices ${params.range}`, caveats };
  },
});

registerTool({
  name: "portfolio.risk",
  description: "Portfolio risk decomposition from real history: drawdown analysis, concentration (HHI, top weights), correlation risk (avg pairwise, PC1 share, diversification ratio), tail risk (VaR/CVaR 95, EVT VaR/ES 99).",
  category: "risk",
  permission: "read",
  keywords: ["risk", "var", "cvar", "tail", "concentration", "correlation", "expected shortfall"],
  parameters: {
    range: { type: "enum", values: ["3mo", "6mo", "1y", "2y"], default: "6mo" },
  },
  execute: async (params, ctx) => {
    const positions = requirePositions(ctx.host.getPositions());
    const h = await holdingsReturns(positions, params.range as string);
    const lw = h.series.length >= 2 ? ledoitWolfShrinkage(h.series) : null;
    const correlation = lw ? covToCorr(lw.sigma) : [[1]];
    const risk = computeRiskMetrics({
      portfolioReturns: h.portRets,
      positions: h.tickers.map((t, i) => ({ ticker: t, weight: h.weights[i], sector: "unclassified" })),
      correlation,
      covariance: lw?.sigma,
      weightsAligned: h.weights,
    });
    ctx.recordFact(metricToFact("VaR 95 (daily)", risk.tail.var95, "portfolio.risk"));
    ctx.recordFact(metricToFact("CVaR 95 (daily)", risk.tail.cvar95, "portfolio.risk"));
    if (risk.tail.evtVar99) ctx.recordFact(metricToFact("EVT VaR 99", risk.tail.evtVar99, "portfolio.risk"));
    ctx.recordFact(metricToFact("max drawdown", risk.drawdown.maxDrawdown, "portfolio.risk"));
    ctx.recordFact(metricToFact("concentration HHI", risk.concentration.hhi, "portfolio.risk"));
    const caveats = ["sector concentration unclassified — position-level only"];
    if (h.missing.length) caveats.push(`excluded (no history): ${h.missing.join(", ")}`);
    if (lw) caveats.push(`Ledoit–Wolf shrinkage δ=${round(lw.delta, 3)}`);
    return { data: risk, cached: h.cached, source: `historical-prices ${params.range}`, caveats };
  },
});

registerTool({
  name: "portfolio.stress_test",
  description: "Stress the portfolio through per-asset betas. Named historical scenarios (gfc, covid, vol2018, rate150, mild, melt) or a CUSTOM market shock — e.g. 'oil at $120' → estimate the equity-index impact and pass it as customShockPct with a describing basis.",
  category: "risk",
  permission: "read",
  keywords: ["stress", "scenario", "shock", "crash", "what if", "drawdown"],
  parameters: {
    scenario: { type: "enum", values: ["gfc", "covid", "vol2018", "rate150", "mild", "melt", "custom"], default: "custom" },
    customShockPct: { type: "number", min: -80, max: 80, description: "Market shock in percent (custom scenario), e.g. -12" },
    customBasis: { type: "string", description: "One-line description of the hypothetical, e.g. 'Brent to $120: energy-cost shock to equities'" },
    benchmark: { type: "string", default: "SPY", description: "Market factor used for beta estimation" },
    range: { type: "enum", values: ["6mo", "1y", "2y"], default: "1y" },
  },
  execute: async (params, ctx) => {
    const positions = requirePositions(ctx.host.getPositions());
    const h = await holdingsReturns(positions, params.range as string);

    let scenario: StressScenario;
    if (params.scenario === "custom") {
      const shock = params.customShockPct as number | undefined;
      if (shock === undefined) throw new Error("custom scenario requires customShockPct");
      scenario = {
        id: "custom",
        name: (params.customBasis as string) || `Custom ${shock}% market shock`,
        basis: (params.customBasis as string) || "user-defined hypothetical market shock",
        marketShock: shock / 100,
      };
    } else {
      scenario = STRESS_SCENARIOS.find((s) => s.id === params.scenario)!;
    }

    const caveats: string[] = [];
    let market: number[] | null = null;
    let betaBasis = `OLS vs ${params.benchmark} (${params.range})`;
    try {
      const b = await fetchHistory([params.benchmark as string], params.range as string);
      const key = Object.keys(b.data)[0];
      market = logReturns(b.data[key]?.closes || []);
    } catch { /* fall through to proxy */ }
    if (!market || market.length < 20) {
      // Equal-weight basket proxy — disclosed, never silent.
      const T = h.series[0].length;
      market = new Array(T).fill(0).map((_, t) => h.series.reduce((s, r) => s + r[t], 0) / h.series.length);
      betaBasis = "OLS vs equal-weight holdings basket (benchmark history unavailable)";
      caveats.push("benchmark unavailable — betas estimated against the holdings basket itself");
    }
    const T = Math.min(market.length, h.series[0].length);
    const betas = estimateBetas(h.series.map((s) => s.slice(-T)), market.slice(-T));

    const result = runStressScenario({
      scenario,
      positions: h.tickers.map((t, i) => ({ ticker: t, weight: h.weights[i], beta: betas[i] })),
      portfolioValue: h.totalValue,
      betaSampleSize: T,
      betaBasis,
    });
    ctx.recordFact(metricToFact(`stress impact — ${scenario.name}`, result.portfolioImpact, "portfolio.stress_test"));
    ctx.recordFact({ label: `stress loss value — ${scenario.name}`, value: round(result.lossValue, 2), tool: "portfolio.stress_test" });
    for (const p of result.positionImpacts.slice(0, 5)) {
      ctx.recordFact({ label: `${p.ticker} stress impact (β=${round(p.beta, 2)})`, value: round(p.impact * 100, 2), unit: "%", tool: "portfolio.stress_test" });
    }
    return { data: result, cached: h.cached, source: "covariance-estimate", caveats: [...caveats, ...result.portfolioImpact.provenance.assumptions || []] };
  },
});

registerTool({
  name: "portfolio.optimize",
  description: `Run a portfolio optimizer over the current holdings and return target weights with diagnostics. Optimizers: ${Object.entries(OPTIMIZER_LABELS).map(([k, v]) => `${k} (${v})`).join(", ")}. Black–Litterman accepts optional views.`,
  category: "portfolio",
  permission: "read",
  keywords: ["optimize", "allocation", "weights", "black litterman", "risk parity", "hrp", "cvar", "rebalance"],
  parameters: {
    optimizer: { type: "enum", required: true, values: ["equal_weight", "min_variance", "mean_variance", "robust_mean_variance", "risk_parity", "risk_budget", "hrp", "black_litterman", "min_cvar"] },
    range: { type: "enum", values: ["6mo", "1y", "2y"], default: "1y" },
    maxWeight: { type: "number", min: 0.05, max: 1, description: "Cap on any single weight" },
    views: {
      type: "array",
      description: "Black–Litterman views: expected annual return per ticker with confidence 0–1",
      items: {
        type: "object",
        properties: {
          ticker: { type: "string", required: true },
          expectedReturnAnnual: { type: "number", required: true, description: "e.g. 0.12 for 12%" },
          confidence: { type: "number", min: 0.05, max: 1, default: 0.5 },
        },
      },
    },
  },
  execute: async (params, ctx) => {
    const positions = requirePositions(ctx.host.getPositions());
    if (positions.length < 2) throw new Error("Optimization needs at least 2 positions.");
    const h = await holdingsReturns(positions, params.range as string);
    const lw = ledoitWolfShrinkage(h.series);
    if (!lw) throw new Error("Covariance estimation failed — insufficient aligned history.");
    const mu = h.series.map((s) => s.reduce((a, b) => a + b, 0) / s.length);

    const views = ((params.views as Array<{ ticker: string; expectedReturnAnnual: number; confidence: number }>) || [])
      .map((v) => {
        const idx = h.tickers.findIndex((t) => t.toUpperCase().startsWith(v.ticker.toUpperCase().split(".")[0]));
        if (idx < 0) return null;
        // Absolute view on one asset: one-hot view portfolio, with the stated
        // annual return de-annualized to the daily units of Σ and μ.
        const viewPortfolio = new Array(h.tickers.length).fill(0);
        viewPortfolio[idx] = 1;
        return { portfolio: viewPortfolio, expectedReturn: v.expectedReturnAnnual / 252, confidence: v.confidence ?? 0.5 };
      })
      .filter((v): v is NonNullable<typeof v> => v !== null);

    const result = runOptimizer(params.optimizer as OptimizerId, {
      tickers: h.tickers,
      sigma: lw.sigma,
      mu,
      returnSeries: h.series,
      currentWeights: h.weights,
      sampleSize: h.series[0].length,
      constraints: params.maxWeight ? { maxWeight: params.maxWeight as number } : undefined,
      views,
    });
    if (!result) throw new Error(`${OPTIMIZER_LABELS[params.optimizer as OptimizerId]} did not converge on this covariance — no allocation asserted.`);

    result.tickers.forEach((t, i) => {
      ctx.recordFact({
        label: `${result.label} weight — ${t}`, value: round(result.weights[i] * 100, 2), unit: "%",
        tool: "portfolio.optimize", confidence: result.diagnostics.confidence,
      });
    });
    ctx.recordFact({ label: `${result.label} expected annual vol`, value: round(result.volAnnual * 100, 2), unit: "%", tool: "portfolio.optimize", confidence: result.diagnostics.confidence });
    ctx.recordFact({ label: `${result.label} turnover vs current`, value: round(result.turnoverFromCurrent * 100, 2), unit: "%", tool: "portfolio.optimize" });
    return {
      data: result,
      cached: h.cached,
      source: "covariance-estimate",
      confidence: result.diagnostics.confidence,
      caveats: [`Ledoit–Wolf δ=${round(lw.delta, 3)}`, ...(h.missing.length ? [`excluded: ${h.missing.join(", ")}`] : [])],
    };
  },
});

registerTool({
  name: "compare.assets",
  description: "Side-by-side quantitative comparison of 2–4 tickers from real history: annualized return, vol, Sharpe, max drawdown, correlation between them, plus live prices.",
  category: "market",
  permission: "read",
  keywords: ["compare", "versus", "vs", "relative", "side by side"],
  parameters: {
    tickers: { type: "array", required: true, items: { type: "string" }, minItems: 2, maxItems: 4 },
    range: { type: "enum", values: ["3mo", "6mo", "1y", "2y"], default: "6mo" },
  },
  execute: async (params, ctx) => {
    const { data, cached } = await fetchHistory(params.tickers as string[], params.range as string);
    const entries = Object.entries(data).filter(([, s]) => (s?.closes?.length || 0) >= 21);
    if (entries.length < 2) throw new Error("Need usable history for at least 2 of the requested tickers.");
    const aligned = alignSeries(entries.map(([, s]) => logReturns(s.closes)));
    const rows = entries.map(([t], i) => {
      const perf = computePerformanceMetrics({ portfolioReturns: aligned[i] });
      if (!perf) return { ticker: t, error: "insufficient history" };
      ctx.recordFact(metricToFact(`${t} annual return`, perf.annualReturn, "compare.assets"));
      ctx.recordFact(metricToFact(`${t} annual vol`, perf.annualVol, "compare.assets"));
      ctx.recordFact(metricToFact(`${t} Sharpe`, perf.sharpe, "compare.assets"));
      ctx.recordFact(metricToFact(`${t} max drawdown`, perf.maxDrawdown, "compare.assets"));
      return {
        ticker: t,
        annualReturn: round(perf.annualReturn.value, 4),
        annualVol: round(perf.annualVol.value, 4),
        sharpe: round(perf.sharpe.value, 3),
        maxDrawdown: round(perf.maxDrawdown.value, 4),
        observations: aligned[i].length,
      };
    });
    let correlation: number | null = null;
    if (aligned.length >= 2) {
      const lw = ledoitWolfShrinkage(aligned.slice(0, 2));
      if (lw) {
        correlation = round(covToCorr(lw.sigma)[0][1], 3);
        ctx.recordFact({ label: `correlation ${entries[0][0]} / ${entries[1][0]}`, value: correlation, tool: "compare.assets" });
      }
    }
    return { data: { rows, pairCorrelation: correlation, range: params.range }, cached, source: `historical-prices ${params.range}` };
  },
});

registerTool({
  name: "portfolio.what_changed",
  description: "Diff the portfolio against a lookback window: per-position price moves, biggest gainers/losers, total value change. Powers 'what changed since yesterday'.",
  category: "portfolio",
  permission: "read",
  keywords: ["changed", "yesterday", "diff", "movers", "today", "since"],
  parameters: {
    lookbackDays: { type: "number", min: 1, max: 30, default: 1, integer: true },
  },
  execute: async (params, ctx) => {
    const positions = requirePositions(ctx.host.getPositions());
    const { data, cached } = await fetchHistory(positions.map((p) => p.ticker), "1mo");
    const lookback = params.lookbackDays as number;
    const moves = positions.map((p) => {
      const closes = data[p.ticker]?.closes || [];
      if (closes.length < lookback + 1) return { ticker: p.ticker, changePct: null };
      const prev = closes[closes.length - 1 - lookback];
      const last = p.currentPrice ?? closes[closes.length - 1];
      const changePct = prev > 0 ? round(((last - prev) / prev) * 100, 2) : null;
      if (changePct !== null) {
        ctx.recordFact({ label: `${p.ticker} ${lookback}d move`, value: changePct, unit: "%", tool: "portfolio.what_changed", cached });
      }
      const value = (p.currentPrice ?? p.buyPrice) * p.quantity;
      return { ticker: p.ticker, changePct, valueImpact: changePct !== null ? round(value * changePct / 100, 2) : null };
    });
    const ranked = moves.filter((m) => m.changePct !== null).sort((a, b) => (a.changePct! - b.changePct!));
    return {
      data: { lookbackDays: lookback, moves, worst: ranked.slice(0, 3), best: ranked.slice(-3).reverse() },
      cached,
      source: "historical-prices 1mo + live portfolio state",
    };
  },
});
