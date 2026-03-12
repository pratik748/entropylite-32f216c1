

# Augment Layer: Fix Broken Charts + Add Institutional Visualizations

## Problem
1. **Charts using `hsl(var(--border))` in SVG attributes may not render** — Recharts passes these as SVG presentation attributes where CSS custom properties can fail. PortfolioConstruction, RiskModeling use this pattern. BenchmarkModule and StressTestModule use hardcoded HSL values and work fine.
2. **11 of 15 modules have zero charts** — they are tables-only. ESG, MultiAsset, Compliance, Valuation, Hedging, Exposure, ClientReporting, OrderManagement, TradeLifecycle, DataAggregation, Workflow all lack Recharts visualizations.

## Fix Strategy

### A. Fix chart rendering across all modules
Replace all `hsl(var(--...))` inside Recharts props with resolved hardcoded dark-theme HSL values matching the institutional palette:
- Border/grid: `hsl(220, 12%, 13%)`  
- Muted foreground: `hsl(210, 8%, 45%)`
- Foreground: `hsl(0, 0%, 95%)`

Affected: **PortfolioConstructionModule**, **RiskModelingModule**

### B. Add institutional charts to every table-only module

Each module gets 1–3 Recharts visualizations driven by real portfolio data:

| Module | Charts to Add |
|--------|--------------|
| **ESGModule** | Radar chart (E/S/G breakdown per stock), stacked bar (portfolio E vs S vs G) |
| **MultiAssetModule** | Treemap-style horizontal bar (asset class weights), area chart (cumulative P&L by class) |
| **ComplianceModule** | Radial bar / gauge (compliance score), bar chart (rule pass/warn/fail counts) |
| **ValuationModule** | Grouped bar (fair value vs current price per stock), area chart (cash flow forecast) |
| **HedgingModule** | Bar chart (hedge notional by instrument), grouped bar (pre vs post Greeks) |
| **ExposureDashboardModule** | PieChart (sector weights), heatmap-style bar chart (risk factors), treemap bar |
| **ClientReportingModule** | Pie (allocation), bar chart (per-stock returns), area (cumulative return) |
| **OrderManagementModule** | Bar chart (order value by ticker), pie (side distribution BUY/SELL/HOLD) |
| **DataAggregationModule** | Bar chart (records per source), horizontal bar (latency comparison) |
| **WorkflowModule** | Progress/funnel bar chart (stage completion %), pie (action distribution) |
| **TradeLifecycleModule** | Horizontal stacked bar (lifecycle stage per trade) |

## Files to Edit (13 files)

1. `src/components/augment/PortfolioConstructionModule.tsx` — fix `hsl(var(--...))` → hardcoded values
2. `src/components/augment/RiskModelingModule.tsx` — same fix
3. `src/components/augment/ESGModule.tsx` — add Radar + BarChart
4. `src/components/augment/MultiAssetModule.tsx` — add BarChart + AreaChart
5. `src/components/augment/ComplianceModule.tsx` — add RadialBar + BarChart
6. `src/components/augment/ValuationModule.tsx` — add grouped BarChart + AreaChart
7. `src/components/augment/HedgingModule.tsx` — add BarChart for notionals + Greeks comparison
8. `src/components/augment/ExposureDashboardModule.tsx` — add PieChart + BarChart
9. `src/components/augment/ClientReportingModule.tsx` — add PieChart + BarChart
10. `src/components/augment/OrderManagementModule.tsx` — add BarChart + PieChart
11. `src/components/augment/DataAggregationModule.tsx` — add BarChart
12. `src/components/augment/WorkflowModule.tsx` — add BarChart
13. `src/components/augment/TradeLifecycleModule.tsx` — add stacked BarChart

All charts will use real portfolio data from `useNormalizedPortfolio`, the institutional dark palette with hardcoded HSL colors, and the existing Recharts library.

