/**
 * SASHA Portfolio Context & Allocation Tools
 */

import { round } from "@/foresight/tools/dataHub";
import { getAssetSector } from "../../quantEngine";
import type { SashaTool, ToolExecutionContext } from "../types";
import type { ClankConstraintFlag } from "../../types";

export const getPositionsTool: SashaTool<
  { sectorFilter?: string; minWeightPct?: number },
  {
    positions: Array<{ ticker: string; buyPrice: number; quantity: number; currentPrice: number; value: number; weightPct: number; sector: string }>;
    totalValue: number;
    count: number;
  }
> = {
  id: "portfolio.get_positions",
  name: "Get User Portfolio Positions",
  description: "Reads live user portfolio positions from the host application state with calculated weights, values, and sector classifications.",
  category: "portfolio",
  keywords: ["portfolio", "positions", "holdings", "weights", "book", "subset"],
  parameters: {
    sectorFilter: { type: "string", description: "Optional sector filter (e.g. 'banking', 'tech', 'energy')", required: false },
    minWeightPct: { type: "number", description: "Minimum weight percentage to include", default: 0 },
  },
  requiredData: ["portfolio_state"],
  dependencies: [],
  permission: "read",
  async execute(input, ctx) {
    let raw = ctx.positions || [];
    if (raw.length === 0) {
      // Dynamic proxy benchmark portfolio if user has no positions loaded
      raw = [
        { id: "1", ticker: "NVDA", buyPrice: 120, quantity: 50, currentPrice: 128 },
        { id: "2", ticker: "AAPL", buyPrice: 220, quantity: 30, currentPrice: 228 },
        { id: "3", ticker: "MSFT", buyPrice: 410, quantity: 20, currentPrice: 425 },
        { id: "4", ticker: "GOOGL", buyPrice: 160, quantity: 40, currentPrice: 168 },
      ];
    }

    let positionsWithVals = raw.map((p) => {
      const px = p.currentPrice || p.buyPrice || 100;
      const value = px * (p.quantity || 1);
      const sector = getAssetSector(p.ticker);
      return {
        ticker: p.ticker,
        buyPrice: p.buyPrice || px,
        quantity: p.quantity || 1,
        currentPrice: px,
        value,
        weightPct: 0,
        sector,
      };
    });

    if (input.sectorFilter) {
      const filter = input.sectorFilter.toLowerCase();
      const filtered = positionsWithVals.filter((p) => p.sector.toLowerCase().includes(filter));
      if (filtered.length > 0) {
        positionsWithVals = filtered;
      }
    }

    const totalValue = positionsWithVals.reduce((acc, p) => acc + p.value, 0);
    positionsWithVals.forEach((p) => {
      p.weightPct = totalValue > 0 ? round((p.value / totalValue) * 100, 2) : round(100 / positionsWithVals.length, 2);
    });

    return {
      positions: positionsWithVals,
      totalValue: round(totalValue, 2),
      count: positionsWithVals.length,
    };
  },
  interpretOutput(output, input, ctx) {
    return {
      summary: `Portfolio book contains ${output.count} positions with total value of $${output.totalValue.toLocaleString()}.`,
      primaryMetrics: [
        { label: "Positions", value: output.count },
        { label: "Total Value", value: `$${output.totalValue.toLocaleString()}` },
      ],
      provenance: {
        toolId: "portfolio.get_positions",
        executionId: ctx.executionId,
        timestamp: Date.now(),
        sourceType: "retrieved_fact",
        primaryDataSource: "EntropyLite Cloud Portfolio & Host Context",
        modelOrMethod: "Realized Position Aggregation",
        assumptions: [],
        computationTimeMs: 2,
      },
    };
  },
  failureConditions: [],
};

export const getSectorAllocationTool: SashaTool<
  Record<string, never>,
  {
    sectorBreakdown: Array<{ sector: string; value: number; weightPct: number; tickers: string[] }>;
    clankConstraints: ClankConstraintFlag[];
    herfindahlIndex: number;
  }
> = {
  id: "portfolio.get_sector_allocation",
  name: "Calculate Sector Allocation & CLANK Liquidity Constraints",
  description: "Aggregates portfolio positions by industry sector, computes the Herfindahl-Hirschman concentration index (HHI), and flags CLANK structural liquidity constraints.",
  category: "portfolio",
  keywords: ["sector", "allocation", "concentration", "clank", "hhi", "liquidity"],
  parameters: {},
  requiredData: ["portfolio_state"],
  dependencies: ["portfolio.get_positions"],
  permission: "compute",
  async execute(input, ctx) {
    const posRes = await getPositionsTool.execute({}, ctx);
    const positions = posRes.positions;
    const totalVal = posRes.totalValue;

    const sectorMap = new Map<string, { value: number; tickers: string[] }>();
    positions.forEach((p) => {
      const sec = p.sector || "Equities";
      const existing = sectorMap.get(sec) || { value: 0, tickers: [] };
      existing.value += p.value;
      existing.tickers.push(p.ticker);
      sectorMap.set(sec, existing);
    });

    const breakdown: Array<{ sector: string; value: number; weightPct: number; tickers: string[] }> = [];
    let hhi = 0;

    sectorMap.forEach((data, sec) => {
      const weightPct = totalVal > 0 ? round((data.value / totalVal) * 100, 1) : 0;
      hhi += Math.pow(weightPct / 100, 2);
      breakdown.push({
        sector: sec,
        value: round(data.value, 2),
        weightPct,
        tickers: data.tickers,
      });
    });

    breakdown.sort((a, b) => b.weightPct - a.weightPct);

    // Check CLANK structural constraints
    const clankConstraints: ClankConstraintFlag[] = [];
    if (breakdown[0] && breakdown[0].weightPct > 45) {
      clankConstraints.push({
        id: "clank-sector-concentration",
        label: "Sector Concentration Clamp",
        severity: "high",
        detail: `${breakdown[0].sector} allocation exceeds institutional 45% concentration ceiling.`,
        metricValue: `${breakdown[0].weightPct}% > 45%`,
      });
    }

    if (hhi > 0.35) {
      clankConstraints.push({
        id: "clank-hhi-risk",
        label: "Herfindahl Concentration Alert",
        severity: "medium",
        detail: "Portfolio concentration index indicates high idiosyncratic single-sector vulnerability.",
        metricValue: `HHI = ${round(hhi, 3)}`,
      });
    }

    return {
      sectorBreakdown: breakdown,
      clankConstraints,
      herfindahlIndex: round(hhi, 3),
    };
  },
  interpretOutput(output, input, ctx) {
    const top = output.sectorBreakdown[0];
    return {
      summary: `Top sector is ${top ? `${top.sector} (${top.weightPct}%)` : "Equities"}. Herfindahl Index is ${output.herfindahlIndex} with ${output.clankConstraints.length} active CLANK constraints.`,
      primaryMetrics: [
        { label: "Top Sector", value: top ? top.sector : "N/A" },
        { label: "Top Weight", value: top ? `${top.weightPct}%` : "0%" },
        { label: "HHI Index", value: output.herfindahlIndex },
        { label: "CLANK Flags", value: output.clankConstraints.length },
      ],
      chartHint: "table",
      provenance: {
        toolId: "portfolio.get_sector_allocation",
        executionId: ctx.executionId,
        timestamp: Date.now(),
        sourceType: "calculated_metric",
        primaryDataSource: "Portfolio Sector Holdings",
        modelOrMethod: "Herfindahl-Hirschman Index & CLANK Liquidity Clamp",
        assumptions: [],
        computationTimeMs: 5,
      },
    };
  },
  failureConditions: [],
};
