

# Three Fixes: God's Eye Discovery Count, Monte Carlo Labels, Live News Speed

## Problem 1: God's Eye Only Shows ~3 Discoveries

**Root cause**: The `discoveryCount` formula caps at `Math.min(n * 2, 10)` but starts at `Math.max(5, ...)`. For small portfolios (3-5 stocks), the AI often returns the bare minimum because the prompt says "at least 5" but doesn't push hard enough. Also, discovery mode lacks sentiment context — it only gets optional `news_context` and `macro_context` strings but those are never actually passed from the frontend.

**Fix**:
- **Edge function** (`supabase/functions/derivatives-intelligence/index.ts`):
  - Raise discovery minimum to `Math.max(10, Math.min(n * 3, 20))` — always generate at least 10 discoveries
  - Add a stronger prompt section demanding diversity: at least 2 each of `futures_etf_leverage`, `sector_pair`, `macro_hedge`, `relative_value`, `cross_asset`
  - Add `sentiment_context` field to prompt for real-time sentiment awareness — instruct AI to incorporate current market sentiment (risk-on/risk-off, fear/greed) into discovery reasoning
  - Increase `maxTokens` allocation for discoveries from +3000 to +5000

- **Hook** (`src/hooks/useDerivativesIntelligence.ts`):
  - Actually pass `newsContext` and `macroContext` when calling `analyze()` — currently the caller never supplies these
  - Accept sentiment data from the news feed and pass it as context

- **UI** (`src/components/sandbox/DerivativesEngine.tsx`):
  - Add a sentiment indicator strip at the top of Discoveries showing the injected market mood
  - Pass news headlines from LiveNewsFeed as context to the analyze call

## Problem 2: Monte Carlo Missing Timeframe & Variables

**Root cause**: The Monte Carlo panel in `StatArbEngine.tsx` renders `runMonteCarlo(totalValue, portfolioMu, portfolioVol, 252, 10000, 60, true)` but the UI shows no indication of:
- Simulation horizon (252 trading days = 1 year)
- Number of paths (10,000 simulated, 60 rendered)
- Input parameters (μ, σ, risk-free rate)
- Model used (GBM)

The 3D chart axes say "Trading Days (0-252)" as static text but the fan chart/histogram show no labels.

**Fix** (`src/components/sandbox/StatArbEngine.tsx` — `MonteCarloPanel`):
- Add a **parameters card** above the 3D chart showing: Model (GBM), Horizon (252 days / 1Y), Paths (10,000), Rendered (60), Drift (μ), Volatility (σ), Risk-Free Rate (4%)
- Add XAxis label "Trading Days" on the fan chart
- Add a horizon selector (30d / 90d / 180d / 252d) that changes the simulation timeframe
- Show the current μ and σ values derived from real data prominently

## Problem 3: Live News Slow and Skewed

**Root cause**: 
1. `NEWS_REFRESH_INTERVAL = 600_000` (10 minutes) — very slow refresh
2. RSS feeds are parsed but many feeds return stale content (1 headline/day)
3. Only fetching 6 RSS sources + GDELT + newsdata.io
4. GDELT `maxrecords=20` is low
5. No real-time streaming — pure polling

**Fix** (`supabase/functions/fetch-news/index.ts` + `src/components/LiveNewsFeed.tsx`):
- **Edge function**:
  - Add more RSS sources: Yahoo Finance RSS, Seeking Alpha, Barron's, WSJ Markets, FT Markets, Bloomberg (if available)
  - Increase GDELT `maxrecords` from 20 to 50
  - Add Google News RSS as a fallback: `https://news.google.com/rss/search?q=stock+market&hl=en-US`
  - Add Finviz RSS: `https://finviz.com/news_export.ashx?v=3` (if accessible)
  - Sort by pubDate (most recent first) before deduplication to ensure freshest articles surface
  - Return up to 40 articles instead of 25
- **Client**:
  - Reduce `NEWS_REFRESH_INTERVAL` from 600,000ms to 120,000ms (2 minutes)
  - Show "last updated X seconds ago" as a live counter
  - Add a manual refresh button that bypasses cache

## Deliverables

| # | File | Change |
|---|------|--------|
| 1 | `supabase/functions/derivatives-intelligence/index.ts` | Raise discovery minimum to 10-20, add sentiment context, stronger diversity requirements |
| 2 | `src/hooks/useDerivativesIntelligence.ts` | Pass news/macro/sentiment context to edge function |
| 3 | `src/components/sandbox/DerivativesEngine.tsx` | Add sentiment strip, pass context to analyze |
| 4 | `src/components/sandbox/StatArbEngine.tsx` | Add parameters card, horizon selector, proper axis labels to Monte Carlo |
| 5 | `supabase/functions/fetch-news/index.ts` | Add more RSS sources, increase GDELT records, sort by recency, return 40 articles |
| 6 | `src/components/LiveNewsFeed.tsx` | Reduce refresh to 2min, add live "updated ago" counter |

