

# Plan: Heavy Intelligence Loops, Continuous Simulation, CLANK AI Detection & Strategy Evolution

## Overview

Four major upgrades to leverage Cloudflare AI at full capacity: parallel multi-model reasoning, continuous background simulation, AI-powered constraint detection, and autonomous strategy discovery with evolutionary selection.

---

## 1. Parallel Intelligence Orchestrator

**New edge function: `parallel-intelligence`**

A single edge function that runs 4 parallel `callAI` calls simultaneously and cross-validates their conclusions:

- **Market Interpretation Model** — reads regime, sectors, VIX, produces macro narrative
- **Anomaly Detection Model** — scans portfolio for concentration, correlation, unusual patterns
- **Portfolio Optimization Model** — suggests optimal weights, rebalancing
- **Risk Assessment Model** — evaluates tail risks, stress scenarios

Each model gets the same input but a different system prompt. The function runs all 4 via `Promise.all`, then merges and cross-validates: flags where models agree (high confidence) vs disagree (requires attention).

**Frontend: `useParallelIntelligence` hook** — calls this once per refresh cycle, feeds merged results to a new "Intelligence Consensus" panel showing agreement/disagreement across models.

## 2. Continuous Simulation Engine

**New edge function: `continuous-simulation`**

Runs perpetual scenario simulation calibrated by AI:
- Takes portfolio + regime → AI generates scenario trees (branching paths with probabilities)
- Produces volatility regime change forecasts with transition probabilities
- Identifies liquidity stress trigger levels for each holding
- Returns time-series of evolving risk surfaces

**Frontend: `useContinuousSimulation` hook** — polls every 60s (governed by `apiGovernor` with a new `continuous` tier at 60s TTL). Updates MonteCarloEngine and AftermathMatrix with live AI-calibrated parameters rather than static ones.

**New `continuous` tier in apiGovernor** — 60s cooldown for background loops.

## 3. AI-Powered CLANK Detection

**New edge function: `clank-detection`**

Replaces the static rule-based constraint evaluation in `clank-engine.ts`:
- AI analyzes portfolio holdings against known institutional constraint patterns
- Detects: index rebalance flows, ETF creation/redemption triggers, vol-targeting adjustments, gamma exposure shifts, liquidity bottlenecks, CTA trend triggers, pension rebalancing windows
- Returns constraint activations with AI-calibrated probabilities, estimated forced volumes, and cascade sequences
- Uses portfolio context (which holdings are affected, position sizes) for personalized detection

**Frontend update: `ClankEngine.tsx`** — calls `clank-detection` via `useAIIntelligence`, overlays AI results on top of existing static engine (AI results take priority, static serves as fallback).

## 4. Strategy Evolution Machine

**New edge function: `strategy-evolution`**

Autonomous strategy discovery pipeline in a single AI call:
- Input: portfolio, regime, strategy memory (past wins/losses), market conditions
- AI proposes 6-10 new strategy candidates
- For each candidate, AI assigns: expected Sharpe, max drawdown estimate, regime fitness, confidence
- AI ranks and filters: discards weak ones (Sharpe < 0.5 or confidence < 40)
- Returns top 3-5 "evolved" strategies with full trade specs

**Frontend: `useStrategyEvolution` hook** — runs in background every 120s. Stores discovered strategies in a new "Strategy Factory" section within the Sandbox. Strategies accumulate over time; user can promote them to active paper trading.

**Update `EntropySandbox.tsx`** — add "Strategy Factory" section showing AI-discovered strategies with evolution metrics (generation count, survival rate, avg Sharpe).

---

## Technical Details

### New Edge Functions (4)
| Function | Input | Parallel AI Calls | Output |
|---|---|---|---|
| `parallel-intelligence` | portfolio, regime, VIX | 4 concurrent | merged consensus |
| `continuous-simulation` | portfolio, regime | 1 | scenario trees, regime transitions |
| `clank-detection` | portfolio, VIX, regime | 1 | constraint activations with probabilities |
| `strategy-evolution` | portfolio, regime, memory | 1 | ranked strategy candidates |

### API Governor Changes
- New `continuous` tier: 60s TTL for background loops
- New `evolution` tier: 120s TTL for strategy discovery
- Map new functions to appropriate tiers

### New Frontend Files
- `src/hooks/useParallelIntelligence.ts` — orchestrates parallel-intelligence calls
- `src/hooks/useContinuousSimulation.ts` — 60s polling loop for live simulation
- `src/hooks/useStrategyEvolution.ts` — 120s background strategy factory
- `src/components/sandbox/StrategyFactory.tsx` — UI for discovered strategies
- `src/components/terminal/IntelligenceConsensus.tsx` — consensus panel showing model agreement

### Frontend Integration Points
- `ClankEngine.tsx` — add AI overlay via `useAIIntelligence("clank-detection", ...)`
- `MonteCarloEngine.tsx` — consume continuous simulation data when available
- `EntropySandbox.tsx` — add StrategyFactory section
- `Index.tsx` — wire `useParallelIntelligence` and `useContinuousSimulation` at top level, pass data down

### Config Updates
- `supabase/config.toml` — register 4 new functions with `verify_jwt = false`

All functions use the existing `callAI.ts` shared module (Cloudflare Workers AI, Llama-4-Scout). All have static fallbacks for graceful degradation.

