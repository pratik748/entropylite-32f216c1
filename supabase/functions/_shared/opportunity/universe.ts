// CandidateGenerator — builds the scan universe from objective market
// sources. Nothing in this file is an "opportunity": these are candidates
// only, and every candidate must survive evidence collection, independent
// scoring, cross-validation and the validator before it can be shown.
//
// Three kinds of sources, in priority order:
//   1. FULL EXCHANGE DIRECTORY (primary discovery) — the complete NASDAQ +
//      NYSE/AMEX/ARCA listing files (~8–10k issues), filtered for exchange
//      quality and issue type (no test issues, warrants, units, rights,
//      preferreds, deficient/delinquent filers). One rotating shard of the
//      directory is scanned per run, so the entire listed market is covered
//      across successive runs without inheriting any screener's selection
//      bias. Candidates emerge from their own measured price action.
//      Survivorship note: listing files contain today's ACTIVE issues; the
//      engine evaluates the live tradeable market, and all per-symbol
//      statistics (walk-forward, vol) are computed on each symbol's own
//      history, so no cross-sectional survivorship adjustment is applied.
//   2. Market-attention sources (Yahoo predefined screeners + trending) —
//      supplementary only: they surface names with unusual activity faster
//      than shard rotation would, but confer zero scoring privilege.
//   3. Asset-class coverage grid — the broad index / sector / bond /
//      commodity ETF set that defines which markets the engine covers
//      (analogous to an index provider's universe definition).
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

