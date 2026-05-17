# Real Math, Real Data — System-Wide Veracity Pass

Goal: every quantitative module reads from real historical data and runs real math. Synthetic numbers never used use ai and web to get real data The same `useQuantSnapshot` becomes the single source of truth feeding Direct Profit, Desirable Assets, Risk, Monte Carlo, Factor Models, Stat Arb, Causal, Execution, ESG, Order Management, and the dashboard.

## Scope (modules touched)

Frontend (currently use `Math.random` or heuristic proxies):

- `src/components/sandbox/StatArbEngine.tsx` — already partially fixed; finish the propagation
- `src/components/sandbox/MonteCarloEngine.tsx`
- `src/components/sandbox/CausalEffectsEngine.tsx`
- `src/components/sandbox/ExecutionEngine.tsx`
- `src/components/augment/RiskModelingModule.tsx`
- `src/components/augment/ESGModule.tsx`
- `src/components/augment/OrderManagementModule.tsx`
- `src/components/MonteCarloChart.tsx`
- `src/components/DesirableAssets.tsx`

Backend:

- `supabase/functions/desirable-assets/index.ts` — replace any noise-based PnL with real backtest using `historical-prices`
- `supabase/functions/alternative-signals/index.ts` — drop random sentiment, use real news/sentiment from `fetch-news` + `sentiment-intel`
- `supabase/functions/sec-filings/index.ts` — replace placeholder rows with real SEC EDGAR scrape (no fabrication)
- `supabase/functions/direct-profit/index.ts` — consume the real-math `desirableHint` already passed in

## Architecture

```text
                ┌──────────────────────────────┐
                │  historical-prices (Yahoo→AV)│
                │  fetch-news / sentiment-intel│
                │  sec-filings (real EDGAR)    │
                └──────────────┬───────────────┘
                               │
                               ▼
                ┌──────────────────────────────┐
                │  useQuantSnapshot (already)  │
                │  + useRealSignals (new)      │  ← real μ,σ,corr,VaR,sentiment,filings
                └──────────────┬───────────────┘
                               │
       ┌───────────────┬───────┴────────┬──────────────────┐
       ▼               ▼                ▼                  ▼
 Desirable Assets   Direct Profit   Risk / Monte Carlo  Stat Arb / Causal
       │               │                │                  │
       └───────────────┴────────┬───────┴──────────────────┘
                                ▼
                       Dashboard analytics
                       (one truth, one number)
```

## Plan

### 1. Real-data foundation

- Audit every `Math.random()` in the modules above. For each, either (a) replace with a computation off the real series, or (b) wrap behind an explicit `provenance: "synthetic-fallback"` badge and only fire when `closes.length < 30`.
- Extend `useQuantSnapshot` (or add `useRealSignals`) to expose: per-asset μ̂ (shrunk + clamped), σ, skew, kurt, jump stats, rolling 60d historical VaR/CVaR, Sharpe, Sortino, Pearson corr matrix, true portfolio σ via wᵀΣw, Merton DD/PD.

### 2. Backtest-driven Desirable Assets

- Rewrite the scoring inside `supabase/functions/desirable-assets/index.ts`:
  - Pull 1y daily closes via `historical-prices`
  - Compute realized return, hit-rate, max drawdown, Sharpe per zone
  - PnL% is the actual cumulative log-return of the zone window, not a noise draw
  - Drop any zone with `n < 60` daily obs from the "recommended" list (mark as "insufficient history")
- Surface `provenance: "historical-backtest"` in the payload so the dashboard and Direct Profit show the same number.

### 3. Direct Profit alignment

- Direct Profit already reads `desirableHint`. Switch it to consume the new backtested PnL fields (`realizedSharpe`, `hitRate`, `realizedPnlPct`) instead of the old "avgPnL".
- The `CONTEXTUAL_OVERRIDE` rule fires only when the desirable signal carries `provenance: "historical-backtest"` AND `n >= 60`.

### 4. Monte Carlo / Factor / Risk modules

- `MonteCarloEngine`, `MonteCarloChart`, `RiskModelingModule`: paths simulated from real μ̂ (shrunk, ±35% clamp), real σ, real jump intensity, real covariance. Remove the sine-wave VaR backtest entirely — use `rollingHistoricalVaR`.
- `CausalEffectsEngine`: replace random effect sizes with regression coefficients from `logReturns` of paired series (event-window vs control-window).
- `StatArbEngine`: finalize the shrinkage/clamping work; ensure Factor Model, Optimization, Mean Reversion, Foresight tabs all read from the same snapshot.

### 5. Execution / Order Management / ESG

- `ExecutionEngine`, `OrderManagementModule`: replace random fills/slippage with real bid-ask + ADV-derived impact: slippage = k·σ·√(orderSize/ADV). ADV from `historical-prices.volumes`.
- `ESGModule`: drop random scores. Either pull from a real source (Yahoo `esgScores` endpoint + GDELT controversy count via `fetch-news`), or display "Data unavailable — connect ESG provider" instead of fabricating.

### 6. Alternative signals & SEC filings

- `alternative-signals`: sentiment from `sentiment-intel` (already exists); flow proxy from real volume z-score; remove random social score or label it "demo only".
- `sec-filings`: scrape SEC EDGAR (`https://www.sec.gov/cgi-bin/browse-edgar`) with a UA header. Return real filings or an empty list — never fabricate rows.

### 7. Provenance & UI honesty

- Every module renders a small `MethodologyTooltip` (already exists) showing: data source, lookback N, formula, provenance (`historical` | `partial` | `synthetic-fallback` | `unavailable`).
- Dashboard analytics widget shows the same provenance badge so "no edge found" only appears when the math truly says so — not because the input was random.

### 8. Validation

- For 5 tickers (AAPL, NVDA, CRWD, ARKK, RELIANCE.NS) verify:
  - `historical-prices` returns ≥200 daily bars
  - Desirable Assets PnL matches a manual `(P_end/P_start - 1)` calc within 1bp
  - Direct Profit BUY/SELL/WAIT decision matches the documented rule given the real inputs
  - Monte Carlo annualized μ stays inside ±35% and Sharpe is finite
- Type-check and curl each edge function once after deploy.

## Out of scope

- No new UI sections, no design changes. Visual layout of each module stays as-is; only the numbers and the small provenance badge change.
- No new paid data providers — only the keys already in secrets (Alpha Vantage, Newsdata, etc.) plus public Yahoo/SEC/GDELT.

## Risk / trade-offs

- Some modules will show fewer "recommendations" because zones with thin history get dropped. That is the correct behavior for a credibility-first system.
- Edge-function latency increases slightly (extra `historical-prices` call inside `desirable-assets`); mitigated by the existing `governedInvoke` cache.