# Fix Duplicate Sentiment + Enhance Alternative Data Sources

## Issues Found

The sentiments and alternative data should be on the market section rather than the dashboard 

1. **Duplicate SentimentDashboard**: Rendered 3 times on desktop dashboard:
  - Line 292: Full `SentimentDashboard` inside center scroll area
  - Line 304: Compact version in bottom-center panel
  - Line 325: Compact version in right sidebar
  - Each instance makes its own API call to `sentiment-intel`
2. `**sentiment-intel` missing from config.toml**: No `verify_jwt = false` entry, so JWT verification may block unauthenticated calls (though it uses `requireAuth` internally anyway, the config must match other functions)
3. **Limited data sources**: Currently only CNN Fear & Greed, GDELT, and newsdata.io. Can add more free, no-key-needed sources.

## Plan

### 1. Remove Duplicate Sentiment Panels

**File: `src/pages/Index.tsx**`

- Remove the full `SentimentDashboard` at line 292 (center scroll area) — this is redundant with the bottom-center panel
- Remove the compact `SentimentDashboard` at line 325 (right sidebar) — keep only the bottom-center panel (line 304)
- On mobile (line 223), keep the single instance
- Net result: 1 instance on mobile, 1 instance on desktop

### 2. Add `sentiment-intel` to config.toml

Add `[functions.sentiment-intel]` with `verify_jwt = false`

### 3. Enhance `sentiment-intel` Edge Function with More Sources

Add these free, no-API-key-needed data sources:

- **Reddit/WallStreetBets Sentiment** via GDELT or public Reddit `.json` endpoints — fetch top posts from r/wallstreetbets and r/stocks, extract sentiment signals from upvote ratios and comment counts
- **FRED Economic Indicators** (free, no key needed for basic endpoints) — fetch VIX, yield curve spread (10Y-2Y), and unemployment claims as macro sentiment proxies  
- **Wikipedia Pageview Spikes** (free API) — unusual spikes in ticker/company Wikipedia views correlate with retail attention events
- **EventRegistry Global Event Tone** as a second global news tone source alongside GDELT

Weighted composite recalculation:

- CNN F&G: 25%
- GDELT Tone: 20%  
- News Source Breakdown: 15%
- Reddit Retail Sentiment: 15%
- FRED Macro Signals: 15%
- Wikipedia Attention: 10%

### 4. Update SentimentDashboard UI

- Add Reddit sentiment indicator (bullish/bearish retail mood)
- Add FRED macro signals row (VIX level, yield curve status)
- Add Wikipedia attention spike badge when detected
- Keep the existing CNN F&G gauge, GDELT tone chart, and source breakdown

### Technical Details

- Reddit `.json` endpoints: `https://www.reddit.com/r/wallstreetbets/hot.json?limit=25` (no auth needed)
- FRED public API: `https://api.stlouisfed.org/fred/series/observations?series_id=T10Y2Y&file_type=json` (needs free API key — but we can use the VIX from market-data instead)
- Wikipedia Pageviews: `https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/all-agents/{title}/daily/YYYYMMDD/YYYYMMDD` (free, no key)
- All new fetches run in parallel with existing CNN/GDELT/newsdata calls