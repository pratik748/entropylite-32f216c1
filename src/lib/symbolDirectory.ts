// Curated symbol directory used for ticker auto-suggest in StockInput.
// Not exhaustive — covers the most-searched global names plus the Indian
// universe already supported by normalizeUserTicker. Matching is done on
// ticker, company name, and informal aliases (e.g. "Adani" -> ADANIENT.NS,
// "Netflix" -> NFLX).

export interface SymbolEntry {
  ticker: string;        // canonical symbol (normalized)
  name: string;          // company / asset name
  exchange: string;      // short label e.g. NASDAQ, NSE, CRYPTO, FX
  aliases?: string[];    // informal names users may type
  kind: "equity" | "crypto" | "fx" | "commodity" | "etf" | "index";
}

export const SYMBOL_DIRECTORY: SymbolEntry[] = [
  // ---- US mega-cap equities ----
  { ticker: "AAPL", name: "Apple Inc.", exchange: "NASDAQ", kind: "equity", aliases: ["apple"] },
  { ticker: "MSFT", name: "Microsoft Corp.", exchange: "NASDAQ", kind: "equity", aliases: ["microsoft"] },
  { ticker: "GOOGL", name: "Alphabet (Google) Class A", exchange: "NASDAQ", kind: "equity", aliases: ["google", "alphabet"] },
  { ticker: "GOOG", name: "Alphabet (Google) Class C", exchange: "NASDAQ", kind: "equity", aliases: ["google c"] },
  { ticker: "AMZN", name: "Amazon.com Inc.", exchange: "NASDAQ", kind: "equity", aliases: ["amazon"] },
  { ticker: "META", name: "Meta Platforms Inc.", exchange: "NASDAQ", kind: "equity", aliases: ["facebook", "meta"] },
  { ticker: "NFLX", name: "Netflix Inc.", exchange: "NASDAQ", kind: "equity", aliases: ["netflix"] },
  { ticker: "TSLA", name: "Tesla Inc.", exchange: "NASDAQ", kind: "equity", aliases: ["tesla"] },
  { ticker: "NVDA", name: "NVIDIA Corp.", exchange: "NASDAQ", kind: "equity", aliases: ["nvidia"] },
  { ticker: "AMD", name: "Advanced Micro Devices", exchange: "NASDAQ", kind: "equity", aliases: ["amd"] },
  { ticker: "INTC", name: "Intel Corp.", exchange: "NASDAQ", kind: "equity", aliases: ["intel"] },
  { ticker: "ORCL", name: "Oracle Corp.", exchange: "NYSE", kind: "equity", aliases: ["oracle"] },
  { ticker: "CRM", name: "Salesforce Inc.", exchange: "NYSE", kind: "equity", aliases: ["salesforce"] },
  { ticker: "ADBE", name: "Adobe Inc.", exchange: "NASDAQ", kind: "equity", aliases: ["adobe"] },
  { ticker: "AVGO", name: "Broadcom Inc.", exchange: "NASDAQ", kind: "equity", aliases: ["broadcom"] },
  { ticker: "PEP", name: "PepsiCo Inc.", exchange: "NASDAQ", kind: "equity", aliases: ["pepsi", "pepsico"] },
  { ticker: "KO", name: "Coca-Cola Co.", exchange: "NYSE", kind: "equity", aliases: ["coca cola", "coke"] },
  { ticker: "MCD", name: "McDonald's Corp.", exchange: "NYSE", kind: "equity", aliases: ["mcdonalds"] },
  { ticker: "SBUX", name: "Starbucks Corp.", exchange: "NASDAQ", kind: "equity", aliases: ["starbucks"] },
  { ticker: "NKE", name: "Nike Inc.", exchange: "NYSE", kind: "equity", aliases: ["nike"] },
  { ticker: "DIS", name: "Walt Disney Co.", exchange: "NYSE", kind: "equity", aliases: ["disney"] },
  { ticker: "BA", name: "Boeing Co.", exchange: "NYSE", kind: "equity", aliases: ["boeing"] },
  { ticker: "JPM", name: "JPMorgan Chase & Co.", exchange: "NYSE", kind: "equity", aliases: ["jpmorgan", "jp morgan"] },
  { ticker: "GS", name: "Goldman Sachs Group", exchange: "NYSE", kind: "equity", aliases: ["goldman", "goldman sachs"] },
  { ticker: "MS", name: "Morgan Stanley", exchange: "NYSE", kind: "equity", aliases: ["morgan stanley"] },
  { ticker: "BAC", name: "Bank of America Corp.", exchange: "NYSE", kind: "equity", aliases: ["bofa", "bank of america"] },
  { ticker: "WFC", name: "Wells Fargo & Co.", exchange: "NYSE", kind: "equity", aliases: ["wells fargo"] },
  { ticker: "V", name: "Visa Inc.", exchange: "NYSE", kind: "equity", aliases: ["visa"] },
  { ticker: "MA", name: "Mastercard Inc.", exchange: "NYSE", kind: "equity", aliases: ["mastercard"] },
  { ticker: "BRK-B", name: "Berkshire Hathaway B", exchange: "NYSE", kind: "equity", aliases: ["berkshire", "buffett"] },
  { ticker: "WMT", name: "Walmart Inc.", exchange: "NYSE", kind: "equity", aliases: ["walmart"] },
  { ticker: "COST", name: "Costco Wholesale", exchange: "NASDAQ", kind: "equity", aliases: ["costco"] },
  { ticker: "PFE", name: "Pfizer Inc.", exchange: "NYSE", kind: "equity", aliases: ["pfizer"] },
  { ticker: "JNJ", name: "Johnson & Johnson", exchange: "NYSE", kind: "equity", aliases: ["johnson"] },
  { ticker: "UNH", name: "UnitedHealth Group", exchange: "NYSE", kind: "equity", aliases: ["unitedhealth"] },
  { ticker: "XOM", name: "Exxon Mobil Corp.", exchange: "NYSE", kind: "equity", aliases: ["exxon"] },
  { ticker: "CVX", name: "Chevron Corp.", exchange: "NYSE", kind: "equity", aliases: ["chevron"] },
  { ticker: "T", name: "AT&T Inc.", exchange: "NYSE", kind: "equity", aliases: ["at&t", "att"] },
  { ticker: "VZ", name: "Verizon Communications", exchange: "NYSE", kind: "equity", aliases: ["verizon"] },
  { ticker: "UBER", name: "Uber Technologies", exchange: "NYSE", kind: "equity", aliases: ["uber"] },
  { ticker: "LYFT", name: "Lyft Inc.", exchange: "NASDAQ", kind: "equity", aliases: ["lyft"] },
  { ticker: "ABNB", name: "Airbnb Inc.", exchange: "NASDAQ", kind: "equity", aliases: ["airbnb"] },
  { ticker: "SHOP", name: "Shopify Inc.", exchange: "NYSE", kind: "equity", aliases: ["shopify"] },
  { ticker: "SQ", name: "Block Inc. (Square)", exchange: "NYSE", kind: "equity", aliases: ["square", "block"] },
  { ticker: "PYPL", name: "PayPal Holdings", exchange: "NASDAQ", kind: "equity", aliases: ["paypal"] },
  { ticker: "SPOT", name: "Spotify Technology", exchange: "NYSE", kind: "equity", aliases: ["spotify"] },
  { ticker: "PLTR", name: "Palantir Technologies", exchange: "NYSE", kind: "equity", aliases: ["palantir"] },
  { ticker: "COIN", name: "Coinbase Global", exchange: "NASDAQ", kind: "equity", aliases: ["coinbase"] },
  { ticker: "RBLX", name: "Roblox Corp.", exchange: "NYSE", kind: "equity", aliases: ["roblox"] },
  { ticker: "SNAP", name: "Snap Inc.", exchange: "NYSE", kind: "equity", aliases: ["snapchat", "snap"] },
  { ticker: "PINS", name: "Pinterest Inc.", exchange: "NYSE", kind: "equity", aliases: ["pinterest"] },
  { ticker: "X", name: "X (Twitter, private)", exchange: "—", kind: "equity", aliases: ["twitter"] },

  // ---- ETFs / indices ----
  { ticker: "SPY", name: "SPDR S&P 500 ETF", exchange: "NYSE", kind: "etf", aliases: ["sp500", "s&p 500"] },
  { ticker: "QQQ", name: "Invesco QQQ (Nasdaq-100)", exchange: "NASDAQ", kind: "etf", aliases: ["nasdaq", "nasdaq 100"] },
  { ticker: "DIA", name: "SPDR Dow Jones ETF", exchange: "NYSE", kind: "etf", aliases: ["dow", "dow jones"] },
  { ticker: "IWM", name: "iShares Russell 2000 ETF", exchange: "NYSE", kind: "etf", aliases: ["russell 2000"] },
  { ticker: "VTI", name: "Vanguard Total Market", exchange: "NYSE", kind: "etf", aliases: ["total market"] },
  { ticker: "^VIX", name: "CBOE Volatility Index", exchange: "CBOE", kind: "index", aliases: ["vix", "volatility"] },
  { ticker: "^GSPC", name: "S&P 500 Index", exchange: "INDEX", kind: "index", aliases: ["spx"] },
  { ticker: "^NSEI", name: "NIFTY 50 Index", exchange: "NSE", kind: "index", aliases: ["nifty"] },
  { ticker: "^BSESN", name: "BSE SENSEX", exchange: "BSE", kind: "index", aliases: ["sensex"] },

  // ---- Crypto ----
  { ticker: "BTC-USD", name: "Bitcoin", exchange: "CRYPTO", kind: "crypto", aliases: ["bitcoin", "btc"] },
  { ticker: "ETH-USD", name: "Ethereum", exchange: "CRYPTO", kind: "crypto", aliases: ["ethereum", "eth"] },
  { ticker: "SOL-USD", name: "Solana", exchange: "CRYPTO", kind: "crypto", aliases: ["solana", "sol"] },
  { ticker: "BNB-USD", name: "BNB", exchange: "CRYPTO", kind: "crypto", aliases: ["binance coin", "bnb"] },
  { ticker: "XRP-USD", name: "Ripple XRP", exchange: "CRYPTO", kind: "crypto", aliases: ["ripple", "xrp"] },
  { ticker: "DOGE-USD", name: "Dogecoin", exchange: "CRYPTO", kind: "crypto", aliases: ["doge", "dogecoin"] },
  { ticker: "ADA-USD", name: "Cardano", exchange: "CRYPTO", kind: "crypto", aliases: ["cardano", "ada"] },
  { ticker: "AVAX-USD", name: "Avalanche", exchange: "CRYPTO", kind: "crypto", aliases: ["avalanche", "avax"] },
  { ticker: "MATIC-USD", name: "Polygon", exchange: "CRYPTO", kind: "crypto", aliases: ["polygon", "matic"] },
  { ticker: "LINK-USD", name: "Chainlink", exchange: "CRYPTO", kind: "crypto", aliases: ["chainlink", "link"] },

  // ---- FX ----
  { ticker: "EURUSD=X", name: "EUR / USD", exchange: "FX", kind: "fx", aliases: ["euro", "eur"] },
  { ticker: "GBPUSD=X", name: "GBP / USD", exchange: "FX", kind: "fx", aliases: ["pound", "gbp"] },
  { ticker: "USDJPY=X", name: "USD / JPY", exchange: "FX", kind: "fx", aliases: ["yen", "jpy"] },
  { ticker: "USDINR=X", name: "USD / INR", exchange: "FX", kind: "fx", aliases: ["rupee", "inr"] },
  { ticker: "USDCNY=X", name: "USD / CNY", exchange: "FX", kind: "fx", aliases: ["yuan", "cny"] },
  { ticker: "DX-Y.NYB", name: "US Dollar Index (DXY)", exchange: "FX", kind: "fx", aliases: ["dxy", "dollar index"] },

  // ---- Commodities ----
  { ticker: "GC=F", name: "Gold Futures", exchange: "COMEX", kind: "commodity", aliases: ["gold"] },
  { ticker: "SI=F", name: "Silver Futures", exchange: "COMEX", kind: "commodity", aliases: ["silver"] },
  { ticker: "CL=F", name: "Crude Oil (WTI) Futures", exchange: "NYMEX", kind: "commodity", aliases: ["oil", "wti", "crude"] },
  { ticker: "BZ=F", name: "Brent Crude Futures", exchange: "ICE", kind: "commodity", aliases: ["brent"] },
  { ticker: "NG=F", name: "Natural Gas Futures", exchange: "NYMEX", kind: "commodity", aliases: ["natural gas", "gas"] },
  { ticker: "HG=F", name: "Copper Futures", exchange: "COMEX", kind: "commodity", aliases: ["copper"] },

  // ---- India NSE (Adani family + bluechips) ----
  { ticker: "ADANIENT.NS", name: "Adani Enterprises", exchange: "NSE", kind: "equity", aliases: ["adani", "adani enterprises"] },
  { ticker: "ADANIPORTS.NS", name: "Adani Ports & SEZ", exchange: "NSE", kind: "equity", aliases: ["adani ports"] },
  { ticker: "ADANIGREEN.NS", name: "Adani Green Energy", exchange: "NSE", kind: "equity", aliases: ["adani green"] },
  { ticker: "ADANIPOWER.NS", name: "Adani Power", exchange: "NSE", kind: "equity", aliases: ["adani power"] },
  { ticker: "ADANITRANS.NS", name: "Adani Energy Solutions", exchange: "NSE", kind: "equity", aliases: ["adani transmission", "adani energy"] },
  { ticker: "ATGL.NS", name: "Adani Total Gas", exchange: "NSE", kind: "equity", aliases: ["adani gas", "atgl"] },
  { ticker: "AWL.NS", name: "Adani Wilmar", exchange: "NSE", kind: "equity", aliases: ["adani wilmar", "awl"] },
  { ticker: "RELIANCE.NS", name: "Reliance Industries", exchange: "NSE", kind: "equity", aliases: ["reliance", "ril"] },
  { ticker: "TCS.NS", name: "Tata Consultancy Services", exchange: "NSE", kind: "equity", aliases: ["tcs", "tata consultancy"] },
  { ticker: "INFY.NS", name: "Infosys", exchange: "NSE", kind: "equity", aliases: ["infosys", "infy"] },
  { ticker: "WIPRO.NS", name: "Wipro", exchange: "NSE", kind: "equity", aliases: ["wipro"] },
  { ticker: "HCLTECH.NS", name: "HCL Technologies", exchange: "NSE", kind: "equity", aliases: ["hcl", "hcl tech"] },
  { ticker: "TECHM.NS", name: "Tech Mahindra", exchange: "NSE", kind: "equity", aliases: ["tech mahindra", "techm"] },
  { ticker: "HDFCBANK.NS", name: "HDFC Bank", exchange: "NSE", kind: "equity", aliases: ["hdfc", "hdfc bank"] },
  { ticker: "ICICIBANK.NS", name: "ICICI Bank", exchange: "NSE", kind: "equity", aliases: ["icici", "icici bank"] },
  { ticker: "SBIN.NS", name: "State Bank of India", exchange: "NSE", kind: "equity", aliases: ["sbi", "state bank"] },
  { ticker: "KOTAKBANK.NS", name: "Kotak Mahindra Bank", exchange: "NSE", kind: "equity", aliases: ["kotak"] },
  { ticker: "AXISBANK.NS", name: "Axis Bank", exchange: "NSE", kind: "equity", aliases: ["axis"] },
  { ticker: "BHARTIARTL.NS", name: "Bharti Airtel", exchange: "NSE", kind: "equity", aliases: ["airtel", "bharti"] },
  { ticker: "ITC.NS", name: "ITC Ltd.", exchange: "NSE", kind: "equity", aliases: ["itc"] },
  { ticker: "LT.NS", name: "Larsen & Toubro", exchange: "NSE", kind: "equity", aliases: ["l&t", "larsen", "lt"] },
  { ticker: "MARUTI.NS", name: "Maruti Suzuki", exchange: "NSE", kind: "equity", aliases: ["maruti", "suzuki"] },
  { ticker: "TATAMOTORS.NS", name: "Tata Motors", exchange: "NSE", kind: "equity", aliases: ["tata motors"] },
  { ticker: "TATASTEEL.NS", name: "Tata Steel", exchange: "NSE", kind: "equity", aliases: ["tata steel"] },
  { ticker: "SUNPHARMA.NS", name: "Sun Pharmaceutical", exchange: "NSE", kind: "equity", aliases: ["sun pharma"] },
  { ticker: "TITAN.NS", name: "Titan Company", exchange: "NSE", kind: "equity", aliases: ["titan"] },
  { ticker: "BAJFINANCE.NS", name: "Bajaj Finance", exchange: "NSE", kind: "equity", aliases: ["bajaj finance"] },
  { ticker: "BAJAJFINSV.NS", name: "Bajaj Finserv", exchange: "NSE", kind: "equity", aliases: ["bajaj finserv"] },
  { ticker: "HINDUNILVR.NS", name: "Hindustan Unilever", exchange: "NSE", kind: "equity", aliases: ["hul", "hindustan unilever"] },
  { ticker: "NESTLEIND.NS", name: "Nestle India", exchange: "NSE", kind: "equity", aliases: ["nestle"] },
  { ticker: "DMART.NS", name: "Avenue Supermarts (DMart)", exchange: "NSE", kind: "equity", aliases: ["dmart", "avenue"] },
  { ticker: "ETERNAL.NS", name: "Eternal Ltd. (Zomato)", exchange: "NSE", kind: "equity", aliases: ["zomato", "eternal"] },
  { ticker: "PAYTM.NS", name: "One 97 (Paytm)", exchange: "NSE", kind: "equity", aliases: ["paytm"] },
  { ticker: "NYKAA.NS", name: "FSN E-Commerce (Nykaa)", exchange: "NSE", kind: "equity", aliases: ["nykaa"] },
  { ticker: "JIOFIN.NS", name: "Jio Financial Services", exchange: "NSE", kind: "equity", aliases: ["jio", "jio financial"] },
  { ticker: "IRCTC.NS", name: "Indian Railway Catering (IRCTC)", exchange: "NSE", kind: "equity", aliases: ["irctc"] },
  { ticker: "TRENT.NS", name: "Trent Ltd. (Tata)", exchange: "NSE", kind: "equity", aliases: ["trent", "westside"] },
];

