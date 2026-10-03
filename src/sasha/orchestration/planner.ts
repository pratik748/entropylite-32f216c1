/**
 * SASHA Intelligent Analytical Planner
 *
 * Constructs structured, acyclic DAG execution plans from natural language queries.
 * Discovers required tools from the Universal Tool Registry, resolves computational dependencies,
 * extracts asset entities and scenario parameters, and validates plan feasibility before execution.
 */

import { toolRegistry } from "../tools/registry";
import { routeSashaIntent } from "../intentRouter";
import type { ToolExecutionContext } from "../tools/types";
import type { ExecutionPlan, ExecutionPlanNode, PlannerContext } from "./types";
import type { SashaParsedIntent } from "../types";

export class SashaPlanner {
  /**
   * Constructs an optimized DAG execution plan for a user query.
   */
  public async createPlan(
    query: string,
    ctx: ToolExecutionContext
  ): Promise<ExecutionPlan> {
    const trimmedQuery = query.trim();
    const intent = routeSashaIntent(trimmedQuery);
    const planId = `plan_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    // Build the DAG nodes based on intent and discovered tools
    const nodes = this.constructNodes(intent, trimmedQuery, ctx);

    // Validate acyclicity and topological sortability
    this.validateDAG(nodes);

    const estimatedTimeMs = nodes.reduce((sum, n) => {
      const tool = toolRegistry.get(n.toolId);
      return sum + (tool?.category === "news" || tool?.category === "stress" ? 60 : 15);
    }, 20);

    return {
      planId,
      query: trimmedQuery,
      intent,
      nodes,
      rationale: this.generateRationale(intent, nodes),
      estimatedTimeMs,
      createdAt: Date.now(),
    };
  }

  /**
   * Dynamically constructs execution nodes based on intent type and parameter extraction.
   */
  private constructNodes(
    intent: SashaParsedIntent,
    query: string,
    ctx: ToolExecutionContext
  ): ExecutionPlanNode[] {
    const nodes: ExecutionPlanNode[] = [];

    switch (intent.type) {
      case "single_stock": {
        const { ticker, benchmark = (ticker.endsWith(".NS") || ticker.endsWith(".BO") ? "^NSEI" : "SPY"), range = "6mo" } = intent;

        // 1. Fetch Target Asset History
        nodes.push({
          id: `fetch_history_${ticker}`,
          toolId: "market.fetch_history",
          name: `Fetch ${ticker} Price History`,
          description: `Download continuous daily OHLCV bars for ${ticker}`,
          input: { ticker, range },
          dependencies: [],
          status: "pending",
        });

        // 2. Fetch Benchmark History
        nodes.push({
          id: `fetch_history_${benchmark}`,
          toolId: "market.fetch_history",
          name: `Fetch Benchmark (${benchmark}) History`,
          description: `Download continuous daily OHLCV bars for benchmark ${benchmark}`,
          input: { ticker: benchmark, range },
          dependencies: [],
          status: "pending",
        });

        // 3. Align Series & Calculate Continuous Returns
        nodes.push({
          id: "align_returns",
          toolId: "market.calc_returns",
          name: "Align Continuous Returns Matrix",
          description: "Align timestamps across trading sessions and compute log return vectors",
          input: {
            tickers: [ticker, benchmark],
            range,
          },
          dependencies: [`fetch_history_${ticker}`, `fetch_history_${benchmark}`],
          status: "pending",
        });

        // 4. Calculate OLS Beta Regression against Benchmark
        nodes.push({
          id: "calc_beta_regression",
          toolId: "quant.calc_beta_regression",
          name: `Compute OLS Beta Regression (${ticker} vs ${benchmark})`,
          description: "Estimate empirical market sensitivity beta, Jensen alpha, R², and correlation",
          input: {
            $map: {
              assetReturns: "$output.align_returns.returnsMatrix.0",
              benchmarkReturns: "$output.align_returns.returnsMatrix.1",
            },
          },
          dependencies: ["align_returns"],
          status: "pending",
        });

        // 5. Fetch Company Fundamentals & Valuation
        nodes.push({
          id: `fetch_metrics_${ticker}`,
          toolId: "fundamentals.fetch_metrics",
          name: `Fetch Fundamental & Multiples Telemetry for ${ticker}`,
          description: "Balance sheet, income statement, P/E, EV/EBITDA, and margin profile",
          input: { ticker },
          dependencies: [],
          status: "pending",
        });

        // 6. Fetch Ticker-Specific News & Catalysts
        nodes.push({
          id: "fetch_news_wires",
          toolId: "news.fetch_wires",
          name: `Fetch Institutional News Wires for ${ticker}`,
          description: `Analyze news catalysts, sentiment polarity, and veracity for ${ticker}`,
          input: { topicOrSector: `${ticker} Equity`, ticker },
          dependencies: [],
          status: "pending",
        });

        break;
      }

      case "stock_comparison": {
        const { tickerA, tickerB, range } = intent;

        // 1. Fetch History Ticker A
        nodes.push({
          id: `fetch_history_${tickerA}`,
          toolId: "market.fetch_history",
          name: `Fetch ${tickerA} Price History`,
          description: `Download continuous daily OHLCV bars for ${tickerA}`,
          input: { ticker: tickerA, range: range || "6mo" },
          dependencies: [],
          status: "pending",
        });

        // 2. Fetch History Ticker B
        nodes.push({
          id: `fetch_history_${tickerB}`,
          toolId: "market.fetch_history",
          name: `Fetch ${tickerB} Price History`,
          description: `Download continuous daily OHLCV bars for ${tickerB}`,
          input: { ticker: tickerB, range: range || "6mo" },
          dependencies: [],
          status: "pending",
        });

        // 3. Align Series and Compute Continuous Returns
        nodes.push({
          id: "align_returns",
          toolId: "market.calc_returns",
          name: "Align Series & Calculate Continuous Returns",
          description: "Align timestamps across trading days and compute log return series",
          input: {
            tickers: [tickerA, tickerB],
            range: range || "6mo",
          },
          dependencies: [`fetch_history_${tickerA}`, `fetch_history_${tickerB}`],
          status: "pending",
        });

        // 4. Calculate OLS Beta Regression
        nodes.push({
          id: "calc_beta_regression",
          toolId: "quant.calc_beta_regression",
          name: `Compute OLS Beta Regression (${tickerA} on ${tickerB})`,
          description: "Estimate empirical market sensitivity beta, Jensen alpha, and R²",
          input: {
            $map: {
              assetReturns: "$output.align_returns.returnsMatrix.0",
              benchmarkReturns: "$output.align_returns.returnsMatrix.1",
            },
          },
          dependencies: ["align_returns"],
          status: "pending",
        });

        // 5. Test Engle-Granger Cointegration
        nodes.push({
          id: "test_cointegration",
          toolId: "statarb.test_cointegration",
          name: "Engle-Granger Two-Step Cointegration Test",
          description: "Augmented Dickey-Fuller test on spread residuals with Ornstein-Uhlenbeck half-life",
          input: {
            tickerA,
            tickerB,
            $map: {
              pricesA: `$output.fetch_history_${tickerA}.prices`,
              pricesB: `$output.fetch_history_${tickerB}.prices`,
            },
          },
          dependencies: [`fetch_history_${tickerA}`, `fetch_history_${tickerB}`],
          status: "pending",
        });

        // 6. Calculate Pair Valuation Spread & Z-Score
        nodes.push({
          id: "calc_pair_spread",
          toolId: "statarb.calc_spread",
          name: "Compute Rolling Pair Spread & Z-Score",
          description: "Calculate historical price ratio distribution, percentile rank, and sparkline",
          input: {
            tickerA,
            tickerB,
            $map: {
              pricesA: `$output.fetch_history_${tickerA}.prices`,
              pricesB: `$output.fetch_history_${tickerB}.prices`,
            },
          },
          dependencies: [`fetch_history_${tickerA}`, `fetch_history_${tickerB}`],
          status: "pending",
        });

        // 7. Compare Fundamental & Valuation Metrics
        nodes.push({
          id: "compare_peers",
          toolId: "fundamentals.compare_peers",
          name: "Compare Peer Fundamentals & Multiples",
          description: "Head-to-head analysis of P/E, EV/EBITDA, Gross Margin, and ROE",
          input: { tickerA, tickerB },
          dependencies: [],
          status: "pending",
        });

        break;
      }

      case "subset_risk": {
        const sector = intent.subsetFilter.sector;

        // 1. Get Live Portfolio Positions
        nodes.push({
          id: "get_positions",
          toolId: "portfolio.get_positions",
          name: "Retrieve Live Portfolio Holdings",
          description: "Extract active position book with weights and sector metadata",
          input: { sectorFilter: sector },
          dependencies: [],
          status: "pending",
        });

        // 2. Compute Sector Allocation & CLANK Constraints
        nodes.push({
          id: "get_sector_allocation",
          toolId: "portfolio.get_sector_allocation",
          name: "Calculate Sector Allocation & CLANK Constraints",
          description: "Herfindahl-Hirschman concentration index and structural liquidity limits",
          input: {},
          dependencies: ["get_positions"],
          status: "pending",
        });

        // 3. Align Returns for covariance calculation
        nodes.push({
          id: "align_returns",
          toolId: "market.calc_returns",
          name: "Align Continuous Returns Matrix",
          description: "Fetch and align daily return vectors for active subset",
          input: {
            $map: {
              tickers: "$output.get_positions.positions.ticker",
            },
          },
          dependencies: ["get_positions"],
          status: "pending",
        });

        // 4. Compute Analytical Ledoit-Wolf Covariance Matrix
        nodes.push({
          id: "calc_covariance",
          toolId: "quant.calc_covariance",
          name: "Ledoit-Wolf Covariance Matrix",
          description: "Analytical shrinkage estimator to constant correlation target",
          input: {
            $map: {
              returnsMatrix: "$output.align_returns.returnsMatrix",
              tickers: "$output.align_returns.tickers",
            },
          },
          dependencies: ["align_returns"],
          status: "pending",
        });

        // 5. Compute Euler Marginal Risk Share Decomposition
        nodes.push({
          id: "calc_euler_risk",
          toolId: "quant.calc_euler_risk",
          name: "Euler Homogeneous Risk Decomposition",
          description: "Calculate percentage contribution to risk (PCR) and VaR95/CVaR95",
          input: {
            $map: {
              covarianceMatrix: "$output.calc_covariance.covarianceMatrix",
              tickers: "$output.calc_covariance.tickers",
              weights: "$output.get_positions.positions.weightPct",
            },
          },
          dependencies: ["calc_covariance", "get_positions"],
          status: "pending",
        });

        break;
      }

      case "stress_test": {
        // 1. Get Live Portfolio Positions
        nodes.push({
          id: "get_positions",
          toolId: "portfolio.get_positions",
          name: "Retrieve Live Portfolio Holdings",
          description: "Extract current portfolio weights and asset universe for shock propagation",
          input: {},
          dependencies: [],
          status: "pending",
        });

        // 2. Fetch Macro Indicators
        nodes.push({
          id: "fetch_macro_indicators",
          toolId: "macro.fetch_indicators",
          name: "Fetch Global Macro Benchmark Telemetry",
          description: "Current baseline Treasury yields, oil, gold, and VIX metrics",
          input: {},
          dependencies: [],
          status: "pending",
        });

        // 3. Run Scenario Stress Test Simulation
        nodes.push({
          id: "run_stress_test",
          toolId: "stress.run_scenario_test",
          name: "Execute Macro Scenario Stress Test",
          description: "Compute asset loss absorption, portfolio drawdown, and tail hedge sizing",
          input: {
            scenarioName: intent.shockDescription || "Macro Stress Scenario",
            marketShockPct: intent.marketShockPct || -5,
            commodityShockPct: intent.commodityShockPct,
            vixShockPct: intent.vixShockPct,
            interestRateShockBps: intent.interestRateShockBps,
            $map: {
              positions: "$output.get_positions.positions",
            },
          },
          dependencies: ["get_positions", "fetch_macro_indicators"],
          status: "pending",
        });

        break;
      }

      case "news_impact": {
        const topic = intent.topicOrSector;
        const ticker = intent.ticker;

        // 1. Scour Institutional News Wires
        nodes.push({
          id: "fetch_news_wires",
          toolId: "news.fetch_wires",
          name: "Fetch News Wires & Transmission Channels",
          description: `Analyze news catalysts, sentiment polarity, and causal DAG for ${topic}`,
          input: { topicOrSector: topic, ticker },
          dependencies: [],
          status: "pending",
        });

        // 2. Fetch Global Macro Indicators
        nodes.push({
          id: "fetch_macro_indicators",
          toolId: "macro.fetch_indicators",
          name: "Fetch Global Macro Benchmark Telemetry",
          description: "Corroborate macro indicators with news narrative",
          input: {},
          dependencies: [],
          status: "pending",
        });

        // 3. Fetch Geopolitical Chokepoints (if macro or energy related)
        if (/energy|oil|crude|red sea|geopolitical|chokepoint|iran|middle east|taiwan/i.test(topic) || /energy|oil|crude|geopolitical/i.test(query)) {
          nodes.push({
            id: "fetch_chokepoints",
            toolId: "geopolitics.fetch_chokepoints",
            name: "Fetch Maritime Chokepoint Risk Indicators",
            description: "Assess kinetic and flow risk across critical global chokepoints",
            input: {},
            dependencies: [],
            status: "pending",
          });
        }

        break;
      }

      case "llm_fallback":
      default: {
        // 1. Google Web Grounding
        nodes.push({
          id: "search_google",
          toolId: "grounding.search_google",
          name: "Google Financial Grounding Search",
          description: "Scour live institutional search feeds to verify facts and citations",
          input: { query },
          dependencies: [],
          status: "pending",
        });

        // 2. Global Macro Indicators
        nodes.push({
          id: "fetch_macro_indicators",
          toolId: "macro.fetch_indicators",
          name: "Fetch Global Macro Benchmark Telemetry",
          description: "Macro baseline context",
          input: {},
          dependencies: [],
          status: "pending",
        });

        break;
      }
    }

    return nodes;
  }

  /**
   * Ensures the DAG contains no cycles and all declared dependencies exist in the node set.
   */
  private validateDAG(nodes: ExecutionPlanNode[]): void {
    const nodeIds = new Set(nodes.map((n) => n.id));

    // Verify all dependencies exist
    for (const node of nodes) {
      for (const depId of node.dependencies) {
        if (!nodeIds.has(depId)) {
          throw new Error(
            `Invalid Execution Plan DAG: Node "${node.id}" references non-existent dependency "${depId}".`
          );
        }
      }
    }

    // Topological Sort / Cycle Detection using Kahn's algorithm
    const inDegree: Record<string, number> = {};
    const adjList: Record<string, string[]> = {};

    nodes.forEach((n) => {
      inDegree[n.id] = 0;
      adjList[n.id] = [];
    });

    nodes.forEach((n) => {
      n.dependencies.forEach((dep) => {
        adjList[dep].push(n.id);
        inDegree[n.id] = (inDegree[n.id] || 0) + 1;
      });
    });

    const queue: string[] = [];
    nodes.forEach((n) => {
      if (inDegree[n.id] === 0) queue.push(n.id);
    });

    let visitedCount = 0;
    while (queue.length > 0) {
      const curr = queue.shift()!;
      visitedCount++;
      for (const neighbor of adjList[curr]) {
        inDegree[neighbor]--;
        if (inDegree[neighbor] === 0) {
          queue.push(neighbor);
        }
      }
    }

    if (visitedCount !== nodes.length) {
      throw new Error(
        "Invalid Execution Plan DAG: Circular dependency detected in plan nodes."
      );
    }
  }

  private generateRationale(intent: SashaParsedIntent, nodes: ExecutionPlanNode[]): string {
    switch (intent.type) {
      case "single_stock":
        return `Single-equity quantitative plan: Price history extractions (${intent.ticker} & ${intent.benchmark || "SPY"}) → returns alignment → concurrent OLS beta regression, institutional fundamentals, and news catalyst ingestion.`;
      case "stock_comparison":
        return `Multi-stage statistical arbitrage plan: 2 parallel price history extractions → alignment & returns → concurrent beta regression, Engle-Granger cointegration test, rolling spread distribution, and fundamental peer comparison.`;
      case "subset_risk":
        return `Euler risk analysis plan: Live position retrieval → parallel Ledoit-Wolf covariance shrinkage, exact Euler homogeneous risk decomposition (PCR), and CLANK liquidity concentration checking.`;
      case "stress_test":
        return `Macro stress simulation plan: Live position book extraction & macro benchmark retrieval → multi-stage causal shock propagation and tail hedge optimization.`;
      case "news_impact":
        return `Real-time intelligence plan: News wire extraction, veracity scoring, and causal transmission DAG synthesis.`;
      default:
        return `Direct web grounding & macro benchmark synthesis.`;
    }
  }
}

export const sashaPlanner = new SashaPlanner();
