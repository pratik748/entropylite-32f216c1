import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import DeskPortfolioMode from "./DeskPortfolioMode";
import type { PortfolioStock } from "@/components/PortfolioPanel";

// No network: every edge call resolves empty, so the quant snapshot never
// becomes ready. That is the worst credible state — the book mode must still
// render an honest surface from the analysis payloads alone (verdicts +
// news), showing "—" for unmeasured quantities instead of fabricating them.
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

const stock = (over: Record<string, unknown>): PortfolioStock => ({
  id: String(over.ticker),
  ticker: String(over.ticker),
  buyPrice: 100,
  quantity: 10,
  isLoading: false,
  ...over,
  analysis: {
    currentPrice: 110,
    currency: "USD",
    suggestion: "Hold",
    confidence: 60,
    sector: "Technology",
    ...(over.analysis as Record<string, unknown>),
  },
});

describe("DeskPortfolioMode", () => {
  it("declines to synthesize a book of one", () => {
    render(<DeskPortfolioMode stocks={[stock({ ticker: "AAPL" })]} />);
    expect(screen.getByText(/at least two analyzed positions/i)).toBeInTheDocument();
  });

  it("renders verdict-driven directives and book news without any quant history", () => {
    const stocks = [
      stock({
        ticker: "AAPL",
        analysis: {
          suggestion: "Exit",
          confidence: 72,
          totalPressure: -4,
          overallSentiment: -20,
          news: [{ headline: "Regulator opens probe", category: "Company", sentiment: -30, shortTermImpact: -5, longTermImpact: -3, confidence: 70, explanation: "…" }],
        },
      }),
      stock({ ticker: "MSFT", analysis: { suggestion: "Add", confidence: 66 } }),
    ];
    render(<DeskPortfolioMode stocks={stocks} />);

    expect(screen.getByText("Book Synthesis")).toBeInTheDocument();
    // Desk verdict Exit + negative news pressure agree → TRIM, unsized
    // (no optimizer target without return history — sized manually).
    expect(screen.getByText("TRIM")).toBeInTheDocument();
    expect(screen.getAllByText(/size manually/i).length).toBeGreaterThan(0);
    // Lone Add verdict → ADD.
    expect(screen.getByText("ADD")).toBeInTheDocument();
    // Book-level news roll-up with its non-prediction disclaimer.
    expect(screen.getByText(/News pressure on the book/i)).toBeInTheDocument();
    expect(screen.getByText(/not measured or predicted price moves/i)).toBeInTheDocument();
    // Advisory-only footer and unavailable optimizer disclosed, not faked.
    expect(screen.getByText(/advisory only/i)).toBeInTheDocument();
    expect(screen.getByText(/unavailable \(needs ≥2 assets with return history\)/i)).toBeInTheDocument();
  });
});
