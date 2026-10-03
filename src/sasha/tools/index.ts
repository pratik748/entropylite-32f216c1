/**
 * SASHA Universal Tool Registry Bootstrap
 *
 * Self-registers all modular computational tools into the centralized registry.
 */

import { toolRegistry } from "./registry";
import { fetchHistoryTool, lookupSymbolTool, alignReturnsTool } from "./modules/marketTools";
import { calcCovarianceTool, calcEulerRiskTool, calcBetaRegressionTool } from "./modules/quantRiskTools";
import { testCointegrationTool, calcPairSpreadTool } from "./modules/statarbTools";
import { runStressTestTool } from "./modules/stressTools";
import { fetchCompanyMetricsTool, comparePeersTool } from "./modules/fundamentalTools";
import { fetchMacroIndicatorsTool, fetchChokepointsTool } from "./modules/macroTools";
import { fetchNewsWiresTool, searchGoogleTool } from "./modules/newsGroundingTools";
import { getPositionsTool, getSectorAllocationTool } from "./modules/portfolioTools";

export function registerAllSashaTools(): void {
  // Market tools
  toolRegistry.register(fetchHistoryTool);
  toolRegistry.register(lookupSymbolTool);
  toolRegistry.register(alignReturnsTool);

  // Quant & Risk tools
  toolRegistry.register(calcCovarianceTool);
  toolRegistry.register(calcEulerRiskTool);
  toolRegistry.register(calcBetaRegressionTool);

  // Stat-Arb tools
  toolRegistry.register(testCointegrationTool);
  toolRegistry.register(calcPairSpreadTool);

  // Stress & Scenario tools
  toolRegistry.register(runStressTestTool);

  // Fundamentals & Peers
  toolRegistry.register(fetchCompanyMetricsTool);
  toolRegistry.register(comparePeersTool);

  // Macro & Geopolitics
  toolRegistry.register(fetchMacroIndicatorsTool);
  toolRegistry.register(fetchChokepointsTool);

  // News & Grounding
  toolRegistry.register(fetchNewsWiresTool);
  toolRegistry.register(searchGoogleTool);

  // Portfolio
  toolRegistry.register(getPositionsTool);
  toolRegistry.register(getSectorAllocationTool);
}

// Auto-register on import
registerAllSashaTools();

export * from "./types";
export * from "./registry";
