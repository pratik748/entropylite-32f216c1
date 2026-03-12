

# Data Source Integration Layer for Entropy

## Reality Check

Entropy runs on Supabase Edge Functions + React. True Bloomberg/Refinitiv feeds require six-figure enterprise contracts and dedicated infrastructure. What we CAN build is an institutional-grade data ingestion layer using **free and low-cost public APIs** that cover the same information categories, routed into Entropy's existing prediction architecture.

## What Already Exists
- **Market Data**: Yahoo Finance (v8/v6/v10 fallback chain)
- **News**: RSS (Reuters, NYT, BBC, CNBC, MarketWatch) + GDELT + newsdata.io
- **Sentiment**: CNN Fear & Greed, Reddit WSB, Wikipedia pageviews, GDELT tone
- **Geopolitical**: AI-enhanced conflict analysis with GDELT headlines + forex stress
- **DataAggregation Module**: Static/hardcoded feed table (not wired to real sources)

## Plan: 5 New Edge Functions + 1 Enhanced UI Module

### 1. `macro-intelligence` Edge Function (NEW)
Connects to **free public APIs** for macro/economic data:
- **FRED** (Federal Reserve Economic Data) — GDP, CPI, unemployment, yield curves, M2 money supply. Uses the existing `ALPHAVANTAGE_API_KEY` secret or FRED's free API.
- **World Bank API** (free, no key) — Global GDP growth, trade balances
- **IMF SDMX API** (free, no key) — Exchange rates, reserves data
- Returns structured macro indicators with trend direction and regime classification
- Feeds into: market-data macro context, risk-intelligence, portfolio-intelligence

### 2. `sec-filings` Edge Function (NEW)
Connects to **SEC EDGAR** (free, no key):
- Full-text search of recent 10-K, 10-Q, 8-K filings
- Insider trading data (Form 4) for portfolio tickers
- Earnings transcript extraction via EDGAR XBRL API
- Returns: filing summaries, insider buy/sell signals, earnings surprises
- Feeds into: analyze-stock, desirable-assets, prediction layers

### 3. `alternative-signals` Edge Function (NEW)
Aggregates non-traditional public signals:
- **Google Trends** (via SerpAPI pattern / direct scraping) — search interest spikes for portfolio tickers
- **GitHub Activity** (free API) — tech company open-source activity as proxy for innovation velocity
- **Shipping/Trade Data** — UN Comtrade API (free) for trade flow anomalies
- Returns: attention scores, innovation signals, trade flow shifts
- Feeds into: sentiment-intel, causal-effects, scar memory

### 4. `institutional-flows` Edge Function (NEW)
Tracks institutional positioning:
- **13F Holdings** from SEC EDGAR — major fund position changes
- **ETF Flow Data** from Yahoo Finance — sector rotation signals
- **Options Flow** from Yahoo Finance options chain — put/call ratios, unusual volume
- Returns: institutional sentiment, smart money direction, options skew
- Feeds into: flow-intelligence, clank-detection, crown-intelligence

### 5. `data-pipeline-status` Edge Function (NEW)
Real-time health monitoring for all data sources:
- Pings each data source endpoint with HEAD requests
- Measures latency and availability
- Returns source status, latency, last successful fetch timestamp
- Powers the DataAggregation module with REAL status data

### 6. Enhanced `DataAggregationModule` UI (REWRITE)
Transform from static table to **live Data Intelligence Hub**:
- Real-time source health dashboard (wired to `data-pipeline-status`)
- Data flow visualization showing ingestion → processing → consumption
- Source credibility scoring display
- Latency heatmap across all feeds
- New charts: data freshness timeline, source reliability radar, ingestion volume area chart
- Pipeline stage indicators with real error counts from edge function logs

### 7. API Governor Updates
- Register all new endpoints in `apiGovernor.ts` with appropriate tiers:
  - `macro-intelligence`: "slow" (60s cache — macro data changes slowly)
  - `sec-filings`: "slow" (60s)
  - `alternative-signals`: "slow" (60s)
  - `institutional-flows`: "slow" (60s)
  - `data-pipeline-status`: "frequent" (15s)

### 8. Wire New Data Into Existing Modules
- **PortfolioBlotter**: Show insider trading alerts from sec-filings
- **MarketOverview**: Add macro indicator strip from macro-intelligence
- **SentimentDashboard**: Incorporate Google Trends attention data
- **FlowDetectionPanel**: Use institutional-flows for 13F/options data

## Files to Create/Edit (13 files)

**New Edge Functions (5):**
1. `supabase/functions/macro-intelligence/index.ts`
2. `supabase/functions/sec-filings/index.ts`
3. `supabase/functions/alternative-signals/index.ts`
4. `supabase/functions/institutional-flows/index.ts`
5. `supabase/functions/data-pipeline-status/index.ts`

**Config:**
6. `supabase/config.toml` — add 5 new function entries with `verify_jwt = false`

**Frontend:**
7. `src/components/augment/DataAggregationModule.tsx` — rewrite with live data
8. `src/lib/apiGovernor.ts` — register new endpoints
9. `src/hooks/useDataPipeline.ts` — new hook for pipeline status
10. `src/hooks/useMacroIntelligence.ts` — new hook for macro data
11. `src/hooks/useInstitutionalFlows.ts` — new hook for flow data

**Integration points:**
12. `src/components/terminal/FlowDetectionPanel.tsx` — wire institutional-flows
13. `src/components/MarketOverview.tsx` — add macro indicator strip

## Constraints Respected
- All sources are free/public APIs (no paid subscriptions needed)
- Caching via API Governor prevents unnecessary calls
- Edge functions use existing auth pattern (`requireAuth`)
- No new secrets needed (FRED is free, SEC EDGAR is free, World Bank is free)

