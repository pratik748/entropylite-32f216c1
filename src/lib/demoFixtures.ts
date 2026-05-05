/**
 * Demo Mode fixtures — frozen, deterministic responses for every edge function
 * the terminal touches. Returned by `governedInvoke` when Demo Mode is ON so
 * no backend call ever fires and every module renders fully populated for
 * investors / first-time viewers.
 *
 * Data is intentionally curated around the demo portfolio (AAPL, NVDA,
 * RELIANCE.NS, BTC-USD, TSLA) defined in `demoMode.ts`.
 */

import { DEMO_TICKERS } from "./demoMode";

const FROZEN_PRICES: Record<string, number> = {
  AAPL: 214.86,
  NVDA: 1184.55,
  "RELIANCE.NS": 2912.4,
  "BTC-USD": 96420,
  TSLA: 232.74,
  "SPY": 542.18,
  "QQQ": 468.92,
  "^GSPC": 5421.8,
  "^NDX": 18756.4,
  "^NSEI": 24820.5,
  "^VIX": 13.4,
  "DX-Y.NYB": 105.6,
  "GC=F": 2342.1,
  "CL=F": 78.4,
};

function priceFor(t: string): number {
  return FROZEN_PRICES[t] ?? 100;
}

function pricePayload(tickers: string[]) {
  const prices: Record<string, any> = {};
  for (const t of tickers) {
    prices[t] = {
      price: priceFor(t),
      change: 0.42,
      changePct: 0.18,
      currency: t.endsWith(".NS") ? "INR" : t === "BTC-USD" ? "USD" : "USD",
      timestamp: Date.now(),
    };
  }
  return { prices };
}

