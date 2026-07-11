// CandidateGenerator — builds the scan universe from objective market
// sources. Nothing in this file is an "opportunity": these are candidates
// only, and every candidate must survive evidence collection, independent
// scoring, cross-validation and the validator before it can be shown.
//
// Two kinds of sources:
//   1. Market-activity screeners (Yahoo Finance predefined screeners and
//      trending tickers) — the market itself nominates names by observable
//      activity (volume, movement), not by our opinion.
//   2. Asset-class coverage instruments — the broad index / sector / bond /
//      commodity ETF grid that defines which markets the engine covers.
//      This is market COVERAGE (analogous to an index provider's universe
//      definition), not a curated picks list: coverage instruments receive
//      zero scoring privilege and are rejected like anything else when the
//      evidence is weak.
//
// If every dynamic source fails, the engine still runs on the coverage
// grid; if evidence collection then fails too, the honest result is an
// empty opportunity list — never a fabricated one.

import type { AssetClass, Candidate } from "./types.ts";

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

async function fetchJSON(url: string, timeoutMs = 8000): Promise<any | null> {
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" }, signal: controller.signal });
      if (!res.ok) return null;
      return await res.json();
    } finally {
      clearTimeout(t);
    }
  } catch {
    return null;
  }
}

function quoteTypeToAssetClass(quoteType: string | undefined, symbol: string): AssetClass {
  const qt = String(quoteType || "").toUpperCase();
  if (qt === "ETF") return "etf";
  if (qt === "INDEX") return "index";
  if (qt === "CRYPTOCURRENCY" || /-USD$/.test(symbol)) return "crypto";
  if (qt === "FUTURE" || /=F$/.test(symbol)) return "commodity";
  return "equity";
}

/** Yahoo predefined screeners — the market nominates candidates by activity. */
const SCREENER_IDS = [
  "most_actives",
  "day_gainers",
  "day_losers",
  "undervalued_large_caps",
  "growth_technology_stocks",
];

async function fetchScreenerCandidates(scrId: string, region: string, count: number): Promise<Candidate[]> {
  const url =
    `https://query1.finance.yahoo.com/v1/finance/screener/predefined/saved` +
    `?formatted=false&scrIds=${encodeURIComponent(scrId)}&count=${count}&region=${encodeURIComponent(region)}&lang=en-US`;
  const data = await fetchJSON(url);
  const quotes: any[] = data?.finance?.result?.[0]?.quotes ?? [];
  const out: Candidate[] = [];
  for (const q of quotes) {
    const symbol = String(q?.symbol || "").toUpperCase();
    if (!symbol || symbol.length > 16) continue;
    out.push({
      symbol,
      name: String(q?.shortName || q?.longName || symbol),
      assetClass: quoteTypeToAssetClass(q?.quoteType, symbol),
      exchange: q?.fullExchangeName ? String(q.fullExchangeName) : undefined,
      currency: q?.currency ? String(q.currency) : undefined,
      origin: {
        source: `screener:${scrId}`,
        reason: `Nominated by market activity — Yahoo predefined screener "${scrId}" (${region}).`,
      },
      snapshot: {
        price: Number(q?.regularMarketPrice) || undefined,
        changePct: Number.isFinite(Number(q?.regularMarketChangePercent)) ? Number(q.regularMarketChangePercent) : undefined,
        volume: Number(q?.regularMarketVolume) || undefined,
        avgVolume3M: Number(q?.averageDailyVolume3Month) || undefined,
        marketCap: Number(q?.marketCap) || undefined,
        fiftyTwoWeekHigh: Number(q?.fiftyTwoWeekHigh) || undefined,
        fiftyTwoWeekLow: Number(q?.fiftyTwoWeekLow) || undefined,
        trailingPE: Number(q?.trailingPE) || undefined,
      },
    });
  }
  return out;
}

async function fetchTrendingCandidates(region: string): Promise<Candidate[]> {
  const data = await fetchJSON(`https://query1.finance.yahoo.com/v1/finance/trending/${encodeURIComponent(region)}?count=25`);
  const quotes: any[] = data?.finance?.result?.[0]?.quotes ?? [];
  return quotes
    .map((q: any) => String(q?.symbol || "").toUpperCase())
    .filter((s: string) => s && s.length <= 16 && !s.startsWith("^"))
    .map((symbol: string) => ({
      symbol,
      name: symbol,
      assetClass: quoteTypeToAssetClass(undefined, symbol) as AssetClass,
      origin: {
        source: "trending",
        reason: `Elevated market attention — Yahoo trending tickers (${region}).`,
      },
    }));
}

// ── Asset-class coverage grid ───────────────────────────────────────
// Defines the markets the engine covers (broad index, sectors, duration,
// credit, commodities, international, crypto majors). These are candidates,
// not recommendations — they earn no score by being here.

interface CoverageRow { symbol: string; name: string; assetClass: AssetClass }

