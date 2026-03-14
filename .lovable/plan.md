

# Foresight Overhaul + Rebranding

## Changes

### 1. Rebrand — `index.html`
- Title: "Entropy Lite — Institutional Intelligence"
- Description: "Institutional-grade portfolio intelligence. Quantitative risk, regime detection, and predictive analytics."
- Update all og:title, twitter:title, og:description, twitter:description to match.

### 2. Foresight Panel Rebuild — `src/components/sandbox/StatArbEngine.tsx`

**Remove:**
- The 3D Risk-Return Surface (lines 1205-1238) — the static sphere grid adds no predictive value.
- Static per-asset verdicts that just repeat heuristic rules (Z-score thresholds) — replace with dynamic, data-driven directional forecasts.

**Replace with:**

**A. 3D Directional Forecast Surface (the core "future machine")**
- For each asset, run a Monte Carlo fan (e.g., 500 paths, 60 trading days) using the asset's own GBM parameters (μ, σ from analysis).
- Allow the user to **select an asset** from a dropdown to view its dedicated forecast.
- Render a **3D surface** where X = time (days), Y = price path index (percentile bands), Z = price level.
- Color gradient: green (upside paths above buy price) to red (downside paths below buy price).
- Show percentile contour lines (5th, 25th, 50th, 75th, 95th) as highlighted ridges on the surface.
- Overlay the current price and buy price as horizontal planes for reference.
- This gives **direction** (is the median drifting up or down?) and **magnitude** (how wide is the cone?).

**B. Dynamic Verdict Engine**
- Replace static heuristic verdicts with computed ones that synthesize:
  - Monte Carlo median trajectory slope (direction)
  - Probability of profit at 30/60/90 day horizons
  - Mean reversion signal (OU z-score + snap-back probability)
  - Regime-conditional expected return
  - Fragility exposure
- Each verdict shows: direction arrow (↑↗→↘↓), magnitude (expected % move), confidence band, and time horizon.
- Verdicts are **reactive** — they change based on the selected asset's actual quantitative signals, not static if/else rules.

**C. Forecast Summary Cards**
- For the selected asset: 30-day target (median), 60-day target, probability of +10% move, probability of -10% move, expected drawdown, optimal entry zone (from OU mean ± 1σ).

**Keep:**
- 3D Score Gauge (it's visually distinctive and useful)
- Metric cards grid (Sharpe, Sortino, etc.)
- Regime-Conditional VaR + Transition Matrix
- Executable Command Console
- Tail Crash Co-Movement

### 3. Math additions — `src/lib/statarb-math.ts`
- Add `multiHorizonForecast(price, mu, vol, horizons)` — returns median price, P(profit), P(+10%), P(-10%) at each horizon.
- Add `directionMagnitude(mu, vol, horizon)` — returns expected direction and magnitude with confidence.

## Files to Edit

| File | Change |
|------|--------|
| `index.html` | Rebrand title + meta tags |
| `src/components/sandbox/StatArbEngine.tsx` | Remove 3D risk surface, add 3D forecast surface with asset selector, dynamic verdicts |
| `src/lib/statarb-math.ts` | Add `multiHorizonForecast`, `directionMagnitude` |