async function fetchText(url: string, timeoutMs = 12000): Promise<string | null> {
  try {
    const controller = new AbortController();
    const t = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { headers: { "User-Agent": UA }, signal: controller.signal });
      if (!res.ok) return null;
      return await res.text();
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

// ── Full exchange directory (primary discovery source) ─────────────

interface DirectoryEntry {
  symbol: string;
  name: string;
  isEtf: boolean;
  exchange: string;
}

let directoryCache: { entries: DirectoryEntry[]; expires: number } | null = null;
const DIRECTORY_TTL_MS = 12 * 60 * 60 * 1000;

/** Symbols that are structurally not common-equity candidates: warrants,
 *  rights, units, when-issued, preferred series, notes. */
function isJunkIssue(symbol: string, name: string): boolean {
  if (!/^[A-Z]{1,5}$/.test(symbol)) return true;         // $ . = suffixed issues
  if (/warrant|right(s)?\b| unit(s)?\b|preferred|%|due \d{4}|notes\b/i.test(name)) return true;
  return false;
}

/**
 * Complete NASDAQ + NYSE/AMEX/ARCA listing directory with exchange-quality
 * and corporate-structure filters applied. Cached per isolate for 12h.
 */
export async function fetchExchangeDirectory(): Promise<DirectoryEntry[]> {
  if (directoryCache && directoryCache.expires > Date.now()) return directoryCache.entries;

  const [nasdaq, other] = await Promise.all([
    fetchText("https://www.nasdaqtrader.com/dynamic/SymDir/nasdaqlisted.txt"),
    fetchText("https://www.nasdaqtrader.com/dynamic/SymDir/otherlisted.txt"),
  ]);

  const entries: DirectoryEntry[] = [];

  // nasdaqlisted: Symbol|Security Name|Market Category|Test Issue|Financial Status|Round Lot Size|ETF|NextShares
  for (const line of (nasdaq ?? "").split("\n").slice(1)) {
    const cols = line.split("|");
    if (cols.length < 8 || line.startsWith("File Creation")) continue;
    const [symbol, name, category, testIssue, finStatus, , etf] = cols;
    if (testIssue === "Y") continue;
    if (finStatus && finStatus !== "N") continue;       // deficient/delinquent/bankrupt filers out
    if (category !== "Q" && category !== "G" && category !== "S") continue; // NASDAQ tiers only
    if (isJunkIssue(symbol, name)) continue;
    entries.push({ symbol, name, isEtf: etf === "Y", exchange: "NASDAQ" });
  }

  // otherlisted: ACT Symbol|Security Name|Exchange|CQS Symbol|ETF|Round Lot Size|Test Issue|NASDAQ Symbol
  const exchangeNames: Record<string, string> = { A: "NYSE American", N: "NYSE", P: "NYSE Arca", Z: "Cboe BZX" };
  for (const line of (other ?? "").split("\n").slice(1)) {
    const cols = line.split("|");
    if (cols.length < 8 || line.startsWith("File Creation")) continue;
    const [symbol, name, exchange, , etf, , testIssue] = cols;
    if (testIssue === "Y") continue;
    if (!(exchange in exchangeNames)) continue;          // exchange-quality filter
    if (isJunkIssue(symbol, name)) continue;
    entries.push({ symbol, name, isEtf: etf === "Y", exchange: exchangeNames[exchange] });
  }

  entries.sort((a, b) => a.symbol.localeCompare(b.symbol));
  if (entries.length > 0) directoryCache = { entries, expires: Date.now() + DIRECTORY_TTL_MS };
  return entries;
}

// Shard-scan bounds: one edge invocation cannot chart-scan 8–10k symbols,
// so each run scans a contiguous shard (rotated daily) and nominates the
// shard's strongest absolute movers into the candidate pool. Full market
// coverage is achieved across successive runs.
const SHARD_SIZE = 300;
const SPARK_BATCH = 20;
const SHARD_NOMINEES = 30;

async function sparkCloses(symbols: string[]): Promise<Map<string, number[]>> {
  const out = new Map<string, number[]>();
  const url =
    `https://query1.finance.yahoo.com/v8/finance/spark?symbols=${encodeURIComponent(symbols.join(","))}` +
    `&range=1mo&interval=1d`;
  const data = await fetchJSON(url);
  if (!data || typeof data !== "object") return out;
  for (const sym of symbols) {
    const closes = (data as Record<string, any>)[sym]?.close;
    if (Array.isArray(closes)) {
      const clean = closes.map(Number).filter((c) => Number.isFinite(c) && c > 0);
      if (clean.length >= 10) out.set(sym, clean);
    }
  }
  return out;
}

/**
 * Scan today's directory shard and nominate the strongest absolute movers.
 * Nomination is purely observational (the symbol's own 21-day move); the
 * real liquidity and validation gates run later in the pipeline.
 */
export async function directoryShardCandidates(): Promise<Candidate[]> {
  const directory = await fetchExchangeDirectory();
  if (directory.length === 0) return [];

  const shardCount = Math.max(1, Math.ceil(directory.length / SHARD_SIZE));
  const dayIndex = Math.floor(Date.now() / 86_400_000);
  const shardIndex = dayIndex % shardCount;
  const shard = directory.slice(shardIndex * SHARD_SIZE, (shardIndex + 1) * SHARD_SIZE);

  const batches: string[][] = [];
  for (let i = 0; i < shard.length; i += SPARK_BATCH) {
    batches.push(shard.slice(i, i + SPARK_BATCH).map((e) => e.symbol));
  }

  const scored: Array<{ entry: DirectoryEntry; move: number; lastClose: number }> = [];
  // Sequential-ish with small parallelism to stay polite to the endpoint.
  const CONC = 5;
  for (let i = 0; i < batches.length; i += CONC) {
    const results = await Promise.all(batches.slice(i, i + CONC).map((b) => sparkCloses(b).catch(() => new Map<string, number[]>())));
    for (const map of results) {
      for (const [sym, closes] of map) {
        const entry = shard.find((e) => e.symbol === sym);
        if (!entry) continue;
        const lastClose = closes[closes.length - 1];
        if (lastClose < 2) continue;                     // sub-$2 issues out (quality floor)
        const first = closes[0];
        const move = first > 0 ? Math.abs(lastClose - first) / first : 0;
        scored.push({ entry, move, lastClose });
      }
    }
  }

  scored.sort((a, b) => b.move - a.move);
  return scored.slice(0, SHARD_NOMINEES).map(({ entry }) => ({
    symbol: entry.symbol,
    name: entry.name,
    assetClass: (entry.isEtf ? "etf" : "equity") as AssetClass,
    exchange: entry.exchange,
    currency: "USD",
    origin: {
      source: "directory:shard_scan",
      reason: `Nominated from the full ${entry.exchange} listing directory by its own 21-day price action (rotating whole-market shard scan).`,
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

/** Pure coverage-grid universe — also used by the browser fallback venue. */
export function coverageCandidates(indiaMode: boolean): Candidate[] {
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
 * Build the candidate universe. All dynamic sources run in parallel;
 * failures are recorded, never papered over.
 *
 * Priority when the engine later caps universe size: coverage grid first
 * (small, defines market breadth), then whole-market directory nominees
 * (primary discovery), then attention sources (supplementary).
 *
 * India mode: no free full-exchange directory is reliably available for
 * NSE/BSE, so discovery there uses region screeners + the coverage grid —
 * a documented data limitation, not a design choice.
 */
export async function generateUniverse(opts: {
  indiaMode: boolean;
  perScreener?: number;
  excludeSymbols?: string[];
}): Promise<UniverseResult> {
  const region = opts.indiaMode ? "IN" : "US";
  const perScreener = opts.perScreener ?? 25;

  const directoryTask = opts.indiaMode
    ? Promise.resolve({ id: "directory:shard_scan", candidates: [] as Candidate[] })
    : directoryShardCandidates()
      .then((c) => ({ id: "directory:shard_scan", candidates: c }))
      .catch(() => ({ id: "directory:shard_scan", candidates: [] as Candidate[] }));
  const screenerTasks = SCREENER_IDS.map((id) =>
    fetchScreenerCandidates(id, region, perScreener)
      .then((c) => ({ id: `screener:${id}`, candidates: c }))
      .catch(() => ({ id: `screener:${id}`, candidates: [] as Candidate[] })),
  );
  const trendingTask = fetchTrendingCandidates(region)
    .then((c) => ({ id: "trending", candidates: c }))
    .catch(() => ({ id: "trending", candidates: [] as Candidate[] }));

  const [directory, trending, ...screeners] = await Promise.all([directoryTask, trendingTask, ...screenerTasks]);

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

  // Order = survival priority under the engine's universe cap.
  for (const c of coverageCandidates(opts.indiaMode)) push(c);
  if (directory.candidates.length === 0 && !opts.indiaMode) failedSources.push(directory.id);
  for (const c of directory.candidates) push(c);
  for (const r of screeners) {
    if (r.candidates.length === 0) failedSources.push(r.id);
    for (const c of r.candidates) push(c);
  }
  if (trending.candidates.length === 0) failedSources.push(trending.id);
  for (const c of trending.candidates) push(c);

  return { candidates, sources, failedSources };
}

/** Benchmark used for beta / relative strength / regime detection. */
export function benchmarkSymbol(indiaMode: boolean): string {
  return indiaMode ? "NIFTYBEES.NS" : "SPY";
}
