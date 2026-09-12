import { describe, it, expect, beforeEach } from "vitest";
import { venorEngine } from "./simulation-engine";

describe("VENOR Simulation & Bayesian Evolution Engine", () => {
  beforeEach(() => {
    venorEngine.reset();
  });

  it("initializes with institutional capital $10,000,000 and 5 active quantitative strategies", () => {
    const state = venorEngine.getState();
    expect(state.initialCapital).toBe(10_000_000);
    expect(state.equity).toBe(10_000_000);
    expect(state.cash).toBe(10_000_000);
    expect(state.fleet.length).toBe(5);
    expect(state.fleet.every((s) => s.active)).toBe(true);
    expect(state.assets.length).toBeGreaterThanOrEqual(10);
  });

  it("advances market prices and executes strategy ticks deterministically", () => {
    const initialTicks = venorEngine.getState().tickCount;
    for (let i = 0; i < 5; i++) {
      venorEngine.tick();
    }
    const state = venorEngine.getState();
    expect(state.tickCount).toBe(initialTicks + 5);
    expect(state.equityCurve.length).toBeGreaterThan(1);
    expect(state.executionLog.length).toBeGreaterThan(0);
  });

  it("applies closed-form Almgren-Chriss SDE execution and tracks slippage", () => {
    // Force a series of ticks to generate trades
    for (let i = 0; i < 20; i++) {
      venorEngine.tick();
    }
    const state = venorEngine.getState();
    expect(state.totalVolumeTraded).toBeGreaterThanOrEqual(0);
    expect(state.totalSlippageDollars).toBeGreaterThanOrEqual(0);
    if (state.recentTrades.length > 0) {
      const trade = state.recentTrades[0];
      expect(trade.slippageCostDollars).toBeGreaterThanOrEqual(0);
      expect(trade.slippageBps).toBeGreaterThanOrEqual(0);
      expect(trade.shares).toBeGreaterThan(0);
    }
  });

  it("executes Bayesian hyperparameter evolution and updates generation lineage", () => {
    const initialGen = venorEngine.getState().currentGeneration;
    venorEngine.runBayesianOptimizationStep();
    const state = venorEngine.getState();

    expect(state.currentGeneration).toBe(initialGen + 1);
    expect(state.generationHistory.length).toBeGreaterThanOrEqual(2);

    const latestGen = state.generationHistory[0];
    expect(latestGen.generation).toBe(state.currentGeneration);
    expect(latestGen.parameters).toBeDefined();
    expect(latestGen.parameters.ouEntryZScore).toBeGreaterThan(1.0);
    expect(latestGen.parameters.evtMinConvexityRatio).toBeGreaterThan(2.0);
  });

  it("injects geopolitical shocks into SVAR causal tensors", () => {
    const shockEvent = "Taiwan Strait semiconductor export blockade";
    venorEngine.injectMacroShock(shockEvent);
    const state = venorEngine.getState();

    expect(state.activeMacroShock).toBe(shockEvent);
    const hasShockLog = state.executionLog.some((l) => l.type === "SHOCK" || l.message.includes("GEOPOLITICAL"));
    expect(hasShockLog).toBe(true);
  });

  it("notifies subscribers on state updates without memory leaks", () => {
    let callCount = 0;
    const unsub = venorEngine.subscribe((st) => {
      callCount++;
    });

    expect(callCount).toBe(1); // Immediate notification
    venorEngine.tick();
    expect(callCount).toBe(2);

    unsub();
    venorEngine.tick();
    expect(callCount).toBe(2); // No further notifications after unsubscribe
  });
});