const desirablePicks = [
  {
    ticker: "MSFT", name: "Microsoft Corp", assetClass: "equity", exchange: "NASDAQ",
    currency: "USD", realCurrency: "USD", realPrice: 432.18, currentEstPrice: 432.18,
    entryZone: [418, 432], targetPrice: 478, stopLoss: 405, timeHorizon: "3-6 months",
    suggestedQty: 25, confidence: 82,
    thesis: "Azure AI workload growth re-accelerating; Copilot attach rate rising in Enterprise SKUs.",
    catalyst: "Q4 earnings + Azure growth print > 32% YoY.",
    hedgingStrategy: "Pair with QQQ-2% puts for index-level draw.",
    riskReward: "1 : 2.6", sector: "Technology",
    tags: ["mega-cap", "ai-beneficiary", "compounder"], riskProfile: ["medium_term", "high_conviction"],
    strategy: "momentum", priceChange24h: 0.82, priceVerified: true,
    sharpeRatio: 1.82, maxDrawdown: -8.4, portfolioCorrelation: 0.34, volatility: 0.22,
    zScore: 1.4, quantScore: 78, simulationTested: true,
    momentum20d: 6.8, momentum5d: 2.1, trendStrength: 0.74,
    sentimentScore: 42, sentimentLabel: "constructive", earningsSignal: "bullish",
    sentimentHeadline: "MSFT raised at MS — Azure AI capacity sold through CY26",
    sentimentArticleCount: 38, allocationPct: 6.2, riskBudgetPct: 1.4,
    hedgeInstrument: "QQQ 460P 30D", hedgeRatioPct: 18,
    evidenceSummary: ["Azure backlog +37% YoY", "Capex guide raised", "Copilot ARR > $4B run-rate"],
    portfolioFit: "Adds quality growth with low correlation to NVDA tail risk.",
    riskVerdict: "low", riskCompositeScore: 28, horizonClass: "medium_term",
  },
  {
    ticker: "GOOGL", name: "Alphabet Inc", assetClass: "equity", exchange: "NASDAQ",
    currency: "USD", realCurrency: "USD", realPrice: 178.42, currentEstPrice: 178.42,
    entryZone: [172, 180], targetPrice: 205, stopLoss: 162, timeHorizon: "6-12 months",
    suggestedQty: 60, confidence: 76,
    thesis: "Search resilient, Gemini 3 closes the gap, YouTube ads inflecting on shorts monetization.",
    catalyst: "Cloud margin print + Waymo expansion to 4 new metros.",
    hedgingStrategy: "Pair vs META 1:1 to neutralize ad-cycle beta.",
    riskReward: "1 : 2.1", sector: "Technology",
    tags: ["ad-rebound", "ai-platform"], riskProfile: ["medium_term"],
    strategy: "equity", priceChange24h: 1.24, priceVerified: true,
    sharpeRatio: 1.61, maxDrawdown: -11.2, portfolioCorrelation: 0.41, volatility: 0.27,
    zScore: 0.9, quantScore: 72, simulationTested: true,
    momentum20d: 4.2, momentum5d: 1.6, trendStrength: 0.62,
    sentimentScore: 28, sentimentLabel: "constructive", earningsSignal: "bullish",
    sentimentHeadline: "Cloud margin expansion ahead of Street",
    sentimentArticleCount: 24, allocationPct: 5.8, riskBudgetPct: 1.6,
    hedgeInstrument: "META short 25%", hedgeRatioPct: 25,
    evidenceSummary: ["Cloud op-margin 14% vs 11% est", "TAC stable", "Waymo ride-share +180% QoQ"],
    portfolioFit: "Diversifies AI exposure away from compute-only beta.",
    riskVerdict: "medium", riskCompositeScore: 42, horizonClass: "long_term",
  },
  {
    ticker: "TSM", name: "Taiwan Semiconductor", assetClass: "equity", exchange: "NYSE",
    currency: "USD", realCurrency: "USD", realPrice: 174.6, currentEstPrice: 174.6,
    entryZone: [168, 176], targetPrice: 210, stopLoss: 156, timeHorizon: "6-12 months",
    suggestedQty: 50, confidence: 79,
    thesis: "Sole-source N3/N2 ramp; AI accelerator wafers fully booked through 2027.",
    catalyst: "Arizona Fab 2 first-silicon + N2 yield update.",
    hedgingStrategy: "Pair with SOXX-3% puts vs Taiwan-strait tail.",
    riskReward: "1 : 2.9", sector: "Semiconductors",
    tags: ["foundry", "ai-supply"], riskProfile: ["high_conviction", "long_term"],
    strategy: "equity", priceChange24h: 0.94, priceVerified: true,
    sharpeRatio: 1.94, maxDrawdown: -14.8, portfolioCorrelation: 0.52, volatility: 0.31,
    zScore: 1.7, quantScore: 81, simulationTested: true,
    momentum20d: 8.4, momentum5d: 3.1, trendStrength: 0.81,
    sentimentScore: 51, sentimentLabel: "very constructive", earningsSignal: "bullish",
    sentimentHeadline: "TSM utilization 100% on N3 — pricing power confirmed",
    sentimentArticleCount: 41, allocationPct: 5.4, riskBudgetPct: 2.1,
    hedgeInstrument: "SOXX 220P 60D", hedgeRatioPct: 30,
    evidenceSummary: ["N3 fully booked", "Pricing +6% in '26", "ASML LP-DUV doubled"],
    portfolioFit: "Picks-and-shovels exposure to NVDA thesis without the multiple.",
    riskVerdict: "medium", riskCompositeScore: 48, horizonClass: "long_term",
  },
  {
    ticker: "GLD", name: "SPDR Gold Trust", assetClass: "etf_commodity", exchange: "NYSEARCA",
    currency: "USD", realCurrency: "USD", realPrice: 218.4, currentEstPrice: 218.4,
    entryZone: [214, 220], targetPrice: 246, stopLoss: 204, timeHorizon: "6-12 months",
    suggestedQty: 30, confidence: 71,
    thesis: "CB buying + real-rate normalization + de-dollarization tail bid.",
    catalyst: "Fed cut delivered + DXY rolls below 103.",
    hedgingStrategy: "Hedges concentrated equity tail and BTC drawdowns.",
    riskReward: "1 : 2.0", sector: "Commodities",
    tags: ["safe-haven", "decorrelator"], riskProfile: ["safe_haven", "long_term"],
    strategy: "correlation_hedge", priceChange24h: 0.38, priceVerified: true,
    sharpeRatio: 1.32, maxDrawdown: -6.8, portfolioCorrelation: -0.12, volatility: 0.14,
    zScore: 0.6, quantScore: 68, simulationTested: true,
    momentum20d: 3.2, momentum5d: 0.8, trendStrength: 0.51,
    sentimentScore: 18, sentimentLabel: "neutral-positive", earningsSignal: "neutral",
    sentimentHeadline: "Central bank buying hits record 1,037T in Q1",
    sentimentArticleCount: 19, allocationPct: 7.5, riskBudgetPct: 0.9,
    hedgeInstrument: "n/a — IS the hedge", hedgeRatioPct: 0,
    evidenceSummary: ["CB demand +24% YoY", "Real-rates rolling over", "ETF flows turn positive"],
    portfolioFit: "Negative-correlation sleeve to AAPL/NVDA/TSLA tech beta.",
    riskVerdict: "low", riskCompositeScore: 22, horizonClass: "long_term",
  },
  {
    ticker: "HDFCBANK.NS", name: "HDFC Bank", assetClass: "equity", exchange: "NSE",
    currency: "INR", realCurrency: "INR", realPrice: 1684.5, currentEstPrice: 1684.5,
    entryZone: [1640, 1700], targetPrice: 1920, stopLoss: 1560, timeHorizon: "6-12 months",
    suggestedQty: 100, confidence: 73,
    thesis: "Merger-synergy NIM trough done; index inclusion flows + retail credit growth.",
    catalyst: "MSCI weight upgrade + Q1 NIM print.",
    hedgingStrategy: "Pair vs ICICIBANK 0.6:1 to isolate idiosyncratic alpha.",
    riskReward: "1 : 2.4", sector: "Banking",
    tags: ["india-financials", "rerate"], riskProfile: ["medium_term", "income"],
    strategy: "pair_trade", priceChange24h: 0.62, priceVerified: true,
    sharpeRatio: 1.45, maxDrawdown: -9.2, portfolioCorrelation: 0.18, volatility: 0.24,
    zScore: 1.1, quantScore: 71, simulationTested: true,
    momentum20d: 4.8, momentum5d: 1.4, trendStrength: 0.66,
    sentimentScore: 32, sentimentLabel: "constructive", earningsSignal: "bullish",
    sentimentHeadline: "MSCI passive flow ~$3.2B expected on weight bump",
    sentimentArticleCount: 22, allocationPct: 4.6, riskBudgetPct: 1.2,
    hedgeInstrument: "ICICIBANK short 60%", hedgeRatioPct: 60,
    evidenceSummary: ["NIM trough at 3.42%", "Retail loan +18%", "FII flows turn net buyer"],
    portfolioFit: "Adds India-financials exposure orthogonal to RELIANCE oil/telecom beta.",
    riskVerdict: "low", riskCompositeScore: 31, horizonClass: "medium_term",
  },
  {
    ticker: "ASML", name: "ASML Holding", assetClass: "equity", exchange: "NASDAQ",
    currency: "USD", realCurrency: "USD", realPrice: 942.6, currentEstPrice: 942.6,
    entryZone: [910, 950], targetPrice: 1180, stopLoss: 840, timeHorizon: "6-12 months",
    suggestedQty: 8, confidence: 75,
    thesis: "EUV monopoly; High-NA orders accelerating into '27.",
    catalyst: "Q3 bookings print > €5.6B.",
    hedgingStrategy: "Pair vs SOX index 1:1 to isolate alpha.",
    riskReward: "1 : 3.1", sector: "Semiconductors",
    tags: ["monopoly", "ai-supply"], riskProfile: ["high_conviction", "long_term"],
    strategy: "equity", priceChange24h: 1.42, priceVerified: true,
    sharpeRatio: 1.71, maxDrawdown: -16.2, portfolioCorrelation: 0.48, volatility: 0.34,
    zScore: 1.3, quantScore: 76, simulationTested: true,
    momentum20d: 5.6, momentum5d: 2.4, trendStrength: 0.72,
    sentimentScore: 38, sentimentLabel: "constructive", earningsSignal: "bullish",
    sentimentHeadline: "ASML High-NA backlog at 12 systems for 2026",
    sentimentArticleCount: 27, allocationPct: 4.2, riskBudgetPct: 1.8,
    hedgeInstrument: "SOXX 220P 60D", hedgeRatioPct: 35,
    evidenceSummary: ["High-NA orders +200%", "EUV utilization at fab limit", "China revenue stabilizing"],
    portfolioFit: "Layered AI-supply exposure with TSM, less direct competition risk than NVDA.",
    riskVerdict: "medium", riskCompositeScore: 44, horizonClass: "long_term",
  },
];

