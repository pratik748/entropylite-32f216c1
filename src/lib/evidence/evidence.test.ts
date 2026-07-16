import { describe, it, expect } from "vitest";
import { buildEvidenceGraph, metricsForSection, type BuildInputs } from "./build";
import type { DeskAnalysis, Dossier, Financials } from "./inputs";
import { synthesize } from "./synthesis";
import { annualizedVol, concentrationIndex, maxDrawdown, percentileOfLast, positionIn52w, trailingReturn } from "./compute";
import { WORKSPACES } from "@/components/workstation/registry";

/* ── Fixtures ─────────────────────────────────────────────────── */

function makeBars(sessions = 520, drift = 0.0004, wobble = 0.01) {
  const closes: number[] = [];
  const volumes: number[] = [];
  const timestamps: number[] = [];
  let p = 100;
  const t0 = Math.floor(Date.now() / 1000) - sessions * 86400;
  for (let i = 0; i < sessions; i++) {
    p = p * (1 + drift + wobble * Math.sin(i / 9) * (i % 3 === 0 ? 1 : -0.6));
    closes.push(Number(p.toFixed(2)));
    volumes.push(1_000_000 + (i % 20) * 40_000);
    timestamps.push(t0 + i * 86400);
  }
  return { closes, volumes, timestamps };
}

const analysisFixture: DeskAnalysis = {
  currentPrice: 227.5,
  currency: "USD",
  riskLevel: "medium",
  riskScore: 48,
  riskBreakdown: { volatilityRisk: 40, sectorRisk: 52, regulatoryRisk: 30, financialRisk: 35, macroRisk: 55 },
  keyRisks: ["Concentration"],
  bullRange: [240, 265],
  neutralRange: [215, 240],
  bearRange: [185, 215],
  suggestion: "Hold",
  confidence: 62,
  verdict: "Range-bound between supports.",
  sector: "Technology",
  marketCap: "Large Cap",
  marketCapValue: 3.4e12,
  pe: 31.2,
  pbv: 46.1,
  dividendYield: 0.5,
  beta: 1.15,
  roe: 147.2,
  debtToEquity: 154,
  technicals: { rsi: 58.2, support: 214, resistance: 243, trend: "sideways", maSignal: "above_200dma" },
  news: [{ headline: "x", sentiment: 10 }],
  momentum: 1.4,
  volatility: 24.8,
  overallSentiment: 12,
  totalPressure: 3,
  quantMetrics: { sharpe1y: 0.9, sortino1y: 1.1, maxDrawdown: -18.2, sigmaAnnual: 24.8, sessions: 250 },
};

const dossierFixture: Dossier = {
  companyName: "Test Corp",
  revenueSegments: [
    { segment: "Hardware", percentage: 52, trend: "stable" },
    { segment: "Services", percentage: 28, trend: "growing" },
    { segment: "Wearables", percentage: 20, trend: "stable" },
  ],
  geographicRevenue: [
    { region: "Americas", percentage: 43 },
    { region: "Europe", percentage: 25 },
    { region: "Greater China", percentage: 19 },
    { region: "Rest", percentage: 13 },
  ],
  ownership: { insiderPct: 2, institutionalPct: 61, retailPct: 37, topHolders: [] },
  insiderActivity: [
    { name: "A", role: "CEO", action: "sell", shares: 100000, date: "2026-05-01", signal: "bearish" },
    { name: "B", role: "CFO", action: "buy", shares: 20000, date: "2026-05-10", signal: "bullish" },
  ],
  narrative: {
    newsSentiment: 18,
    socialSentiment: 5,
    analystConsensus: "buy",
    earningsTone: "positive",
    narrativeShifts: [],
    analystTargets: { low: 190, median: 250, high: 300 },
  },
  signals: {
    supplyChainRisk: 58,
    ownershipStability: 72,
    competitiveMoat: 84,
    regulatoryRisk: 46,
    insiderConfidence: 44,
    narrativeMomentum: 61,
  },
  regulatoryExposure: [{ issue: "DMA", severity: "medium", region: "EU", status: "active" }],
};

