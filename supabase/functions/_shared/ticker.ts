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

function dedupe(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function normalizeIndianBase(rawBase: string): string {
  const compact = rawBase.replace(/[^A-Z0-9]/g, "");
  return INDIAN_ALIASES[compact] || compact;
}

export function normalizeTickerInput(rawTicker: string): string {
  let ticker = (rawTicker || "").trim().toUpperCase();
  if (!ticker) return "";

  ticker = ticker
    .replace(/\.NSE$/, ".NS")
    .replace(/\.BSE$/, ".BO")
    .replace(/^NSE\s*:\s*/i, "")
    .replace(/^BSE\s*:\s*/i, "")
    .replace(/\s+/g, " ");

  const exchange = /\.NS$/.test(ticker) ? "NS" : /\.BO$/.test(ticker) ? "BO" : null;
  const rawBase = ticker.replace(/\.(NS|BO)$/, "");
  const normalizedBase = normalizeIndianBase(rawBase);
  const looksIndian = Boolean(exchange) || KNOWN_INDIAN_BASE.has(normalizedBase);

  if (looksIndian) {
    return `${normalizedBase}.${exchange || "NS"}`;
  }

  // Keep global symbols untouched, except collapse accidental spaces for plain tickers
  if (!/[=\-^:.]/.test(ticker) && ticker.includes(" ")) {
    return ticker.replace(/\s+/g, "");
  }

  return ticker;
}

export function isIndianTicker(ticker: string): boolean {
  const normalized = normalizeTickerInput(ticker);
  if (!normalized) return false;
  if (normalized.endsWith(".NS") || normalized.endsWith(".BO")) return true;
  const compact = normalized.replace(/[^A-Z0-9]/g, "");
  return KNOWN_INDIAN_BASE.has(compact);
}

export function buildTickerCandidates(rawTicker: string): string[] {
  const normalized = normalizeTickerInput(rawTicker);
  if (!normalized) return [];

  const isIndian = isIndianTicker(normalized);
  const hasExchange = /\.(NS|BO)$/.test(normalized);
  const base = normalized.replace(/\.(NS|BO)$/, "");

  if (!isIndian) {
    return [normalized];
  }

  if (normalized.endsWith(".NS")) {
    return dedupe([normalized, `${base}.BO`, base]);
  }

  if (normalized.endsWith(".BO")) {
    return dedupe([normalized, `${base}.NS`, base]);
  }

  if (hasExchange) {
    return dedupe([normalized, base]);
  }

  return dedupe([`${base}.NS`, `${base}.BO`, base]);
}
