const KNOWN_INDIAN_BASE = new Set([
  "WIPRO", "TCS", "INFY", "RELIANCE", "HDFCBANK", "ICICIBANK", "SBIN", "TATAMOTORS", "BHARTIARTL", "ITC",
  "KOTAKBANK", "LT", "AXISBANK", "MARUTI", "SUNPHARMA", "TITAN", "BAJFINANCE", "HCLTECH", "ADANIENT", "ADANIPORTS",
  "TECHM", "HINDUNILVR", "POWERGRID", "NTPC", "ONGC", "COALINDIA", "BPCL", "JSWSTEEL", "TATASTEEL", "DRREDDY",
  "CIPLA", "DIVISLAB", "ULTRACEMCO", "GRASIM", "NESTLEIND", "BAJAJFINSV", "HEROMOTOCO", "EICHERMOT", "APOLLOHOSP",
  "HINDALCO", "VEDL", "MRF", "IRCTC", "ETERNAL", "ZOMATO", "PAYTM", "NYKAA", "DMART", "TRENT", "JIOFIN",
]);

const INDIAN_ALIASES: Record<string, string> = {
  ZOMATO: "ETERNAL",
  ETERNAL: "ETERNAL",
  TATASTEEL: "TATASTEEL",
  TATASTEELLTD: "TATASTEEL",
  TATASTEELLIMITED: "TATASTEEL",
};

function normalizeIndianBase(rawBase: string): string {
  const compact = rawBase.replace(/[^A-Z0-9]/g, "");
  return INDIAN_ALIASES[compact] || compact;
}

export function normalizeUserTicker(rawTicker: string): string {
  let ticker = (rawTicker || "").trim().toUpperCase();
  if (!ticker) return "";

  ticker = ticker
    .replace(/\.NSE$/, ".NS")
    .replace(/\.BSE$/, ".BO")
    .replace(/^NSE\s*:\s*/i, "")
    .replace(/^BSE\s*:\s*/i, "")
    .replace(/\s+/g, " ");

  const exchange = /\.NS$/.test(ticker) ? "NS" : /\.BO$/.test(ticker) ? "BO" : null;
  const base = normalizeIndianBase(ticker.replace(/\.(NS|BO)$/, ""));
  const looksIndian = Boolean(exchange) || KNOWN_INDIAN_BASE.has(base);

  if (looksIndian) {
    return `${base}.${exchange || "NS"}`;
  }

  if (!/[=\-^:.]/.test(ticker) && ticker.includes(" ")) {
    return ticker.replace(/\s+/g, "");
  }

  return ticker;
}
