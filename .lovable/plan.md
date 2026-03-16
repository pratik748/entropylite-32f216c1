# Derivatives Intelligence Layer — Implementation Plan

## Architecture Overview

This is a large feature set. The most practical approach is to build it as a **single new section** on top ("Derivatives") backed by **one new edge function** that uses AI to generate all derivatives intelligence from portfolio context, plus **client-side quantitative computations** for correlation/pair-trade math.

```text
┌─────────────────────────────────────────────────┐
│ EntropySandbox — new "Derivatives" tab          │
│  ┌────────────────────────────────────────────┐  │
│  │ DerivativesEngine.tsx                      │  │
│  │  ├─ Correlation Matrix (client-side math)  │  │
│  │  ├─ Pair Trading Scanner                   │  │
│  │  ├─ Options Intelligence                   │  │
│  │  ├─ Futures & Leverage                     │  │
│  │  ├─ Opportunity Scanner                    │  │
│  │  └─ Strategy Simulation                    │  │
│  └────────────────────────────────────────────┘  │
│                    ▼                             │
│  Edge Function: derivatives-intelligence         │
│  (AI-powered: correlation, options, futures,     │
│   pair trades, hedges, simulations)              │
└─────────────────────────────────────────────────┘
```

## Files to Create/Edit

### 1. New Edge Function: `supabase/functions/derivatives-intelligence/index.ts`

Single AI edge function that accepts portfolio data and returns structured JSON covering all 9 modules:

- **Correlation engine**: Top positive/inverse correlations, divergence signals, stability scores
- **Pair trades**: Z-scores, spread analysis, reversion probabilities, long/short recommendations
- **Options intelligence**: IV rank/percentile, skew, gamma exposure, overpriced/underpriced signals
- **Futures module**: Basis vs spot, cost of carry, capital efficiency comparisons
- **Portfolio neutrality**: Beta/sector/factor exposure with hedge suggestions
- **Opportunity scanner**: Ranked opportunities by probability, risk-adjusted return, capital efficiency
- **Strategy simulation**: Expected P&L ranges, win probability, Sharpe estimates per strategy

Uses existing `callAI` + `safeParseJSON` + `requireAuth` shared utilities. Tool-call format for structured output.

### 2. New Component: `src/components/sandbox/DerivativesEngine.tsx`

Main component with **7 sub-tabs**:


| Sub-tab            | Content                                                   | Data Source                      |
| ------------------ | --------------------------------------------------------- | -------------------------------- |
| Correlation Matrix | Heatmap + divergence alerts                               | Client-side math + AI enrichment |
| Pair Trades        | Top pairs with Z-score charts, spread distribution        | AI                               |
| Options Intel      | IV rank bars, skew visualization, gamma exposure gauge    | AI                               |
| Futures & Leverage | Basis charts, margin efficiency comparisons               | AI                               |
| Neutrality         | Beta/sector exposure bars with hedge suggestions          | AI + client math                 |
| Scanner            | Ranked opportunity cards with confidence/category filters | AI                               |
| Simulation         | Per-strategy P&L range charts, win probability gauges     | AI                               |


**Visualizations** (all Recharts):

- Correlation heatmap via colored grid cells
- Z-score line charts for pair spreads
- IV rank horizontal bars
- Opportunity cards with confidence badges
- Simulated P&L range area charts

### 3. New Hook: `src/hooks/useDerivativesIntelligence.ts`

Wraps the edge function call with the existing `governedInvoke` pattern. Tier: `"slow"` (60s cache). Passes portfolio tickers, weights, prices, volatilities, and base currency.

### 4. Edit: `src/components/sandbox/EntropySandbox.tsx`

- Add `"derivatives"` to the `sections` array with icon `BarChart3` and label "Derivatives"
- Import and render `DerivativesEngine` in the switch statement

### 5. Edit: `supabase/config.toml`

Add `[functions.derivatives-intelligence]` with `verify_jwt = false`.

### 6. Client-Side Correlation Math

Inside `DerivativesEngine.tsx`, compute rolling correlations from portfolio price data (using log returns + Pearson correlation). This provides instant results while the AI enriches with deeper signals.

7.leverage maths from stats arb.

## AI Prompt Design

The edge function prompt instructs the AI to return a single JSON object with sections:

```json
{
  "correlations": { "pairs": [...], "divergences": [...] },
  "pair_trades": [{ "long": "X", "short": "Y", "z_score": ..., "reversion_prob": ..., "win_rate": ... }],
  "options_intel": [{ "ticker": ..., "iv_rank": ..., "iv_percentile": ..., "skew": ..., "gamma_exposure": ..., "signal": ... }],
  "futures": [{ "ticker": ..., "basis_pct": ..., "leverage_ratio": ..., "cost_of_carry": ..., "recommendation": ... }],
  "neutrality": { "beta_exposure": ..., "sector_tilts": [...], "hedge_suggestions": [...] },
  "opportunities": [{ "type": ..., "confidence": ..., "risk_reward": ..., "capital_efficiency": ..., "reasoning": ... }],
  "simulations": [{ "strategy_name": ..., "expected_return_range": [...], "win_probability": ..., "sharpe": ..., "max_dd": ... }]
}
```

Temperature: 0.5. MaxTokens: 5000. Random seed injected for variety.

## Summary of Deliverables


| #   | Deliverable                                            | Type                       |
| --- | ------------------------------------------------------ | -------------------------- |
| 1   | `supabase/functions/derivatives-intelligence/index.ts` | New file                   |
| 2   | `src/components/sandbox/DerivativesEngine.tsx`         | New file                   |
| 3   | `src/hooks/useDerivativesIntelligence.ts`              | New file                   |
| 4   | `src/components/sandbox/EntropySandbox.tsx`            | Edit — add tab             |
| 5   | `supabase/config.toml`                                 | Edit — add function config |
