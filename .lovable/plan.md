# Fix: Dossier Reliability, Region-Aware Markets, Richer Stat Arb

## Three Problems Identified

### 1. Corporate Dossier — Slow & Unreliable

**Root cause**: The edge function makes a synchronous 8K-token AI call that often times out. The `governedInvoke` uses "slow" tier (60s cache) so even with 24h localStorage, the governor's in-memory cache expires quickly and triggers new API calls on every page navigation.

**Fix**:

- `**src/hooks/useCompanyIntelligence.ts**`: Switch from `governedInvoke` to a direct `supabase.functions.invoke()` call with a longer timeout, bypassing the governor's 60s TTL entirely (localStorage 24h cache is the real cache layer here). Add a 90-second AbortController timeout.
- `supabase/functions/company-intelligence/index.ts`: use only Mistral ai
- `**src/lib/apiGovernor.ts**`: Remove `company-intelligence` from the governor tier map entirely — it should not be governed since it has its own 24h cache.

### 2. Region Setting Not Working for News/Sentiment

**Root cause**: `MarketOverview` passes `region` as a prop to `LiveNewsFeed`, but the `governedInvoke("fetch-news", ...)` call uses `body: { region }` — however the governor's `cacheKey` function creates a key based on the body, so changing region should produce a different cache key. The real issue is that `fetchNews` in `LiveNewsFeed` is called in a `useEffect` that depends on `[ticker, region]`, but the initial effect fires with `region="All"` and subsequent region changes DO trigger re-fetches. Let me verify the actual fetch-news edge function handles the region param...

Looking at the fetch-news function (line 46 of LiveNewsFeed): `body: { ticker: ticker || "", category: "business", region: region || "All" }` — this is correct. The edge function uses a region keyword mapper. The issue is likely that the `governedInvoke` cache key includes the full body, so each region gets its own cache — this should work.

**Actual issue found**: The `MarketOverview` component passes `region` to `LiveNewsFeed` (line 307), but `region` is typed as `Region` (which includes "All", "US", "Europe", "Asia", "India"). The sectors shown (S&P 500 sectors via XLK, XLF, etc.) and macro AI prompt don't change with region — they always show US-centric data. The market-data edge function fetches ALL indices regardless of region; filtering happens client-side (line 107). This is actually correct — indices filter works. **The real problem**: news likely returns mostly US news because RSS sources are all Western outlets. The region keyword injection in `fetch-news` may not be working properly.

**Fix**:

- `**src/components/MarketOverview.tsx**`: Pass `region` to the `fetchMarketData` call so the AI macro summary is region-contextual. Also pass region to `governedInvoke("market-data", { body: { region } })`.
- `**supabase/functions/market-data/index.ts**`: Accept `region` param and make the AI macro prompt region-aware (e.g., for India, focus on NIFTY, SENSEX, RBI policy rather than S&P 500).
- `**src/components/SentimentDashboard.tsx**`: If it exists and doesn't accept region, wire it up too.

### 3. Stat Arb Monte Carlo — Needs More Paths & Richness

**Root cause**: Monte Carlo panel only shows 30 visible paths in 3D and 5 metric cards. No percentile band chart, no final distribution histogram, no per-asset breakdown.

**Fix — `src/components/sandbox/StatArbEngine.tsx` (MonteCarloPanel)**:

- Increase visible paths from 30 → 60 for denser 3D visualization
- Add a **2D Percentile Fan Chart** using `mc.percentileBands` (5th/25th/50th/75th/95th) — an AreaChart showing confidence bands over time
- Add a **Final Value Distribution Histogram** — bucket `mc.finalValues` into ~30 bins and render as BarChart
- Add a **Max Drawdown Distribution** chart
- Add more metric cards: Sharpe ratio, probability of profit, median final value, skewness
- Add per-asset contribution breakdown table showing each asset's contribution to portfolio VaR

**Also enrich other Stat Arb panels**:

- **Portfolio Risk**: Add correlation heatmap visualization (currently just computes `corr` but doesn't render it visually)
- **Stress Test**: Add per-asset impact breakdown table (data exists at `r.assetImpacts` but isn't rendered)

## Files to Edit


| File                                               | Change                                                                                                       |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| `src/hooks/useCompanyIntelligence.ts`              | Direct supabase invoke with AbortController, bypass governor                                                 |
| `supabase/functions/company-intelligence/index.ts` | Stay on mistral AI for speed/reliability, tighten prompt                                                     |
| `src/lib/apiGovernor.ts`                           | Remove company-intelligence from tier map                                                                    |
| `src/components/MarketOverview.tsx`                | Pass region to market-data API call                                                                          |
| `supabase/functions/market-data/index.ts`          | Accept region, make AI macro prompt region-contextual                                                        |
| `src/components/sandbox/StatArbEngine.tsx`         | Richer Monte Carlo (fan chart, histogram, more paths, more metrics), correlation heatmap, stress test detail |


## Technical Details

**Dossier —**  The company-intelligence edge function uses `callAI()` which routes to Mistral ai

**Monte Carlo enrichments**: All computed client-side from existing `SA.runMonteCarlo` output — no new API calls needed. The `mc.percentileBands` and `mc.finalValues` arrays are already computed but not [visualized.](http://visualized.al)

All stat arb systems also enhanced and new statistics tools implement and a foresight tool in stat arb that uses all stat arb tools to give a unified foresight mathematical truth.

**Region-aware macro**: The AI macro prompt will be parameterized by region, e.g., for "India" it will emphasize NIFTY/SENSEX/RBI/INR rather than S&P/Fed/USD.