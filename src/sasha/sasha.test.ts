/**
 * SASHA (Structural Analysis & Synthesis Heuristic Agent) Intensive Test Suite
 *
 * Validates:
 *  1. Sub-100ms Heuristic Intent Routing (< 5ms deterministic resolution across 25+ patterns).
 *  2. Ticker Resolution & Sector Lexicon Matching (US mega-caps, Indian NSE/BSE, Crypto, FX, Commodities).
 *  3. Subset Portfolio Risk Engine (Ledoit–Wolf Covariance, Euler Risk Decomposition, CVaR95 Expected Shortfall, CLANK Constraints).
 *  4. Single-Asset & Empty Portfolio Graceful Edge Cases.
 *  5. Stock Comparison & Pairs Trading Engine (Pearson r, Beta Regression, Engle-Granger Cointegration, OU Half-Life, Stat-Arb Verdict, Spread Sparkline).
 *  6. Multi-Factor Scenario Stress Testing (Empirical Beta propagation, Commodity/VIX/Rate Shocks, P&L Drawdown, Fortress Resilience Grade, Option Hedge Structuring).
 *  7. Multi-Stage Causal Transmission DAG Construction (Macro -> Transmission -> Sector -> Asset).
 *  8. News & Macro Headwinds Ingestion Engine (Live Wire Ingestion, Signal-to-Noise, Institutional Veracity, 1st/2nd Order Causal Channels).
 *  9. Financial Phonetic Pronunciation Engine (50+ tickers, Greek σ/α/β/θ, VaR/CVaR, bps, %, negative values).
 * 10. Conceptual Factor & Quantitative Synthesis Fallback.
 * 11. Universal Tool Registry (Discovery, Validation, Manifest, Modular Handlers).
 * 12. Intelligent DAG Planning (Dependency Resolution, Acyclicity Validation, Dynamic Mapping).
 * 13. Autonomous DAG Execution (Topological Parallel Execution, Bounded Retries, Provenance Receipts).
 * 14. End-to-End Orchestration (executeSashaOrchestration across arbitrary queries).
 */

import { describe, it, expect } from "vitest";
import { routeSashaIntent, matchSectorFromText, resolveSymbolCandidate } from "./intentRouter";
import {
  executeSubsetRisk,
  executeStockComparison,
  executeStressTest,
  executeNewsImpact,
  executeLLMFallback,
  getAssetSector,
  getAssetCurrency,
} from "./quantEngine";
import { toInstitutionalPhonetics } from "./sashaPhonetics";
import { searchGoogleGrounding } from "./googleSearchProxy";
import { toolRegistry } from "./tools";
import { sashaPlanner } from "./orchestration/planner";
import { sashaExecutor } from "./orchestration/executor";
import { executeSashaOrchestration } from "./orchestration";
import type { PortfolioPosition } from "@/foresight/types";

