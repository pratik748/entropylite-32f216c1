/**
 * Live Data Scraper — institutional-grade real-time fundamentals & news.
 *
 * Sources:
 *  - Indian equities  → Screener.in, Moneycontrol news, BSE/NSE announcements
 *  - Global equities  → Yahoo Finance quote-summary, Finviz, StockAnalysis.com, SEC EDGAR
 *  - Macro            → Trading Economics calendar, Investing.com market overview
 *
 * In-memory 15-minute cache per ticker keyed by (source, identifier).
 * Cache survives across requests within the same edge-function isolate.
 */

const CACHE_TTL_MS = 15 * 60 * 1000;
const cache = new Map<string, { data: unknown; expires: number }>();

function getCached<T>(key: string): T | null {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expires) {
    cache.delete(key);
    return null;
  }
  return hit.data as T;
}

function setCached<T>(key: string, data: T): T {
  cache.set(key, { data, expires: Date.now() + CACHE_TTL_MS });
  return data;
}

const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

async function fetchHTML(url: string, timeoutMs = 9000): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": UA,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9",
        "Accept-Language": "en-US,en;q=0.9",
      },
    });
    clearTimeout(timeout);
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

function decode(s: string): string {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&rsquo;/g, "'")
    .replace(/&lsquo;/g, "'")
    .replace(/&rdquo;/g, '"')
    .replace(/&ldquo;/g, '"')
    .trim();
}

