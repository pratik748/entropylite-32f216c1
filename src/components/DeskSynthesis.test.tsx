import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import DeskSynthesis from "./DeskSynthesis";
import type { PortfolioStock } from "@/components/PortfolioPanel";

// No network: historical-prices returns nothing → the graph builds from the
// analysis payload alone (the Desk already holds it), which is exactly the
// worst case we want to prove renders a full synthesis.
vi.mock("@/lib/apiGovernor", () => ({
  governedInvoke: vi.fn().mockResolvedValue({ data: null, error: null }),
}));

vi.mock("@/hooks/useFX", () => ({
  useFX: () => ({
    baseCurrency: "USD",
    indiaMode: false,
    convertToBase: (amount: number) => amount,
  }),
}));

// A realistic analyze-stock payload — enough fields for a rich graph.
const analysis = {
  ticker: "AAPL",
  currentPrice: 220,
  buyPrice: 200,
  quantity: 10,
  currency: "USD",
  riskLevel: "Medium",
  riskScore: 44,
  riskBreakdown: { volatilityRisk: 40, sectorRisk: 35, regulatoryRisk: 30, financialRisk: 28, macroRisk: 42 },
  keyRisks: ["Valuation full", "China demand"],
  bullRange: [245, 270] as [number, number],
  neutralRange: [210, 240] as [number, number],
  bearRange: [180, 205] as [number, number],
  suggestion: "Hold",
  confidence: 68,
  verdict: "Quality compounder at a full price",
  sector: "Technology",
  marketCap: "Large Cap",
  marketCapValue: 3.4e12,
  pe: 29,
  pbv: 45,
  dividendYield: 0.5,
  beta: 1.2,
  betaSource: "yahoo",
  roe: 147,
  debtToEquity: 150,
  technicals: { rsi: 58, support: 205, resistance: 245, trend: "bullish", maSignal: "above_200dma" },
  news: [{ headline: "AAPL beats", source: "yahoo", sentiment: 40 }],
  momentum: 6.5,
  volatility: 26,
  overallSentiment: 30,
  totalPressure: 2.1,
  quantMetrics: { sharpe1y: 0.9, sortino1y: 1.3, maxDrawdown: -22, sigmaAnnual: 26, sessions: 250 },
} as unknown as NonNullable<PortfolioStock["analysis"]>;

const renderSynthesis = () =>
  render(
    <MemoryRouter>
      <DeskSynthesis analysis={analysis} />
    </MemoryRouter>,
  );

describe("DeskSynthesis", () => {
  it("renders the full synthesis, not the assembling placeholder", () => {
    renderSynthesis();
    expect(screen.getByRole("heading", { name: "Evidence Synthesis" })).toBeInTheDocument();
    expect(screen.queryByText(/Assembling evidence synthesis/)).not.toBeInTheDocument();
  });

  it("shows a decisive verdict word", () => {
    renderSynthesis();
    const verdicts = ["Accumulate", "Hold", "Reduce", "Avoid"];
    expect(verdicts.some((v) => screen.queryAllByText(v).length > 0)).toBe(true);
  });

  it("renders the core synthesis sections", () => {
    renderSynthesis();
    expect(screen.getByText("Pillar verdicts")).toBeInTheDocument();
    expect(screen.getByText("Scenario distribution")).toBeInTheDocument();
    expect(screen.getByText("What's driving the verdict")).toBeInTheDocument();
    // All six pillars present.
    for (const p of ["Valuation", "Quality", "Growth", "Health", "Momentum", "Risk"]) {
      expect(screen.getAllByText(p).length).toBeGreaterThan(0);
    }
  });

  it("links to the full Workstation for node-level inspection", () => {
    renderSynthesis();
    const link = screen.getByRole("link", { name: /Inspect every node/ });
    expect(link).toHaveAttribute("href", "/company/AAPL");
  });
});
