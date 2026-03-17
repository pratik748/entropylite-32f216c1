

# Derivatives "God's Eye" + Stat Arb Math Accuracy — Implementation Plan

## Two Problems Identified

### Problem 1: Derivatives Engine is Portfolio-Only
Currently the derivatives engine only analyzes tickers already in the portfolio. The user wants it to act as a **"God's Eye"** — discovering opportunities from the broader market using news, geopolitical data, sector analysis, and historical patterns. Example: Lockheed Martin futures + iShares Defence ETF for riskless leverage — assets not necessarily in the portfolio.

### Problem 2: Stat Arb Modules Use Synthetic Data
Several stat arb panels generate **random synthetic data** instead of using real market information:

- **Factor Model**: Factor returns are `Array.from({length: 60}, () => 0.0002 + 0.01 * SA.gaussianRandom())` — pure noise, not real factor data
- **Liquidity**: Order book imbalance is `SA.orderBookImbalance(50 + Math.random() * 50, 50 + Math.random() * 50)` — random numbers
- **Structural Flow**: Prices generated as `a.price * (1 + 0.01 * SA.gaussianRandom() * (30 - i))` — synthetic, volumes also random
- **Stress Test**: Factor betas use `SA.gaussianRandom() * 0.5` for Size/Value/Momentum/Quality — not derived from actual data
- **Correlation heatmaps** (both Derivatives & Stat Arb): Built from synthetic GBM returns, not historical price data

All these should use **real price history** from the `price-feed` edge function.

---

## Plan

### 1. Upgrade Derivatives Edge Function — "God's Eye" Mode

**File**: `supabase/functions/derivatives-intelligence/index.ts`

Expand the AI prompt to go beyond portfolio tickers:

- Add a `discovery_mode: true` flag that instructs the AI to **discover external opportunities** — correlated ETFs, sector futures, cross-asset plays (e.g., LMT + ITA defence ETF, oil futures + XLE)
- Inject **market context** into the prompt: current geopolitical themes (from existing news/geo data), macro regime, recent sector movements
- Add a new `discoveries` section to the JSON output schema:
  ```json
  "discoveries": [
    {
      "asset_a": "LMT", "asset_b": "ITA",
      "type": "futures_etf_leverage",
      "thesis": "Defence spending escalation...",
      "instrument_a": "LMT futures",
      "instrument_b": "ITA ETF",
      "structure": "Long LMT futures / Long ITA for leveraged sector exposure",
      "capital_efficiency": 4.5,
      "catalyst": "news/geopolitical/earnings/macro",
      "confidence": 0.75,
      "reasoning": "..."
    }
  ]
  ```
- Increase maxTokens to accommodate discovery output
- Pass optional `news_context` and `macro_context` strings from the client

### 2. Update Derivatives Hook — Pass Market Context

**File**: `src/hooks/useDerivativesIntelligence.ts`

- Accept optional `newsContext` and `macroContext` parameters
- Pass `discovery_mode: true` and context strings in the request body

### 3. Update Derivatives UI — Add "Discoveries" Tab

**File**: `src/components/sandbox/DerivativesEngine.tsx`

- Add a new "Discoveries" sub-tab (icon: `Eye`) showing God's Eye opportunities
- Each discovery card shows: thesis, instruments, structure, catalyst source, capital efficiency, confidence
- Display catalyst badges (NEWS, GEO, MACRO, HISTORY)

### 4. Create Historical Price Fetch Utility

**File**: `supabase/functions/historical-prices/index.ts` (new edge function)

- Fetch multi-day historical prices from Yahoo Finance v8 chart endpoint (`range=3mo&interval=1d`)
- Accept array of tickers, return `{ [ticker]: number[] }` (daily closes)
- This provides **real data** for stat arb math

**File**: `supabase/config.toml` — add function config

### 5. Create Client-Side Hook for Historical Data

**File**: `src/hooks/useHistoricalPrices.ts` (new)

- Wraps the `historical-prices` edge function via `governedInvoke`
- Caches results (tier: `"slow"`, 5-minute cache)
- Returns `{ prices: Record<string, number[]>, loading, error, fetch }`

### 6. Fix Stat Arb Panels with Real Data

**File**: `src/components/sandbox/StatArbEngine.tsx`

Replace synthetic data in these panels:

| Panel | Current Problem | Fix |
|-------|----------------|-----|
| **Factor Model** | Random factor returns | Use real returns from historical prices; compute market beta from SPY correlation; derive Size/Value/Momentum from real cross-sectional data |
| **Liquidity** | Random OBI | Remove fake OBI; use real volume data from historical fetch; keep Almgren-Chriss model (math is correct) but with real ADV estimates |
| **Structural Flow** | Synthetic prices/volumes | Use real historical prices for flow detection signals |
| **Stress Test** | Random factor betas | Derive betas from real factor regression against historical returns |
| **Correlation Heatmaps** | GBM-generated returns | Compute from real historical daily returns |
| **Mean Reversion** | Synthetic price path | Use real historical prices for OU estimation, Hurst, Z-score |
| **Time Series** | Synthetic path scaled to endpoints | Use real historical prices for Kalman filter and ARIMA forecast |

The math functions in `statarb-math.ts` are **correct** — the problem is the inputs. The fix is feeding them real data.

### 7. Update Price Dynamics & Risk Panels

These panels correctly use stochastic models (GBM, Jump Diffusion) which are forward-looking simulations — those are fine using estimated parameters. But the **parameters** (μ, σ) should be derived from real historical returns rather than the current heuristic mapping (`risk === "High" → vol = 0.4`).

---

## Summary of Deliverables

| # | File | Change |
|---|------|--------|
| 1 | `supabase/functions/derivatives-intelligence/index.ts` | Add God's Eye discovery mode with news/macro context |
| 2 | `supabase/functions/historical-prices/index.ts` | New — fetch real historical prices from Yahoo Finance |
| 3 | `src/hooks/useHistoricalPrices.ts` | New — client hook for historical price data |
| 4 | `src/hooks/useDerivativesIntelligence.ts` | Pass discovery mode + market context |
| 5 | `src/components/sandbox/DerivativesEngine.tsx` | Add Discoveries tab, pass context |
| 6 | `src/components/sandbox/StatArbEngine.tsx` | Replace all synthetic data inputs with real historical prices |
| 7 | `supabase/config.toml` | Add `historical-prices` function config |