const desirableResponse = {
  recommendations: desirablePicks,
  marketCondition:
    "Risk-on regime, AI capex cycle dominant, gold catching defensive bid, INR financials inflecting.",
  regimeType: "risk-on",
  liveWebContext:
    "## LIVE WEB CONTEXT\n• Fed decision May 8 — 25bp cut priced 78%\n• Earnings season 71% beat-rate, AI capex guides raised across MAG7\n• China stimulus package (RMB 2.4T) lifts copper, freight, India IT\n• Geopolitical: Taiwan-strait calm, Red Sea shipping insurance down 12%",
  candidatesGenerated: 38,
  candidatesPassed: 6,
  rejectSummary: ["12 failed Sharpe<1.2", "8 failed liquidity floor", "12 failed correlation cap"],
  rejectHeadline: "32 of 38 candidates screened cleanly, 6 elite setups passed all filters.",
};

const briefResponse = {
  date: new Date().toISOString().slice(0, 10),
  regime: "Risk-on, momentum-led",
  insights: [
    {
      title: "AI capex cycle still has runway",
      body: "MSFT/META/GOOG reaffirmed 2026 capex >$90B each. NVDA + TSM remain the cleanest expressions; GOOGL adds optionality at lower beta.",
      tag: "Macro",
    },
    {
      title: "Gold is the cleanest portfolio decorrelator",
      body: "GLD shows -0.12 corr to your equity sleeve and +6.8% YTD on real-rate normalization. Recommended 7.5% allocation as tail hedge.",
      tag: "Hedging",
    },
    {
      title: "TSLA: trim or exit",
      body: "BYD price war + Shanghai output cut + insider lockup expiry compounds. Risk-adjusted return turns negative below $225.",
      tag: "Position",
    },
  ],
  topMover: "NVDA +2.4%",
  topRisk: "DXY rebound to 105.6 if CPI prints hot",
};