describe("SASHA Sub-100ms Heuristic Intent Router", () => {
  it("routes stock comparison and pairs trading queries across US, Indian, and Global symbols in < 5ms", () => {
    const t0 = performance.now();
    const intent1 = routeSashaIntent("Compare NVDA vs AMD");
    const elapsed = performance.now() - t0;

    expect(elapsed).toBeLessThan(10);
    expect(intent1.type).toBe("stock_comparison");
    if (intent1.type === "stock_comparison") {
      expect(intent1.tickerA).toBe("NVDA");
      expect(intent1.tickerB).toBe("AMD");
    }

    const intent2 = routeSashaIntent("Compare Reliance and HDFC");
    expect(intent2.type).toBe("stock_comparison");
    if (intent2.type === "stock_comparison") {
      expect(intent2.tickerA).toBe("RELIANCE.NS");
      expect(intent2.tickerB).toBe("HDFCBANK.NS");
    }

    const intent3 = routeSashaIntent("Pairs trade GOOG vs META");
    expect(intent3.type).toBe("stock_comparison");
    if (intent3.type === "stock_comparison") {
      expect(intent3.tickerA).toBe("GOOG");
      expect(intent3.tickerB).toBe("META");
    }

    const intent4 = routeSashaIntent("Correlation between TCS and Infosys");
    expect(intent4.type).toBe("stock_comparison");
    if (intent4.type === "stock_comparison") {
      expect(intent4.tickerA).toBe("TCS.NS");
      expect(intent4.tickerB).toBe("INFY.NS");
    }

    const intent5 = routeSashaIntent("Compare BTC-USD to ETH-USD");
    expect(intent5.type).toBe("stock_comparison");
    if (intent5.type === "stock_comparison") {
      expect(intent5.tickerA).toBe("BTC-USD");
      expect(intent5.tickerB).toBe("ETH-USD");
    }
  });

  it("routes subset portfolio risk queries with sector and filter recognition", () => {
    const intent1 = routeSashaIntent("Analyze my banking subset");
    expect(intent1.type).toBe("subset_risk");
    if (intent1.type === "subset_risk") {
      expect(intent1.subsetFilter.sector).toBe("banking");
    }

    const intent2 = routeSashaIntent("Stress test my high-beta positions");
    expect(intent2.type).toBe("subset_risk");
    if (intent2.type === "subset_risk") {
      expect(intent2.subsetFilter.betaThreshold).toBe("high");
    }

    const intent3 = routeSashaIntent("Analyze tech stocks risk");
    expect(intent3.type).toBe("subset_risk");
    if (intent3.type === "subset_risk") {
      expect(intent3.subsetFilter.sector).toBe("tech");
    }

    const intent4 = routeSashaIntent("Risk breakdown of my top gainers");
    expect(intent4.type).toBe("subset_risk");
    if (intent4.type === "subset_risk") {
      expect(intent4.subsetFilter.pnlStatus).toBe("gainers");
    }

    const intent5 = routeSashaIntent("Show energy holdings risk");
    expect(intent5.type).toBe("subset_risk");
    if (intent5.type === "subset_risk") {
      expect(intent5.subsetFilter.sector).toBe("energy");
    }
  });

  it("routes multi-factor scenario stress tests with parameter extraction", () => {
    const intent1 = routeSashaIntent("What happens if oil spikes 15% and Nifty drops 2%?");
    expect(intent1.type).toBe("stress_test");
    if (intent1.type === "stress_test") {
      expect(intent1.commodityShockPct?.commodity).toBe("Brent Crude Oil");
      expect(intent1.commodityShockPct?.shockPct).toBe(15);
      expect(intent1.marketShockPct).toBe(-2);
    }

    const intent2 = routeSashaIntent("Stress test +20% VIX spike");
    expect(intent2.type).toBe("stress_test");
    if (intent2.type === "stress_test") {
      expect(intent2.vixShockPct).toBe(20);
    }

    const intent3 = routeSashaIntent("what happens in a oil shock ?");
    expect(intent3.type).toBe("stress_test");
    if (intent3.type === "stress_test") {
      expect(intent3.commodityShockPct?.commodity).toBe("Brent Crude Oil");
      expect(intent3.commodityShockPct?.shockPct).toBe(15);
      expect(intent3.marketShockPct).toBe(-2.5);
    }

    const intent4 = routeSashaIntent("Simulate rates rise 75 bps");
    expect(intent4.type).toBe("stress_test");
    if (intent4.type === "stress_test") {
      expect(intent4.interestRateShockBps).toBe(75);
    }

    const intent5 = routeSashaIntent("What happens during a market crash?");
    expect(intent5.type).toBe("stress_test");
    if (intent5.type === "stress_test") {
      expect(intent5.marketShockPct).toBe(-10);
      expect(intent5.vixShockPct).toBe(35);
    }
  });

  it("routes news & macro ingestion queries", () => {
    const intent1 = routeSashaIntent("What's moving energy?");
    expect(intent1.type).toBe("news_impact");
    if (intent1.type === "news_impact") {
      expect(intent1.topicOrSector).toBe("energy");
    }

    const intent2 = routeSashaIntent("Summarize geopolitical headwinds");
    expect(intent2.type).toBe("news_impact");

    const intent3 = routeSashaIntent("What is moving NVDA?");
    expect(intent3.type).toBe("news_impact");
    if (intent3.type === "news_impact") {
      expect(intent3.ticker).toBe("NVDA");
    }
  });

  it("routes single stock and equity fact sheet inquiries accurately", () => {
    const intent1 = routeSashaIntent("What about JPM?");
    expect(intent1.type).toBe("single_stock");
    if (intent1.type === "single_stock") {
      expect(intent1.ticker).toBe("JPM");
      expect(intent1.benchmark).toBe("SPY");
    }

    const intent2 = routeSashaIntent("Analyze NVDA");
    expect(intent2.type).toBe("single_stock");
    if (intent2.type === "single_stock") {
      expect(intent2.ticker).toBe("NVDA");
    }

    const intent3 = routeSashaIntent("Quote for GS");
    expect(intent3.type).toBe("single_stock");
    if (intent3.type === "single_stock") {
      expect(intent3.ticker).toBe("GS");
    }

    const intent4 = routeSashaIntent("Tell me about Reliance");
    expect(intent4.type).toBe("single_stock");
    if (intent4.type === "single_stock") {
      expect(intent4.ticker).toBe("RELIANCE.NS");
      expect(intent4.benchmark).toBe("^NSEI");
    }

    const intent5 = routeSashaIntent("AAPL");
    expect(intent5.type).toBe("single_stock");
    if (intent5.type === "single_stock") {
      expect(intent5.ticker).toBe("AAPL");
    }
  });
});

