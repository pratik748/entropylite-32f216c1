// EvidenceCollectors — gather observable signals for each candidate.
//
// Collectors are independent and fail independently. A collector that
// returns nothing is recorded in `missing` so the final object can report
// its own data quality honestly. No collector ever synthesizes values.
//
// Collectors:
//   price_history  — Yahoo daily chart (1y) → returns/vol/trend/volume features
//   yahoo_summary  — fundamentals, analyst state (finalists only, expensive)
//   gdelt_news     — article tone + headline evidence (finalists only)

import { fetchYahooSummary } from "../liveData.ts";
import { returnMoments } from "../mathEdge.ts";
import type {
  Candidate,
  EvidenceBundle,
  EvidenceItem,
  FundamentalFeatures,
  PriceFeatures,
  SentimentFeatures,
} from "./types.ts";

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

/** Bounded-concurrency map so we don't hammer upstream data sources. */
export async function pMap<T, R>(items: T[], fn: (item: T) => Promise<R>, concurrency = 8): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  });
  await Promise.all(workers);
  return out;
}

// ── price_history collector ─────────────────────────────────────────

export interface ChartSeries {
  closes: number[];
  volumes: number[];
  currency?: string;
}

const chartCache = new Map<string, { data: ChartSeries | null; expires: number }>();
const CHART_TTL_MS = 10 * 60 * 1000;