const financialsFixture: Financials = {
  symbol: "TEST",
  currency: "USD",
  marketCap: 3.42e12,
  income: [
    { period: "FY2025", revenue: 391e9, grossProfit: 180.7e9, operatingIncome: 123.2e9, netIncome: 93.7e9 },
    { period: "FY2024", revenue: 383.3e9, grossProfit: 169.1e9, operatingIncome: 114.3e9, netIncome: 97e9 },
    { period: "FY2023", revenue: 394.3e9, grossProfit: 170.8e9, operatingIncome: 119.4e9, netIncome: 99.8e9 },
  ],
  balance: [
    { period: "FY2025", totalAssets: 365e9, totalLiabilities: 308e9, equity: 57e9, cash: 30e9, longTermDebt: 96e9, currentAssets: 153e9, currentLiabilities: 176e9 },
    { period: "FY2024", totalAssets: 353e9, totalLiabilities: 290e9, equity: 62e9, cash: 29.9e9, longTermDebt: 106e9, currentAssets: 143e9, currentLiabilities: 145e9 },
  ],
  cashflow: [
    { period: "FY2025", operatingCF: 118e9, capex: -11e9, freeCF: 107e9, dividendsPaid: -15.2e9, buybacks: -94.9e9, netIncome: 93.7e9 },
    { period: "FY2024", operatingCF: 110.5e9, capex: -10.9e9, freeCF: 99.6e9, dividendsPaid: -15e9, buybacks: -77.5e9, netIncome: 97e9 },
  ],
  ratios: {
    grossMargin: 0.462, operatingMargin: 0.315, netMargin: 0.24,
    returnOnEquity: 1.472, returnOnAssets: 0.257,
    currentRatio: 0.87, quickRatio: 0.83, debtToEquity: 154,
    totalCash: 62e9, totalDebt: 110e9, ebitda: 134e9,
    operatingCashflow: 118e9, freeCashflow: 107e9,
    revenueGrowth: 0.02, earningsGrowth: -0.034,
  },
  asOf: Date.now(),
};

const fullInputs: BuildInputs = {
  ticker: "TEST",
  analysis: analysisFixture,
  bars: makeBars(),
  dossier: dossierFixture,
  quote: { price: 227.5, currency: "USD" },
  financials: financialsFixture,
};

/* ── compute helpers ──────────────────────────────────────────── */

describe("evidence compute helpers", () => {
  const bars = makeBars();

  it("computes sane derived statistics", () => {
    const vol = annualizedVol(bars.closes);
    expect(vol).not.toBeNull();
    expect(vol!).toBeGreaterThan(0);
    expect(vol!).toBeLessThan(200);

    const dd = maxDrawdown(bars.closes);
    expect(dd).not.toBeNull();
    expect(dd!).toBeLessThanOrEqual(0);

    const pos = positionIn52w(bars.closes);
    expect(pos).toBeGreaterThanOrEqual(0);
    expect(pos).toBeLessThanOrEqual(100);

    const r = trailingReturn(bars.closes, 252);
    expect(r).not.toBeNull();
  });

  it("computes percentiles and concentration", () => {
    expect(percentileOfLast([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])).toBe(100);
    expect(concentrationIndex([100])).toBe(100);
    expect(concentrationIndex([25, 25, 25, 25])).toBe(25);
    expect(concentrationIndex([])).toBeNull();
  });
});

/* ── graph builder ────────────────────────────────────────────── */