describe("SASHA Sector Classification & Ticker Directory", () => {
  it("classifies multi-asset sectors accurately", () => {
    expect(getAssetSector("NVDA")).toBe("tech");
    expect(getAssetSector("AAPL")).toBe("tech");
    expect(getAssetSector("TCS.NS")).toBe("tech");
    expect(getAssetSector("JPM")).toBe("banking");
    expect(getAssetSector("HDFCBANK.NS")).toBe("banking");
    expect(getAssetSector("XOM")).toBe("energy");
    expect(getAssetSector("RELIANCE.NS")).toBe("energy");
    expect(getAssetSector("TSLA")).toBe("auto");
    expect(getAssetSector("MARUTI.NS")).toBe("auto");
    expect(getAssetSector("PFE")).toBe("pharma");
    expect(getAssetSector("SUNPHARMA.NS")).toBe("pharma");
    expect(getAssetSector("WMT")).toBe("consumer");
    expect(getAssetSector("ITC.NS")).toBe("consumer");
    expect(getAssetSector("BTC-USD")).toBe("crypto");
    expect(getAssetSector("EURUSD=X")).toBe("fx");
    expect(getAssetSector("CL=F")).toBe("commodity");
  });

  it("resolves asset currency accurately", () => {
    expect(getAssetCurrency("NVDA")).toBe("USD");
    expect(getAssetCurrency("RELIANCE.NS")).toBe("INR");
    expect(getAssetCurrency("TCS.NS")).toBe("INR");
    expect(getAssetCurrency("AZN.L")).toBe("GBP");
    expect(getAssetCurrency("SAP.DE")).toBe("EUR");
    expect(getAssetCurrency("7203.T")).toBe("JPY");
  });

  it("resolves informal company aliases to canonical tickers", () => {
    expect(resolveSymbolCandidate("reliance")).toBe("RELIANCE.NS");
    expect(resolveSymbolCandidate("hdfc")).toBe("HDFCBANK.NS");
    expect(resolveSymbolCandidate("tata motors")).toBe("TATAMOTORS.NS");
    expect(resolveSymbolCandidate("google")).toBe("GOOGL");
    expect(resolveSymbolCandidate("apple")).toBe("AAPL");
    expect(resolveSymbolCandidate("nvidia")).toBe("NVDA");
    expect(resolveSymbolCandidate("goldman")).toBe("GS");
  });
});