function tokenScore(haystack: string, q: string): number {
  if (!haystack) return 0;
  const h = haystack.toLowerCase();
  if (h === q) return 100;
  if (h.startsWith(q)) return 80;
  // word-boundary prefix match (e.g. "Adani Ports" matched by "ports")
  const words = h.split(/[^a-z0-9]+/);
  if (words.some((w) => w.startsWith(q))) return 60;
  if (h.includes(q)) return 40;
  return 0;
}

export function searchSymbols(query: string, limit = 8): SymbolEntry[] {
  const q = (query || "").trim().toLowerCase();
  if (q.length < 1) return [];

  const scored: { entry: SymbolEntry; score: number }[] = [];
  for (const entry of SYMBOL_DIRECTORY) {
    let score = 0;
    score = Math.max(score, tokenScore(entry.ticker, q));
    // strip exchange suffix for cleaner ticker matching (e.g. "ADANIENT" from "ADANIENT.NS")
    const baseTicker = entry.ticker.split(/[.\-=^]/)[0];
    score = Math.max(score, tokenScore(baseTicker, q) - 5);
    score = Math.max(score, tokenScore(entry.name, q) - 10);
    for (const a of entry.aliases || []) {
      score = Math.max(score, tokenScore(a, q) - 5);
    }
    if (score > 0) scored.push({ entry, score });
  }

  scored.sort((a, b) => b.score - a.score || a.entry.ticker.localeCompare(b.entry.ticker));
  return scored.slice(0, limit).map((s) => s.entry);
}