describe("buildEvidenceGraph", () => {
  const graph = buildEvidenceGraph(fullInputs);

  it("builds a rich graph from full inputs", () => {
    expect(graph.order.length).toBeGreaterThanOrEqual(25);
    expect(graph.coverage.total).toBe(graph.order.length);
    expect(graph.coverage.estimated).toBeGreaterThan(0);
  });

  it("every node satisfies the evidence contract", () => {
    for (const id of graph.order) {
      const m = graph.metrics[id];
      expect(m.definition.length, `${id} definition`).toBeGreaterThan(10);
      expect(m.calculation.length, `${id} calculation`).toBeGreaterThan(5);
      expect(m.whyItMatters.length, `${id} whyItMatters`).toBeGreaterThan(10);
      expect(m.assessment.reason.length, `${id} reason`).toBeGreaterThan(5);
      expect(Math.abs(m.thesisWeight), `${id} weight bounds`).toBeLessThanOrEqual(1);
      if (m.value != null) expect(Number.isFinite(m.value), `${id} finite`).toBe(true);
      for (const r of m.relatedIds) expect(graph.metrics[r], `${id} related ${r}`).toBeTruthy();
    }
  });

  it("degrades gracefully with missing sources (never throws, still yields evidence)", () => {
    const noDossier = buildEvidenceGraph({ ...fullInputs, dossier: null });
    expect(noDossier.order.length).toBeGreaterThanOrEqual(15);
    const noBars = buildEvidenceGraph({ ...fullInputs, bars: null });
    expect(noBars.order.length).toBeGreaterThanOrEqual(15);
    const bare = buildEvidenceGraph({ ticker: "X", analysis: null, bars: null, dossier: null, quote: null });
    expect(bare.order.length).toBe(0);
    expect(() => synthesize(bare, null, null)).not.toThrow();
  });

  it("covers every registry section with at least one evidence node (nothing blank), except declared narrative sections", () => {
    // Sections whose primary content is synthesis/dossier detail views rather
    // than metric nodes; they render custom content, never a blank screen.
    const narrativeSections = new Set([
      "overview/summary", // custom synthesis view
      "thesis/investment-thesis",
      "thesis/key-drivers",
      "thesis/cases",
      "thesis/validation",
      "thesis/breakers",
      "thesis/confidence",
      "thesis/recommendation",
      "competition/network", // dossier competitor table
      "intelligence/management", // dossier leadership view
      "intelligence/earnings-calls",
      "risk/monte-carlo", // simulation chart + spread node renders here too
      "risk/portfolio-impact",
      "risk/stress",
    ]);
    for (const ws of WORKSPACES) {
      for (const s of ws.sections) {
        const key = `${ws.id}/${s.id}`;
        const hits = metricsForSection(graph, key);
        if (!narrativeSections.has(key)) {
          expect(hits.length, `section ${key} must have evidence`).toBeGreaterThan(0);
        }
      }
    }
  });
});

/* ── synthesis ────────────────────────────────────────────────── */

describe("synthesize", () => {
  const graph = buildEvidenceGraph(fullInputs);
  const syn = synthesize(graph, analysisFixture, 227.5);

  it("produces a complete, deterministic synthesis", () => {
    expect(["ACCUMULATE", "HOLD", "REDUCE", "AVOID"]).toContain(syn.action);
    expect(syn.confidence).toBeGreaterThanOrEqual(35);
    expect(syn.confidence).toBeLessThanOrEqual(90);
    expect(syn.pillars).toHaveLength(6);
    for (const p of syn.pillars) {
      expect(p.score).toBeGreaterThanOrEqual(0);
      expect(p.score).toBeLessThanOrEqual(100);
    }
    expect(syn.headline.length).toBeGreaterThan(20);
    expect(syn.narrative.length).toBeGreaterThan(0);
    // Deterministic: same inputs → same output.
    const again = synthesize(buildEvidenceGraph(fullInputs), analysisFixture, 227.5);
    expect(again.action).toBe(syn.action);
    expect(again.confidence).toBe(syn.confidence);
  });

  it("prices cases from engine ranges and keeps probabilities coherent", () => {
    const total = syn.cases.reduce((a, c) => a + c.probability, 0);
    expect(total).toBeGreaterThanOrEqual(97);
    expect(total).toBeLessThanOrEqual(103);
    const bull = syn.cases.find((c) => c.id === "bull")!;
    const bear = syn.cases.find((c) => c.id === "bear")!;
    expect(bull.target).toBe(265);
    expect(bear.target).toBe(185);
    expect(bull.returnPct!).toBeGreaterThan(0);
    expect(bear.returnPct!).toBeLessThan(0);
    for (const c of syn.cases) for (const a of c.anchorIds) expect(graph.metrics[a]).toBeTruthy();
  });

  it("evaluates breakers as live predicates over the graph", () => {
    expect(syn.breakers.length).toBeGreaterThanOrEqual(4);
    for (const b of syn.breakers) {
      expect(["intact", "watch", "tripped"]).toContain(b.state);
      for (const n of b.nodeIds) expect(graph.metrics[n]).toBeTruthy();
    }
    // Force a structure break and confirm the breaker trips.
    const crashed: BuildInputs = {
      ...fullInputs,
      bars: (() => {
        const b = makeBars();
        const last = b.closes[b.closes.length - 1];
        for (let i = 0; i < 30; i++) b.closes.push(Number((last * (1 - 0.02 * (i + 1))).toFixed(2)));
        for (let i = 0; i < 30; i++) { b.volumes.push(1_000_000); b.timestamps.push(b.timestamps[b.timestamps.length - 1] + 86400); }
        return b;
      })(),
    };
    const crashedSyn = synthesize(buildEvidenceGraph(crashed), analysisFixture, 140);
    const structure = crashedSyn.breakers.find((b) => b.id === "structure_break");
    expect(structure).toBeTruthy();
    expect(["watch", "tripped"]).toContain(structure!.state);
  });

  it("keeps the ledger auditable", () => {
    const { supporting, opposing, neutral, movers } = syn.ledger;
    expect(supporting + opposing + neutral).toBe(graph.order.length);
    expect(movers.length).toBeGreaterThan(0);
    for (const m of movers) expect(graph.metrics[m.id]).toBeTruthy();
  });
});