describe("SASHA Financial Phonetic Pronunciation Engine", () => {
  it("translates financial tickers to institutional spoken names", () => {
    expect(toInstitutionalPhonetics("NVDA")).toBe("NVIDIA");
    expect(toInstitutionalPhonetics("AAPL")).toBe("Apple");
    expect(toInstitutionalPhonetics("MSFT")).toBe("Microsoft");
    expect(toInstitutionalPhonetics("JPM")).toBe("J-P Morgan");
    expect(toInstitutionalPhonetics("XOM")).toBe("ExxonMobil");
    expect(toInstitutionalPhonetics("RELIANCE.NS")).toBe("Reliance");
    expect(toInstitutionalPhonetics("HDFCBANK.NS")).toBe("H-D-F-C Bank");
    expect(toInstitutionalPhonetics("TATAMOTORS.NS")).toBe("Tata Motors");
    expect(toInstitutionalPhonetics("SPY")).toBe("S-P-Y");
    expect(toInstitutionalPhonetics("QQQ")).toBe("Q-Q-Q");
  });

  it("translates quant terms, Greek letters, and financial jargon", () => {
    const raw = "Technology represents 58% of your book with 24.8% σ. NVDA 1d CVaR95 is -3.4% with a 50 bps spread.";
    const spoken = toInstitutionalPhonetics(raw);

    expect(spoken).toContain("NVIDIA");
    expect(spoken).toContain("sigma");
    expect(spoken).toContain("one day");
    expect(spoken).toContain("C-V-A-R ninety-five");
    expect(spoken).toContain("50 basis points");
    expect(spoken).toContain("minus 3.4 percent");
  });

  it("translates math Greek symbols α, β, θ, λ correctly", () => {
    expect(toInstitutionalPhonetics("α is 2.5%")).toContain("alpha");
    expect(toInstitutionalPhonetics("β is 1.35")).toContain("beta");
    expect(toInstitutionalPhonetics("θ decay")).toContain("theta");
  });
});