export async function fetchDailyChart(symbol: string, timeoutMs = 8000): Promise<ChartSeries | null> {
  const key = symbol.toUpperCase();
  const hit = chartCache.get(key);
  if (hit && hit.expires > Date.now()) return hit.data;

  const url =
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}` +
    `?range=1y&interval=1d&includePrePost=false&events=div%2Csplit`;
  const data = await fetchJSON(url, timeoutMs);
  const result = data?.chart?.result?.[0];
  const quote = result?.indicators?.quote?.[0];
  const rawCloses: unknown[] = quote?.close ?? [];
  const rawVolumes: unknown[] = quote?.volume ?? [];

  const closes: number[] = [];
  const volumes: number[] = [];
  for (let i = 0; i < rawCloses.length; i++) {
    const c = Number(rawCloses[i]);
    if (Number.isFinite(c) && c > 0) {
      closes.push(c);
      const v = Number(rawVolumes[i]);
      volumes.push(Number.isFinite(v) && v >= 0 ? v : 0);
    }
  }
  const series = closes.length >= 2
    ? { closes, volumes, currency: result?.meta?.currency ? String(result.meta.currency) : undefined }
    : null;
  chartCache.set(key, { data: series, expires: Date.now() + CHART_TTL_MS });
  return series;
}

function mean(xs: number[]): number {
  if (xs.length === 0) return 0;
  let s = 0;
  for (const x of xs) s += x;
  return s / xs.length;
}

function stdev(xs: number[]): number {
  if (xs.length < 2) return 0;
  const m = mean(xs);
  let s = 0;
  for (const x of xs) s += (x - m) ** 2;
  return Math.sqrt(s / (xs.length - 1));
}

function simpleReturn(closes: number[], window: number): number {
  if (closes.length <= window) return 0;
  const a = closes[closes.length - 1 - window];
  const b = closes[closes.length - 1];
  return a > 0 ? (b - a) / a : 0;
}

function rsi14(closes: number[]): number {
  const period = 14;
  if (closes.length < period + 1) return 50;
  let gain = 0, loss = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const d = closes[i] - closes[i - 1];
    if (d > 0) gain += d; else loss -= d;
  }
  if (gain + loss === 0) return 50;
  const rs = loss === 0 ? Infinity : gain / loss;
  return 100 - 100 / (1 + rs);
}

function annualizedVol(closes: number[]): number {
  const rets: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    if (closes[i - 1] > 0) rets.push(Math.log(closes[i] / closes[i - 1]));
  }
  return stdev(rets) * Math.sqrt(252);
}

function olsBeta(assetCloses: number[], benchCloses: number[]): number | null {
  const n = Math.min(assetCloses.length, benchCloses.length);
  if (n < 60) return null;
  const a = assetCloses.slice(-n);
  const b = benchCloses.slice(-n);
  const ra: number[] = [], rb: number[] = [];
  for (let i = 1; i < n; i++) {
    if (a[i - 1] > 0 && b[i - 1] > 0) {
      ra.push(Math.log(a[i] / a[i - 1]));
      rb.push(Math.log(b[i] / b[i - 1]));
    }
  }
  const mb = mean(rb), ma = mean(ra);
  let cov = 0, varB = 0;
  for (let i = 0; i < ra.length; i++) {
    cov += (ra[i] - ma) * (rb[i] - mb);
    varB += (rb[i] - mb) ** 2;
  }
  return varB > 0 ? cov / varB : null;
}

export function computePriceFeatures(series: ChartSeries, benchmark: ChartSeries | null): PriceFeatures {
  const { closes, volumes } = series;
  const lastClose = closes[closes.length - 1];

  const sma = (w: number): number | null => {
    if (closes.length < w) return null;
    return mean(closes.slice(-w));
  };
  const sma50v = sma(50) ?? mean(closes);
  const sma200v = sma(200);

  const peak = Math.max(...closes);
  const low52 = Math.min(...closes);
  let maxDD = 0, runPeak = closes[0];
  for (const c of closes) {
    if (c > runPeak) runPeak = c;
    const dd = (runPeak - c) / runPeak;
    if (dd > maxDD) maxDD = dd;
  }

  const last50 = closes.slice(-50);
  const sd50 = stdev(last50);
  const vol20 = volumes.slice(-21, -1);
  const volMean20 = mean(vol20);
  const volSd20 = stdev(vol20);
  const todayVol = volumes[volumes.length - 1] ?? 0;

  const dollarVol = mean(
    closes.slice(-20).map((c, i) => c * (volumes[volumes.length - 20 + i] ?? 0)),
  );

  const half = Math.floor(closes.length / 2);
  const moments = returnMoments(closes);

  return {
    bars: closes.length,
    lastClose,
    currency: series.currency,
    ret5d: simpleReturn(closes, 5),
    ret21d: simpleReturn(closes, 21),
    ret63d: simpleReturn(closes, 63),
    ret126d: simpleReturn(closes, 126),
    volAnnual: moments.sigmaAnnual,
    volAnnualPrev: annualizedVol(closes.slice(0, half)),
    maxDrawdown1y: maxDD,
    drawdownFromPeak: peak > 0 ? (peak - lastClose) / peak : 0,
    rsi14: rsi14(closes),
    sma50: sma50v,
    sma200: sma200v,
    pctFrom52wHigh: peak > 0 ? (lastClose - peak) / peak : 0,
    pctFrom52wLow: low52 > 0 ? (lastClose - low52) / low52 : 0,
    zScore50d: sd50 > 0 ? (lastClose - sma50v) / sd50 : 0,
    volumeZ20: volSd20 > 0 ? (todayVol - volMean20) / volSd20 : 0,
    avgDollarVolume20d: dollarVol,
    skew: moments.skew,
    excessKurt: moments.excessKurt,
    betaVsBenchmark: benchmark ? olsBeta(closes, benchmark.closes) : null,
    relStrength63d: benchmark
      ? simpleReturn(closes, 63) - simpleReturn(benchmark.closes, 63)
      : null,
    closes,
  };
}

// ── gdelt_news collector ────────────────────────────────────────────

const POSITIVE_WORDS = ["beat", "beats", "upside", "raised", "growth", "surge", "record", "strong", "upgrade", "upgrades", "bullish", "outperform", "rebound", "expands"];
const NEGATIVE_WORDS = ["miss", "misses", "cut", "cuts", "downgrade", "downgraded", "weak", "lawsuit", "probe", "bearish", "slowdown", "warning", "decline", "selloff", "slump"];

function lexicalScore(headline: string): number {
  const t = headline.toLowerCase();
  let s = 0;
  for (const w of POSITIVE_WORDS) if (t.includes(w)) s += 1;
  for (const w of NEGATIVE_WORDS) if (t.includes(w)) s -= 1;
  return s;
}

function parseTone(toneRaw: unknown): number {
  if (typeof toneRaw === "number") return toneRaw;
  if (typeof toneRaw === "string") {
    const n = Number(toneRaw.split(",")[0]);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

export async function fetchNewsSentiment(symbol: string, name: string): Promise<SentimentFeatures | null> {
  const base = symbol.replace(/\.(NS|BO)$/i, "").replace(/-USD$/i, "");
  const safeName = name.replace(/"/g, "").trim();
  const nameQuery = safeName && safeName.toUpperCase() !== base ? ` OR "${safeName}"` : "";
  const query = `"${base}" OR "$${base}"${nameQuery} (earnings OR guidance OR outlook OR revenue OR analyst OR stock)`;
  const url = `https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(query)}&mode=ArtList&maxrecords=20&format=json&sort=DateDesc`;
  const data = await fetchJSON(url, 5000);
  const articles: any[] = Array.isArray(data?.articles) ? data.articles.slice(0, 20) : [];
  if (articles.length === 0) return null;

  let toneSum = 0, lexSum = 0, w = 0;
  for (let i = 0; i < articles.length; i++) {
    const weight = Math.max(0.35, 1 - i * 0.05);
    toneSum += parseTone(articles[i]?.tone) * weight;
    lexSum += lexicalScore(String(articles[i]?.title || "")) * weight;
    w += weight;
  }
  return {
    articleCount: articles.length,
    avgTone: w > 0 ? toneSum / w : 0,
    lexicalScore: w > 0 ? lexSum / w : 0,
    topHeadline: String(articles[0]?.title || "").slice(0, 180) || null,
  };
}

// ── yahoo_summary collector ─────────────────────────────────────────

export async function fetchFundamentals(symbol: string): Promise<FundamentalFeatures | null> {
  const snap = await fetchYahooSummary(symbol);
  if (!snap) return null;
  return {
    marketCap: snap.marketCap,
    trailingPE: snap.pe,
    forwardPE: snap.forwardPe,
    pegRatio: snap.pegRatio,
    priceToBook: snap.priceToBook,
    profitMargins: snap.profitMargins,
    returnOnEquity: snap.returnOnEquity,
    debtToEquity: snap.debtToEquity,
    revenueGrowth: snap.revenueGrowth,
    earningsGrowth: snap.earningsGrowth,
    recommendationKey: snap.recommendationKey,
    numberOfAnalystOpinions: snap.numberOfAnalystOpinions,
    targetMeanPrice: snap.targetMeanPrice,
    shortPercentOfFloat: snap.shortPercentOfFloat,
    sector: snap.sector,
    industry: snap.industry,
  };
}

// ── Bundle assembly ─────────────────────────────────────────────────

const pct = (v: number) => `${(v * 100).toFixed(1)}%`;

/**
 * Stage-1 evidence: price history only (cheap, runs for the whole universe).
 * Fundamentals + news run later for finalists via `enrichBundle`.
 */
export async function collectPriceEvidence(
  candidate: Candidate,
  benchmark: ChartSeries | null,
  timeoutMs = 8000,
): Promise<EvidenceBundle> {
  const asOf = new Date().toISOString();
  const items: EvidenceItem[] = [];
  const missing: string[] = [];

  const series = await fetchDailyChart(candidate.symbol, timeoutMs);
  let price: PriceFeatures | null = null;
  if (series && series.closes.length >= 2) {
    price = computePriceFeatures(series, benchmark);
    items.push(
      { collector: "price_history", key: "ret_21d", value: price.ret21d, statement: `21-day return ${pct(price.ret21d)}`, asOf },
      { collector: "price_history", key: "ret_63d", value: price.ret63d, statement: `63-day return ${pct(price.ret63d)}`, asOf },
      { collector: "price_history", key: "vol_annual", value: price.volAnnual, statement: `Realized volatility ${pct(price.volAnnual)} annualized`, asOf },
      { collector: "price_history", key: "rsi_14", value: price.rsi14, statement: `RSI(14) at ${price.rsi14.toFixed(0)}`, asOf },
      { collector: "price_history", key: "dollar_volume_20d", value: price.avgDollarVolume20d, statement: `20-day average traded value ${Math.round(price.avgDollarVolume20d).toLocaleString()} ${price.currency ?? ""}`, asOf },
    );
  } else {
    missing.push("price_history");
  }

  return { candidate, price, fundamentals: null, sentiment: null, items, missing };
}

/** Stage-2 evidence for finalists: fundamentals + news sentiment. */
export async function enrichBundle(bundle: EvidenceBundle): Promise<EvidenceBundle> {
  const asOf = new Date().toISOString();
  const { candidate } = bundle;

  const [fundamentals, sentiment] = await Promise.all([
    candidate.assetClass === "equity" ? fetchFundamentals(candidate.symbol).catch(() => null) : Promise.resolve(null),
    fetchNewsSentiment(candidate.symbol, candidate.name).catch(() => null),
  ]);

  const items = [...bundle.items];
  const missing = [...bundle.missing];

  if (fundamentals) {
    if (fundamentals.trailingPE != null) items.push({ collector: "yahoo_summary", key: "trailing_pe", value: fundamentals.trailingPE, statement: `Trailing P/E ${fundamentals.trailingPE.toFixed(1)}`, asOf });
    if (fundamentals.revenueGrowth != null) items.push({ collector: "yahoo_summary", key: "revenue_growth", value: fundamentals.revenueGrowth, statement: `Revenue growth ${pct(fundamentals.revenueGrowth)} YoY`, asOf });
    if (fundamentals.targetMeanPrice != null && bundle.price) {
      const upside = (fundamentals.targetMeanPrice - bundle.price.lastClose) / bundle.price.lastClose;
      items.push({ collector: "yahoo_summary", key: "analyst_target_upside", value: upside, statement: `Mean analyst target implies ${pct(upside)} vs last close (${fundamentals.numberOfAnalystOpinions ?? 0} analysts)`, asOf });
    }
  } else if (candidate.assetClass === "equity") {
    missing.push("yahoo_summary");
  }

  if (sentiment) {
    items.push({ collector: "gdelt_news", key: "avg_tone", value: sentiment.avgTone, statement: `News tone ${sentiment.avgTone.toFixed(1)} across ${sentiment.articleCount} recent articles`, asOf });
  } else {
    missing.push("gdelt_news");
  }

  return { ...bundle, fundamentals, sentiment, items, missing };
}