/* ── relationship engine, contributions, history ─────────────── */

import { EVIDENCE_RELATIONS, alignment, connectedIds, neighborhood, valuationSensitivity } from "./relations";
import { scoreContributions } from "./synthesis";
import { diffSnapshot } from "./history";
import { parseCapString } from "./build";

describe("evidence relationship engine", () => {
  const graph = buildEvidenceGraph(fullInputs);

  it("declares edges only between known node ids with named mechanisms", () => {
    const knownIds = new Set(Object.keys(buildEvidenceGraph(fullInputs).metrics));
    for (const rel of EVIDENCE_RELATIONS) {
      expect(rel.note.length, `${rel.from}→${rel.to} note`).toBeGreaterThan(20);
      expect([1, -1]).toContain(rel.polarity);
      // Every edge endpoint must be an id the builder can produce.
      expect(knownIds.has(rel.from) || knownIds.has(rel.to), `${rel.from}→${rel.to}`).toBe(true);
    }
  });

  it("resolves neighborhoods against the live graph without dead ends", () => {
    const hood = neighborhood(graph, "roe");
    expect(hood.drivers.length + hood.driven.length).toBeGreaterThan(0);
    for (const e of [...hood.drivers, ...hood.driven]) {
      expect(graph.metrics[e.metric.id]).toBeTruthy();
    }
    expect(connectedIds(graph, "roe").has("roe")).toBe(true);
    expect(connectedIds(graph, null).size).toBe(0);
  });

  it("splits neighbors into corroborating and countervailing evidence", () => {
    const { supporting, opposing } = alignment(graph, "risk_composite");
    for (const e of supporting) expect(e.metric.thesisWeight * graph.metrics["risk_composite"].thesisWeight).toBeGreaterThan(0);
    for (const e of opposing) expect(e.metric.thesisWeight * graph.metrics["risk_composite"].thesisWeight).toBeLessThan(0);
  });

  it("computes deterministic valuation sensitivity from actual operands", () => {
    const sens = valuationSensitivity(graph, 227.5);
    expect(sens).not.toBeNull();
    expect(sens!.rows).toHaveLength(4);
    const reversion = sens!.rows.find((r) => r.scenario.includes("18×"))!;
    // price × (18 / 31.2)
    expect(reversion.implied).toBeCloseTo(227.5 * (18 / 31.2), 0);
    expect(valuationSensitivity(buildEvidenceGraph({ ...fullInputs, analysis: null }), 227.5)).toBeNull();
  });
});

describe("causal contribution scoring", () => {
  const graph = buildEvidenceGraph(fullInputs);

  it("amplifies corroborated evidence and stays bounded", () => {
    const contributions = scoreContributions(graph);
    expect(contributions).toHaveLength(graph.order.length);
    for (const c of contributions) {
      expect(Math.abs(c.scored)).toBeLessThanOrEqual(1);
      if (c.base === 0) expect(c.scored).toBe(0);
      // Sign never flips through propagation — drivers scale, they don't invert.
      if (c.base !== 0) expect(Math.sign(c.scored)).toBe(Math.sign(c.base));
    }
    // roe has an aligned driver (moat) in the fixture → amplified above base.
    const roe = contributions.find((c) => c.id === "roe")!;
    expect(Math.abs(roe.scored)).toBeGreaterThan(Math.abs(roe.base));
    expect(roe.via.length).toBeGreaterThan(0);
  });

  it("feeds the synthesis ledger", () => {
    const syn = synthesize(graph, analysisFixture, 227.5);
    expect(syn.contributions).toHaveLength(graph.order.length);
    expect(syn.ledger.supporting + syn.ledger.opposing + syn.ledger.neutral).toBe(graph.order.length);
  });
});

