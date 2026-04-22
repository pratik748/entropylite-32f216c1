

## Intraday Mode → System-Wide Overhaul

Toggling **Intraday Mode** will no longer swap the dashboard for a separate validator surface. Instead, it re-tunes every intelligence module across the entire app for same-session profit, and the **Lodger Ledger** is detached into its own dedicated home.

### What the user will see when Intraday Mode is ON

- **Dashboard, Desirable, Markets, News, Sandbox, Risk** — same surfaces, same layouts, but every module re-skews to short-horizon profit:
  - **Desirable Assets** — only intraday-tradable picks: high ADV, tight spreads, today's catalyst, time-horizon collapsed to `minutes–hours`, `targetPrice` and `stopLoss` recomputed for ≤1-day moves, hedge overlays disabled.
  - **Live News Feed & News Impact** — only stories with **immediate price-move potential** (last 6h, tier-1 sources, earnings/halts/upgrades/macro shocks). Sentiment scoring biases for *trade-now* not *long thesis*.
  - **Stock Analysis (`analyze-stock`)** — recommendation framing flips from "thesis + holding" to "intraday entry/exit window, expected hold, drawdown tolerance." Confidence is keyed off momentum + flow, not fundamentals.
  - **Markets** — auto-narrows to today's leaders/laggards, pre-market gappers, unusual-volume movers.
  - **Risk Dashboard** — VaR/CVaR collapse to single-session horizon; daily loss budget surfaces inline.
  - **Sell Notifications** — fire on intraday targets, not multi-day.
- **Lodger Ledger** — removed from the validator pane and **promoted to its own top-level slot**: lives as a sticky bottom drawer on the dashboard (collapsible) and as a full panel inside the **Risk** tab → "Deep Trade Ledger" sub-tab. Persists regardless of mode so historical lessons remain visible.
- The Pre-Trade Validator, Active Lodge, Edge Graph, Daily Target Band, and Discipline Governor UI **are removed**. Their math (Lodgers state, rolling Sharpe, equity curve, edge decay) keeps running silently in the background and feeds biases into the standard dashboard modules.
- A minimal `INTRADAY MODE` chip stays in the header banner so the user always knows the system is in short-session tuning.

### How it works (technical)

**Single source of truth — `useIntradayMode`**
Already global. We pipe it the same way `indiaMode` is piped: through `apiGovernor.governedInvoke`, which auto-injects `intradayMode: true` into every edge-function body. Every module then branches on that flag.

**Edge functions updated**
- `desirable-assets` — when `intradayMode`, prompt swaps to *"intraday-only candidates: high ADV (>$50M / >₹500cr daily turnover), tight spread, present-day catalyst, time horizon ≤6h"*. `timeHorizon` defaults to `intraday`. `entryZone` / `targetPrice` / `stopLoss` computed on 1-day σ instead of 30-day. Hedge overlays disabled. Deterministic backstop universe swapped to a curated intraday liquid list (SPY/QQQ/NVDA/TSLA/RELIANCE.NS/HDFCBANK.NS/etc.).
- `analyze-stock` — system prompt adds an intraday block: "Frame as intraday opportunity. Provide entry window (HH:MM–HH:MM local), expected hold (minutes), invalidation level, and one immediate catalyst. Do NOT discuss multi-quarter fundamentals." Suggestion vocabulary stays observational.
- `fetch-news` — when `intradayMode`, filters articles to last 6h, drops opinion/analyst-only sources, prioritises earnings/halts/upgrades/macro. Adds `tradeRelevance: "high|med|low"` so the UI can rank.
- `sentiment-intel` — weights recency (decay τ = 90min) over volume.
- `market-data` — surfaces `topGainers`, `topLosers`, `unusualVolume`, `gapMovers` arrays in addition to indices.
- `risk-intelligence` — switches VaR horizon to 1 session.
- All four are no-op-safe when `intradayMode` is absent (back-compat).