const geoResponse = {
  conflicts: [
    {
      name: "Russia-Ukraine War", lat: 48.38, lng: 31.17, severity: 0.62, type: "war",
      affectedAssets: ["LMT", "BA", "RHM.DE", "WEAT"],
      summary: "Frozen lines; defense supply chains continue elevated tempo.",
    },
    {
      name: "Taiwan Strait Tension", lat: 23.7, lng: 121, severity: 0.48, type: "diplomatic",
      affectedAssets: ["TSM", "NVDA", "ASML"],
      summary: "Calm baseline; PLA exercises down 18% QoQ.",
    },
    {
      name: "Israel-Hezbollah", lat: 33.5, lng: 35.5, severity: 0.55, type: "war",
      affectedAssets: ["BZ=F", "CL=F", "GLD"],
      summary: "Brent risk premium ~$4/bbl, contained.",
    },
    {
      name: "Red Sea Shipping", lat: 15, lng: 42, severity: 0.42, type: "shipping",
      affectedAssets: ["MAERSK-B.CO", "ZIM", "FDX"],
      summary: "Insurance rates -12% from Q1 peak.",
    },
  ],
  events: [
    { id: "g1", time: Date.now() - 1800_000, headline: "Fed officials signal patience on cuts", region: "US", tickers: ["SPY", "QQQ"], severity: "low" },
    { id: "g2", time: Date.now() - 3600_000, headline: "RBI holds rates, dovish forward guidance", region: "IN", tickers: ["RELIANCE.NS", "HDFCBANK.NS"], severity: "low" },
    { id: "g3", time: Date.now() - 7200_000, headline: "OPEC+ extends voluntary cuts to Q3", region: "ME", tickers: ["CL=F", "XOM"], severity: "medium" },
  ],
};

const newsResponse = {
  articles: [
    { title: "NVIDIA Blackwell shipments ahead of plan, Q2 guide raised", source: "Reuters", url: "#", publishedAt: new Date().toISOString(), sentiment: 0.78, tickers: ["NVDA"] },
    { title: "Apple Services hits record 74% gross margin", source: "Bloomberg", url: "#", publishedAt: new Date(Date.now() - 1800_000).toISOString(), sentiment: 0.62, tickers: ["AAPL"] },
    { title: "Reliance Jio crosses 500M subscribers", source: "Mint", url: "#", publishedAt: new Date(Date.now() - 3600_000).toISOString(), sentiment: 0.66, tickers: ["RELIANCE.NS"] },
    { title: "Spot BTC ETFs net +$1.4B inflow this week", source: "CoinDesk", url: "#", publishedAt: new Date(Date.now() - 5400_000).toISOString(), sentiment: 0.71, tickers: ["BTC-USD"] },
    { title: "Tesla cuts Shanghai output 15% in May", source: "Bloomberg", url: "#", publishedAt: new Date(Date.now() - 7200_000).toISOString(), sentiment: -0.42, tickers: ["TSLA"] },
    { title: "Fed officials signal patience on rate path", source: "WSJ", url: "#", publishedAt: new Date(Date.now() - 9000_000).toISOString(), sentiment: 0.18, tickers: ["SPY"] },
  ],
};

