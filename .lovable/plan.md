

# Multi-Source Institutional News Aggregator

## Approach
Without Firecrawl, we use **public RSS feeds** from the exact sources institutional platforms like OpenBB consume. Reuters, CNN, NYT, BBC, CNBC, FT, and others all publish financial RSS feeds that are free and require no API key. We combine these with the existing newsdata.io feed and GDELT for maximum coverage.

## Architecture

```text
┌─────────────────────────────────────────────┐
│          fetch-news (edge function)         │
│                                             │
│  ┌───────────┐ ┌──────────┐ ┌───────────┐  │
│  │ RSS Feeds │ │newsdata  │ │  GDELT    │  │
│  │ Reuters   │ │.io (existing)│ │  API  │  │
│  │ CNN Biz   │ └──────────┘ └───────────┘  │
│  │ NYT Biz   │                              │
│  │ BBC Biz   │   All results merged,        │
│  │ CNBC      │   deduplicated, scored,      │
│  │ WSJ       │   and ranked by relevance    │
│  │ FT        │                              │
│  │ Bloomberg │                              │
│  └───────────┘                              │
└─────────────────────────────────────────────┘
```

## RSS Sources (no API key needed)
- **Reuters**: `https://www.reutersagency.com/feed/` + Reuters business RSS
- **CNN Business**: `https://rss.cnn.com/rss/money_latest.rss`
- **NYT Business**: `https://rss.nytimes.com/services/xml/rss/nyt/Business.xml`
- **BBC Business**: `https://feeds.bbci.co.uk/news/business/rss.xml`
- **CNBC**: `https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=100003114`
- **MarketWatch**: `https://feeds.marketwatch.com/marketwatch/topstories/`
- **FT**: `https://www.ft.com/rss/home`
- **Bloomberg**: (no public RSS, covered by newsdata.io + GDELT)

## Changes

### 1. Rewrite `supabase/functions/fetch-news/index.ts`
- Add a lightweight XML-to-JSON RSS parser (no external deps, just regex/string parsing on the XML response -- Deno native fetch)
- Define `RSS_SOURCES` array with URL, source name, and tier
- Fetch all RSS feeds in parallel with `Promise.allSettled` (graceful per-source failures)
- Parse each RSS XML into standardized `{ title, description, link, source, pubDate }` objects
- Merge RSS results with existing newsdata.io results
- Add GDELT API call (`https://api.gdeltproject.org/api/v2/doc/doc?query=...&mode=artlist&format=json`) for supplemental coverage
- Deduplicate by title similarity (fuzzy match on normalized titles)
- Apply existing junk filter + relevance scoring
- Add source tier tag (T1/T2/T3) server-side
- Return top 25 ranked articles

### 2. Update `src/components/LiveNewsFeed.tsx`
- Display new `sourceTier` field from server response
- Add source count indicator showing how many feeds were successfully polled
- Add "MULTI-SOURCE" label replacing the current header

## Files Modified
- `supabase/functions/fetch-news/index.ts` -- multi-source aggregator with RSS + GDELT + newsdata.io
- `src/components/LiveNewsFeed.tsx` -- minor UI updates for multi-source indicator

