

# Bloomberg Terminal Transformation — Keep Top Nav, Upgrade Everything Below

## Constraint
Keep the existing Header + tab bar (Dashboard, Markets, Geopolitics, Desirable, Sandbox, Stat Arb, Augment, Risk) exactly as-is. Transform the **content area below** into a Bloomberg-style dense intelligence terminal.

## What Changes

### 1. Global Ticker Strip (`src/components/terminal/TickerStrip.tsx`)
- Continuous scrolling horizontal strip inserted **between the tab bar and main content**
- 15+ global assets: S&P 500, NASDAQ, Dow, Nikkei, Euro Stoxx, Gold, Oil, BTC, US10Y, DXY, etc.
- Each shows: name, price, % change (green/red), tiny SVG sparkline
- Data from `market-data` edge function, polled every 15s
- CSS marquee animation, pause on hover

### 2. System Status Bar (`src/components/terminal/SystemStatusBar.tsx`)
- Fixed bottom bar across all tabs
- Shows: data latency (ms), active simulations count, connection status, UTC clock, compute load indicator
- Monospace font, terminal aesthetic

### 3. Dashboard Tab Overhaul (`src/pages/Index.tsx` — dashboard section only)
Replace the current 2-column layout with a **dense multi-panel grid** using `react-resizable-panels`:

```text
┌────────────────┬──────────────────────┬─────────────┐
│ Portfolio       │  Analysis / Charts   │ Watchlist   │
│ Blotter         │  (Monte Carlo, etc.) │ + News      │
│ + Stock Input   │                      │ + Flows     │
│                 ├──────────────────────┤             │
│                 │  Risk / Simulation   │             │
└────────────────┴──────────────────────┴─────────────┘
```

### 4. Portfolio Blotter (`src/components/terminal/PortfolioBlotter.tsx`)
- Replaces PortfolioPanel in Dashboard with dense trading-blotter table
- Columns: Asset | Price | Chg% | Qty | Exposure | PnL | Vol | Risk%
- Green/red flash animations on price ticks
- Monospace, tight 24px rows, click to select

### 5. Flow Detection Panel (`src/components/terminal/FlowDetectionPanel.tsx`)
- Shown in right column of Dashboard
- Computed flow signals: ETF rebalancing, vol targeting, liquidity stress
- Heatmap cells with color intensity + impact probability bars

### 6. Panel Wrapper (`src/components/terminal/PanelWrapper.tsx`)
- Wraps each panel with terminal-style header (title, icon, expand-to-fullscreen button)
- Thin neon border on active/focused panel

### 7. CSS Updates (`src/index.css`)
- Add `.flash-green`, `.flash-red` keyframe animations for price ticks
- Add `.ticker-scroll` marquee animation
- Add `.terminal-row` utility for tight row spacing
- Tighter density variables

### 8. News Feed Update (`src/components/LiveNewsFeed.tsx`)
- Compact single-line format: `timestamp | source | sentiment-dot | headline`
- Auto-scroll, pause on hover

## Files to Create
1. `src/components/terminal/TickerStrip.tsx`
2. `src/components/terminal/SystemStatusBar.tsx`
3. `src/components/terminal/PortfolioBlotter.tsx`
4. `src/components/terminal/FlowDetectionPanel.tsx`
5. `src/components/terminal/PanelWrapper.tsx`

## Files to Modify
1. `src/pages/Index.tsx` — add TickerStrip + SystemStatusBar globally, refactor Dashboard tab to use resizable panels with blotter
2. `src/index.css` — add terminal animation utilities
3. `src/components/LiveNewsFeed.tsx` — compact terminal mode

## What Stays the Same
- Header component (logo, market dots, clock)
- Tab navigation bar (all 8 tabs)
- All non-dashboard tabs render their existing components unchanged
- All existing edge functions and data flow