const US_COVERAGE: CoverageRow[] = [
  { symbol: "SPY", name: "SPDR S&P 500 ETF", assetClass: "etf" },
  { symbol: "QQQ", name: "Invesco QQQ Trust", assetClass: "etf" },
  { symbol: "IWM", name: "iShares Russell 2000 ETF", assetClass: "etf" },
  { symbol: "DIA", name: "SPDR Dow Jones Industrial Average ETF", assetClass: "etf" },
  { symbol: "XLK", name: "Technology Select Sector SPDR", assetClass: "etf" },
  { symbol: "XLF", name: "Financial Select Sector SPDR", assetClass: "etf" },
  { symbol: "XLE", name: "Energy Select Sector SPDR", assetClass: "etf" },
  { symbol: "XLV", name: "Health Care Select Sector SPDR", assetClass: "etf" },
  { symbol: "XLI", name: "Industrial Select Sector SPDR", assetClass: "etf" },
  { symbol: "XLP", name: "Consumer Staples Select Sector SPDR", assetClass: "etf" },
  { symbol: "XLY", name: "Consumer Discretionary Select Sector SPDR", assetClass: "etf" },
  { symbol: "XLU", name: "Utilities Select Sector SPDR", assetClass: "etf" },
  { symbol: "XLB", name: "Materials Select Sector SPDR", assetClass: "etf" },
  { symbol: "XLC", name: "Communication Services Select Sector SPDR", assetClass: "etf" },
  { symbol: "EEM", name: "iShares MSCI Emerging Markets ETF", assetClass: "etf" },
  { symbol: "EFA", name: "iShares MSCI EAFE ETF", assetClass: "etf" },
  { symbol: "TLT", name: "iShares 20+ Year Treasury Bond ETF", assetClass: "bond" },
  { symbol: "IEF", name: "iShares 7-10 Year Treasury Bond ETF", assetClass: "bond" },
  { symbol: "HYG", name: "iShares iBoxx High Yield Corporate Bond ETF", assetClass: "bond" },
  { symbol: "GLD", name: "SPDR Gold Shares", assetClass: "commodity" },
  { symbol: "SLV", name: "iShares Silver Trust", assetClass: "commodity" },
  { symbol: "USO", name: "United States Oil Fund", assetClass: "commodity" },
  { symbol: "DBC", name: "Invesco DB Commodity Index Fund", assetClass: "commodity" },
  { symbol: "BTC-USD", name: "Bitcoin", assetClass: "crypto" },
  { symbol: "ETH-USD", name: "Ethereum", assetClass: "crypto" },
];

const INDIA_COVERAGE: CoverageRow[] = [
  { symbol: "NIFTYBEES.NS", name: "Nippon India ETF Nifty 50 BeES", assetClass: "etf" },
  { symbol: "JUNIORBEES.NS", name: "Nippon India ETF Nifty Next 50", assetClass: "etf" },
  { symbol: "BANKBEES.NS", name: "Nippon India ETF Bank BeES", assetClass: "etf" },
  { symbol: "ITBEES.NS", name: "Nippon India ETF Nifty IT", assetClass: "etf" },
  { symbol: "PHARMABEES.NS", name: "Nippon India ETF Nifty Pharma", assetClass: "etf" },
  { symbol: "PSUBNKBEES.NS", name: "Nippon India ETF Nifty PSU Bank", assetClass: "etf" },
  { symbol: "GOLDBEES.NS", name: "Nippon India ETF Gold BeES", assetClass: "commodity" },
  { symbol: "SILVERBEES.NS", name: "Nippon India Silver ETF", assetClass: "commodity" },
];

function coverageCandidates(indiaMode: boolean): Candidate[] {
  const rows = indiaMode ? [...INDIA_COVERAGE, ...US_COVERAGE] : US_COVERAGE;
  return rows.map((r) => ({
    symbol: r.symbol,
    name: r.name,
    assetClass: r.assetClass,
    origin: {
      source: "coverage:asset_class_grid",
      reason: "Asset-class coverage instrument — part of the engine's defined market universe.",
    },
  }));
}

export interface UniverseResult {
  candidates: Candidate[];
  /** origin.source → count, for diagnostics. */
  sources: Record<string, number>;
  /** Dynamic sources that failed or returned nothing. */
  failedSources: string[];
}

/**
 * Build the candidate universe. Screener + trending sources run in
 * parallel; failures are recorded, never papered over.
 */
export async function generateUniverse(opts: {
  indiaMode: boolean;
  perScreener?: number;
  excludeSymbols?: string[];
}): Promise<UniverseResult> {
  const region = opts.indiaMode ? "IN" : "US";
  const perScreener = opts.perScreener ?? 25;

  const screenerTasks = SCREENER_IDS.map((id) =>
    fetchScreenerCandidates(id, region, perScreener)
      .then((c) => ({ id: `screener:${id}`, candidates: c }))
      .catch(() => ({ id: `screener:${id}`, candidates: [] as Candidate[] })),
  );
  const trendingTask = fetchTrendingCandidates(region)
    .then((c) => ({ id: "trending", candidates: c }))
    .catch(() => ({ id: "trending", candidates: [] as Candidate[] }));

  const results = await Promise.all([...screenerTasks, trendingTask]);

  const excluded = new Set((opts.excludeSymbols ?? []).map((s) => s.toUpperCase()));
  const seen = new Set<string>();
  const candidates: Candidate[] = [];
  const sources: Record<string, number> = {};
  const failedSources: string[] = [];

  const push = (c: Candidate) => {
    if (seen.has(c.symbol) || excluded.has(c.symbol)) return;
    seen.add(c.symbol);
    candidates.push(c);
    sources[c.origin.source] = (sources[c.origin.source] ?? 0) + 1;
  };

  for (const r of results) {
    if (r.candidates.length === 0) failedSources.push(r.id);
    for (const c of r.candidates) push(c);
  }
  for (const c of coverageCandidates(opts.indiaMode)) push(c);

  return { candidates, sources, failedSources };
}

/** Benchmark used for beta / relative strength / regime detection. */
export function benchmarkSymbol(indiaMode: boolean): string {
  return indiaMode ? "NIFTYBEES.NS" : "SPY";
}
