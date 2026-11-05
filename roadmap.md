# Roadmap

- [x] Separate OmniRoute from OpenRouter in the AI chain (own gateway lane, OMNIROUTE_URL, provider/model ids, no OpenRouter alias)
- [x] Hide all Sasha UI elements behind SASHA_ENABLED flag (HUD, header launcher, palette entry, hotkeys)
- [x] Review data-provider APIs (news, maps, markets, macro) and fix stale endpoints
  - [x] FRED: real FRED_API_KEY instead of hardcoded DEMO_KEY (macro-intelligence, pipeline status, key test, API Manager)
  - [x] NewsData: legacy /api/1/news paths moved to /api/1/latest (geo-events, key test, pipeline status)
  - [x] Yahoo: removed retired v6/v10 quote endpoints; institutional-flows ETF quotes moved to v8 chart
  - [x] historical-prices: Alpha Vantage outputsize now requests full for 1y+ ranges (compact is only 100 sessions)
  - [x] fetch-news: GDELT query encoding fixed
  - [x] data-pipeline-status: dynamic dates, key-aware probes instead of demo tokens
- [ ] Redeploy affected edge functions and verify key tests live
- [ ] Verify preview shows no Sasha surfaces and no console errors
