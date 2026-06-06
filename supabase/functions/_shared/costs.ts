// Cost-aware haircut for expected-R calculation.
//
// Every trade signal has to clear an effective round-trip cost (spread +
// brokerage + impact). Indian small-caps in particular can have 1–3%
// effective spread; a signal with 1.5% edge is a guaranteed loss after
// costs. We classify the ticker into a liquidity tier and return the
// expected round-trip cost as a decimal (e.g. 0.015 = 1.5%).
//
// This is a deliberately conservative static table — it errs on the side
// of marking unknown tickers as expensive (default 0.7%) so we don't
// pretend small-caps are free to trade.

export type LiquidityTier =
  | "us_megacap"        // SPY, AAPL, MSFT, NVDA, GOOGL, AMZN, META, TSLA — 5 bps
  | "us_largecap"       // S&P 500 names — 10 bps
  | "us_smallcap"       // sub-$2B US — 25 bps
  | "in_nifty50"        // RELIANCE, TCS, INFY, HDFCBANK, … — 12 bps
  | "in_nifty500"       // mid-cap NSE — 25 bps
  | "in_smallcap"       // small/micro-cap India (GTL INFRA etc.) — 150 bps
  | "etf_majors"        // SPY/QQQ/NIFTYBEES — 6 bps
  | "crypto_majors"     // BTC/ETH — 15 bps
  | "unknown";          // default fallback — 70 bps

const COST_BY_TIER: Record<LiquidityTier, number> = {
  us_megacap: 0.0005,
  us_largecap: 0.0010,
  us_smallcap: 0.0025,
  in_nifty50: 0.0012,
  in_nifty500: 0.0025,
  in_smallcap: 0.0150,
  etf_majors: 0.0006,
  crypto_majors: 0.0015,
  unknown: 0.0070,
};

const US_MEGACAP = new Set(["AAPL","MSFT","NVDA","GOOGL","GOOG","AMZN","META","TSLA","BRK-B","BRK.B"]);
const US_LARGECAP = new Set([
  "JPM","V","UNH","XOM","WMT","PG","JNJ","MA","HD","ORCL","ABBV","KO","BAC","PFE","AVGO","COST","DIS","CSCO","ACN","MRK","ADBE","NFLX","TMO","CRM","INTC","AMD","QCOM","TXN","IBM","INTU","SPGI","CVX","LIN","NEE","PEP","NKE","CMCSA","ABT","T","UPS","PM","RTX","HON","LOW","WFC","BMY","UNP","GS","MS","C","BLK","CAT","DE","BA","MMM","GE","F","GM"
]);
const ETF_MAJORS = new Set(["SPY","QQQ","IWM","DIA","VOO","VTI","NIFTYBEES.NS","BANKBEES.NS","GOLDBEES.NS","JUNIORBEES.NS","ITBEES.NS"]);
const IN_NIFTY50 = new Set([
  "RELIANCE","TCS","INFY","HDFCBANK","ICICIBANK","HINDUNILVR","ITC","SBIN","BHARTIARTL","LT","KOTAKBANK","AXISBANK","BAJFINANCE","ASIANPAINT","MARUTI","HCLTECH","TITAN","ULTRACEMCO","WIPRO","SUNPHARMA","NESTLEIND","NTPC","POWERGRID","M&M","ADANIENT","ADANIPORTS","JSWSTEEL","TATASTEEL","TATAMOTORS","TECHM","ONGC","BAJAJFINSV","COALINDIA","HDFCLIFE","SBILIFE","HINDALCO","DRREDDY","DIVISLAB","CIPLA","EICHERMOT","GRASIM","BRITANNIA","INDUSINDBK","BAJAJ-AUTO","BPCL","TATACONSUM","HEROMOTOCO","UPL","APOLLOHOSP","LTIM"
]);

function stripSuffix(t: string): string {
  return t.replace(/\.(NS|BO|L|TO|HK|T|PA|DE|SS|SZ|KS|AX|SA|SI)$/i, "").toUpperCase();
}

export function classifyLiquidity(ticker: string): LiquidityTier {
  if (!ticker) return "unknown";
  const up = ticker.toUpperCase();
  const base = stripSuffix(up);
  if (ETF_MAJORS.has(up) || ETF_MAJORS.has(base)) return "etf_majors";
  if (up.endsWith("-USD") || up.endsWith(".USD")) {
    return /^(BTC|ETH)/i.test(base) ? "crypto_majors" : "unknown";
  }
  const isIndian = /\.(NS|BO)$/i.test(up);
  if (isIndian) {
    if (IN_NIFTY50.has(base)) return "in_nifty50";
    // crude heuristic: 5+ char NSE tickers that aren't in nifty50 → assume small/mid
    return base.length >= 7 ? "in_smallcap" : "in_nifty500";
  }
  if (US_MEGACAP.has(up) || US_MEGACAP.has(base)) return "us_megacap";
  if (US_LARGECAP.has(up) || US_LARGECAP.has(base)) return "us_largecap";
  // 1–3 char US ticker that isn't in our largecap set → assume largecap-ish
  if (/^[A-Z]{1,3}$/.test(base)) return "us_largecap";
  // 4+ char unknown US ticker → small/micro cap
  if (/^[A-Z]{4,5}$/.test(base)) return "us_smallcap";
  return "unknown";
}

/** Round-trip cost as decimal (0.015 = 1.5%). */
export function costHaircut(ticker: string): number {
  return COST_BY_TIER[classifyLiquidity(ticker)];
}

export function tickerClass(ticker: string): string {
  return classifyLiquidity(ticker);
}