

# Foresight Hub — 3D Intelligence Command Center

## Current State
The Foresight panel is a flat summary: one composite score, 8 metric cards, and a per-asset verdict list. No 3D visuals, no executable actions, no unique analytics that differentiate it from the other tabs.

## Vision
Transform Foresight into the **command center hub** — the one place where every stat arb engine converges into interactive 3D visualizations and real-time executable commands.

## What Gets Built

### 1. Three 3D Visualizations (React Three Fiber)

**A. 3D Risk Surface**
- X = Asset index, Y = Risk contribution, Z = Expected return
- Each asset rendered as a glowing sphere sized by portfolio weight
- Color: green (accumulate) → yellow (hold) → red (exit) based on verdict
- Interactive: orbit, zoom, click sphere to highlight asset details
- Plane at Y=0 separates positive/negative risk contribution

**B. 3D Regime Transition Landscape**
- Terrain mesh where X = time steps, Y = regime probability (bull/neutral/bear), Z = portfolio value
- Shows how portfolio value evolves across regime transitions
- Color gradient: green peaks (bull), gray plateau (neutral), red valleys (bear)
- Animated camera fly-through on load

**C. 3D Correlation Network Graph**
- Each asset is a floating node (sphere)
- Edges (lines) connect all pairs, thickness = |correlation|, color = positive (green) / negative (red)
- Highly correlated clusters visually group together
- Auto-rotating, orbit controls

### 2. Unique Analytics Nobody Else Has

**A. Entropy Score** — measures portfolio disorder/unpredictability using Shannon entropy on return distributions. Low entropy = concentrated risk, high entropy = well-diversified chaos.

**B. Tail Dependency Matrix** — goes beyond correlation to measure how assets co-move specifically in crash scenarios (lower-tail dependence coefficient from copula theory approximation).

**C. Regime-Conditional VaR** — VaR computed separately for each detected regime (bull/neutral/bear) instead of one blended number.

**D. Portfolio Fragility Index** — ratio of CVaR to VaR. Values >> 1 mean the tail is fat and losses accelerate beyond VaR. Unique metric for tail risk awareness.

**E. Optimal Horizon Calculator** — uses mean reversion half-lives and drift to compute the mathematically optimal holding period for each asset.

### 3. Executable Command Console

A command bar at the bottom of Foresight with real-time actionable buttons:

- **"Execute Rebalance → Risk Parity"** — generates exact trade list (shares to buy/sell per asset) to move from current weights to risk parity weights
- **"Execute Foresight Verdicts"** — converts ACCUMULATE/REDUCE/EXIT verdicts into specific dollar amounts and share counts
- **"Hedge Portfolio"** — generates exact hedge trades (SPY puts, inverse ETFs) sized to neutralize the computed VaR
- **"Optimize Kelly"** — computes Kelly-optimal position sizes and generates rebalance trades

Each command produces a **Trade Instruction Card** showing: ticker, action, shares, dollar amount, and a "Copy to Clipboard" button. These mirror the format from the Strategy Lab.

### 4. Enhanced Score Visualization

Replace the flat "72/100" text with a **3D animated gauge** — a glowing ring that fills based on score, with particle effects at the current level, rendered in a small Canvas.

## Files to Edit

| File | Change |
|------|--------|
| `src/lib/statarb-math.ts` | Add: `shannonEntropy()`, `tailDependence()`, `regimeConditionalVaR()`, `fragilityIndex()`, `optimalHorizon()` |
| `src/components/sandbox/StatArbEngine.tsx` | Rebuild ForesightPanel with 3D visuals, unique analytics, executable commands |

## Technical Notes

- All 3D uses existing `@react-three/fiber` + `@react-three/drei` (already installed)
- All math is pure client-side from `statarb-math.ts` — no new API calls
- Executable commands generate trade instruction objects matching the Strategy Lab format
- The 3D Risk Surface and Correlation Network use existing portfolio data; no new data fetching
- File will grow ~400 lines for ForesightPanel; other panels unchanged

