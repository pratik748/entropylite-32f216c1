# Desk Book Mode — full-portfolio synthesis

## The one valuation (why tabs used to disagree on book value)

Three separate defects let one surface say 5.3M while another said 3M for
the same book, all fixed at the spine:

1. **Dropped positions** — modules valued only positions whose analysis
   had completed. `useNormalizedPortfolio` now values EVERY position;
   ones awaiting analysis are priced at cost basis and flagged
   (`priceBasis: "cost"`), never silently excluded.
2. **Silent 1:1 FX** — `useFX.getRate` treated any missing rate as 1.0,
   so an INR position without a live rate was worth 83× its true USD
   value on some tabs. A full static fallback table now backs every
   supported currency, and `rateIsLive` discloses fallback conversions.
3. **Divergent currency resolution** — the blotter assumed
   `analysis.currency || "USD"`, the allocation chart used suffix
   inference only, the normalized hook used both. Everything now resolves
   through `resolveAssetCurrency` inside the one hook.

Consumers of the spine after this change: blotter, allocation chart, P&L
waterfall, Desk Book mode, all Augment modules, the Risk tab, and the
Opportunity Engine portfolio context in `Index.tsx`. None of them computes
value independently anymore.

## Factor decomposition (the regression layer)

`src/lib/quant/factor-model.ts` fits a multi-factor time-series model:
ridge-stabilized OLS of each asset's daily returns on ETF/index factor
proxies (S&P 500, NIFTY 50 for INR books, TLT rates, HYG credit, UUP
dollar, GLD gold, USO oil) fetched through the same governed
historical-prices pipeline as every asset series. Outputs: per-asset betas
with R² and idiosyncratic vol; portfolio factor exposures Σwᵢβᵢ;
systematic vs idiosyncratic variance split (eᵀΣ_f e vs Σwᵢ²σ²(εᵢ));
Euler factor contributions (sum to 1 by construction); −2σ single-factor
partial shocks; and a 60d rolling market beta vs full-sample beta for
regime-shift detection. Every simplification (proxy factors, uncorrelated
residuals, first-order shocks) is printed in the UI, not hidden.

## Liquidity & capacity (what big books actually need)

`src/lib/quant/liquidity.ts` uses real 20-day median volumes: per-position
days-to-exit at a 20% participation cap, book share exitable within
1/5/20 trading days, and the positions that are capacity risks (> 5 days).
It is a participation constraint, not an impact model, and says so.

The Desk's center pane now has two views: **Instrument** (the existing
single-position pass) and **Book** (a whole-portfolio pass). Book view is
the default when no instrument is focused and the book holds ≥ 2 analyzed
positions. Selecting any position — in the blotter, a directive row, or via
Foresight — returns to Instrument view.

## One spine, no new engines

Book mode computes nothing novel. It composes the platform's existing truth
spine, so it can never disagree with the tabs it summarizes:

| Quantity | Source | Also shown in |
|---|---|---|
| Σ, VaR, CVaR, σ, Sharpe, correlation | `useQuantSnapshot` (1y daily history) | Risk tab |
| Performance / risk / exposure / attribution / optimizers / stress / insights | `useInstitutionalAnalytics` → `src/lib/analytics` | Augment modules |
| Optimizer target (HRP default) | same `recommended` selection as Augment · Portfolio Construction | Augment |
| Portfolio Health | `healthInputFromSnapshot` + `computePortfolioHealth` — the *same helper call* as the Daily Briefing | SCR-01 briefing |
| Desk verdicts (Add / Hold / Exit + confidence) | `analyze-stock` payload per position | Blotter, Desk, Workstation |
| News pressure | analysis-layer news scores (`totalPressure`, per-headline impacts) | News Impact table |

## Directives (what to add, what to trim)

`src/lib/desk-book.ts` merges three independent signal families per
position — optimizer weight drift (quant), desk verdict (thesis), news
pressure (narrative) — under deterministic, disclosed rules:

- **Conflicts are surfaced, never averaged**: any add-side signal together
  with any trim-side signal produces `REVIEW`, naming both sides.
- **News never trades alone**: the platform's own disclaimer says news
  scores are not price predictions, so a lone news signal only watches.
- **Sizing is honest**: moves toward an optimizer target are sized in base
  currency and whole units; thesis-driven moves without a target say
  "size manually" instead of inventing a number.
- Thresholds are constants in the module (`DRIFT_MATERIAL_PP = 2`,
  `NEWS_PRESSURE_BAR = 2`) and printed in the UI methodology footer.

Rules and edge cases are locked by `src/lib/desk-book.test.ts` and the
component smoke test `src/components/DeskPortfolioMode.test.tsx` (which
proves the surface stays honest with zero network: unmeasured quantities
render "—", the optimizer is disclosed as unavailable, verdict-driven
directives still work).

## Coherence repairs shipped with this feature ("repair before repartition")

1. **Risk:reward canon** — `src/lib/riskReward.ts`. The same trade used to
   render as "1:2.5" (Discover, Strategy Lab), "2.5:1" (Direct Profit,
   Workstation) and "2.5x" (Derivatives). Canonical quantity is the
   R-multiple (reward per unit risk); canonical display is `2.5:1`,
   matching the evidence engine's node and its 1.5:1 entry bar
   (`RR_ENTRY_BAR`, now shared). All display sites parse-then-format
   through this module; upstream strings are normalized, never trusted for
   orientation.
2. **Stat-arb mislabel** — `optimalHorizon().riskRewardRatio` is
   E[return]/σ over the horizon, not a stop/target R-multiple. It is now
   labeled `E[r]/σ` instead of "R:R".
3. **Crown Layer de-fabrication** — the client-side fallback invented
   expected edge, confidence and R:R from beta arithmetic. It now states
   observed facts only (risk score, β, realized P&L) and is badged
   "local screen · no edge estimates"; AI-estimated fields render only
   when the server pass provides them.
4. **Risk tab FX** — the Risk dashboard summed native-currency position
   values (mixing INR and USD) and hardcoded `$`. It now uses the
   FX-normalized book (`useNormalizedPortfolio`) and base-currency
   formatting everywhere, so its totals agree with the blotter.
5. **Portfolio Health single-source** — `healthInputFromSnapshot` is the
   one sanctioned snapshot→health mapping; the Daily Briefing and Book
   mode both call it, so the same book can never score differently on
   different screens.
