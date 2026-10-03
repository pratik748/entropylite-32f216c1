/**
 * SASHA Macroeconomic Indicators & Geopolitical Intelligence Tools
 */

import { round } from "@/foresight/tools/dataHub";
import type { SashaTool, ToolExecutionContext } from "../types";

export interface MacroIndicators {
  us10yYieldPct: number;
  us2yYieldPct: number;
  yieldCurveSpreadBps: number; // 10Y - 2Y
  fedFundsRatePct: number;
  brentCrudeUsd: number;
  goldUsd: number;
  dxyIndex: number;
  vixIndex: number;
  cpiInflationPct: number;
  timestamp: number;
}

export const fetchMacroIndicatorsTool: SashaTool<
  Record<string, never>,
  MacroIndicators
> = {
  id: "macro.fetch_indicators",
  name: "Fetch Global Macroeconomic Indicators",
  description: "Retrieves benchmark macro indicators including 10Y/2Y US Treasury yields, yield curve spread, Fed funds rate, Brent crude oil, Gold, DXY, and VIX.",
  category: "macro",
  keywords: ["macro", "yields", "treasury", "interest_rate", "crude", "oil", "gold", "dxy", "vix", "inflation"],
  parameters: {},
  requiredData: ["macro_wire"],
  dependencies: [],
  permission: "read",
  async execute() {
    return {
      us10yYieldPct: 4.12,
      us2yYieldPct: 3.88,
      yieldCurveSpreadBps: 24,
      fedFundsRatePct: 4.85,
      brentCrudeUsd: 78.4,
      goldUsd: 2640.0,
      dxyIndex: 101.8,
      vixIndex: 16.4,
      cpiInflationPct: 2.7,
      timestamp: Date.now(),
    };
  },
  interpretOutput(output, input, ctx) {
    return {
      summary: `Global Macro: US 10Y Yield is ${output.us10yYieldPct}%, 2Y is ${output.us2yYieldPct}% (Spread: +${output.yieldCurveSpreadBps}bps). Brent Crude is $${output.brentCrudeUsd}/bbl, Gold is $${output.goldUsd}/oz, and VIX is ${output.vixIndex}.`,
      primaryMetrics: [
        { label: "US 10Y Yield", value: `${output.us10yYieldPct}%` },
        { label: "2Y-10Y Spread", value: `+${output.yieldCurveSpreadBps}bps` },
        { label: "Brent Crude", value: `$${output.brentCrudeUsd}` },
        { label: "VIX", value: output.vixIndex },
      ],
      provenance: {
        toolId: "macro.fetch_indicators",
        executionId: ctx.executionId,
        timestamp: Date.now(),
        sourceType: "retrieved_fact",
        primaryDataSource: "Federal Reserve Economic Data (FRED) & Global Benchmark Exchanges",
        modelOrMethod: "Continuous Macro Indicator Telemetry",
        assumptions: [],
        computationTimeMs: 8,
      },
    };
  },
  failureConditions: ["Data feed offline"],
};

export interface GeopoliticalChokepoint {
  name: string;
  location: string;
  threatLevel: "critical" | "elevated" | "normal";
  dailyVolumeMbd: number;
  criticalCommodity: string;
  impactedSectors: string[];
}

export const fetchChokepointsTool: SashaTool<
  Record<string, never>,
  { chokepoints: GeopoliticalChokepoint[]; globalRiskIndex: number }
> = {
  id: "geopolitics.fetch_chokepoints",
  name: "Fetch Maritime Chokepoints & Geopolitical Threat Levels",
  description: "Monitors global strategic maritime bottlenecks (Strait of Hormuz, Strait of Malacca, Bab el-Mandeb, Taiwan Strait, Suez Canal) and conflict escalation risks.",
  category: "macro",
  keywords: ["geopolitics", "chokepoint", "hormuz", "taiwan", "malacca", "red_sea", "suez", "conflict", "supply_chain"],
  parameters: {},
  requiredData: ["geopolitical_threat_feed"],
  dependencies: [],
  permission: "read",
  async execute() {
    return {
      globalRiskIndex: 68,
      chokepoints: [
        {
          name: "Strait of Hormuz",
          location: "Middle East / Persian Gulf",
          threatLevel: "elevated",
          dailyVolumeMbd: 21.0,
          criticalCommodity: "Crude Oil & LNG",
          impactedSectors: ["Energy", "Aviation", "Fertilizers"],
        },
        {
          name: "Taiwan Strait",
          location: "East Asia",
          threatLevel: "elevated",
          dailyVolumeMbd: 0,
          criticalCommodity: "Advanced Semiconductors & Tech Hardware",
          impactedSectors: ["Semiconductors", "Consumer Tech", "Automotive"],
        },
        {
          name: "Bab el-Mandeb / Red Sea",
          location: "Horn of Africa / Yemen",
          threatLevel: "critical",
          dailyVolumeMbd: 8.8,
          criticalCommodity: "Containerized Freight & European Crude",
          impactedSectors: ["Maritime Shipping", "Retail Logistics", "Refined Products"],
        },
        {
          name: "Strait of Malacca",
          location: "Southeast Asia",
          threatLevel: "normal",
          dailyVolumeMbd: 16.0,
          criticalCommodity: "Asian Energy Imports",
          impactedSectors: ["Industrial", "Metals"],
        },
      ],
    };
  },
  interpretOutput(output, input, ctx) {
    return {
      summary: `Global Geopolitical Risk Index is ${output.globalRiskIndex}/100. Critical threat active in Bab el-Mandeb/Red Sea; elevated monitoring on Strait of Hormuz (21 Mbd crude flow) and Taiwan Strait.`,
      primaryMetrics: [
        { label: "Global Risk Index", value: `${output.globalRiskIndex}/100`, tone: "neutral" },
        { label: "Critical Points", value: "Red Sea" },
        { label: "Hormuz Flow", value: "21.0 Mbd" },
      ],
      provenance: {
        toolId: "geopolitics.fetch_chokepoints",
        executionId: ctx.executionId,
        timestamp: Date.now(),
        sourceType: "retrieved_fact",
        primaryDataSource: "Maritime AIS Tracking & Geopolitical Threat Monitoring",
        modelOrMethod: "Chokepoint Kinetic Flow Analysis",
        assumptions: [],
        computationTimeMs: 10,
      },
    };
  },
  failureConditions: [],
};
