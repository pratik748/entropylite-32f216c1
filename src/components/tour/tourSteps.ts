export type TourStep = {
  id: string;
  selector: string;
  title: string;
  body: string;
  requiresTab?: string;
  side?: "top" | "bottom" | "left" | "right" | "auto";
  mobile?: boolean; // include on mobile
};

export const TOUR_STEPS: TourStep[] = [
  {
    id: "input",
    selector: '[data-tour="stock-input"]',
    title: "Start here — the ticker line",
    body: "Drop any symbol: equity (AAPL, RELIANCE), FX (EURUSD), crypto (BTC), commodity (GOLD), or index (NIFTY). One entry kicks off ~40 engines: price feed, fundamentals, options chain, sentiment, macro overlay, geopolitics, peer flows. Type, hit Enter — the whole stack lights up for that name.",
    side: "bottom",
    mobile: true,
  },
  {
    id: "tabs",
    selector: '[data-tour="tab-bar"]',
    title: "Nine modes, one portfolio",
    body: "Dashboard is your cockpit. The other eight are specialist lenses on the same positions — Markets, Geopolitics, Desirable, Sandbox, Stat Arb, Augment, Risk, Fortress. Switching tabs never reloads data; engines run continuously in the background.",
    side: "bottom",
    mobile: true,
  },
  {
    id: "dashboard",
    selector: '[data-tour-tab="dashboard"]',
    title: "Dashboard — your cockpit",
    body: "Live PnL, position blotter, AI verdict per holding, news-impact table, Monte Carlo cone, risk gauge, and the recommendation engine. Everything you need to decide the next click sits on this one screen.",
    requiresTab: "dashboard",
    side: "bottom",
    mobile: true,
  },
  {
    id: "market",
    selector: '[data-tour-tab="market"]',
    title: "Markets — global pulse",
    body: "Indices, sectors, FX, commodities, vol surface (VIX gauge), institutional flow radar, and a live news feed scored for impact. Use it to read the tape before you touch a position.",
    requiresTab: "market",
    side: "bottom",
    mobile: true,
  },
  {
    id: "geo",
    selector: '[data-tour-tab="geopolitical"]',
    title: "Geopolitics — world risk overlay",
    body: "GDELT-fed event stream, country risk heat-map, causal graph linking events → sectors → your tickers, and an exposure list flagging holdings sitting in hot zones. Updates every few minutes whether the tab is open or not.",
    requiresTab: "geopolitical",
    side: "bottom",
    mobile: true,
  },
  {
    id: "desirable",
    selector: '[data-tour-tab="desirable"]',
    title: "Desirable — what to buy next",
    body: "Ranked picks generated from fundamentals, momentum, regime fit, and your existing exposure gaps. Each name carries an entry band, target, stop, and the reason it surfaced. One click adds it to the portfolio.",
    requiresTab: "desirable",
    side: "bottom",
    mobile: true,
  },
  {
    id: "sandbox",
    selector: '[data-tour-tab="sandbox"]',
    title: "Sandbox — twelve engines",
    body: "Monte Carlo, causal effects, derivatives pricing, execution simulator, strategy lab & factory, scar memory (loss replay), aftermath matrix, crown layer (regime-aware sizing), outcome-gradient dashboard. Run any scenario before the market does.",
    requiresTab: "sandbox",
    side: "bottom",
    mobile: true,
  },
  {
    id: "statarb",
    selector: '[data-tour-tab="statarb"]',
    title: "Stat Arb — pairs & spreads",
    body: "Cointegration scanner, z-score signals, half-life of mean reversion, and live spread charts. Find pairs that drifted, size them with the built-in math, and watch them converge.",
    requiresTab: "statarb",
    side: "bottom",
  },
  {
    id: "augment",
    selector: '[data-tour-tab="augment"]',
    title: "Augment — institutional toolkit",
    body: "Fifteen modules: portfolio construction, hedging, stress test, risk modeling, valuation, ESG, compliance, benchmark, exposure dashboard, multi-asset, OMS, trade lifecycle, data aggregation, client reporting, workflow. The back-office of a real fund.",
    requiresTab: "augment",
    side: "bottom",
  },
  {
    id: "risk",
    selector: '[data-tour-tab="risk"]',
    title: "Risk — know what can hurt you",
    body: "VaR (parametric + historical + Monte Carlo), expected shortfall, beta to SPX/NIFTY, factor exposures, drawdown projection, and CLANK — the anomaly detector that flags positions behaving unlike themselves.",
    requiresTab: "risk",
    side: "bottom",
    mobile: true,
  },
  {
    id: "fortress",
    selector: '[data-tour-tab="fortress"]',
    title: "Fortress — capital preservation mode",
    body: "When regimes break, Fortress flips the portfolio to defensive: auto-hedges, cash raise, vol-target down-shift, correlation-aware trimming. One toggle moves you from offense to survival.",
    requiresTab: "fortress",
    side: "bottom",
  },
  {
    id: "direct-profit",
    selector: '[data-tour="direct-profit-btn"]',
    title: "Direct Profit — the arbitrated verdict",
    body: "All nine modules vote. The Master Arbiter resolves contradictions and outputs ONE call: BUY, SELL, or WAIT — with entry band, target, stop, and risk-reward. No more 'fundamentals say buy, technicals say sell'.",
    side: "bottom",
    mobile: true,
  },
  {
    id: "brief",
    selector: '[data-tour="brief-btn"]',
    title: "The Brief — share the edge",
    body: "Three high-conviction insights distilled from the day's run. Export as a branded PNG and post to X or WhatsApp in one tap. On mobile, tap the Entropy logo top-left to open it.",
    side: "bottom",
    mobile: true,
  },
  {
    id: "status",
    selector: '[data-tour="status-bar"]',
    title: "System status — engine pulse",
    body: "Live data health: price-feed latency, engine queue depth, market-hours flags (NYSE/LSE/NSE/TSE), refresh state. If something is stale, you'll see it here before it costs you.",
    side: "top",
    mobile: true,
  },
];

export const TOUR_FLAG_KEY = "entropy_tour_done_v2";