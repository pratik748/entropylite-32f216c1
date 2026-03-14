# Future Graph Machine (FGM) — Foresight Overhaul

## Summary

Replace the entire Foresight panel's 3D visuals with a professional **2D Recharts-based Future Graph Machine** that extends a Yahoo Finance-style historical chart with forward Monte Carlo and all other statistics model projections. Remove all Three.js/3D from Foresight. Add a new `src/lib/future-graph-machine.ts` module for the simulation pipeline.

## What Changes

### 1. New File: `src/lib/future-graph-machine.ts`

The FGM module with a clean pipeline architecture:

- `**extractParameters(prices[])**` — computes daily returns, drift (μ), historical volatility (σ), rolling vol (30/60/90d), mean price, log return distribution
- `**simulateGBM(S0, μ, σ, horizon, nPaths)**` — generates N price paths via GBM
- `**simulateOU(S0, μ_long, θ, σ, horizon, nPaths)**` — mean-reverting paths via Ornstein-Uhlenbeck
- `**simulateHybrid(S0, params, horizon, nPaths)**` — blends GBM drift with OU pull based on Hurst exponent (H < 0.5 = more OU weight, H > 0.5 = more GBM weight)
- `**processProjections(paths[][])**` — computes and returns `{ median_path, bullish_path, bearish_path, confidence_95_upper, confidence_95_lower, monte_carlo_paths (sample of ~50 for rendering) }`
- `**rollingVolatility(returns[], window)**` — 30/60/90d rolling vol
- Cache layer: memoize results by `ticker + horizon + model + depth` key

### 2. Rewrite `ForesightPanel` in `StatArbEngine.tsx`

**Remove entirely:**

- 3D Canvas with `ForecastSurface3D` (the probability cone)
- 3D Canvas with `ScoreGauge3D`
- `ForecastSurface3D` component
- `ScoreGauge3D` component
- All Three.js imports if no longer used elsewhere (check other panels first — they likely still use Three.js so imports stay)

**Replace with the Future Graph Machine UI:**

**A. Controls Bar** (above chart)

- **Projection Horizon**: `30d | 90d | 180d | 1Y` toggle buttons
- **Model Type**: `GBM | Mean Reversion | Hybrid` toggle
- **Simulation Depth**: `500 | 1000 | 5000` toggle
- **"Run Forecast"** button — simulations only run on click (performance optimization)
- **Asset selector** buttons (existing pattern, kept)

**B. The FGM Chart** (single large Recharts `ComposedChart`)

- X-axis = trading days (negative for history, 0 = today, positive = future)
- Left side: **solid primary line** = historical price (generated from buy price to current price using the asset's parameters, ~120 data points)
- Right side (future zone):
  - **Shaded area** (Area) for 95% confidence band (p5 to p95) — light translucent fill
  - **Darker shaded area** (Area) for 50% confidence band (p25 to p75)
  - **Glowing green/red line** = median path (green if above current, red if below)
  - **Thin green line** = bullish path (p90)
  - **Thin red line** = bearish path (p10)
  - **Faint background lines** = 20-30 sample Monte Carlo paths (low opacity)
  - **Vertical dashed reference line** at day 0 = "NOW"
  - **Horizontal dashed line** = current price extending into future for reference
- Color scheme: green for upside paths, red for downside, gray for neutral zones
- Tooltip showing day, price level, percentile band info

**C. Forecast Summary Row** (below chart)

- 30/60/90d median targets, P(profit), P(+10%), P(-10%), expected drawdown, optimal entry — keep existing cards but feed from FGM output

**D. Keep everything else:**

- Metric cards grid (Sharpe, Sortino, etc.)
- Regime-Conditional VaR + Transition Matrix
- Tail Crash Co-Movement
- Dynamic Verdicts
- AI Strategy Command Console + trade cards

### 3. Score Display

Replace the 3D gauge with a **2D radial SVG gauge** — a simple arc that fills based on score (0-100), colored green/yellow/red, with the score number in the center. Clean, professional, no Three.js needed.

## Files to Edit


| File                                       | Change                                                                    |
| ------------------------------------------ | ------------------------------------------------------------------------- |
| `src/lib/future-graph-machine.ts`          | **NEW** — FGM pipeline module                                             |
| `src/components/sandbox/StatArbEngine.tsx` | Remove 3D components from Foresight, rebuild with 2D FGM chart + controls |


## Performance Strategy

- Simulations run **only on button click**, not on mount
- Default shows lightweight 500-path median projection
- Results cached per `ticker+horizon+model+depth`
- Monte Carlo sample paths limited to 30 rendered lines for chart performance
- Historical data synthesized from existing asset parameters (no new API calls)