const marketDataResponse = {
  indices: [
    { symbol: "^GSPC", name: "S&P 500", price: 5421.8, change: 28.4, changePct: 0.52 },
    { symbol: "^NDX", name: "Nasdaq 100", price: 18756.4, change: 142.6, changePct: 0.77 },
    { symbol: "^NSEI", name: "NIFTY 50", price: 24820.5, change: 86.2, changePct: 0.35 },
    { symbol: "^VIX", name: "VIX", price: 13.4, change: -0.6, changePct: -4.28 },
    { symbol: "DX-Y.NYB", name: "DXY", price: 105.6, change: 0.18, changePct: 0.17 },
    { symbol: "GC=F", name: "Gold", price: 2342.1, change: 8.4, changePct: 0.36 },
    { symbol: "CL=F", name: "WTI Crude", price: 78.4, change: -1.2, changePct: -1.51 },
    { symbol: "BTC-USD", name: "Bitcoin", price: 96420, change: 1840, changePct: 1.95 },
  ],
  topGainers: [
    { symbol: "NVDA", price: 1184.55, changePct: 2.42 },
    { symbol: "TSM", price: 174.6, changePct: 1.84 },
    { symbol: "MSFT", price: 432.18, changePct: 1.12 },
  ],
  topLosers: [
    { symbol: "TSLA", price: 232.74, changePct: -1.92 },
    { symbol: "BA", price: 168.4, changePct: -1.46 },
    { symbol: "INTC", price: 31.2, changePct: -1.18 },
  ],
};

const fxResponse = {
  rates: { USD: 1, INR: 83.42, EUR: 0.918, GBP: 0.788, JPY: 154.2, CNY: 7.21 },
  base: "USD",
  timestamp: Date.now(),
};

const sentimentResponse = {
  overallSentiment: 58,
  breakdown: { news: 62, social: 54, options: 51, flow: 64 },
  topThemes: ["AI capex", "Fed cut window", "India financials", "Gold safe-haven"],
  pressureScore: 2.4,
};

const flowResponse = {
  netFlows: [
    { ticker: "NVDA", net: 1840000000, dir: "in" },
    { ticker: "MSFT", net: 920000000, dir: "in" },
    { ticker: "GLD", net: 480000000, dir: "in" },
    { ticker: "TSLA", net: -640000000, dir: "out" },
  ],
  darkPoolPct: 42.6,
  blockTradeCount: 184,
};

const riskResponse = {
  portfolioVar95: 4.2,
  portfolioCvar95: 6.8,
  beta: 1.18,
  maxDrawdown: -8.4,
  sharpe: 1.62,
  concentrationHHI: 0.24,
  scenarioImpacts: [
    { name: "Fed surprise hold", impact: -3.2 },
    { name: "China stimulus +25bp", impact: 1.8 },
    { name: "Taiwan flare-up", impact: -6.4 },
    { name: "Oil to $90", impact: -1.6 },
  ],
};

const monteCarloResponse = {
  paths: 10000,
  horizonDays: 30,
  bull95: 0.082,
  median: 0.024,
  bear5: -0.061,
  cvar95: -0.084,
  ruinProb: 0.018,
};

const causalResponse = {
  effects: [
    { cause: "Fed -25bp", second: ["DXY ↓1.2%", "EM equities ↑2.4%"], third: ["RELIANCE.NS ↑1.8%", "INR strengthens"] },
    { cause: "AI capex guide raised", second: ["NVDA ↑3.4%", "TSM ↑2.1%"], third: ["Power utilities ↑", "Copper ↑1.4%"] },
  ],
  reflexivityScore: 0.62,
};

const derivativesResponse = {
  topPairs: [
    { pair: "NVDA / SMH", corr: 0.78, zScore: 1.4, signal: "long-NVDA" },
    { pair: "AAPL / MSFT", corr: 0.62, zScore: -0.8, signal: "long-AAPL" },
  ],
  optionsIntel: [
    { ticker: "NVDA", iv: 0.48, ivRank: 64, putCallRatio: 0.62 },
    { ticker: "TSLA", iv: 0.55, ivRank: 78, putCallRatio: 1.18 },
  ],
};