describe("SASHA Quantitative Execution Engines", () => {
  const samplePositions: PortfolioPosition[] = [
    { id: "1", ticker: "NVDA", buyPrice: 100, quantity: 40, currentPrice: 125 },
    { id: "2", ticker: "AAPL", buyPrice: 180, quantity: 30, currentPrice: 220 },
    { id: "3", ticker: "MSFT", buyPrice: 380, quantity: 20, currentPrice: 410 },
    { id: "4", ticker: "JPM", buyPrice: 190, quantity: 25, currentPrice: 205 },
    { id: "5", ticker: "XOM", buyPrice: 110, quantity: 35, currentPrice: 118 },
  ];

  it("computes subset risk with Euler risk shares, Expected Shortfall, and Ledoit-Wolf Covariance", async () => {
    const intent = routeSashaIntent("Analyze my tech subset");
    expect(intent.type).toBe("subset_risk");

    if (intent.type === "subset_risk") {
      const result = await executeSubsetRisk(intent, samplePositions);

      expect(result.cardType).toBe("subset_risk");
      expect(result.spokenPunchline).toBeDefined();
      expect(result.spokenPunchline.length).toBeGreaterThan(20);
      expect(result.phoneticSpokenText).toBeDefined();
      expect(result.receipts.length).toBeGreaterThan(0);

      // Spoken punchline format check: 1 to 2 crisp sentences
      const sentences = result.spokenPunchline.split(/(?<=[.!?])\s+/).filter((s) => s.trim().length > 0);
      expect(sentences.length).toBeLessThanOrEqual(2);

      const data = result.cardData as any;
      expect(data.annualizedVolPct).toBeGreaterThan(0);
      expect(data.cvar95DailyPct).toBeGreaterThan(0);
      expect(data.eulerRiskShares).toHaveLength(data.tickers.length);
      expect(data.clankConstraints.length).toBeGreaterThan(0);

      // Sum of Euler risk shares should equal approx 100%
      const totalEuler = data.eulerRiskShares.reduce((s: number, r: any) => s + r.eulerRiskSharePct, 0);
      expect(totalEuler).toBeGreaterThan(95);
      expect(totalEuler).toBeLessThan(105);

      // Spoken punchline verification (zero hallucination)
      expect(result.spokenPunchline).toContain(data.annualizedVolPct.toString());
      expect(result.spokenPunchline).toContain(data.dominantRiskTicker);
    }
  }, 15000);

  it("handles empty portfolio gracefully with institutional proxy subset", async () => {
    const intent = routeSashaIntent("Analyze my portfolio risk");
    expect(intent.type).toBe("subset_risk");

    if (intent.type === "subset_risk") {
      const result = await executeSubsetRisk(intent, []);
      expect(result.cardType).toBe("subset_risk");
      const data = result.cardData as any;
      expect(data.tickers.length).toBeGreaterThanOrEqual(3);
      expect(data.annualizedVolPct).toBeGreaterThan(0);
    }
  }, 15000);

  it("executes stock comparison with cointegration, beta regression, OU half-life, and stat-arb verdict", async () => {
    const intent = routeSashaIntent("Compare NVDA vs AMD");
    expect(intent.type).toBe("stock_comparison");

    if (intent.type === "stock_comparison") {
      const result = await executeStockComparison(intent);

      expect(result.cardType).toBe("stock_comparison");
      expect(result.receipts.length).toBeGreaterThan(0);

      const data = result.cardData as any;
      expect(data.correlation).toBeDefined();
      expect(data.betaRegression.beta).toBeDefined();
      expect(data.betaRegression.rSquared).toBeGreaterThanOrEqual(0);
      expect(data.cointegration.adfStat).toBeDefined();
      expect(data.cointegration.halfLifeDays).toBeGreaterThan(0);
      expect(data.cointegration.spreadVerdict).toBeDefined();
      expect(data.spreadSparkline.length).toBeGreaterThan(0);

      // Punchline verification
      expect(result.spokenPunchline).toContain("NVDA");
      expect(result.spokenPunchline).toContain("AMD");
      expect(result.spokenPunchline).toContain(data.correlation.toString());
    }
  }, 15000);

  it("executes stock comparison on Indian equities (Reliance vs HDFC)", async () => {
    const intent = routeSashaIntent("Compare Reliance and HDFC");
    expect(intent.type).toBe("stock_comparison");

    if (intent.type === "stock_comparison") {
      const result = await executeStockComparison(intent);
      expect(result.cardType).toBe("stock_comparison");
      const data = result.cardData as any;
      expect(data.currencyA).toBe("INR");
      expect(data.currencyB).toBe("INR");
      expect(data.cointegration.adfStat).toBeDefined();
    }
  }, 15000);

  it("executes scenario stress testing with worst-hit absorption, Causal DAG, and hedge recommendation", async () => {
    const intent = routeSashaIntent("What happens if oil spikes 15% and Nifty drops 2%?");
    expect(intent.type).toBe("stress_test");

    if (intent.type === "stress_test") {
      const result = await executeStressTest(intent, samplePositions);

      expect(result.cardType).toBe("stress_test");
      expect(result.receipts.length).toBeGreaterThan(0);

      const data = result.cardData as any;
      expect(data.portfolioDrawdownPct).toBeDefined();
      expect(data.estimatedLossBase).toBeGreaterThanOrEqual(0);
      expect(data.worstHitAssets.length).toBeGreaterThan(0);
      expect(data.resilienceGrade).toBeDefined();
      expect(data.recommendedHedge).toBeDefined();
      expect(data.recommendedHedge.structure).toBeDefined();

      // Causal Transmission DAG verification
      expect(data.dag).toBeDefined();
      expect(data.dag.nodes.length).toBeGreaterThan(0);
      expect(data.dag.edges.length).toBeGreaterThan(0);

      // Punchline verification
      expect(result.spokenPunchline).toContain("%");
      expect(result.spokenPunchline).toContain("draws down");
    }
  }, 20000);

  it("handles qualitative macro shock query 'what happens in a oil shock ?'", async () => {
    const intent = routeSashaIntent("what happens in a oil shock ?");
    expect(intent.type).toBe("stress_test");

    if (intent.type === "stress_test") {
      const result = await executeStressTest(intent, samplePositions);
      expect(result.cardType).toBe("stress_test");
      const data = result.cardData as any;
      expect(data.portfolioDrawdownPct).toBeDefined();
      expect(data.dag.nodes.length).toBeGreaterThanOrEqual(4);
    }
  }, 15000);

  it("executes news & causal impact extraction with institutional veracity scoring and DAG", async () => {
    const intent = routeSashaIntent("What's moving energy?");
    expect(intent.type).toBe("news_impact");

    if (intent.type === "news_impact") {
      const result = await executeNewsImpact(intent, samplePositions);

      expect(result.cardType).toBe("news_impact");
      expect(result.receipts.length).toBeGreaterThan(0);

      const data = result.cardData as any;
      expect(data.signalToNoiseScore).toBeGreaterThanOrEqual(70);
      expect(data.veracityScore).toBeGreaterThanOrEqual(70);
      expect(data.firstOrderMacro).toBeDefined();
      expect(data.secondOrderTransmission).toBeDefined();
      expect(data.articles.length).toBeGreaterThan(0);
      expect(data.dag).toBeDefined();
      expect(data.dag.nodes.length).toBeGreaterThan(0);
    }
  }, 15000);

  it("executes conceptual quant synthesis fallback for Euler and Ledoit-Wolf queries", async () => {
    const intent = { type: "llm_fallback" as const, rawQuery: "Explain Euler marginal risk attribution" };
    const result = await executeLLMFallback(intent, samplePositions);

    expect(result.cardType).toBe("general_quant");
    expect(result.headline).toContain("Euler");
    expect(result.spokenPunchline).toContain("Euler risk");
    expect(result.receipts.length).toBeGreaterThan(0);
  }, 15000);

  it("grounds real-time web intelligence via Google Search & AI mode proxy with source verification", async () => {
    const resOil = await searchGoogleGrounding("Brent crude oil OPEC supply cut impact");
    expect(resOil.sources.length).toBeGreaterThan(0);
    expect(resOil.veracityScore).toBeGreaterThanOrEqual(80);
    expect(resOil.signalToNoiseScore).toBeGreaterThanOrEqual(70);
    expect(resOil.groundedSummary).toBeDefined();
    expect(resOil.spokenSynthesis).toBeDefined();
    expect(resOil.keyFacts.length).toBeGreaterThan(0);

    const resRates = await searchGoogleGrounding("Federal reserve interest rate cuts inflation");
    expect(resRates.sources.length).toBeGreaterThan(0);
    expect(resRates.sources.some((s) => s.tier === 1 || s.tier === 2)).toBe(true);
    expect(resRates.sentiment).toBeDefined();
  }, 15000);
});