function stripTags(html: string): string {
  return decode(html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
}

function parseNum(s: string | undefined | null): number | null {
  if (!s) return null;
  const cleaned = s.replace(/[,₹$€£]/g, "").replace(/\s+/g, "").trim();
  if (cleaned === "" || cleaned === "-" || /^N\.?A\.?$/i.test(cleaned)) return null;
  const m = cleaned.match(/-?[\d.]+/);
  if (!m) return null;
  const n = parseFloat(m[0]);
  return Number.isFinite(n) ? n : null;
}

// ─── Screener.in (Indian equities) ────────────────────────────────────────────
export interface ScreenerSnapshot {
  ticker: string;
  source: "screener.in";
  fetchedAt: number;
  marketCap: number | null;       // ₹ Cr
  currentPrice: number | null;    // ₹
  highLow52w: { high: number | null; low: number | null };
  pe: number | null;
  pb: number | null;
  bookValue: number | null;
  dividendYield: number | null;
  roce: number | null;
  roe: number | null;
  faceValue: number | null;
  industry: string | null;
  about: string | null;
  pros: string[];
  cons: string[];
}

const SCREENER_RATIO_KEYS: Array<{ label: RegExp; key: keyof ScreenerSnapshot }> = [
  { label: /market\s*cap/i,        key: "marketCap" },
  { label: /current\s*price/i,     key: "currentPrice" },
  { label: /stock\s*p\/e|^p\/e\b/i, key: "pe" },
  { label: /book\s*value/i,        key: "bookValue" },
  { label: /price\s*to\s*book|^p\/b\b/i, key: "pb" },
  { label: /dividend\s*yield/i,    key: "dividendYield" },
  { label: /roce/i,                key: "roce" },
  { label: /roe/i,                 key: "roe" },
  { label: /face\s*value/i,        key: "faceValue" },
];

function buildScreenerCandidates(ticker: string): string[] {
  const base = ticker.replace(/\.(NS|BO|NSE|BSE)$/i, "").toUpperCase();
  const slugs = [base];
  // Screener uses NSE symbols — try a few variants
  if (ticker.toUpperCase().endsWith(".BO")) slugs.push(`${base}/consolidated`);
  return slugs.map((s) => `https://www.screener.in/company/${s}/`);
}

export async function fetchScreener(ticker: string): Promise<ScreenerSnapshot | null> {
  const key = `screener:${ticker.toUpperCase()}`;
  const cached = getCached<ScreenerSnapshot>(key);
  if (cached) return cached;

  for (const url of buildScreenerCandidates(ticker)) {
    const html = await fetchHTML(url);
    if (!html || html.length < 2000) continue;

    const snap: ScreenerSnapshot = {
      ticker: ticker.toUpperCase(),
      source: "screener.in",
      fetchedAt: Date.now(),
      marketCap: null,
      currentPrice: null,
      highLow52w: { high: null, low: null },
      pe: null,
      pb: null,
      bookValue: null,
      dividendYield: null,
      roce: null,
      roe: null,
      faceValue: null,
      industry: null,
      about: null,
      pros: [],
      cons: [],
    };

    // Top-ratios block: <li><span class="name">Market Cap</span><span class="number">...</span>
    const liRegex = /<li[^>]*class="[^"]*flex[^"]*"[^>]*>([\s\S]*?)<\/li>/gi;
    let m;
    while ((m = liRegex.exec(html)) !== null) {
      const li = m[1];
      const nameMatch = li.match(/<span[^>]*class="[^"]*name[^"]*"[^>]*>([\s\S]*?)<\/span>/i);
      const valueMatch = li.match(/<span[^>]*class="[^"]*value[^"]*"[^>]*>([\s\S]*?)<\/span>/i)
        || li.match(/<span[^>]*class="[^"]*number[^"]*"[^>]*>([\s\S]*?)<\/span>/i);
      if (!nameMatch || !valueMatch) continue;
      const label = stripTags(nameMatch[1]).toLowerCase();
      const numbers = valueMatch[1].match(/<span[^>]*class="[^"]*number[^"]*"[^>]*>([\s\S]*?)<\/span>/gi);
      const valueRaw = numbers && numbers.length > 0
        ? numbers.map((n) => stripTags(n)).join(" / ")
        : stripTags(valueMatch[1]);

      // 52-week high/low special-case
      if (/high\s*\/\s*low/i.test(label)) {
        const parts = valueRaw.split(/\/|to/).map(parseNum);
        if (parts.length >= 2) snap.highLow52w = { high: parts[0], low: parts[1] };
        continue;
      }

      for (const r of SCREENER_RATIO_KEYS) {
        if (r.label.test(label)) {
          (snap as any)[r.key] = parseNum(valueRaw);
          break;
        }
      }
    }

    // About + industry
    const aboutMatch = html.match(/<div[^>]*class="[^"]*company-profile[^"]*"[^>]*>([\s\S]*?)<\/div>\s*<\/div>/i)
      || html.match(/<p[^>]*class="[^"]*sub[^"]*"[^>]*>([\s\S]*?)<\/p>/i);
    if (aboutMatch) snap.about = stripTags(aboutMatch[1]).slice(0, 600);

    const industryMatch = html.match(/Industry[^<]*<\/span>\s*<a[^>]*>([^<]+)<\/a>/i);
    if (industryMatch) snap.industry = stripTags(industryMatch[1]);

    // Pros / Cons (Screener's analysis bullets)
    const prosBlock = html.match(/<div[^>]*class="[^"]*pros[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
    const consBlock = html.match(/<div[^>]*class="[^"]*cons[^"]*"[^>]*>([\s\S]*?)<\/div>/i);
    const liItems = (block: string | undefined): string[] => {
      if (!block) return [];
      const out: string[] = [];
      const re = /<li[^>]*>([\s\S]*?)<\/li>/gi;
      let mm;
      while ((mm = re.exec(block)) !== null) {
        const t = stripTags(mm[1]);
        if (t.length > 6) out.push(t);
      }
      return out.slice(0, 6);
    };
    snap.pros = liItems(prosBlock?.[1]);
    snap.cons = liItems(consBlock?.[1]);

    // Require at least price OR market cap OR P/E to consider this a hit
    if (snap.currentPrice || snap.marketCap || snap.pe) {
      return setCached(key, snap);
    }
  }

  return setCached(key, null as unknown as ScreenerSnapshot);
}

// ─── Yahoo Finance quoteSummary (global equities) ─────────────────────────────
export interface YahooSnapshot {
  symbol: string;
  source: "yahoo";
  fetchedAt: number;
  price: number | null;
  currency: string | null;
  marketCap: number | null;
  pe: number | null;
  forwardPe: number | null;
  pegRatio: number | null;
  priceToBook: number | null;
  dividendYield: number | null;
  beta: number | null;
  profitMargins: number | null;
  returnOnEquity: number | null;
  debtToEquity: number | null;
  revenueGrowth: number | null;
  earningsGrowth: number | null;
  recommendationKey: string | null;
  numberOfAnalystOpinions: number | null;
  targetMeanPrice: number | null;
  targetHighPrice: number | null;
  targetLowPrice: number | null;
  shortPercentOfFloat: number | null;
  heldPercentInsiders: number | null;
  heldPercentInstitutions: number | null;
  sector: string | null;
  industry: string | null;
  longBusinessSummary: string | null;
}

export async function fetchYahooSummary(symbol: string): Promise<YahooSnapshot | null> {
  const key = `yahoo-summary:${symbol.toUpperCase()}`;
  const cached = getCached<YahooSnapshot>(key);
  if (cached) return cached;

  const modules = [
    "price",
    "summaryDetail",
    "defaultKeyStatistics",
    "financialData",
    "assetProfile",
    "recommendationTrend",
  ].join(",");
  const url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=${modules}`;
  try {
    const res = await fetch(url, { headers: { "User-Agent": UA } });
    if (!res.ok) return setCached(key, null);
    const data = await res.json();
    const r = data?.quoteSummary?.result?.[0];
    if (!r) return setCached(key, null);

    const p = r.price ?? {};
    const sd = r.summaryDetail ?? {};
    const ks = r.defaultKeyStatistics ?? {};
    const fd = r.financialData ?? {};
    const ap = r.assetProfile ?? {};

    const num = (v: any) => (v && typeof v === "object" && "raw" in v ? v.raw : (typeof v === "number" ? v : null));

    const snap: YahooSnapshot = {
      symbol: symbol.toUpperCase(),
      source: "yahoo",
      fetchedAt: Date.now(),
      price: num(p.regularMarketPrice),
      currency: p.currency ?? null,
      marketCap: num(p.marketCap) ?? num(sd.marketCap),
      pe: num(sd.trailingPE),
      forwardPe: num(sd.forwardPE),
      pegRatio: num(ks.pegRatio),
      priceToBook: num(ks.priceToBook),
      dividendYield: num(sd.dividendYield),
      beta: num(sd.beta) ?? num(ks.beta),
      profitMargins: num(fd.profitMargins) ?? num(ks.profitMargins),
      returnOnEquity: num(fd.returnOnEquity),
      debtToEquity: num(fd.debtToEquity),
      revenueGrowth: num(fd.revenueGrowth),
      earningsGrowth: num(fd.earningsGrowth),
      recommendationKey: fd.recommendationKey ?? null,
      numberOfAnalystOpinions: num(fd.numberOfAnalystOpinions),
      targetMeanPrice: num(fd.targetMeanPrice),
      targetHighPrice: num(fd.targetHighPrice),
      targetLowPrice: num(fd.targetLowPrice),
      shortPercentOfFloat: num(ks.shortPercentOfFloat),
      heldPercentInsiders: num(ks.heldPercentInsiders),
      heldPercentInstitutions: num(ks.heldPercentInstitutions),
      sector: ap.sector ?? null,
      industry: ap.industry ?? null,
      longBusinessSummary: typeof ap.longBusinessSummary === "string" ? ap.longBusinessSummary.slice(0, 800) : null,
    };
    return setCached(key, snap);
  } catch {
    return setCached(key, null);
  }
}

// ─── Finviz (US equities) ─────────────────────────────────────────────────────
export interface FinvizSnapshot {
  ticker: string;
  source: "finviz";
  fetchedAt: number;
  metrics: Record<string, string>;
}

export async function fetchFinviz(ticker: string): Promise<FinvizSnapshot | null> {
  const key = `finviz:${ticker.toUpperCase()}`;
  const cached = getCached<FinvizSnapshot>(key);
  if (cached) return cached;

  // Finviz only supports US tickers (no exchange suffix)
  const cleaned = ticker.replace(/\.(NS|BO|TO|L|HK|AX)$/i, "").toUpperCase();
  if (!/^[A-Z][A-Z0-9.\-]{0,8}$/.test(cleaned)) return setCached(key, null);

  const html = await fetchHTML(`https://finviz.com/quote.ashx?t=${encodeURIComponent(cleaned)}`);
  if (!html) return setCached(key, null);

  const metrics: Record<string, string> = {};
  // Snapshot table — alternating <td class="snapshot-td2-cp">Label</td><td class="snapshot-td2">Value</td>
  const cellRe = /<td[^>]*class="snapshot-td2[^"]*"[^>]*>([\s\S]*?)<\/td>/gi;
  const cells: string[] = [];
  let m;
  while ((m = cellRe.exec(html)) !== null) cells.push(stripTags(m[1]));
  for (let i = 0; i + 1 < cells.length; i += 2) {
    const k = cells[i].trim();
    const v = cells[i + 1].trim();
    if (k && v && v !== "-") metrics[k] = v;
  }
  if (Object.keys(metrics).length === 0) return setCached(key, null);
  return setCached(key, { ticker: cleaned, source: "finviz", fetchedAt: Date.now(), metrics });
}

// ─── Moneycontrol news (Indian) ───────────────────────────────────────────────
export interface NewsItem {
  title: string;
  url: string;
  source: string;
  publishedAt?: string;
  summary?: string;
}

export async function fetchMoneycontrolNews(query: string, limit = 8): Promise<NewsItem[]> {
  const key = `mc-news:${query.toLowerCase()}`;
  const cached = getCached<NewsItem[]>(key);
  if (cached) return cached;

  const html = await fetchHTML(
    `https://www.moneycontrol.com/news/tags/${encodeURIComponent(query.toLowerCase().replace(/\s+/g, "-"))}.html`,
  );
  const items: NewsItem[] = [];
  if (html) {
    const cardRe = /<li[^>]*class="clearfix"[^>]*>([\s\S]*?)<\/li>/gi;
    let m;
    while ((m = cardRe.exec(html)) !== null && items.length < limit) {
      const block = m[1];
      const titleMatch = block.match(/<h2[^>]*>\s*<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i)
        || block.match(/<a[^>]+href="([^"]+)"[^>]*>([^<]{20,})<\/a>/i);
      if (!titleMatch) continue;
      const url = titleMatch[1];
      const title = stripTags(titleMatch[2]);
      const dateMatch = block.match(/<span[^>]*class="[^"]*ago[^"]*"[^>]*>([^<]+)<\/span>/i);
      const summaryMatch = block.match(/<p[^>]*>([^<]{30,})<\/p>/i);
      if (title.length > 12) {
        items.push({
          title,
          url,
          source: "Moneycontrol",
          publishedAt: dateMatch ? stripTags(dateMatch[1]) : undefined,
          summary: summaryMatch ? stripTags(summaryMatch[1]).slice(0, 240) : undefined,
        });
      }
    }
  }
  return setCached(key, items);
}

