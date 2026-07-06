# Institutional Analytics Reform — Reporting, Portfolio Construction & Analytics Layer

This document describes the reform of the Augment layer (reporting, portfolio
construction, institutional analytics) into a typed, deterministic, fully
data-driven engine. Design target: BlackRock-Aladdin-grade rigor — every
number computed from real portfolio state and real market data, every claim
cited, graceful degradation everywhere, no fallback heuristics.

## Architecture

```
holdings (portfolio-state) ──┐
1y daily history per asset ──┼─▶ useQuantSnapshot (μ, Σ, ρ, VaR, return series)
benchmark index history ─────┘
       │
       ▼
src/lib/analytics/            ← pure, deterministic engine (no React, no I/O)
  types.ts        typed models; MetricValue = value + provenance + confidence
  performance.ts  CAGR · Sharpe · Sortino · Calmar · Omega · α/β/IR/TE · capture · rolling
  risk.ts         drawdown episodes · concentration · correlation/PC1 · tails/EVT
                  beta-propagated stress · historical worst-window replay · σ sensitivity
  optimizers.ts   unified facade: EW · MinVar · MVO · Robust MVO · ERC · Risk Budget ·
                  HRP · Black–Litterman · Min-CVaR + constraints (cap/turnover/vol target)
  attribution.ts  position contribution · Euler risk contribution · Brinson
  exposure.ts     sector · currency · realized style terciles · portfolio β
  insights.ts     deterministic rule synthesis; every insight cites source/calc/confidence
  reports.ts      composable typed report sections (exec summary → rebalancing)
       │
       ▼
useInstitutionalAnalytics     ← single wiring hook (fetches real benchmark:
                                ^NSEI for INR-dominant books, else ^GSPC)
       │
       ▼
Augment modules (UI renders; never computes financial math)
```

### Provenance model

Every reported figure is a `MetricValue`:

```ts
{ value, provenance: { source, calculation, sampleSize, confidence, assumptions? } }
```

`source` ∈ {historical-prices, portfolio-state, benchmark-prices,
covariance-estimate, derived}. `confidence` is graded mechanically from the
sample (n≥180 high, n≥60 medium, else low) — never asserted. Insights are
generated only by fixed rules over these metrics; there is no path for an
uncited number to reach a report.

### Graceful degradation (hard rules)

1. Ledoit–Wolf shrinkage of Σ when aligned return series exist; nearest-PSD
   projection always (HRP intentionally receives the raw Σ — it never inverts).
2. A solver that fails (singular Σ, non-convergence) returns
   `converged: false` with the reason in `diagnostics.notes`. The UI states
   this; **no fallback allocation is ever substituted**.
3. Metrics that cannot be computed are omitted (EVT below 100 obs, capture
   ratios below 20 obs, style terciles below 3 positions), never guessed.

## What was removed

- **StressTestModule**: the entire `SCENARIO_IMPACTS` table of hardcoded
  portfolio multipliers and the fabricated sensitivity rows (−1.8%, −1.0%, …).
  Replaced by `ΔP/P = Σ wᵢ·βᵢ·shock` with per-asset OLS betas on the real
  benchmark, historical worst-window replay from the portfolio's own series,
  and ±kσ sensitivity from the realized Σ. Recovery estimates come from the
  portfolio's completed drawdown episodes, or are omitted.
- **PortfolioConstructionModule**: Sharpe/Sortino/max-drawdown computed from
  the *cross-section of holdings' P&L* (statistically meaningless) — replaced
  with real time-series metrics; β×risk-score "risk contribution" heuristic —
  replaced with Euler decomposition wᵢ(Σw)ᵢ/σ²ₚ.
- **BenchmarkModule**: circular benchmark estimate (portfolio return ÷ its own
  beta) — replaced with an independent real index series and OLS regression.
- **ExposureDashboardModule**: `riskBreakdown || 40`-style fallback scores and
  arbitrary 70/50/30 concentration mapping — replaced with realized
  volatility, HHI/effective-N, diversification ratio, real style terciles.

## Files created

| File | Contents |
|---|---|
| `src/lib/analytics/types.ts` | Typed models + provenance/confidence machinery |
| `src/lib/analytics/performance.ts` | Performance metric suite |
| `src/lib/analytics/risk.ts` | Risk suite + stress engine + replay |
| `src/lib/analytics/optimizers.ts` | Optimizer facade + risk budgeting + min-CVaR + constraints |
| `src/lib/analytics/attribution.ts` | Contribution + Brinson + Euler risk attribution |
| `src/lib/analytics/exposure.ts` | Sector/currency/style/β exposures |
| `src/lib/analytics/insights.ts` | Deterministic cited insight synthesis |
| `src/lib/analytics/reports.ts` | Composable typed report generators |
| `src/lib/analytics/analytics.test.ts` | 41 unit tests over the engine |
| `src/hooks/useInstitutionalAnalytics.ts` | Wiring hook incl. real benchmark fetch |

## Files modified

| File | Change |
|---|---|
| `src/hooks/useQuantSnapshot.ts` | Exposes `returnsByTicker` (per-asset daily log-returns) |
| `src/components/augment/StressTestModule.tsx` | Full rewrite — computed stress only |
| `src/components/augment/PortfolioConstructionModule.tsx` | 9-optimizer suite, solver diagnostics (κ(Σ), LW δ, convergence, confidence), constraint controls (vol target, position cap, turnover cap), fixed metrics |
| `src/components/augment/BenchmarkModule.tsx` | Real-index OLS α/β/R², TE, IR, capture, rolling Sharpe/vol, Brinson with disclosed basis |
| `src/components/augment/ClientReportingModule.tsx` | Renders the typed institutional report (exec summary, performance, risk, attribution, exposure, scenario, rebalancing) with per-figure citations |
| `src/components/augment/ExposureDashboardModule.tsx` | Currency/style exposures, effective N, realized-vol view |

## Migration plan for remaining modules

The engine is intentionally reusable; remaining Augment modules migrate the
same way, one hook call each:

1. **RiskModelingModule** — already history-driven; swap its ad-hoc factor
   scaling for `analyzeTailRisk`/`analyzeCorrelationRisk`, and surface the
   Merton D/E assumption (`debt = 0.4·E`) as a `MetricProvenance.assumptions`
   entry.
2. **HedgingModule / MultiAssetModule / ValuationModule** — consume
   `useInstitutionalAnalytics` for β, Σ, and exposures instead of local math.
3. **ReturnsEstimateModule** — route expected-return blending through
   `blackLitterman` views (the mathematically correct home for proprietary
   signals) rather than ad-hoc weight nudges.
4. **DataAggregationModule** — remove the "fallback static data" block; render
   the empty state until the pipeline responds.
5. Legacy callers of `portfolio-math` strategies keep working — the facade
   wraps rather than replaces them.

## Verification

- `npx vitest run` — 135 tests green (41 new engine tests: optimizer
  convergence and constraint binding, budget attainment RCᵢ∝bᵢ, CVaR
  improvement over equal weight, stress = Σwβ·shock exactness, drawdown
  episode structure, provenance propagation, graceful-degradation paths).
- `npx tsc --noEmit` and `npx vite build` clean.