**Client wiring**
- `apiGovernor.ts` — already injects `indiaMode`; add the same line for `intradayMode` from `localStorage.getItem("entropy-intraday-mode")`.
- `DesirableAssets.tsx` — read `intradayMode`, pass `intradayMode` in the request body, change column labels (`Hold` instead of `Horizon`, show entry window, suppress hedge column).
- `LiveNewsFeed.tsx`, `NewsImpactTable.tsx` — read `intradayMode`, render only `tradeRelevance ≠ low`, sort by `pubDate` desc, add a small `⚡ INTRADAY FILTER ACTIVE` row.
- `StockSummary.tsx` / `Recommendation.tsx` — when `intradayMode`, render Entry Window / Expected Hold / Invalidation block instead of long-horizon thesis paragraph.
- `MarketOverview.tsx` — when `intradayMode`, show a "Today's Movers" strip (gappers, unusual volume) above indices.
- `RiskDashboard.tsx` — show `1-Session VaR` and `Daily Loss Budget` strip on top.
- `useSellNotifications.ts` — switch threshold to intraday targets when mode is on.

**Dashboard restructure**
- `src/pages/Index.tsx` — drop the `intradayMode ? <IntradayDashboard/> : <NormalDashboard/>` swap. Render the standard dashboard always; pass `intradayMode` down so each module re-skews itself.
- Add a collapsible **`<LodgerLedgerDock />`** fixed to the bottom of the dashboard (height ~32px collapsed, ~280px expanded) showing the most recent 5 distilled lessons + Sharpe₃₀ chip. Visible at all times so the trader sees prior-trade memory while looking at live data.
- Add **`<DeepTradeLedger />`** panel inside the **Risk** tab as a new sub-tab "Trade Ledger" — full `LodgerLedger` + `EdgeGraph` (histogram, decay, equity curve). This is where the heavy ledger surface lives.

**Files to remove from the dashboard surface (kept on disk for the Risk-tab home)**
- `src/components/intraday/IntradayDashboard.tsx` — deleted.
- `src/components/intraday/PreTradeValidator.tsx` — deleted.
- `src/components/intraday/ActiveLodge.tsx` — deleted.
- `src/hooks/useIntradayValidator.ts` — deleted.

**Files to add**
- `src/components/intraday/LodgerLedgerDock.tsx` — sticky bottom dock for the dashboard.
- `src/components/intraday/DeepTradeLedger.tsx` — full ledger surface for the Risk tab.

**Files to keep**
- `src/hooks/useLodgers.ts`, `src/lib/lodgers-math.ts`, `supabase/functions/lodger-distill/index.ts`, `lodger_trades` table, `EdgeGraph.tsx`, `LodgerLedger.tsx` — the ledger system stays exactly as it is, just relocated.

### Data flow

```text
User toggles INTRADAY MODE
        │
        ├─► localStorage["entropy-intraday-mode"] = true
        │
        ├─► apiGovernor injects intradayMode:true into EVERY edge call
        │
        ├─► desirable-assets   → intraday-only universe + ≤6h horizon
        ├─► fetch-news         → last 6h, trade-relevance ranking
        ├─► analyze-stock      → entry window + invalidation framing
        ├─► sentiment-intel    → recency-weighted scoring
        ├─► market-data        → gappers / unusual volume
        └─► risk-intelligence  → 1-session VaR + daily loss budget

Standard dashboard re-renders with the same components,
now showing intraday-tuned data everywhere.

LodgerLedgerDock (bottom) ─► live distilled lessons from prior trades
DeepTradeLedger (Risk tab) ─► full ledger + edge graph
```

### Guardrails
- All "intraday" framing stays observational ("entry window forming", "invalidation level"), never directive ("buy now").
- Toggling OFF restores every module to its long-horizon defaults instantly (no cache poisoning — `flushAllCaches()` already runs on toggle).
- Lodger Ledger is mode-agnostic: it persists and renders in both modes, since past lessons are useful regardless.
- News intraday filter falls back to "show all" if fewer than 5 trade-relevant articles exist, so the panel never goes empty.

### Out of scope this iteration
- Live broker routing for intraday orders (still manual / paper).
- Options-chain intraday flow overlay (next pass).