// ─── BSE corporate announcements (Indian filings) ─────────────────────────────
export async function fetchBSEAnnouncements(scripCodeOrName: string, limit = 6): Promise<NewsItem[]> {
  const key = `bse-ann:${scripCodeOrName.toLowerCase()}`;
  const cached = getCached<NewsItem[]>(key);
  if (cached) return cached;

  // BSE search page is light HTML; we use the /xml-data tag-search RSS-like endpoint via the public news index.
  const html = await fetchHTML(
    `https://www.bseindia.com/markets/MarketInfo/DispNewNoticesCirculars.aspx?sub=Search&sub1=${encodeURIComponent(scripCodeOrName)}`,
  );
  const items: NewsItem[] = [];
  if (html) {
    const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    let m;
    while ((m = rowRe.exec(html)) !== null && items.length < limit) {
      const row = m[1];
      const linkMatch = row.match(/<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/i);
      if (!linkMatch) continue;
      const title = stripTags(linkMatch[2]);
      if (title.length < 12) continue;
      items.push({
        title,
        url: linkMatch[1].startsWith("http") ? linkMatch[1] : `https://www.bseindia.com${linkMatch[1]}`,
        source: "BSE Filings",
      });
    }
  }
  return setCached(key, items);
}

// ─── SEC EDGAR (US filings) ───────────────────────────────────────────────────
export async function fetchEDGARFilings(ticker: string, limit = 6): Promise<NewsItem[]> {
  const key = `edgar:${ticker.toUpperCase()}`;
  const cached = getCached<NewsItem[]>(key);
  if (cached) return cached;

  const url = `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${encodeURIComponent(ticker)}&type=&dateb=&owner=include&count=${limit}&action=getcompany`;
  const html = await fetchHTML(url);
  const items: NewsItem[] = [];
  if (html) {
    const rowRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
    let m;
    while ((m = rowRe.exec(html)) !== null && items.length < limit) {
      const row = m[1];
      const typeMatch = row.match(/<td[^>]*nowrap="nowrap"[^>]*>([^<]+)<\/td>/i);
      const dateMatch = row.match(/(\d{4}-\d{2}-\d{2})/);
      const linkMatch = row.match(/<a[^>]+href="(\/Archives\/[^"]+)"[^>]*>/i);
      if (!typeMatch || !linkMatch) continue;
      const filingType = stripTags(typeMatch[1]);
      if (!/10-K|10-Q|8-K|13D|13G|S-1|S-3|DEF\s*14A|4\b/i.test(filingType)) continue;
      items.push({
        title: `${filingType}${dateMatch ? ` filed ${dateMatch[1]}` : ""}`,
        url: `https://www.sec.gov${linkMatch[1]}`,
        source: "SEC EDGAR",
        publishedAt: dateMatch?.[1],
      });
    }
  }
  return setCached(key, items);
}