describe("historical intelligence", () => {
  it("diffs snapshots into material changes, grade flips first", () => {
    const graph = buildEvidenceGraph(fullInputs);
    const prev = {
      ts: Date.now() - 86400000,
      nodes: Object.fromEntries(
        graph.order.map((id) => {
          const m = graph.metrics[id];
          if (id === "pe") return [id, { v: 24.0, g: "neutral" as const, w: 0 }];
          if (id === "volatility") return [id, { v: m.value, g: m.assessment.grade, w: m.thesisWeight }];
          return [id, { v: m.value, g: m.assessment.grade, w: m.thesisWeight }];
        }),
      ),
    };
    const changes = diffSnapshot(prev, graph);
    const peChange = changes.find((c) => c.id === "pe");
    expect(peChange).toBeTruthy();
    expect(peChange!.regraded).toBe(true);
    expect(changes[0].regraded).toBe(true);
    expect(peChange!.deltaPct).toBeCloseTo(30, 0);
  });
});

describe("robustness fixes", () => {
  it("parses capitalization strings", () => {
    expect(parseCapString("$3.4T")).toBe(3.4e12);
    expect(parseCapString("620B")).toBe(620e9);
    expect(parseCapString("₹1,20,000 Cr")).toBe(120000 * 1e7);
    expect(parseCapString("large cap")).toBeNull();
    expect(parseCapString(null)).toBeNull();
  });

  it("market cap renders a size class when the numeric value is missing", () => {
    const g = buildEvidenceGraph({
      ...fullInputs,
      analysis: { ...analysisFixture, marketCapValue: undefined, marketCap: "Large Cap" },
    });
    const cap = g.metrics["market_cap"];
    expect(cap).toBeTruthy();
    expect(cap.value == null ? cap.displayText : "has-value").toBeTruthy();
  });

  it("grades bank leverage against the financial-sector frame", () => {
    const g = buildEvidenceGraph({
      ...fullInputs,
      analysis: { ...analysisFixture, sector: "Financial Services", debtToEquity: 890 },
    });
    expect(g.metrics["debt_equity"].assessment.grade).toBe("neutral");
    expect(g.metrics["debt_equity"].assessment.reason).toMatch(/capital ratios/i);
  });

  it("every node carries confidence and provenance-consistent bounds", () => {
    const g = buildEvidenceGraph(fullInputs);
    for (const id of g.order) {
      const m = g.metrics[id];
      expect(m.confidence).toBeGreaterThan(0.4);
      expect(m.confidence).toBeLessThanOrEqual(0.95);
      if (m.provenance === "model") expect(m.confidence).toBeLessThanOrEqual(0.6);
    }
  });
});


/* ── statement pipeline nodes ─────────────────────────────────── */

