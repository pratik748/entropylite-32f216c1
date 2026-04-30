import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { requireAuth } from "../_shared/auth.ts";
import { buildTickerCandidates, isIndianTicker, normalizeTickerInput } from "../_shared/ticker.ts";
import { fetchTickerLiveBundle, type TickerLiveBundle } from "../_shared/liveData.ts";
import { fetchLiveWebContext } from "../_shared/callAI.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const ALPHA_VANTAGE_KEY = Deno.env.get("ALPHAVANTAGE_API_KEY") || "";

type Bars = {
  closes: number[];
  volumes: number[];
  timestamps: number[];
  source: "yahoo" | "alphavantage";
};

type DisplayNewsItem = {
  headline: string;
  date?: string;
  category: "Company" | "Sector" | "Macro" | "Competitor";
  sentiment: number;
  shortTermImpact: number;
  longTermImpact: number;
  confidence: number;
  explanation: string;
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function round(value: number, digits = 2) {
  return Number.isFinite(value) ? Number(value.toFixed(digits)) : 0;
}

function mean(values: number[]) {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function stdev(values: number[]) {
  if (values.length < 2) return 0;
  const m = mean(values);
  return Math.sqrt(values.reduce((sum, value) => sum + (value - m) ** 2, 0) / (values.length - 1));
}

function percentile(values: number[], p: number) {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = clamp((sorted.length - 1) * p, 0, sorted.length - 1);
  const lower = Math.floor(idx);
  const upper = Math.ceil(idx);
  if (lower === upper) return sorted[lower];
  const weight = idx - lower;
  return sorted[lower] * (1 - weight) + sorted[upper] * weight;
}

function sma(values: number[], period: number) {
  if (values.length === 0) return 0;
  const slice = values.slice(-Math.min(period, values.length));
  return mean(slice);
}

function pctReturns(closes: number[]) {
  const out: number[] = [];
  for (let i = 1; i < closes.length; i++) {
    const prev = closes[i - 1];
    const cur = closes[i];
    if (prev > 0 && cur > 0) out.push((cur - prev) / prev);
  }
  return out;
}

function rsi(closes: number[], period = 14) {
  if (closes.length <= period) return 50;
  let gains = 0;
  let losses = 0;
  for (let i = closes.length - period; i < closes.length; i++) {
    const diff = closes[i] - closes[i - 1];
    if (diff > 0) gains += diff;
    else losses += Math.abs(diff);
  }
  if (losses === 0 && gains === 0) return 50;
  if (losses === 0) return 100;
  const rs = gains / losses;
  return 100 - 100 / (1 + rs);
}

function sharpeFromReturns(returns: number[], annualRiskFree = 0.045) {
  if (returns.length < 20) return 0;
  const sigma = stdev(returns);
  if (sigma === 0) return 0;
  const rfDaily = annualRiskFree / 252;
  return ((mean(returns) - rfDaily) / sigma) * Math.sqrt(252);
}

function sortinoFromReturns(returns: number[], annualRiskFree = 0.045) {
  if (returns.length < 20) return 0;
  const rfDaily = annualRiskFree / 252;
  const downside = returns.filter((r) => r < rfDaily).map((r) => r - rfDaily);
  if (downside.length === 0) return 0;
  const downsideDev = Math.sqrt(mean(downside.map((d) => d * d)));
  if (downsideDev === 0) return 0;
  return ((mean(returns) - rfDaily) / downsideDev) * Math.sqrt(252);
}

function maxDrawdown(closes: number[]) {
  if (closes.length === 0) return 0;
  let peak = closes[0];
  let maxDd = 0;
  for (const close of closes) {
    if (close > peak) peak = close;
    const dd = (peak - close) / peak;
    if (dd > maxDd) maxDd = dd;
  }
  return maxDd * 100;
}

async function fetchAlphaVantage(symbol: string): Promise<{ price: number; prevClose: number; high: number; low: number; volume: number } | null> {
  if (!ALPHA_VANTAGE_KEY) return null;
  try {
    const normalized = normalizeTickerInput(symbol);
    const cleanSymbol = normalized.replace(/\.(NS|BO)$/, "");
    const exchange = normalized.endsWith(".BO") ? "BSE" : "NSE";
    const avSymbol = normalized.endsWith(".NS") || normalized.endsWith(".BO") ? `${exchange}:${cleanSymbol}` : cleanSymbol;
    const url = `https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${encodeURIComponent(avSymbol)}&apikey=${ALPHA_VANTAGE_KEY}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const q = data?.["Global Quote"];
    if (!q || !q["05. price"]) return null;
    return {
      price: parseFloat(q["05. price"]),
      prevClose: parseFloat(q["08. previous close"] || "0"),
      high: parseFloat(q["03. high"] || "0"),
      low: parseFloat(q["04. low"] || "0"),
      volume: parseInt(q["06. volume"] || "0"),
    };
  } catch {
    return null;
  }
}

async function fetchYahooBars(symbol: string, range = "1y"): Promise<Bars | null> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=${range}&_t=${Date.now()}`;
    const res = await fetch(url, { headers: { "User-Agent": UA, "Cache-Control": "no-cache, no-store" } });
    if (!res.ok) return null;
    const data = await res.json();
    const result = data?.chart?.result?.[0];
    if (!result) return null;
    const timestamps = result.timestamp || [];
    const closes = result.indicators?.quote?.[0]?.close || [];
    const volumes = result.indicators?.quote?.[0]?.volume || [];
    const validCloses: number[] = [];
    const validVolumes: number[] = [];
    const validTimestamps: number[] = [];
    for (let i = 0; i < closes.length; i++) {
      if (closes[i] != null && closes[i] > 0) {
        validCloses.push(closes[i]);
        validVolumes.push(volumes[i] || 0);
        validTimestamps.push(timestamps[i] || 0);
      }
    }
    if (validCloses.length < 30) return null;
    return { closes: validCloses, volumes: validVolumes, timestamps: validTimestamps, source: "yahoo" };
  } catch {
    return null;
  }
}

async function fetchAlphaBars(symbol: string, range = "1y"): Promise<Bars | null> {
  if (!ALPHA_VANTAGE_KEY) return null;
  const cleanSym = symbol.replace(/\.(NS|BO)$/, "");
  try {
    const outputsize = range === "1y" ? "full" : "compact";
    const url = `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=${encodeURIComponent(cleanSym)}&outputsize=${outputsize}&apikey=${ALPHA_VANTAGE_KEY}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const series = data?.["Time Series (Daily)"];
    if (!series) return null;
    const dates = Object.keys(series).sort();
    const closes: number[] = [];
    const volumes: number[] = [];
    const timestamps: number[] = [];
    for (const date of dates) {
      const close = parseFloat(series[date]?.["4. close"] || "0");
      const volume = parseFloat(series[date]?.["5. volume"] || "0");
      if (close > 0) {
        closes.push(close);
        volumes.push(Number.isFinite(volume) ? volume : 0);
        timestamps.push(Math.floor(new Date(date).getTime() / 1000));
      }
    }
    if (closes.length < 30) return null;
    return {
      closes: closes.slice(-252),
      volumes: volumes.slice(-252),
      timestamps: timestamps.slice(-252),
      source: "alphavantage",
    };
  } catch {
    return null;
  }
}

async function fetchHistoricalBars(ticker: string) {
  const candidates = buildTickerCandidates(ticker);
  for (const symbol of candidates) {
    const yahoo = await fetchYahooBars(symbol, "1y");
    if (yahoo) return yahoo;
  }
  for (const symbol of candidates) {
    const alpha = await fetchAlphaBars(symbol, "1y");
    if (alpha) return alpha;
  }
  return null;
}

function inferAssetClass(ticker: string) {
  if (ticker.includes("-USD") || ticker.includes("-EUR")) return "Crypto";
  if (ticker.includes("=X")) return "Forex";
  if (ticker.includes("=F")) return "Commodity";
  if (ticker.includes("ETF") || ticker === "SPY" || ticker === "QQQ") return "ETF";
  return "Equity";
}

function inferExchange(ticker: string, isIndian: boolean) {
  if (ticker.endsWith(".NS")) return "NSE";
  if (ticker.endsWith(".BO")) return "BSE";
  if (ticker.includes("-USD") || ticker.includes("-EUR")) return "Crypto Spot";
  if (ticker.includes("=X")) return "FX";
  if (ticker.includes("=F")) return "Futures";
  return isIndian ? "NSE/BSE" : "NASDAQ/NYSE";
}

function inferMarketCapCategory(isIndian: boolean, marketCapValue: number | null) {
  if (marketCapValue == null || !Number.isFinite(marketCapValue)) return "N/A";
  if (isIndian) {
    if (marketCapValue >= 100000) return "Large Cap";
    if (marketCapValue >= 20000) return "Mid Cap";
    if (marketCapValue >= 5000) return "Small Cap";
    return "Micro Cap";
  }
  if (marketCapValue >= 10_000_000_000) return "Large Cap";
  if (marketCapValue >= 2_000_000_000) return "Mid Cap";
  if (marketCapValue >= 300_000_000) return "Small Cap";
  return "Micro Cap";
}

function newsCategory(title: string, source: string): DisplayNewsItem["category"] {
  const t = title.toLowerCase();
  if (/fed|rbi|inflation|gdp|yield|oil|crude|rupee|dollar|fii|rates|macro|cpi|ppi/.test(t)) return "Macro";
  if (/sector|industry|peer|competitor/.test(t)) return "Sector";
  if (/filing|board|earnings|results|stake|order|contract|approval|launch|acquisition|probe|sebi|court|supreme/.test(t)) return "Company";
  if (/bse|sec/.test(source.toLowerCase())) return "Company";
  return "Company";
}

function headlineSentiment(title: string) {
  const t = title.toLowerCase();
  const positive = [
    "beats", "beat", "surge", "jumps", "jump", "wins", "win", "approval", "approves", "order", "orders",
    "growth", "upgrade", "raises", "strong", "record", "rebound", "recovery", "stake buy", "expands",
  ];
  const negative = [
    "miss", "misses", "falls", "fall", "drop", "drops", "slump", "cuts", "downgrade", "probe", "investigation",
    "sebi", "court", "lawsuit", "decline", "warning", "weak", "delay", "debt", "default", "outflow",
  ];
  let score = 0;
  for (const word of positive) if (t.includes(word)) score += 16;
  for (const word of negative) if (t.includes(word)) score -= 16;
  return clamp(score, -90, 90);
}

function mapNews(bundle: TickerLiveBundle) {
  const combined = [...bundle.filings, ...bundle.news];
  const deduped = combined.filter((item, index, arr) => arr.findIndex((x) => x.title === item.title) === index).slice(0, 8);
  const news: DisplayNewsItem[] = deduped.map((item) => {
    const sentiment = headlineSentiment(item.title);
    const category = newsCategory(item.title, item.source);
    const baseImpact = Math.max(0.8, Math.abs(sentiment) / 18);
    const sourceBoost = /bse|sec/i.test(item.source) ? 1.35 : /moneycontrol/i.test(item.source) ? 1.1 : 1;
    const shortTermImpact = round(Math.sign(sentiment) * baseImpact * sourceBoost, 1);
    const longTermImpact = round(Math.sign(sentiment) * baseImpact * 0.6 * sourceBoost, 1);
    const confidence = /bse|sec/i.test(item.source) ? 90 : /yahoo/i.test(item.source) ? 78 : 72;
    return {
      headline: item.title,
      date: item.publishedAt,
      category,
      sentiment,
      shortTermImpact,
      longTermImpact,
      confidence,
      explanation: `${item.source} item. Impact score is inferred directly from headline wording and event type.`,
    };
  });
  const overallSentiment = news.length > 0 ? round(mean(news.map((item) => item.sentiment)), 0) : 0;
  const totalPressure = round(news.reduce((sum, item) => sum + item.shortTermImpact, 0), 1);
  return { news, overallSentiment, totalPressure };
}

function deriveSectorRisk(sector: string | null) {
  const s = (sector || "").toLowerCase();
  if (/bank|financial/.test(s)) return 58;
  if (/metal|energy|power|infrastructure|shipping|logistics/.test(s)) return 64;
  if (/technology|software/.test(s)) return 46;
  if (/consumer|pharma|health/.test(s)) return 38;
  return 50;
}

function deriveMacroRisk(sector: string | null, beta: number, overallSentiment: number) {
  const s = (sector || "").toLowerCase();
  let score = 42 + Math.max(0, beta - 1) * 18;
  if (/infrastructure|power|capital goods|metals|energy/.test(s)) score += 10;
  if (overallSentiment < -20) score += 8;
  return clamp(Math.round(score), 15, 95);
}

function deriveRegulatoryRisk(ticker: string, sector: string | null, news: DisplayNewsItem[]) {
  const joined = `${ticker} ${(sector || "")} ${news.map((item) => item.headline).join(" ")}`.toLowerCase();
  let score = 32;
  if (/adani|ports|power|utilities|infrastructure/.test(joined)) score += 12;
  if (/sebi|probe|investigation|court|supreme|regulator|approval/.test(joined)) score += 20;
  return clamp(score, 10, 95);
}

function inferRiskBreakdown(params: {
  annualizedVol: number;
  sector: string | null;
  debtToEquity: number | null;
  beta: number;
  news: DisplayNewsItem[];
  ticker: string;
  overallSentiment: number;
}) {
  const volatility = clamp(Math.round(params.annualizedVol * 1.25), 10, 95);
  const sector = deriveSectorRisk(params.sector);
  const regulatory = deriveRegulatoryRisk(params.ticker, params.sector, params.news);
  const financial = clamp(Math.round(28 + Math.max(0, (params.debtToEquity || 0) - 40) * 0.35 + Math.max(0, params.beta - 1) * 10), 12, 95);
  const macro = deriveMacroRisk(params.sector, params.beta, params.overallSentiment);
  return { volatility, sector, regulatory, financial, macro };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    await requireAuth(req, corsHeaders);
    const rawBody = await req.json();
    const requestedTicker = (rawBody.ticker || "").toString();
    const ticker = normalizeTickerInput(requestedTicker);
    const buyPrice = Number(rawBody.buyPrice);
    const quantity = Number(rawBody.quantity);

    if (!ticker || !Number.isFinite(buyPrice) || !Number.isFinite(quantity) || buyPrice <= 0 || quantity <= 0) {
      return new Response(JSON.stringify({ error: "ticker, buyPrice, and quantity are required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const isIndian = isIndianTicker(ticker);
    let currency = isIndian ? "INR" : "USD";
    let currentPrice = 0;
    let prevClose = 0;
    let dayHigh = 0;
    let dayLow = 0;
    let volume = 0;
    let fiftyTwoWeekHigh = 0;
    let fiftyTwoWeekLow = 0;

    const symbolsToTry = buildTickerCandidates(ticker);
    console.log(`Ticker normalized: "${requestedTicker}" -> "${ticker}"; candidates: ${symbolsToTry.join(", ")}`);

    for (const symbol of symbolsToTry) {
      if (currentPrice > 0) break;
      try {
        const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=5d&_t=${Date.now()}`;
        const yahooRes = await fetch(yahooUrl, { headers: { "User-Agent": UA, "Cache-Control": "no-cache, no-store" } });
        if (yahooRes.ok) {
          const yahooData = await yahooRes.json();
          const meta = yahooData?.chart?.result?.[0]?.meta;
          if (meta?.regularMarketPrice && meta.regularMarketPrice > 0) {
            currentPrice = meta.regularMarketPrice;
            if (!isIndian) currency = meta.currency || currency;
            prevClose = meta.chartPreviousClose || meta.previousClose || 0;
            dayHigh = meta.regularMarketDayHigh || 0;
            dayLow = meta.regularMarketDayLow || 0;
            volume = meta.regularMarketVolume || 0;
            fiftyTwoWeekHigh = meta.fiftyTwoWeekHigh || 0;
            fiftyTwoWeekLow = meta.fiftyTwoWeekLow || 0;
            break;
          }
        }
      } catch {
        // ignore and continue
      }
    }

    if (currentPrice <= 0) {
      for (const symbol of symbolsToTry) {
        const av = await fetchAlphaVantage(symbol);
        if (av && av.price > 0) {
          currentPrice = av.price;
          prevClose = av.prevClose;
          dayHigh = av.high;
          dayLow = av.low;
          volume = av.volume;
          break;
        }
      }
    }

    if (currentPrice <= 0) {
      return new Response(JSON.stringify({ error: `Could not fetch price data for ${ticker}. Check the ticker symbol and try again.` }), {
        status: 422,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const [bars, bundle] = await Promise.all([
      fetchHistoricalBars(ticker),
      fetchTickerLiveBundle(ticker, isIndian),
    ]);

    const closes = bars?.closes || [currentPrice];
    const volumes = bars?.volumes || [volume];
    const returns = pctReturns(closes);
    const sigmaDaily = stdev(returns);
    const annualizedVol = sigmaDaily * Math.sqrt(252) * 100;
    const rsi14 = rsi(closes, 14);
    const sma20 = sma(closes, 20) || currentPrice;
    const sma50 = sma(closes, 50) || sma20;
    const sma200 = sma(closes, 200) || sma50;
    const latest20 = closes.slice(-20);
    const support = latest20.length > 0 ? percentile(latest20, 0.15) : currentPrice * 0.95;
    const resistance = latest20.length > 0 ? percentile(latest20, 0.85) : currentPrice * 1.05;
    const realizedSharpe = sharpeFromReturns(returns);
    const realizedSortino = sortinoFromReturns(returns);
    const drawdown = maxDrawdown(closes);
    const changePct = prevClose > 0 ? ((currentPrice - prevClose) / prevClose) * 100 : 0;
    const volumeRatio = mean(volumes.slice(-20)) > 0 ? volume / Math.max(mean(volumes.slice(-20)), 1) : 1;
    const trend = currentPrice > sma20 && sma20 >= sma50 ? "bullish" : currentPrice < sma20 && sma20 <= sma50 ? "bearish" : "sideways";
    const maSignal = currentPrice > sma200 * 1.01 ? "above_200dma" : currentPrice < sma200 * 0.99 ? "below_200dma" : "crossing";
    const posIn52w = fiftyTwoWeekHigh > fiftyTwoWeekLow
      ? ((currentPrice - fiftyTwoWeekLow) / (fiftyTwoWeekHigh - fiftyTwoWeekLow)) * 100
      : 50;

    const marketCapValue = isIndian
      ? bundle.screener?.marketCap ?? null
      : bundle.yahoo?.marketCap ?? null;
    const sector = bundle.screener?.industry || bundle.yahoo?.sector || bundle.yahoo?.industry || null;
    const pe = bundle.screener?.pe ?? bundle.yahoo?.pe ?? null;
    const pbv = bundle.screener?.pb ?? bundle.yahoo?.priceToBook ?? null;
    const dividendYield = bundle.screener?.dividendYield ?? bundle.yahoo?.dividendYield ?? null;
    const roe = bundle.screener?.roe ?? (bundle.yahoo?.returnOnEquity != null ? bundle.yahoo.returnOnEquity * 100 : null);
    const debtToEquity = bundle.yahoo?.debtToEquity ?? null;
    const beta = bundle.yahoo?.beta ?? round(clamp(annualizedVol / 22, 0.65, 2.75), 2);
    const marketCap = inferMarketCapCategory(isIndian, marketCapValue);
    const { news, overallSentiment, totalPressure } = mapNews(bundle);

    const riskBreakdown = inferRiskBreakdown({
      annualizedVol,
      sector,
      debtToEquity,
      beta,
      news,
      ticker,
      overallSentiment,
    });
    const riskScore = Math.round(
      riskBreakdown.volatility * 0.28 +
      riskBreakdown.sector * 0.16 +
      riskBreakdown.regulatory * 0.22 +
      riskBreakdown.financial * 0.20 +
      riskBreakdown.macro * 0.14
    );
    const riskLevel = riskScore >= 67 ? "High" : riskScore >= 40 ? "Medium" : "Low";

    const keyRisks = [
      annualizedVol > 35 ? `Realized volatility is elevated at ${round(annualizedVol, 1)}% annualized.` : "Volatility is contained relative to typical single-name equity swings.",
      debtToEquity != null && debtToEquity > 80 ? `Leverage is heavy with debt/equity near ${round(debtToEquity, 1)}.` : `Balance-sheet stress is moderate${debtToEquity != null ? ` with debt/equity near ${round(debtToEquity, 1)}` : " based on available public data"}.`,
      posIn52w > 80 ? `Price is near the top of its 52-week range (${round(posIn52w, 0)}%), so upside may need fresh catalysts.` : posIn52w < 25 ? `Price is in the lower quartile of its 52-week range (${round(posIn52w, 0)}%), which raises downside persistence risk.` : `Price is mid-range at ${round(posIn52w, 0)}% of the 52-week band.`,
      news.some((item) => item.sentiment < -20) ? "Recent headline flow includes adverse event language that can pressure the tape." : "Recent headline flow is not signaling a major negative shock.",
    ].slice(0, 4);

    const monthlySigma = sigmaDaily > 0 ? sigmaDaily * Math.sqrt(21) : Math.max(Math.abs(changePct) / 100, 0.04);
    const bullRange: [number, number] = [
      round(currentPrice * (1 + monthlySigma * 0.45)),
      round(currentPrice * (1 + monthlySigma * 1.15)),
    ];
    const neutralRange: [number, number] = [
      round(currentPrice * (1 - monthlySigma * 0.3)),
      round(currentPrice * (1 + monthlySigma * 0.3)),
    ];
    const bearRange: [number, number] = [
      round(Math.max(0.01, currentPrice * (1 - monthlySigma * 1.15))),
      round(Math.max(0.01, currentPrice * (1 - monthlySigma * 0.45))),
    ];

    let signal = 0;
    if (trend === "bullish") signal += 2;
    if (trend === "bearish") signal -= 2;
    if (rsi14 >= 45 && rsi14 <= 68) signal += 1;
    if (rsi14 >= 72) signal -= 1;
    if (overallSentiment > 15) signal += 1;
    if (overallSentiment < -15) signal -= 1;
    if (currentPrice > resistance) signal += 1;
    if (currentPrice < support) signal -= 1;
    if (riskScore >= 72) signal -= 1;
    if (realizedSharpe > 0.75) signal += 1;
    if (realizedSharpe < -0.2) signal -= 1;

    const dataCoverage = [
      currentPrice > 0,
      closes.length >= 90,
      sector != null,
      pe != null || pbv != null || roe != null,
      news.length > 0,
    ].filter(Boolean).length;

    // ---- Entry-price-aware adjustments ----
    const pnlPct = ((currentPrice - buyPrice) / buyPrice) * 100;
    // If holder is deeply underwater AND structure is broken, lean Exit
    if (pnlPct < -15 && trend !== "bullish") signal -= 2;
    // If holder is meaningfully in profit but structure decays, take profit (Exit-leaning)
    if (pnlPct > 25 && trend === "bearish") signal -= 1;
    // Mean-reversion penalty: chasing 52w highs without a fresh breakout
    if (posIn52w > 85 && rsi14 > 70) signal -= 2;
    // Distance from support vs resistance — must have asymmetric upside to "Add"
    const upsideToResistance = ((resistance - currentPrice) / currentPrice) * 100;
    const downsideToSupport = ((currentPrice - support) / currentPrice) * 100;
    const rrRatio = downsideToSupport > 0.5 ? upsideToResistance / downsideToSupport : 0;
    if (rrRatio < 1.0) signal -= 1;        // poor R:R kills longs
    if (rrRatio >= 2.0) signal += 1;        // strong R:R rewards longs

    // ---- Probability-weighted expected return (drift-adjusted) ----
    const muDaily = mean(returns);
    const expReturn21d = (muDaily * 21 - 0.5 * sigmaDaily * sigmaDaily * 21) * 100; // log-drift approx in %
    if (expReturn21d > 2) signal += 1;
    if (expReturn21d < -2) signal -= 1;

    // ---- Stricter thresholds + new "Skip" bucket when edge is absent ----
    // Add: needs +3 confluences AND R:R >= 1.5 AND not stretched
    // Exit: needs -3 confluences OR (deeply underwater + bearish)
    // Skip: low data coverage OR conflicting signals near zero
    let suggestion: "Add" | "Exit" | "Hold" | "Skip";
    if (dataCoverage <= 2) {
      suggestion = "Skip";
    } else if (signal >= 3 && rrRatio >= 1.5 && posIn52w < 90) {
      suggestion = "Add";
    } else if (signal <= -3 || (pnlPct < -20 && trend === "bearish")) {
      suggestion = "Exit";
    } else if (Math.abs(signal) <= 1 && rrRatio < 1.5) {
      suggestion = "Skip";
    } else {
      suggestion = "Hold";
    }

    const confidence = clamp(
      Math.round(38 + dataCoverage * 6 + Math.abs(signal) * 5 + (trend === "sideways" ? -4 : 0) - Math.max(0, riskScore - 60) * 0.15 + (rrRatio >= 1.5 ? 4 : 0)),
      35,
      86,
    );

    const macroFactors = [
      `${sector || "Sector"} exposure is carrying a macro risk score of ${riskBreakdown.macro}/100.`,
      `20-day realized volatility is ${round(annualizedVol, 1)}% annualized with beta near ${round(beta, 2)}.`,
      news.length > 0
        ? `Recent headline pressure reads ${overallSentiment >= 0 ? "+" : ""}${overallSentiment} with net ${totalPressure >= 0 ? "+" : ""}${totalPressure}% short-horizon pressure.`
        : "Headline flow is thin, so conviction rests more heavily on price structure and fundamentals.",
    ];

    const verdict = suggestion === "Add"
      ? `${ticker} offers asymmetric upside: R:R ${rrRatio.toFixed(1)}:1 to ${currency} ${round(resistance)} with invalidation at ${currency} ${round(support)}. 21d drift modeled at ${expReturn21d >= 0 ? "+" : ""}${round(expReturn21d, 1)}%.`
      : suggestion === "Exit"
        ? `${ticker} fails the edge test: ${pnlPct < -15 ? `position is ${round(pnlPct, 1)}% underwater, ` : ""}structure is ${trend}, and downside path opens to ${currency} ${bearRange[0]}. Defend the book.`
        : suggestion === "Skip"
          ? `${ticker} shows NO ACTIONABLE EDGE right now — R:R ${rrRatio.toFixed(1)}:1 (need ≥1.5), signal score ${signal}, drift ${expReturn21d >= 0 ? "+" : ""}${round(expReturn21d, 1)}%. Sitting out is the trade.`
          : `${ticker} is range-bound between ${currency} ${neutralRange[0]} and ${currency} ${neutralRange[1]}. Hold existing exposure but do not add until R:R or trend improves.`;

    const confidenceReasoning = `Confidence is ${confidence}% — data coverage ${dataCoverage}/5, trend ${trend}, R:R ${rrRatio.toFixed(1)}:1, 21d drift ${expReturn21d >= 0 ? "+" : ""}${round(expReturn21d, 1)}%, position ${round(pnlPct, 1)}% from entry, composite risk ${riskScore}/100.`;

    const summary = [
      `${ticker} is trading at ${currency} ${round(currentPrice)} versus your entry at ${currency} ${round(buyPrice)}, with ${round(changePct, 2)}% day change and ${round(annualizedVol, 1)}% annualized realized volatility from the last ${returns.length} sessions.` ,
      `Trend structure is ${trend}: price is ${currentPrice >= sma20 ? "above" : "below"} the 20-day average (${currency} ${round(sma20)}) and ${maSignal === "above_200dma" ? "above" : maSignal === "below_200dma" ? "below" : "near"} the 200-day trend anchor (${currency} ${round(sma200)}).`,
      `${sector || "Public"} fundamentals show ${pe != null ? `P/E ${round(pe, 2)}` : "no clean P/E read"}${pbv != null ? `, P/B ${round(pbv, 2)}` : ""}${roe != null ? `, ROE ${round(roe, 1)}%` : ""}${debtToEquity != null ? `, and debt/equity ${round(debtToEquity, 1)}` : ""}.`,
      news.length > 0
        ? `Recent real headlines skew ${overallSentiment >= 0 ? "slightly constructive" : "defensive"}, with net pressure at ${totalPressure >= 0 ? "+" : ""}${totalPressure}%.`
        : "Recent headline coverage is light, so the read relies mostly on price, volume, and reported fundamentals.",
    ].join(" ");

    const hedgeStrike = round(support);
    const hedgeStrategy = suggestion === "Exit"
      ? `${ticker} can be defended with a protective put near ${currency} ${hedgeStrike} or a hard risk stop below ${currency} ${round(support)} until the price reclaims ${currency} ${round(resistance)}.`
      : `${ticker} can be hedged with a protective put near ${currency} ${hedgeStrike}, keeping invalidation tied to a sustained break below ${currency} ${round(support)}.`;

    const analysis = {
      analyzedAt: new Date().toISOString(),
      currentPrice: round(currentPrice),
      currency,
      riskLevel,
      riskScore,
      riskBreakdown: {
        volatilityRisk: riskBreakdown.volatility,
        sectorRisk: riskBreakdown.sector,
        regulatoryRisk: riskBreakdown.regulatory,
        financialRisk: riskBreakdown.financial,
        macroRisk: riskBreakdown.macro,
      },
      keyRisks,
      bullRange,
      neutralRange,
      bearRange,
      suggestion,
      confidence,
      confidenceReasoning,
      verdict,
      hedgeStrategy,
      summary,
      macroFactors,
      overallSentiment,
      totalPressure,
      sector: sector || "Unknown",
      assetClass: inferAssetClass(ticker),
      exchange: inferExchange(ticker, isIndian),
      marketCap,
      marketCapValue,
      pe: pe != null ? round(pe, 2) : null,
      pbv: pbv != null ? round(pbv, 2) : null,
      dividendYield: dividendYield != null ? round(dividendYield, 2) : null,
      beta: round(beta, 2),
      roe: roe != null ? round(roe, 2) : null,
      debtToEquity: debtToEquity != null ? round(debtToEquity, 2) : null,
      esgScore: null,
      technicals: {
        rsi: round(rsi14, 1),
        support: round(support),
        resistance: round(resistance),
        trend,
        maSignal,
      },
      news,
      targetPrice: bullRange[1],
      momentum: round((((currentPrice - sma20) / Math.max(sma20, 1)) * 100), 2),
      volatility: round(annualizedVol, 2),
      sentiment: overallSentiment,
      regime: trend === "bullish" ? "risk-on" : trend === "bearish" ? "risk-off" : "range-bound",
      quantMetrics: {
        sharpe1y: round(realizedSharpe, 2),
        sortino1y: round(realizedSortino, 2),
        maxDrawdown: round(drawdown, 2),
        sigmaAnnual: round(annualizedVol, 2),
        sessions: returns.length,
        source: bars?.source || "spot-only",
      },
    };

    return new Response(JSON.stringify(analysis), {
      headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0" },
    });
  } catch (error: any) {
    console.error("Error in analyze-stock:", error);
    if (error instanceof Response) return error;
    return new Response(JSON.stringify({ error: "Analysis failed", details: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