// ─── Trading Economics calendar (macro) ───────────────────────────────────────
export interface MacroEvent {
  date: string;
  country: string;
  event: string;
  importance: "low" | "medium" | "high";
  actual?: string;
  forecast?: string;
  previous?: string;
}

export async function fetchMacroCalendar(): Promise<MacroEvent[]> {
  const key = `te-calendar`;
  const cached = getCached<MacroEvent[]>(key);
  if (cached) return cached;

  const html = await fetchHTML("https://tradingeconomics.com/calendar");
  const events: MacroEvent[] = [];
  if (html) {
    const rowRe = /<tr[^>]*data-url="[^"]*"[^>]*>([\s\S]*?)<\/tr>/gi;
    let m;
    while ((m = rowRe.exec(html)) !== null && events.length < 30) {
      const row = m[1];
      const cells: string[] = [];
      const cellRe = /<td[^>]*>([\s\S]*?)<\/td>/gi;
      let c;
      while ((c = cellRe.exec(row)) !== null) cells.push(stripTags(c[1]));
      if (cells.length < 5) continue;

      // Importance via star count in raw row
      const starCount = (row.match(/calendar-star-1\b/g) || []).length;
      const importance: MacroEvent["importance"] = starCount >= 3 ? "high" : starCount === 2 ? "medium" : "low";

      events.push({
        date: cells[0] || "",
        country: cells[1] || "",
        event: cells[2] || cells[3] || "",
        importance,
        actual: cells[cells.length - 3] || undefined,
        previous: cells[cells.length - 2] || undefined,
        forecast: cells[cells.length - 1] || undefined,
      });
    }
  }
  return setCached(key, events);
}

