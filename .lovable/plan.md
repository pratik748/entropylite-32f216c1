

# Alternative Sentiment Data Sources

## Current State
- Single news source: newsdata.io via `fetch-news` edge function
- Basic sentiment from newsdata.io's built-in field (pos/neg/neutral string)
- No CNN Fear & Greed, no multi-source sentiment aggregation, no trend visualization

## Plan

### 1. New Edge Function: `sentiment-intel`
A single backend function that aggregates sentiment from multiple free sources in parallel:

- **CNN Fear & Greed Index** — scrape the public JSON endpoint (`https://production.dataviz.cnn.io/index/fearandgreed/graphdata`) for the current score (0-100) and historical values
- **Reuters/AP via newsdata.io** — filter existing news results by source to extract per-source sentiment breakdown (Reuters, AP, Bloomberg, CNBC, WSJ)
- **GDELT Global Sentiment** — hit the free GDELT API (`https://api.gdeltproject.org/api/v2/doc/doc?query=...&mode=ArtList&format=json`) for real-time global event tone data by ticker/topic
- **AI Composite Score** — use the existing `callAI` to synthesize a weighted sentiment summary from the raw signals, producing a -100 to +100 composite score with per-source breakdown

Returns: `{ cnnFearGreed: {score, label, history[]}, gdeltTone: {avgTone, articleCount, trendDirection}, sourceBreakdown: [{source, sentiment, count}], compositeScore, trend: "improving"|"deteriorating"|"stable", tickerSentiment?: {...} }`

### 2. New Component: `SentimentDashboard.tsx`
Full sentiment intelligence panel with:
- **CNN Fear & Greed Gauge** — semicircle SVG gauge (reuse RiskGauge pattern) showing 0-100 with zones (Extreme Fear / Fear / Neutral / Greed / Extreme Greed)
- **Source Sentiment Grid** — cards for Reuters, Bloomberg, CNBC, AP, WSJ showing per-source sentiment bars and article counts
- **GDELT Global Tone** — area chart showing tone trend over the fetched window
- **Composite Score** — large number display with trend arrow and historical mini-sparkline
- **Ticker-specific sentiment** — when a stock is selected, show sentiment breakdown specific to that ticker

### 3. Integration into Index.tsx
- Add SentimentDashboard to the Dashboard tab (below news feed or as a collapsible section)
- Wire it to the existing `governedInvoke` with "slow" tier caching (10min)
- Pass active ticker for ticker-specific sentiment when available

### 4. Wire into LiveNewsFeed
- Enrich each article with a source-tier badge (Tier 1: Reuters/Bloomberg/AP, Tier 2: CNBC/WSJ/FT, Tier 3: other)
- Show source reliability indicator next to sentiment dots

### Technical Notes
- CNN F&G endpoint is public JSON, no API key needed
- GDELT API is free, no key needed, rate-limited but generous
- newsdata.io source filtering uses existing API key
- All fetched via the single `sentiment-intel` edge function to minimize client calls
- Governor tier: "slow" (10min cache)

