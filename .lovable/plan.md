

# Outcome-Driven Gradient System (ODGS) Implementation Plan

## What We're Building

A profit-seeking learning system that tracks real trade outcomes, identifies "hot zones" (assets, combinations, conditions that produce outsized returns), and incrementally biases Entropy Lite's recommendations, sizing, and asset selection toward those zones.

## Architecture

```text
┌─────────────────────────────────────────────────────┐
│                   ODGS Core Hook                     │
│              useOutcomeGradient.ts                   │
│                                                      │
│  ProfitField ──► DesirableZones ──► GradientVector   │
│       ▲                                    │         │
│       │              SAFETY CAPS           ▼         │
│  TradeJournal    ┌──────────────┐   Parameter Shift  │
│  PaperTrades     │ maxAlloc 25% │   (α = 0.05-0.15) │
│  StrategyMemory  │ decay 0.97/d │                    │
│                  │ dd limit 15% │                    │
│                  └──────────────┘                    │
├─────────────────────────────────────────────────────┤
│  Consumers:                                          │
│  • DesirableAssets (boost scores for hot-zone assets)│
│  • StrategyFactory (bias evolution toward winners)   │
│  • EntropySandbox (new ODGS dashboard tab)           │
└─────────────────────────────────────────────────────┘
```

## Files to Create/Modify

### 1. NEW: `src/hooks/useOutcomeGradient.ts` — Core ODGS Engine

Pure client-side engine using `useLocalStorage`. No ML, no API calls. Simple maps and rolling stats.

**Data structures:**
- `ProfitFieldEntry`: `{ asset, assetClass, features: {momentum, vol, sentiment, regime}, pnlPct, returnAbs, duration, timestamp }`
- `ProfitField`: Map of `asset → weightedProfitScore`, `assetPair → synergyScore`, `featureVector → profitDensity`
- `DesirableZone`: Clusters of repeated success (same asset, correlated assets, similar features)
- `GradientVector`: Bias adjustments per asset/feature (selection probability boost, allocation scale)

**Core logic:**
- `ingestTrade(trade)` — records outcome with exponential recency weighting (`w = e^(-λ * ageDays)`, λ=0.03) and amplified weight for top-20% PnL trades
- `computeProfitField()` — builds weighted maps from last 200 trades
- `detectDesirableZones()` — clusters top-percentile trades by asset, asset-pair, and feature similarity
- `computeGradientVector()` — directional bias: increase weights for winning features, increase selection probability for hot assets
- `applyGradientStep(α)` — `θ_new = θ + α * gradient`, with controlled step size (α capped at 0.15)
- `getCombinationScores()` — tracks asset pairs where joint PnL > individual
- `getShadowComparison()` — compares active vs evolved parameter sets

**Safety controls (hardcoded):**
- Max allocation per asset: 25%
- Learning rate α: 0.05–0.15 (auto-adjusted by volatility)
- Daily decay factor: 0.97 on old zone scores
- Drawdown limit per zone: 15% — auto-blacklist if exceeded
- Diversification floor: minimum 5 distinct assets in hot zones
- Auto-rollback if 5-trade rolling PnL drops below -8%

**Update trigger:** Recomputes every 25 ingested trades or on manual trigger.

### 2. NEW: `src/components/sandbox/OutcomeGradientDashboard.tsx` — ODGS Visualization

New sandbox tab showing:
- **Profit Field Heatmap**: Top 20 assets by weighted profit score (bar chart)
- **Desirable Zones**: Cluster cards showing hot asset groups, regime context, avg PnL
- **Gradient Direction**: Current bias vector visualized as feature importance bars (momentum, vol, sentiment weights)
- **Allocation Shift Timeline**: How allocation weights have shifted over last N updates (area chart)
- **Shadow Evolution**: Side-by-side active vs evolved PnL comparison
- **Combination Matrix**: Top asset pairs by synergy score
- **Safety Status**: Current caps, blacklisted zones, rollback status

### 3. MODIFY: `src/components/sandbox/EntropySandbox.tsx`

Add ODGS as a new section in the sandbox selector:
```
{ id: "odgs", label: "Profit Gradient", icon: Flame, desc: "Outcome-driven system bias toward profit-rich zones" }
```

### 4. MODIFY: `src/components/DesirableAssets.tsx`

Integrate ODGS output to boost/penalize recommendations:
- Import `useOutcomeGradient` hook
- Multiply each recommendation's `quantScore` by the asset's `profitFieldScore` (1.0–1.5x for hot-zone assets, 0.7–1.0x for cold zones)
- Show a small "ODGS ↑" badge on boosted recommendations

### 5. MODIFY: `src/hooks/useStrategyEvolution.ts`

Feed ODGS gradient vector into the strategy evolution loop:
- Pass top desirable zones and combination scores to the edge function
- Bias strategy instrument selection toward hot-zone assets

### 6. Auto-Ingestion Pipeline

Wire up automatic trade ingestion from existing sources:
- **TradeJournal**: On every new trade log, call `ingestTrade()`
- **PaperTrading**: On every paper trade close (TP/SL hit), call `ingestTrade()`
- **StrategyMemory**: On every strategy outcome log, call `ingestTrade()`

This ensures the ODGS learns passively without manual input.

## What This Does NOT Do

- No heavy ML training — uses simple weighted maps and rolling averages
- No API calls — fully local, runs in browser
- No loss minimization — purely directional convergence toward profit concentration
- No abrupt shifts — controlled α step size with safety caps

## Estimated Scope

- 1 new hook (~350 lines of pure math/data logic)
- 1 new dashboard component (~400 lines with charts)
- 3 small modifications to existing files
- Zero new edge functions or database tables