// ─── Top-level "everything for this ticker" aggregator ────────────────────────
export interface TickerLiveBundle {
  ticker: string;
  isIndian: boolean;
  fetchedAt: number;
  screener: ScreenerSnapshot | null;
  yahoo: YahooSnapshot | null;
  finviz: FinvizSnapshot | null;
  filings: NewsItem[];
  news: NewsItem[];
}

export async function fetchTickerLiveBundle(rawTicker: string, isIndian: boolean): Promise<TickerLiveBundle> {
  const ticker = rawTicker.toUpperCase();
  const baseSymbol = ticker.replace(/\.(NS|BO)$/, "");

  const tasks: Promise<unknown>[] = [];
  if (isIndian) {
    tasks.push(fetchScreener(baseSymbol));
    tasks.push(fetchYahooSummary(ticker.endsWith(".NS") || ticker.endsWith(".BO") ? ticker : `${baseSymbol}.NS`));
    tasks.push(Promise.resolve(null)); // no Finviz for IN
    tasks.push(fetchBSEAnnouncements(baseSymbol));
    tasks.push(fetchMoneycontrolNews(baseSymbol));
  } else {
    tasks.push(Promise.resolve(null)); // no Screener for global
    tasks.push(fetchYahooSummary(ticker));
    tasks.push(fetchFinviz(ticker));
    tasks.push(fetchEDGARFilings(ticker));
    tasks.push(Promise.resolve([] as NewsItem[]));
  }

  const [screener, yahoo, finviz, filings, news] = await Promise.all(tasks);

  return {
    ticker,
    isIndian,
    fetchedAt: Date.now(),
    screener: (screener as ScreenerSnapshot | null) ?? null,
    yahoo: (yahoo as YahooSnapshot | null) ?? null,
    finviz: (finviz as FinvizSnapshot | null) ?? null,
    filings: (filings as NewsItem[]) ?? [],
    news: (news as NewsItem[]) ?? [],
  };
}