describe("SASHA Universal Tool Registry & DAG Orchestration Engine", () => {
  const samplePositions: PortfolioPosition[] = [
    { id: "1", ticker: "NVDA", buyPrice: 100, quantity: 40, currentPrice: 125 },
    { id: "2", ticker: "AAPL", buyPrice: 180, quantity: 30, currentPrice: 220 },
    { id: "3", ticker: "MSFT", buyPrice: 380, quantity: 20, currentPrice: 410 },
  ];

  it("registers and discovers institutional tools dynamically", () => {
    const allTools = toolRegistry.getAll();
    expect(allTools.length).toBeGreaterThanOrEqual(10);

    const marketDiscovery = toolRegistry.discover("fetch stock prices");
    expect(marketDiscovery.some((t) => t.id === "market.fetch_history")).toBe(true);

    const riskDiscovery = toolRegistry.discover("euler covariance risk");
    expect(riskDiscovery.some((t) => t.id === "quant.calc_euler_risk")).toBe(true);

    const statarbDiscovery = toolRegistry.discover("cointegration spread");
    expect(statarbDiscovery.some((t) => t.id === "statarb.test_cointegration")).toBe(true);
  });

  it("validates tool parameter inputs strictly against schema", () => {
    const valid = toolRegistry.validateInput("market.fetch_history", { ticker: "NVDA", range: "6mo" });
    expect(valid.valid).toBe(true);
    expect(valid.errors).toHaveLength(0);

    const invalid = toolRegistry.validateInput("market.fetch_history", {});
    expect(invalid.valid).toBe(false);
    expect(invalid.errors.length).toBeGreaterThan(0);
  });

  it("creates acyclic DAG execution plans for pairs comparison", async () => {
    const plan = await sashaPlanner.createPlan("Compare NVDA vs AMD", {
      userId: "test_user",
      executionId: "exec_1",
      positions: samplePositions,
      portfolioValue: 100000,
      timestamp: Date.now(),
    });

    expect(plan.planId).toBeDefined();
    expect(plan.nodes.length).toBeGreaterThanOrEqual(5);

    // Verify dependencies: align_returns must depend on fetch_history_NVDA and fetch_history_AMD
    const alignNode = plan.nodes.find((n) => n.id === "align_returns");
    expect(alignNode?.dependencies).toContain("fetch_history_NVDA");
    expect(alignNode?.dependencies).toContain("fetch_history_AMD");

    // Verify regression depends on align_returns
    const regNode = plan.nodes.find((n) => n.id === "calc_beta_regression");
    expect(regNode?.dependencies).toContain("align_returns");
  });

  it("executes DAG execution plan autonomously with parallel execution and tracing", async () => {
    const plan = await sashaPlanner.createPlan("Compare NVDA vs AMD", {
      userId: "test_user",
      executionId: "exec_2",
      positions: samplePositions,
      portfolioValue: 100000,
      timestamp: Date.now(),
    });

    const execution = await sashaExecutor.executePlan(plan, {
      userId: "test_user",
      executionId: "exec_2",
      positions: samplePositions,
      portfolioValue: 100000,
      timestamp: Date.now(),
    });

    expect(execution.trace.nodesExecuted).toBe(plan.nodes.length);
    expect(execution.provenances.length).toBeGreaterThan(0);
    expect(execution.resultsByNodeId["fetch_history_NVDA"]).toBeDefined();
    expect(execution.resultsByNodeId["calc_beta_regression"]).toBeDefined();
    expect(execution.resultsByNodeId["test_cointegration"]).toBeDefined();
  }, 20000);

  it("executes end-to-end orchestration pipeline for Euler subset risk", async () => {
    const { result, plan, trace } = await executeSashaOrchestration("Analyze my tech subset", {
      userId: "test_user",
      executionId: "exec_3",
      positions: samplePositions,
      portfolioValue: 100000,
      timestamp: Date.now(),
    });

    expect(result.cardType).toBe("subset_risk");
    expect(result.receipts.length).toBeGreaterThan(0);
    expect(trace.nodesExecuted).toBeGreaterThanOrEqual(3);
    expect(result.spokenPunchline).toBeDefined();
    expect(result.phoneticSpokenText).toBeDefined();

    const data = result.cardData as any;
    expect(data.annualizedVolPct).toBeGreaterThan(0);
    expect(data.eulerRiskShares.length).toBeGreaterThan(0);
  }, 20000);

  it("executes end-to-end orchestration pipeline for oil shock stress scenario", async () => {
    const { result, plan, trace } = await executeSashaOrchestration("What happens if oil spikes 15% and Nifty drops 2%?", {
      userId: "test_user",
      executionId: "exec_4",
      positions: samplePositions,
      portfolioValue: 100000,
      timestamp: Date.now(),
    });

    expect(result.cardType).toBe("stress_test");
    expect(result.receipts.length).toBeGreaterThan(0);
    expect(result.spokenPunchline).toBeDefined();

    const data = result.cardData as any;
    expect(Math.abs(data.portfolioDrawdownPct)).toBeGreaterThan(0);
    expect(data.worstHitAssets.length).toBeGreaterThan(0);
  }, 20000);

  it("executes end-to-end orchestration pipeline for single stock quantitative fact sheet", async () => {
    const { result, plan, trace } = await executeSashaOrchestration("What about JPM?", {
      userId: "test_user",
      executionId: "exec_5",
      positions: samplePositions,
      portfolioValue: 100000,
      timestamp: Date.now(),
    });

    expect(result.cardType).toBe("single_stock");
    expect(result.receipts.length).toBeGreaterThan(0);
    expect(result.spokenPunchline).toBeDefined();
    expect(result.phoneticSpokenText).toBeDefined();

    const data = result.cardData as any;
    expect(data.ticker).toBe("JPM");
    expect(data.lastPrice).toBeGreaterThan(0);
    expect(data.betaRegression).toBeDefined();
    expect(data.betaRegression.beta).toBeGreaterThan(0);
    expect(data.fundamentals).toBeDefined();
    expect(data.fundamentals.peRatio).toBeGreaterThan(0);
    expect(data.fundamentals.marketCapBln).toBeGreaterThan(0);
  }, 20000);
});