describe("statement-derived evidence", () => {
  const graph = buildEvidenceGraph(fullInputs);

  it("fills the core financial sections with reported nodes", () => {
    for (const id of ["revenue", "revenue_growth", "gross_margin", "operating_margin", "net_margin", "fcf", "fcf_conversion", "net_debt", "current_ratio", "capital_returned", "capex_intensity"]) {
      expect(graph.metrics[id], `node ${id}`).toBeTruthy();
      expect(graph.metrics[id].provenance).toBe("reported");
    }
    expect(metricsForSection(graph, "financials/income-statement").length).toBeGreaterThanOrEqual(3);
    expect(metricsForSection(graph, "financials/cash-flow").length).toBeGreaterThanOrEqual(3);
    expect(metricsForSection(graph, "financials/earnings-quality").length).toBeGreaterThanOrEqual(1);
    expect(metricsForSection(graph, "financials/cash-generation").length).toBeGreaterThanOrEqual(3);
  });

  it("computes the derived figures correctly from the fixture", () => {
    expect(graph.metrics["gross_margin"].value).toBeCloseTo(46.2, 1);
    // FCF conversion: 107B / 93.7B ≈ 114%
    expect(graph.metrics["fcf_conversion"].value).toBeCloseTo(114, 0);
    expect(graph.metrics["fcf_conversion"].assessment.grade).toBe("good");
    // Net debt 110 − 62 = 48B; 48/134 EBITDA ≈ 0.36× → serviceable
    expect(graph.metrics["net_debt"].value).toBeCloseTo(48e9, -9);
    // Margin history carries the three fiscal years
    expect(graph.metrics["gross_margin"].history.length).toBe(3);
    // Capital returned 15.2 + 94.9 = 110.1B (103% of FCF → neutral)
    expect(graph.metrics["capital_returned"].value).toBeCloseTo(110.1e9, -9);
  });

  it("market cap uses the statement pipeline when the engine lacks it", () => {
    const g = buildEvidenceGraph({
      ...fullInputs,
      analysis: { ...analysisFixture, marketCapValue: undefined, marketCap: undefined },
    });
    expect(g.metrics["market_cap"].value).toBe(3.42e12);
  });

  it("degrades to the pre-statement graph when financials are absent", () => {
    const g = buildEvidenceGraph({ ...fullInputs, financials: null });
    expect(g.metrics["revenue"]).toBeUndefined();
    expect(g.order.length).toBeGreaterThanOrEqual(25);
  });
});

/* ── institutional analytics (per-section computed views) ─────── */

import {
  computeCapitalStructure,
  computeCashCascade,
  computeDuPont,
  computeHealthScore,
  computeRiskDecomposition,
} from "./analytics";

describe("institutional analytics", () => {
  it("derives capital structure without the statement pipeline", () => {
    const s = computeCapitalStructure(null, analysisFixture);
    expect(s).not.toBeNull();
    expect(s!.source).toBe("derived");
    // book equity = market cap / P/B = 3.4e12 / 46.1
    expect(s!.bookEquity).toBeCloseTo(3.4e12 / 46.1, -8);
    // total debt = book equity × D/E% = bookEquity × 1.54
    expect(s!.totalDebt).toBeCloseTo((3.4e12 / 46.1) * 1.54, -8);
    expect(s!.debtFundingPct).toBeGreaterThan(0);
  });

  it("prefers reported statements for capital structure", () => {
    const s = computeCapitalStructure(financialsFixture, analysisFixture);
    expect(s!.source).toBe("reported");
    expect(s!.totalDebt).toBe(110e9);
    expect(s!.netDebt).toBe(110e9 - 62e9);
  });

  it("computes the three-factor DuPont identity", () => {
    const d = computeDuPont(financialsFixture, analysisFixture);
    expect(d).not.toBeNull();
    expect(d!.factors).toHaveLength(3);
    // net margin × asset turnover × equity multiplier ≈ ROE
    const product = d!.factors.reduce((acc, f) => acc * (f.unit === "%" ? f.value / 100 : f.value), 1);
    expect(product * 100).toBeCloseTo(d!.roe, 0);
  });

  it("falls back to a two-factor DuPont from analysis alone", () => {
    const d = computeDuPont(null, analysisFixture);
    expect(d!.source).toBe("derived");
    expect(d!.factors).toHaveLength(2);
  });

  it("builds a monotonic cash conversion cascade", () => {
    const c = computeCashCascade(financialsFixture);
    expect(c!.length).toBeGreaterThanOrEqual(5);
    expect(c![0].id).toBe("revenue");
    expect(c![0].conversionPct).toBeNull();
    for (const step of c!.slice(1)) expect(step.conversionPct).not.toBeNull();
  });

  it("scores a solvency scorecard with a band", () => {
    const h = computeHealthScore(financialsFixture, analysisFixture);
    expect(h).not.toBeNull();
    expect(h!.score).toBeLessThanOrEqual(h!.max);
    expect(["Fortress", "Sound", "Watch", "Strained"]).toContain(h!.band);
    for (const c of h!.checks) expect(typeof c.pass).toBe("boolean");
  });

  it("decomposes composite risk into ranked factors summing to 100% share", () => {
    const r = computeRiskDecomposition(analysisFixture);
    expect(r).not.toBeNull();
    const shareSum = r!.factors.reduce((s, f) => s + f.share, 0);
    expect(shareSum).toBeGreaterThanOrEqual(97);
    expect(shareSum).toBeLessThanOrEqual(103);
    // ranked descending
    for (let i = 1; i < r!.factors.length; i++) expect(r!.factors[i - 1].value).toBeGreaterThanOrEqual(r!.factors[i].value);
  });
});

