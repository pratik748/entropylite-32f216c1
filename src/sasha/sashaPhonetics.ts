/**
 * SASHA Financial Phonetic Pronunciation Engine
 *
 * Senior Quantitative Risk Officer vocal profile:
 * Translates financial symbols, ticker codes, mathematical Greek letters,
 * statistical metrics, and institutional acronyms into natural institutional
 * spoken English for zero-glitch text-to-speech rendering.
 *
 * Examples:
 *  - NVDA -> "NVIDIA"
 *  - AAPL -> "Apple"
 *  - VaR -> "V-A-R"
 *  - CVaR -> "C-V-A-R"
 *  - bps -> "basis points"
 *  - PnL / P&L -> "P and L"
 *  - σ -> "sigma"
 *  - β -> "beta"
 *  - 1d -> "one day"
 */

/** Known institutional company names for global tickers */
const TICKER_PRONUNCIATION_MAP: Record<string, string> = {
  NVDA: "NVIDIA",
  AAPL: "Apple",
  MSFT: "Microsoft",
  GOOGL: "Alphabet",
  GOOG: "Alphabet",
  AMZN: "Amazon",
  META: "Meta",
  TSLA: "Tesla",
  AMD: "A-M-D",
  INTC: "Intel",
  CRM: "Salesforce",
  ORCL: "Oracle",
  ADBE: "Adobe",
  AVGO: "Broadcom",
  PLTR: "Palantir",
  JPM: "J-P Morgan",
  BAC: "Bank of America",
  GS: "Goldman Sachs",
  MS: "Morgan Stanley",
  WFC: "Wells Fargo",
  C: "Citigroup",
  V: "Visa",
  MA: "Mastercard",
  XOM: "ExxonMobil",
  CVX: "Chevron",
  BP: "B-P",
  SHEL: "Shell",
  T: "A-T and T",
  VZ: "Verizon",
  PFE: "Pfizer",
  JNJ: "Johnson and Johnson",
  UNH: "UnitedHealth",
  WMT: "Walmart",
  COST: "Costco",
  KO: "Coca-Cola",
  PEP: "PepsiCo",
  NKE: "Nike",
  SPY: "S-P-Y",
  QQQ: "Q-Q-Q",
  IWM: "Russell ETF",
  VXX: "V-I-X",
  UVXY: "Ultra V-I-X",

  // Indian Equities (NSE / BSE)
  RELIANCE: "Reliance",
  "RELIANCE.NS": "Reliance",
  HDFCBANK: "H-D-F-C Bank",
  "HDFCBANK.NS": "H-D-F-C Bank",
  HDFC: "H-D-F-C",
  ICICIBANK: "I-C-I-C-I Bank",
  "ICICIBANK.NS": "I-C-I-C-I Bank",
  SBIN: "State Bank of India",
  "SBIN.NS": "State Bank of India",
  KOTAKBANK: "Kotak Bank",
  "KOTAKBANK.NS": "Kotak Bank",
  AXISBANK: "Axis Bank",
  "AXISBANK.NS": "Axis Bank",
  TCS: "T-C-S",
  "TCS.NS": "T-C-S",
  INFY: "Infosys",
  "INFY.NS": "Infosys",
  WIPRO: "Wipro",
  "WIPRO.NS": "Wipro",
  HCLTECH: "H-C-L Tech",
  "HCLTECH.NS": "H-C-L Tech",
  TATAMOTORS: "Tata Motors",
  "TATAMOTORS.NS": "Tata Motors",
  MARUTI: "Maruti Suzuki",
  "MARUTI.NS": "Maruti Suzuki",
  "M&M": "Mahindra",
  "M&M.NS": "Mahindra",
  SUNPHARMA: "Sun Pharma",
  "SUNPHARMA.NS": "Sun Pharma",
  DRREDDY: "Doctor Reddy's",
  "DRREDDY.NS": "Doctor Reddy's",
  ITC: "I-T-C",
  "ITC.NS": "I-T-C",
  LT: "L and T",
  "LT.NS": "L and T",
  ONGC: "O-N-G-C",
  "ONGC.NS": "O-N-G-C",
  NIFTY: "Nifty Fifty",
  "NIFTY 50": "Nifty Fifty",
  BANKNIFTY: "Bank Nifty",
  SENSEX: "Sensex",
};

