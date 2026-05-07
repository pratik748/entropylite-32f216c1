## Problem

Today, `useSellNotifications` only fires toasts ("🚨 Profit Erased") after gains have already evaporated. It never records that you *would have* sold at the peak, so you only see the bad outcome — not the profit your system actually identified.

The app should:

1. Detect the optimal exit moment using advanced computation (not just peak tracking).
2. Auto-record a "locked profit" event the instant the exit signal fires (a virtual sell).
3. Show you the realized P&L you captured, even if the live price keeps falling.

## Solution: Auto-Lock Profit Engine

A new layer that converts sell signals into recorded virtual exits and surfaces realized gains.

### 1. Exit-signal computation (advanced, not heuristic)

New file `src/lib/exit-signal-engine.ts` consuming the existing `useQuantSnapshot` (real σ, μ, drawdown, Sharpe, Merton DD) plus per-asset peak tracking. Triggers a virtual exit when ANY of:

- **Trailing-stop breach (Chandelier exit):** price drops below `peak − k·ATR`, where ATR is computed from 1y daily bars (k=2.5, tightens to 1.5 once profit > 1σ_annual).
- **Drawdown-from-peak threshold:** `(peak − price)/peak ≥ max(0.5·σ_daily·√5, 1.5%)` — adapts to the asset's own volatility.
- **Momentum reversal:** 5-day log-return slope flips negative AND z-score of today's return < −1.0.
- **Risk regime shift:** Merton PD jumps > 25% intraday, or `riskScore ≥ 75` while in profit.
- **AI sell suggestion** from existing analysis (already detected, now triggers a lock instead of a toast).

The first trigger wins; we record the exit price = current price at that tick.

### 2. Virtual sell ledger (locked profits)

New table `locked_exits` (Lovable Cloud) with RLS scoped to `auth.uid()`:

```text
id uuid pk
user_id uuid
ticker text
buy_price numeric
exit_price numeric
quantity numeric
pnl_abs numeric
pnl_pct numeric
peak_price numeric
trigger_reason text   -- 'chandelier' | 'drawdown' | 'momentum' | 'risk' | 'ai'
locked_at timestamptz
currency text
```

When a trigger fires:

- Insert a row.
- Mark the position in local state as "locked" so we don't re-fire.
- Show a positive toast: `🔒 AAPL — Profit locked at +4.2% ($312). Trigger: trailing-stop. Live price may diverge; your captured gain is recorded.`

### 3. UI surfaces

- **PortfolioBlotter:** new column `LOCKED` showing 🔒 + locked P&L for positions that hit an exit. Live PNL stays visible but greyed out, so you can see "what you saved."
- **New panel `LockedProfitsPanel**` (collapsible under blotter or as a tab): list of locked exits, total realized P&L in base currency, win-rate, average trigger reason. Sortable, exportable.
- **Header KPI:** "Realized (locked): +$X" next to the existing live P&L sparkline.

### 4. Replace bad alert behavior

In `useSellNotifications`:

- Remove the "🚨 Profit Erased" toast (it's the symptom we're fixing).
- Replace "Near max profit / max profit zone" toasts with calls into the exit-signal engine so they actually lock instead of just warning.
- Keep risk-critical and AI-sell toasts but route them through the lock engine first.

### 5. Settings

Small settings popover (gear in blotter header):

- Auto-lock: ON / OFF (default ON)
- Aggressiveness: Conservative (k=3 ATR) / Balanced (2.5) / Aggressive (1.5)
- Min profit before any lock can fire: default 0.5%

Stored in `localStorage` under `entropy_autolock_config`.

## Files

**New**

- `src/lib/exit-signal-engine.ts` — pure math, takes AssetStats + price history + peak → trigger or null
- `src/hooks/useAutoLockProfits.ts` — wires quant snapshot + portfolio + writes to `locked_exits`
- `src/components/LockedProfitsPanel.tsx`
- `supabase/migrations/<ts>_locked_exits.sql` — table + RLS

**Edited**

- `src/hooks/useSellNotifications.ts` — remove "profit erased", route through lock engine
- `src/components/terminal/PortfolioBlotter.tsx` — LOCKED column + grey-out locked rows
- `src/components/charts/PortfolioSparkline.tsx` — add realized line
- `src/pages/Index.tsx` — mount `useAutoLockProfits`, render `LockedProfitsPanel`

## Notes

- This is a *virtual* sell — we don't touch any broker. The user keeps holding the asset; we just record the moment your system decided "exit now" so you can see the profit it captured vs. what holding cost you.
- All math uses real 1y history via the existing quant engine — no random walks or fake sine waves.
- 60s grace period on new positions stays, so freshly added stocks don't auto-lock immediately.
- The engine should send a notification when you open the app that you earned thiss instead of you lose this