const tacticalResponse = {
  signals: [
    { ticker: "NVDA", action: "trim 25%", reason: "RSI 78, +84% momentum" },
    { ticker: "GLD", action: "add 15%", reason: "real-rates rolling, CB demand" },
  ],
};

const institutionalResponse = {
  flows: [
    { fund: "Vanguard", ticker: "NVDA", change: 240000000, dir: "in" },
    { fund: "BlackRock", ticker: "MSFT", change: 180000000, dir: "in" },
    { fund: "Bridgewater", ticker: "GLD", change: 92000000, dir: "in" },
  ],
};

const macroResponse = {
  rates: { fedFunds: 5.25, ecb: 3.75, rbi: 6.5, boj: 0.1 },
  cpi: { us: 3.1, india: 4.6, eu: 2.4 },
  gdp: { us: 2.4, india: 7.2, china: 4.8 },
  forecast: "Easing cycle starts Q3-2026; India + China lead growth.",
};

const polymarketResponse = {
  markets: [
    { question: "Fed cuts >50bp by year-end?", probability: 0.62, volume: 1840000 },
    { question: "Trump wins 2026 GE?", probability: 0.48, volume: 8200000 },
    { question: "BTC > $120k by Dec?", probability: 0.41, volume: 2400000 },
  ],
};

const reflexivityResponse = {
  beliefMap: [
    { narrative: "AI capex sustainable", strength: 0.78, momentum: 0.12 },
    { narrative: "Fed easing imminent", strength: 0.62, momentum: 0.08 },
    { narrative: "Soft landing", strength: 0.71, momentum: -0.04 },
  ],
  reflexivityScore: 0.66,
};

const sectionsResponse = { ok: true, status: "demo" };

const FIXTURES: Record<string, any> = {
  "price-feed": (body: any) => pricePayload(Array.isArray(body?.tickers) ? body.tickers : DEMO_TICKERS),
  "market-data": marketDataResponse,
  "fx-rates": fxResponse,
  "fetch-news": newsResponse,
  "geopolitical-data": geoResponse,
  "geo-events": geoResponse,
  "desirable-assets": desirableResponse,
  "tactical-movement": tacticalResponse,
  "sentiment-intel": sentimentResponse,
  "risk-intelligence": riskResponse,
  "flow-intelligence": flowResponse,
  "portfolio-intelligence": riskResponse,
  "monte-carlo-intelligence": monteCarloResponse,
  "crown-intelligence": { opportunities: tacticalResponse.signals },
  "deep-intelligence": { ...sentimentResponse, ...flowResponse },
  "parallel-intelligence": { ...sentimentResponse, ...flowResponse },
  "continuous-simulation": monteCarloResponse,
  "clank-detection": { anomalies: [] },
  "strategy-evolution": { generations: 12, eliteSharpe: 2.41 },
  "macro-intelligence": macroResponse,
  "sec-filings": { filings: [] },
  "alternative-signals": { signals: [] },
  "institutional-flows": institutionalResponse,
  "data-pipeline-status": { sources: [{ name: "Demo Mode", status: "frozen", latencyMs: 0 }] },
  "derivatives-intelligence": derivativesResponse,
  "historical-prices": { closes: Array.from({ length: 60 }, (_, i) => 100 + Math.sin(i / 6) * 4 + i * 0.3) },
  "polymarket-signals": polymarketResponse,
  "reflexivity-engine": reflexivityResponse,
  "company-intelligence": sentimentResponse,
  "fortress-intelligence": riskResponse,
  "causal-effects": causalResponse,
  "entropy-brief": briefResponse,
  "strategy-generate": { strategies: [] },
  "analyze-stock": sectionsResponse,
  "direct-profit": sectionsResponse,
  "alpaca-trading": sectionsResponse,
  "cadence-generate": sectionsResponse,
  "twrd-query": { results: [] },
  "twrd-ingest": sectionsResponse,
  "twrd-feedback": sectionsResponse,
};

/**
 * Returns a frozen fixture for the given edge function, or `undefined` if
 * no fixture is defined (caller should pass through to the network).
 */
export function getDemoFixture(functionName: string, body: any): any | undefined {
  const fx = FIXTURES[functionName];
  if (fx == null) return undefined;
  return typeof fx === "function" ? fx(body) : fx;
}

export const DEMO_FIXTURE_ENDPOINTS = Object.keys(FIXTURES);