/** Jargon, statistical metrics, and shorthand conversions */
const JARGON_REPLACEMENTS: Array<[RegExp, string]> = [
  // Value at Risk & Expected Shortfall
  [/\bCVaR95\b/gi, "C-V-A-R ninety-five"],
  [/\bVaR95\b/gi, "V-A-R ninety-five"],
  [/\bCVaR\b/g, "C-V-A-R"],
  [/\bVaR\b/g, "V-A-R"],
  [/\bES95\b/gi, "Expected Shortfall ninety-five"],

  // Quant & Stats
  [/\b(\d+(?:\.\d+)?)\s*bps\b/gi, "$1 basis points"],
  [/\bbps\b/gi, "basis points"],
  [/\bP&L\b/gi, "P and L"],
  [/\bPnL\b/gi, "P and L"],
  [/\bVIX\b/g, "V-I-X"],
  [/\bADF\b/g, "A-D-F"],
  [/\bOLS\b/g, "O-L-S"],
  [/\bR\^2\b/g, "R squared"],
  [/\bR²\b/g, "R squared"],

  // Time periods
  [/\b1d\b/gi, "one day"],
  [/\b(\d+)d\b/gi, "$1 days"],
  [/\b1m\b/gi, "one month"],
  [/\b3m\b/gi, "three month"],
  [/\b6m\b/gi, "six month"],
  [/\b1y\b/gi, "one year"],
  [/\b2y\b/gi, "two year"],
  [/\bYoY\b/gi, "year over year"],
  [/\bQoQ\b/gi, "quarter over quarter"],

  // Shorthands
  [/\bvol\b/gi, "volatility"],
  [/\bann\.\b/gi, "annualized"],
  [/\best\.\b/gi, "estimated"],
  [/\bwt\.\b/gi, "weight"],
  [/\bwt:\b/gi, "weight:"],
  [/\bvs\.?\b/gi, "versus"],
  [/\bE&P\b/gi, "exploration and production"],
  [/\bCapex\b/gi, "capital expenditure"],
  [/\bOPEC\+\b/gi, "OPEC Plus"],
  [/\bOPEC\b/gi, "OPEC"],
  [/\bFed\b/g, "Federal Reserve"],
];

/**
 * Transforms raw financial punchline text into clean institutional spoken phonetic text.
 */
export function toInstitutionalPhonetics(rawText: string): string {
  if (!rawText) return "";
  let text = rawText;

  // Replace known symbols / tickers (sorted by length descending so longer tickers like RELIANCE.NS match before RELIANCE)
  const sortedTickers = Object.entries(TICKER_PRONUNCIATION_MAP).sort(
    ([a], [b]) => b.length - a.length
  );

  for (const [ticker, spoken] of sortedTickers) {
    // Escape special regex characters in ticker (like .NS, &, etc.)
    const escaped = ticker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const regex = new RegExp(`(?<=^|[\\s(\\[{"'\\/,:;])${escaped}(?=[\\s)\\]}"'\\/,:;!?.]|$)`, "gi");
    text = text.replace(regex, spoken);
  }

  // Replace statistical jargon and shorthands
  for (const [pattern, replacement] of JARGON_REPLACEMENTS) {
    text = text.replace(pattern, replacement);
  }

  // Handle Greek characters directly (Unicode characters don't match ASCII word boundaries)
  text = text.replace(/α/g, "alpha");
  text = text.replace(/σ/g, "sigma");
  text = text.replace(/β/g, "beta");
  text = text.replace(/θ/g, "theta");
  text = text.replace(/λ/g, "lambda");
  text = text.replace(/μ/g, "mu");
  text = text.replace(/τ/g, "tau");
  text = text.replace(/δ/g, "delta");
  text = text.replace(/ρ/g, "rho");

  // Handle currency signs smoothly for TTS
  text = text.replace(/\$(\d+(?:,\d+)*(?:\.\d+)?)/g, "$1 dollars");
  text = text.replace(/₹(\d+(?:,\d+)*(?:\.\d+)?)/g, "$1 rupees");
  text = text.replace(/€(\d+(?:,\d+)*(?:\.\d+)?)/g, "$1 euros");
  text = text.replace(/£(\d+(?:,\d+)*(?:\.\d+)?)/g, "$1 pounds");

  // Handle minus percentages smoothly (e.g. "-2.5%" -> "minus 2.5 percent")
  text = text.replace(/-\s*(\d+(?:\.\d+)?)\s*%/g, "minus $1 percent");
  text = text.replace(/\+\s*(\d+(?:\.\d+)?)\s*%/g, "plus $1 percent");
  text = text.replace(/(\d+(?:\.\d+)?)\s*%/g, "$1 percent");

  // Clean double spaces
  text = text.replace(/\s+/g, " ").trim();

  return text;
}