/* ── quantitative synthesis & availability ────────────────────── */

describe("quantitative synthesis", () => {
  it("normalCdf matches known quantiles", async () => {
    const { normalCdf } = await import("./compute");
    expect(normalCdf(0)).toBeCloseTo(0.5, 6);
    expect(normalCdf(1.959964)).toBeCloseTo(0.975, 4);
    expect(normalCdf(-1.959964)).toBeCloseTo(0.025, 4);
    expect(normalCdf(Infinity)).toBe(1);
    expect(normalCdf(-Infinity)).toBe(0);
  });

  it("derives case probabilities from the log-normal model, not fixed priors", () => {
    const graph = buildEvidenceGraph(fullInputs);
    const syn = synthesize(graph, analysisFixture, 227.5);
    const byId = Object.fromEntries(syn.cases.map((c) => [c.id, c]));
    // Tails clamped to a real floor, base keeps meaningful mass.
    expect(byId.bull.probability).toBeGreaterThanOrEqual(5);
    expect(byId.bear.probability).toBeGreaterThanOrEqual(5);
    expect(byId.base.probability).toBeGreaterThanOrEqual(8);
    expect(syn.cases.reduce((a, c) => a + c.probability, 0)).toBe(100);
    // Deterministic across identical inputs.
    const again = synthesize(buildEvidenceGraph(fullInputs), analysisFixture, 227.5);
    expect(again.cases.map((c) => c.probability)).toEqual(syn.cases.map((c) => c.probability));
  });
});

describe("section availability", () => {
  const settled = { state: "live" as const, fetchedAt: Date.now() };
  const dead = { state: "unavailable" as const, fetchedAt: null };
  const mkData = (over: Partial<Record<"analysis" | "bars" | "dossier" | "quote" | "financials", unknown>>) => ({
    quote: { price: 227.5, currency: "USD" },
    analysis: analysisFixture,
    bars: makeBars(),
    dossier: dossierFixture,
    financials: financialsFixture,
    bootstrapping: false,
    status: {
      quote: settled,
      analysis: settled,
      bars: settled,
      dossier: settled,
      financials: settled,
      ...(over.financials === null ? { financials: dead } : {}),
      ...(over.dossier === null ? { dossier: dead } : {}),
    },
    ...over,
  });

  it("keeps every populated section when all sources are live", async () => {
    const { computeAvailableSections } = await import("@/components/workstation/availability");
    const data = mkData({});
    const graph = buildEvidenceGraph(fullInputs);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const available = computeAvailableSections(data as any, graph);
    for (const key of [
      "financials/income-statement",
      "financials/balance-sheet",
      "financials/cash-generation",
      "risk/risk-analysis",
      "structure/technical",
      "thesis/recommendation",
    ]) {
      expect(available.has(key)).toBe(true);
    }
  });

  it("withdraws statement sections when financials are unpullable but keeps the derived balance sheet", async () => {
    const { computeAvailableSections } = await import("@/components/workstation/availability");
    const data = mkData({ financials: null });
    const graph = buildEvidenceGraph({ ...fullInputs, financials: null });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const available = computeAvailableSections(data as any, graph);
    expect(available.has("financials/income-statement")).toBe(false);
    expect(available.has("financials/cash-flow")).toBe(false);
    // Capital structure derives from market cap ÷ P/B and D/E — stays.
    expect(available.has("financials/balance-sheet")).toBe(true);
    expect(available.has("overview/summary")).toBe(true);
  });

  it("withdraws dossier registers when the dossier is unpullable and no nodes cover them", async () => {
    const { computeAvailableSections } = await import("@/components/workstation/availability");
    const data = mkData({ dossier: null });
    const graph = buildEvidenceGraph({ ...fullInputs, dossier: null });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const available = computeAvailableSections(data as any, graph);
    const { metricsForSection: mfs } = await import("./build");
    for (const key of ["ecosystem/supply-chain", "intelligence/earnings-calls"]) {
      expect(available.has(key)).toBe(mfs(graph, key).length > 0);
    }
  });
});
