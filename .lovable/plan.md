

# Real-Time Intelligence Refresh System

## What We're Building

A centralized refresh orchestrator that forces full live recomputation on page load, reload, and tab refocus — making Entropy behave like a live intelligence terminal, never showing stale analytical data.

## Architecture

### 1. Create `useIntelligenceRefresh` Hook
**New file: `src/hooks/useIntelligenceRefresh.ts`**

Central orchestrator that:
- Listens for `visibilitychange` (tab refocus) and `focus` events
- On trigger: flushes the API Governor cache, then emits a refresh signal
- Exposes `refreshKey` (incrementing counter) and `isRefreshing` state
- Shows a brief "Updating Intelligence…" toast/overlay during refresh
- Debounces refocus events (ignore if last refresh was < 10s ago)

### 2. Modify API Governor — Add `flushAllCaches()`
**File: `src/lib/apiGovernor.ts`**
- Add `flushAllCaches()` that clears the entire `cache` Map and resets AI cooldown timer
- Add `flushAnalyticalCaches()` that clears everything except `price-feed` (raw data can keep its 15s TTL)
- Keep inflight dedup intact (don't cancel running requests)

### 3. Wire Refresh Signal into Index.tsx
**File: `src/pages/Index.tsx`**
- Import `useIntelligenceRefresh` 
- On refresh trigger: call `flushAllCaches()`, then force-refresh prices, re-trigger geo intelligence, and increment a `refreshKey` passed down to child components
- Show a slim "Updating Intelligence…" banner at top during refresh cycle
- Pass `refreshKey` as a prop/key to `MarketOverview`, `GeopoliticalGlobe`, `DesirableAssets`, `RiskDashboard`, `EntropySandbox`

### 4. Update Data-Fetching Components to React to Refresh
Each component already fetches on mount via `useEffect([], [])`. By passing `refreshKey` as a dependency or using it as a React `key`, they'll re-mount and re-fetch:

- **MarketOverview**: Add `refreshKey` to `useEffect` deps → calls `fetchMarketData(true, true)` with `force: true`
- **GeopoliticalGlobe / useGeoIntelligence**: Accept optional `refreshKey`, add to poll effect deps so it re-fetches immediately
- **useMarketRegime**: Same pattern — refresh on key change
- **DesirableAssets**: Re-fetch on refreshKey change
- **RiskDashboard**: Re-fetch on refreshKey change
- **EntropySandbox children** (StrategyLab, MonteCarloEngine, etc.): These depend on `stocks` prop which gets updated prices, so they auto-recompute

### 5. Reduce Analytical Cache TTLs
**File: `src/lib/apiGovernor.ts`**
- Change `slow` tier from 600s (10 min) to 120s (2 min) for news/geo/desirable
- Change `ai` cooldown from 60s to 30s
- Keep `realtime` at 15s (prices)

### 6. "Updating Intelligence…" UI
**File: `src/pages/Index.tsx`**
- Render a slim animated bar below the tab navigation when `isRefreshing` is true
- Auto-dismiss after all parallel fetches complete (Promise.all)
- Use existing glass-panel styling with a pulse animation

## Refresh Trigger Flow

```text
Page Load / Reload / Tab Focus
        │
        ▼
 useIntelligenceRefresh detects event
        │
        ▼
 flushAllCaches() on apiGovernor
        │
        ▼
 refreshKey++ → isRefreshing = true
        │
        ▼
 All modules re-fetch in parallel (force: true)
  ├── market-data
  ├── price-feed
  ├── geopolitical-data
  ├── fetch-news
  ├── desirable-assets
  └── (risk/strategy recompute from fresh data)
        │
        ▼
 isRefreshing = false → UI banner dismissed
```

## Files Changed
1. **New**: `src/hooks/useIntelligenceRefresh.ts` — orchestrator hook
2. **Edit**: `src/lib/apiGovernor.ts` — add `flushAllCaches()`, reduce TTLs
3. **Edit**: `src/pages/Index.tsx` — wire refresh, show updating banner, pass refreshKey
4. **Edit**: `src/components/MarketOverview.tsx` — accept refreshKey prop
5. **Edit**: `src/hooks/useGeoIntelligence.ts` — accept refreshKey param
6. **Edit**: `src/hooks/useMarketRegime.ts` — accept refreshKey param
7. **Edit**: `src/components/DesirableAssets.tsx` — accept refreshKey prop
8. **Edit**: `src/components/RiskDashboard.tsx` — accept refreshKey prop

