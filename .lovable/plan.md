# Desirable Assets — Portfolio-Grounded Intelligence

## Problem

The Desirable Assets module currently asks an AI to recommend 10 assets with no quantitative validation. It doesn't consider portfolio correlations, derivatives opportunities, or run any simulations. The user wants only assets that survive rigorous testing to appear.

## Solution

Transform the pipeline into a **3-stage funnel**: AI generates candidates → backend validates with real price data and quantitative filters → only survivors reach the UI. The recommendations become portfolio-relative, correlation-aware, and simulation-tested.

```text
Stage 1: AI generates ~20 candidates (wider net)
         ↓
Stage 2: Backend fetches real 3mo prices for each candidate
         Computes: correlation to portfolio, Sharpe ratio,
         mean-reversion Z-score, max drawdown, volatility
         ↓
Stage 3: Filter & rank — only top assets that pass:
         • Low correlation to existing portfolio (diversification)
         • Positive risk-adjusted return (Sharpe > threshold)
         • Acceptable max drawdown
         • Include derivative/correlation strategies
         ↓
Final: Return ranked assets + quantitative proof + strategy suggestions
```

## Changes

### 1. Edge Function: `supabase/functions/desirable-assets/index.ts`

**Major rewrite of the pipeline:**

- **Expand AI prompt** to generate ~20 candidates (not 10) and include:
  - Derivative pair strategies (e.g., "Long LMT futures + Short ITA puts")
  - Correlation-based plays relative to the user's portfolio
  - Portfolio context: pass existing tickers, sectors, and weights so AI knows what gaps to fill
- **Fetch 3-month historical prices** for all candidates via Yahoo Finance (reuse the same chart endpoint from `historical-prices`)
- **Fetch portfolio historical prices** for correlation computation
- **Run quantitative validation** on each candidate:
  - Compute daily log returns, annualized volatility, Sharpe ratio
  - Compute Pearson correlation to the portfolio's aggregate return series
  - Estimate max drawdown from historical data
  - Compute mean-reversion Z-score (current price vs. rolling mean)
  - Score capital efficiency for derivative strategies
- **Filter**: Remove assets that fail thresholds (e.g., correlation to portfolio > 0.7, Sharpe < 0)
- **Rank**: Sort by a composite score = `0.4 * normalized_sharpe + 0.3 * (1 - abs_correlation) + 0.2 * confidence + 0.1 * capital_efficiency`
- **Return top 10** with full quantitative proof attached to each recommendation
- Add new fields to each recommendation: `sharpeRatio`, `maxDrawdown`, `portfolioCorrelation`, `volatility`, `zScore`, `quantScore`, `strategy` (derivative strategy if applicable), `backtestWinRate`

### 2. Component: `src/components/DesirableAssets.tsx`

**Enhanced UI to show quantitative proof:**

- Add a **"Quant Proof" section** to each card showing: Sharpe ratio, portfolio correlation, max drawdown, volatility, Z-score
- Add a **composite "Quant Score"** badge (0-100) on each card — this is the ranking metric
- Color-code correlation: green if low (diversifying), yellow if medium, red if high
- Add **strategy type badges**: "Equity", "Pair Trade", "Futures Leverage", "Vol Arb", "Sector Hedge"
- Show a small sparkline of historical price for each recommendation (using the closes data returned)
- Add a "Simulation Tested" badge for assets that passed quantitative filters
- Update header to say "QUANT VALIDATED" instead of just "AI + QUANT HYBRID"
- Each assets should have tag like short term aggressive returns risk safe etc.

### 3. Hook update (minor)

Update the `governedInvoke` call in `DesirableAssets.tsx` to pass portfolio weights, sectors, and prices so the backend has full context for correlation computation.

## Quantitative Filters (Applied Server-Side)


| Metric                | Pass Threshold | Purpose                    |
| --------------------- | -------------- | -------------------------- |
| Portfolio Correlation | < 0.7          | Ensure diversification     |
| Sharpe Ratio (3mo)    | > -0.5         | Filter terrible performers |
| Max Drawdown (3mo)    | < 40%          | Risk control               |
| Price Verified        | Must be true   | No phantom tickers         |
| Min Data Points       | ≥ 20 days      | Statistical significance   |


## Summary of Deliverables


| #   | File                                           | Change                                              |
| --- | ---------------------------------------------- | --------------------------------------------------- |
| 1   | `supabase/functions/desirable-assets/index.ts` | Major rewrite: 3-stage funnel with quant validation |
| 2   | `src/components/DesirableAssets.tsx`           | Show quant proof, scores, strategies, sparklines    |