/** Compact, prompt-ready summary string for AI context injection. */
export function bundleToPromptContext(b: TickerLiveBundle): string {
  const lines: string[] = [];
  lines.push(`LIVE SCRAPED DATA (≤15min cache) for ${b.ticker} — use as primary source of truth, override training-data values where they conflict.`);

  if (b.screener) {
    const s = b.screener;
    lines.push(`\n[Screener.in] mcap=${s.marketCap ?? "?"}Cr px=₹${s.currentPrice ?? "?"} P/E=${s.pe ?? "?"} P/B=${s.pb ?? "?"} ROE=${s.roe ?? "?"}% ROCE=${s.roce ?? "?"}% divY=${s.dividendYield ?? "?"}% 52w=${s.highLow52w.high ?? "?"}/${s.highLow52w.low ?? "?"} industry=${s.industry ?? "?"}`);
    if (s.pros.length) lines.push(`Pros: ${s.pros.slice(0, 4).join(" | ")}`);
    if (s.cons.length) lines.push(`Cons: ${s.cons.slice(0, 4).join(" | ")}`);
    if (s.about) lines.push(`About: ${s.about.slice(0, 280)}`);
  }
  if (b.yahoo) {
    const y = b.yahoo;
    lines.push(`\n[Yahoo] ${y.currency ?? ""} px=${y.price ?? "?"} mcap=${y.marketCap ?? "?"} P/E=${y.pe ?? "?"} fwdPE=${y.forwardPe ?? "?"} PEG=${y.pegRatio ?? "?"} P/B=${y.priceToBook ?? "?"} divY=${y.dividendYield ?? "?"} β=${y.beta ?? "?"} ROE=${y.returnOnEquity ?? "?"} D/E=${y.debtToEquity ?? "?"} revG=${y.revenueGrowth ?? "?"} epsG=${y.earningsGrowth ?? "?"} sector=${y.sector ?? "?"} industry=${y.industry ?? "?"}`);
    if (y.recommendationKey) lines.push(`Analyst: ${y.recommendationKey} (${y.numberOfAnalystOpinions ?? 0} opinions) targets low/mean/high = ${y.targetLowPrice ?? "?"}/${y.targetMeanPrice ?? "?"}/${y.targetHighPrice ?? "?"} insiders=${y.heldPercentInsiders ?? "?"} inst=${y.heldPercentInstitutions ?? "?"} short%=${y.shortPercentOfFloat ?? "?"}`);
    if (y.longBusinessSummary) lines.push(`Profile: ${y.longBusinessSummary.slice(0, 280)}`);
  }
  if (b.finviz) {
    const m = b.finviz.metrics;
    const pick = (k: string) => m[k] ? `${k}=${m[k]}` : "";
    const picked = ["P/E", "Forward P/E", "PEG", "P/B", "ROE", "ROA", "Debt/Eq", "Profit Margin", "Sales Q/Q", "EPS Q/Q", "Short Float", "Inst Own", "Insider Own", "Beta", "Volatility", "RSI (14)", "Recom", "Target Price"].map(pick).filter(Boolean).join(" ");
    if (picked) lines.push(`\n[Finviz] ${picked}`);
  }
  if (b.filings.length) {
    lines.push(`\n[Filings] ${b.filings.slice(0, 5).map((f) => `${f.title}`).join(" | ")}`);
  }
  if (b.news.length) {
    lines.push(`\n[Recent news] ${b.news.slice(0, 6).map((n) => `"${n.title}"${n.publishedAt ? ` (${n.publishedAt})` : ""}`).join(" | ")}`);
  }
  return lines.join("\n");
}

/** Expose cache stats for debugging endpoints. */
export function liveDataCacheStats() {
  const now = Date.now();
  let live = 0;
  for (const v of cache.values()) if (v.expires > now) live++;
  return { totalEntries: cache.size, liveEntries: live, ttlMinutes: CACHE_TTL_MS / 60_000 };
}
