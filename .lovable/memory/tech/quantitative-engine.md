---
name: Quantitative Engine
description: Cutting-edge quant math library + shared snapshot hook providing real σ, μ, correlation, covariance, VaR, CVaR, Merton DD from historical price series
type: feature
---
The platform's quantitative spine. Replaces all heuristic risk-score proxies with real historical math.

**Files**:
- `src/lib/quant-engine.ts` — pure math: log-returns, σ, skew, kurtosis, jump detection, Pearson correlation, covariance, parametric/historical/CVaR, rolling VaR backtest, Sharpe, Sortino, beta, Merton distance-to-default (1974)
- `src/hooks/useQuantSnapshot.ts` — single-source-of-truth hook. Pulls 1y daily bars for every holding via `useHistoricalPrices`, computes per-asset `AssetStats` and full portfolio quant snapshot (μ, σ, sharpe, var, cvar, rolling VaR, correlation, covariance)
- `src/components/quant/MethodologyTooltip.tsx` — institutional disclosure popover (formula + data source + lookback) used in every upgraded module

**Data pipeline**:
- `historical-prices` edge function: Yahoo Finance primary → Alpha Vantage fallback (uses ALPHAVANTAGE_API_KEY). Default range upgraded from 3mo to 1y.

**Modules upgraded**:
- `RiskModelingModule.tsx` — VaR/CVaR from real returns, rolling 60-day historical VaR backtest (replaces sine-wave fake), real correlation factor in radar, Merton DD/PD per issuer (replaces heuristic ratings)
- `MonteCarloEngine.tsx` — μ, σ, jump intensity, jump size all calibrated from real history. Portfolio σ uses true `√(wᵀΣw)` covariance (not weighted average). Scenario stress layered on top of real calibration. Falls back to risk-score proxy only when history < 30 days.

**Conventions**: log returns, σ daily, annualized via ×252 / ×√252.
