import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { callAI, callAIParallel } from "../_shared/callAI.ts";
import { safeParseJSON } from "../_shared/safeParseJSON.ts";
import { requireAuth } from "../_shared/auth.ts";
import { fetchMacroCalendar, fetchYahooSummary } from "../_shared/liveData.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

const CURRENCY_TO_REGION: Record<string, { region: string; exchange: string; suffix: string }> = {
  INR: { region: "India (NSE/BSE)", exchange: "NSE", suffix: ".NS" },
  EUR: { region: "Europe (Euronext/XETRA)", exchange: "Euronext", suffix: ".PA/.DE" },
  GBP: { region: "UK (LSE)", exchange: "LSE", suffix: ".L" },
  JPY: { region: "Japan (TSE)", exchange: "TSE", suffix: ".T" },
  CNY: { region: "China (SSE/SZSE)", exchange: "SSE", suffix: ".SS/.SZ" },
  KRW: { region: "South Korea (KRX)", exchange: "KRX", suffix: ".KS" },
  AUD: { region: "Australia (ASX)", exchange: "ASX", suffix: ".AX" },
  CAD: { region: "Canada (TSX)", exchange: "TSX", suffix: ".TO" },
  BRL: { region: "Brazil (B3)", exchange: "B3", suffix: ".SA" },
  HKD: { region: "Hong Kong (HKEX)", exchange: "HKEX", suffix: ".HK" },
  SGD: { region: "Singapore (SGX)", exchange: "SGX", suffix: ".SI" },
};

const HEDGE_STRATEGIES = new Set(["sector_hedge", "correlation_hedge", "vol_arb"]);

const EARNINGS_KEYWORDS = [
  "earnings",
  "guidance",
  "revenue",
  "eps",
  "quarter",
  "outlook",
  "results",
  "forecast",
  "profit",
  "margin",
];

const POSITIVE_EVENT_WORDS = [
  "beat",
  "beats",
  "upside",
  "raised",
  "growth",
  "surge",
  "record",
  "strong",
  "upgrades",
  "bullish",
  "outperform",
  "rebound",
  "expands",
];

const NEGATIVE_EVENT_WORDS = [
  "miss",
  "misses",
  "cut",
  "cuts",
  "downgrade",
  "downgraded",
  "weak",
  "lawsuit",
  "probe",
  "bearish",
  "slowdown",
  "warning",
  "decline",
  "selloff",
  "slump",
];

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

type FilterTier = "strict" | "balanced" | "relaxed";

interface RealtimeSentiment {
  sentimentScore: number;
  sentimentLabel: string;
  earningsSignal: "bullish" | "neutral" | "bearish";
  headline: string;
  articleCount: number;
}

function toSentimentLabel(score: number): string {
  if (score >= 35) return "Bullish";
  if (score >= 12) return "Mild Bullish";
  if (score <= -35) return "Bearish";
  if (score <= -12) return "Mild Bearish";
  return "Neutral";
}

function parseTone(toneRaw: unknown): number {
  if (typeof toneRaw === "number") return toneRaw;
  if (typeof toneRaw === "string") {
    const first = toneRaw.split(",")[0];
    const parsed = Number(first);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function lexicalHeadlineScore(headline: string): number {
  const text = headline.toLowerCase();
  let score = 0;
  for (const w of POSITIVE_EVENT_WORDS) if (text.includes(w)) score += 1;
  for (const w of NEGATIVE_EVENT_WORDS) if (text.includes(w)) score -= 1;
  return score;
}

async function fetchTickerRealtimeSentiment(ticker: string, name?: string): Promise<RealtimeSentiment | null> {
  try {
    const safeTicker = ticker.replace(/"/g, "").trim();
    const safeName = (name || "").replace(/"/g, "").trim();
    const tickerQuery = `"${safeTicker}" OR "$${safeTicker}"`;
    const nameQuery = safeName && safeName.toUpperCase() !== safeTicker ? ` OR "${safeName}"` : "";
    const query = `${tickerQuery}${nameQuery} (earnings OR guidance OR outlook OR revenue OR analyst)`;
    const url = `https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(query)}&mode=ArtList&maxrecords=24&format=json&sort=DateDesc`;

    const res = await fetch(url, { headers: { "User-Agent": UA } });
    if (!res.ok) return null;
    const data = await res.json();
    const articles = Array.isArray(data?.articles) ? data.articles.slice(0, 20) : [];
    if (articles.length === 0) return null;

    let toneWeightedSum = 0;
    let lexicalWeightedSum = 0;
    let weightSum = 0;
    let earningsLexicalSum = 0;
    let earningsHits = 0;

    for (let i = 0; i < articles.length; i++) {
      const article = articles[i];
      const headline = String(article?.title || "");
      const lowerHeadline = headline.toLowerCase();
      const weight = Math.max(0.35, 1 - i * 0.05);
      const tone = parseTone(article?.tone);
      const lexical = lexicalHeadlineScore(headline);

      toneWeightedSum += tone * weight;
      lexicalWeightedSum += lexical * weight;
      weightSum += weight;

      if (EARNINGS_KEYWORDS.some((k) => lowerHeadline.includes(k))) {
        earningsHits += 1;
        earningsLexicalSum += lexical;
      }
    }

    const avgTone = weightSum > 0 ? toneWeightedSum / weightSum : 0;
    const avgLexical = weightSum > 0 ? lexicalWeightedSum / weightSum : 0;
    const avgEarningsLexical = earningsHits > 0 ? earningsLexicalSum / earningsHits : 0;

    const sentimentScore = clamp(
      Math.round(avgTone * 7 + avgLexical * 9 + avgEarningsLexical * 12),
      -100,
      100,
    );

    const earningsSignal: "bullish" | "neutral" | "bearish" =
      avgEarningsLexical > 0.5 || sentimentScore > 20
        ? "bullish"
        : avgEarningsLexical < -0.5 || sentimentScore < -20
          ? "bearish"
          : "neutral";

    return {
      sentimentScore,
      sentimentLabel: toSentimentLabel(sentimentScore),
      earningsSignal,
      headline: String(articles[0]?.title || "").slice(0, 180),
      articleCount: articles.length,
    };
  } catch {
    return null;
  }
}

function computeOptimalPositionSize(params: {
  portfolioValue: number;
  price: number;
  stopLoss: number;
  confidence: number;
  volatility: number;
  filterTier: FilterTier;
  isHedge: boolean;
  sentimentScore: number;
  targetPrice?: number;
  userBudget?: number;
}): {
  suggestedQty: number;
  allocationPct: number;
  positionValue: number;
  riskBudgetPct: number;
  kellyFraction: number;
  sizingBasis: string;
} {
  const {
    portfolioValue,
    price,
    stopLoss,
    confidence,
    volatility,
    filterTier,
    isHedge,
    sentimentScore,
    targetPrice,
    userBudget,
  } = params;

  if (!Number.isFinite(price) || price <= 0) {
    return { suggestedQty: 1, allocationPct: 0, positionValue: price || 0, riskBudgetPct: 0, kellyFraction: 0, sizingBasis: "invalid_price" };
  }

  // Capital base: prefer explicit user budget when provided (user is telling us
  // exactly how much they want to deploy on this single idea). Otherwise fall
  // back to portfolio value with a reasonable floor.
  const hasBudget = Number.isFinite(userBudget) && (userBudget as number) > 0;
  const capitalBase = hasBudget
    ? (userBudget as number)
    : Math.max(10_000, Number.isFinite(portfolioValue) ? portfolioValue : 100_000);
  const safePortfolio = Math.max(10_000, Number.isFinite(portfolioValue) ? portfolioValue : 100_000);
  const baseRiskPctByTier: Record<FilterTier, number> = {
    strict: 0.012,
    balanced: 0.009,
    relaxed: 0.006,
  };
  const maxAllocPctByTier: Record<FilterTier, number> = {
    strict: 0.13,
    balanced: 0.10,
    relaxed: 0.07,
  };

  const confidenceFactor = clamp(confidence / 70, 0.65, 1.35);
  const sentimentFactor = clamp(1 + sentimentScore / 240, 0.7, 1.25);
  const volFactor = clamp(30 / Math.max(volatility || 25, 12), 0.55, 1.25);

  let riskBudgetPct = baseRiskPctByTier[filterTier] * confidenceFactor * sentimentFactor * volFactor;
  if (isHedge) riskBudgetPct *= 0.85;
  riskBudgetPct = clamp(riskBudgetPct, isHedge ? 0.004 : 0.005, isHedge ? 0.011 : 0.018);

  const stopDistancePct = clamp((price - stopLoss) / price, 0.03, 0.25);
  const riskBudgetDollar = safePortfolio * riskBudgetPct;

  // ─── Kelly criterion ──────────────────────────────────────────
  // f* = (p·b − q) / b   where b = win/loss ratio, p = win prob, q = 1−p.
  // We derive p from confidence (calibrated, not raw) and b from the
  // target/stop asymmetry. Then apply a 0.25× fractional-Kelly safety
  // discount (industry standard) to stay survivable.
  const winProb = clamp(0.40 + (confidence - 50) / 200, 0.40, 0.78);
  const upPct = Number.isFinite(targetPrice) && (targetPrice as number) > price
    ? clamp(((targetPrice as number) - price) / price, 0.02, 0.60)
    : stopDistancePct * 1.8; // assume ~1.8R if no target supplied
  const b = upPct / Math.max(stopDistancePct, 0.01);
  const rawKelly = (winProb * b - (1 - winProb)) / Math.max(b, 0.01);
  const fractionalKelly = clamp(rawKelly * 0.25, 0, 0.20); // cap at 20% of capital
  const qtyByKelly = Math.floor((capitalBase * fractionalKelly) / price);

  const qtyByRisk = Math.floor(riskBudgetDollar / (price * stopDistancePct));
  const maxAllocPct = clamp(maxAllocPctByTier[filterTier] * confidenceFactor * (isHedge ? 0.8 : 1), 0.04, isHedge ? 0.12 : 0.18);
  const qtyByAllocation = Math.floor((safePortfolio * maxAllocPct) / price);
  const hardCapQty = Math.floor((safePortfolio * 0.2) / price);
  // If user gave us a budget, allow up to 100% of THAT budget on this idea
  // (it's their explicit deployable capital). Otherwise the portfolio caps
  // above keep us in check.
  const qtyByBudget = hasBudget ? Math.floor(capitalBase / price) : Infinity;

  // Pick the LARGEST of the disciplined sizers (Kelly vs risk-budget vs
  // allocation), then bound it by the absolute caps. This stops the old
  // behaviour of always collapsing to qty=1 when one path was tight.
  const aggressiveQty = Math.max(qtyByKelly, qtyByRisk, qtyByAllocation);
  const boundedQty = Math.min(aggressiveQty, hardCapQty, qtyByBudget);
  const suggestedQty = Math.max(1, boundedQty);

  // Tag which constraint is binding so the UI can explain the size.
  let sizingBasis = "kelly";
  if (suggestedQty === qtyByBudget && hasBudget) sizingBasis = "user_budget";
  else if (suggestedQty === hardCapQty) sizingBasis = "hard_cap_20pct";
  else if (qtyByKelly >= qtyByRisk && qtyByKelly >= qtyByAllocation) sizingBasis = "kelly";
  else if (qtyByRisk >= qtyByAllocation) sizingBasis = "risk_budget";
  else sizingBasis = "max_allocation";

  const positionValue = suggestedQty * price;
  const allocationPct = (positionValue / safePortfolio) * 100;

  return {
    suggestedQty,
    allocationPct: Math.round(allocationPct * 100) / 100,
    positionValue: Math.round(positionValue * 100) / 100,
    riskBudgetPct: Math.round(riskBudgetPct * 10000) / 100,
    kellyFraction: Math.round(fractionalKelly * 10000) / 100,
    sizingBasis,
  };
}

function deriveHedgePlan(params: {
  strategy: string;
  sector: string;
  regimeType: string;
  sentimentScore: number;
  volatility: number;
  indiaMode?: boolean;
}): { hedgeInstrument: string; hedgeRatioPct: number; hedgeOverlay: string } {
  const strategy = (params.strategy || "equity").toLowerCase();
  const sector = (params.sector || "").toLowerCase();

  if (HEDGE_STRATEGIES.has(strategy)) {
    return {
      hedgeInstrument: "SELF-HEDGE",
      hedgeRatioPct: 100,
      hedgeOverlay: "This position is a direct hedge sleeve. Keep size controlled and rebalance weekly.",
    };
  }

  if (params.indiaMode) {
    if (params.regimeType === "crisis" || params.sentimentScore <= -30 || params.volatility >= 45) {
      return {
        hedgeInstrument: "INDIAVIX.NS",
        hedgeRatioPct: 14,
        hedgeOverlay: "Event-volatility overlay: buy Nifty PUT options or India VIX futures during earnings/event shock windows (~14% notional).",
      };
    }
    if (sector.includes("technology") || sector.includes("it")) {
      return {
        hedgeInstrument: "NIFTYBEES.NS",
        hedgeRatioPct: 18,
        hedgeOverlay: "Nifty beta hedge: buy Nifty PUT options to cushion tech-led drawdowns. Alternative: short Nifty IT index futures.",
      };
    }
    if (sector.includes("financ") || sector.includes("bank")) {
      return {
        hedgeInstrument: "BANKBEES.NS",
        hedgeRatioPct: 16,
        hedgeOverlay: "Bank Nifty hedge: buy Bank Nifty PUT options at 95% strike to protect against banking sector drawdowns.",
      };
    }
    if (sector.includes("energy") || sector.includes("oil")) {
      return {
        hedgeInstrument: "GOLDBEES.NS",
        hedgeRatioPct: 15,
        hedgeOverlay: "Commodity hedge: pair with Gold Bees ETF to offset energy/commodity-linked downside. Gold is a natural safe haven in INR terms.",
      };
    }
    return {
      hedgeInstrument: "NIFTYBEES.NS",
      hedgeRatioPct: 12,
      hedgeOverlay: "Broad-market hedge: buy Nifty PUT options or hold inverse Nifty position to reduce market beta if risk-off conditions accelerate.",
    };
  }

  if (params.regimeType === "crisis" || params.sentimentScore <= -30 || params.volatility >= 45) {
    return {
      hedgeInstrument: "VIXY",
      hedgeRatioPct: 14,
      hedgeOverlay: "Event-volatility overlay: allocate ~14% notional to VIXY during earnings/event shock windows.",
    };
  }

  if (sector.includes("technology") || sector.includes("communication")) {
    return {
      hedgeInstrument: "PSQ",
      hedgeRatioPct: 18,
      hedgeOverlay: "Nasdaq beta hedge: pair with PSQ to cushion tech-led drawdowns around earnings cycles.",
    };
  }

  if (sector.includes("energy")) {
    return {
      hedgeInstrument: "XLE",
      hedgeRatioPct: 16,
      hedgeOverlay: "Sector hedge: pair with XLE options/futures overlay to mitigate crude-linked downside.",
    };
  }

  return {
    hedgeInstrument: "SH",
    hedgeRatioPct: 12,
    hedgeOverlay: "Broad-market hedge: hold SH overlay to reduce S&P beta if risk-off conditions accelerate.",
  };
}

// ── Yahoo Finance helpers ──────────────────────────────────────────
async function fetchYahooChart(symbol: string, range = "3mo", interval = "1d") {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000); // 8s per-fetch timeout
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${interval}&range=${range}&_t=${Date.now()}`;
    let res: Response;
    try {
      res = await fetch(url, { headers: { "User-Agent": UA, "Cache-Control": "no-cache, no-store" }, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) { await res.text(); return null; }
    const data = await res.json();
    const result = data?.chart?.result?.[0];
    if (!result) return null;

    const meta = result.meta;
    const closes: number[] = [];
    const volumes: number[] = [];
    const rawCloses = result.indicators?.quote?.[0]?.close || [];
    const rawVolumes = result.indicators?.quote?.[0]?.volume || [];
    const highs: number[] = result.indicators?.quote?.[0]?.high || [];
    const lows: number[] = result.indicators?.quote?.[0]?.low || [];

    for (let i = 0; i < rawCloses.length; i++) {
      if (rawCloses[i] != null && rawCloses[i] > 0) {
        closes.push(rawCloses[i]);
        volumes.push(rawVolumes[i] || 0);
      }
    }

    const prevClose = meta.chartPreviousClose || meta.previousClose || 0;
    // Price freshness check
    const marketTime = meta.regularMarketTime || 0;
    const nowSec = Math.floor(Date.now() / 1000);
    const stalePrice = marketTime > 0 && (nowSec - marketTime) > 8 * 3600;

    return {
      price: meta.regularMarketPrice || 0,
      currency: meta.currency || "USD",
      change: prevClose > 0 ? ((meta.regularMarketPrice - prevClose) / prevClose) * 100 : 0,
      volume: meta.regularMarketVolume || 0,
      fiftyTwoHigh: meta.fiftyTwoWeekHigh || 0,
      fiftyTwoLow: meta.fiftyTwoWeekLow || 0,
      closes,
      volumes,
      highs: highs.filter(h => h != null && h > 0),
      lows: lows.filter(l => l != null && l > 0),
      stalePrice,
    };
  } catch { return null; }
}

// ── Quantitative math ──────────────────────────────────────────────
function logReturns(prices: number[]): number[] {
  const r: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    if (prices[i] > 0 && prices[i - 1] > 0) r.push(Math.log(prices[i] / prices[i - 1]));
  }
  return r;
}

function mean(arr: number[]): number {
  return arr.length === 0 ? 0 : arr.reduce((a, b) => a + b, 0) / arr.length;
}

function stddev(arr: number[]): number {
  if (arr.length < 2) return 0;
  const m = mean(arr);
  return Math.sqrt(arr.reduce((s, x) => s + (x - m) ** 2, 0) / (arr.length - 1));
}

function sharpeRatio(returns: number[], rfDaily = 0.0002): number {
  if (returns.length < 10) return 0;
  const excessMean = mean(returns) - rfDaily;
  const sd = stddev(returns);
  return sd === 0 ? 0 : (excessMean / sd) * Math.sqrt(252);
}

function maxDrawdown(prices: number[]): number {
  if (prices.length < 2) return 0;
  let peak = prices[0], mdd = 0;
  for (const p of prices) {
    if (p > peak) peak = p;
    const dd = (peak - p) / peak;
    if (dd > mdd) mdd = dd;
  }
  return mdd * 100;
}

function pearsonCorrelation(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  if (n < 10) return 0;
  const ma = mean(a.slice(0, n)), mb = mean(b.slice(0, n));
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < n; i++) {
    const xa = a[i] - ma, xb = b[i] - mb;
    num += xa * xb;
    da += xa * xa;
    db += xb * xb;
  }
  const denom = Math.sqrt(da * db);
  return denom === 0 ? 0 : num / denom;
}

function zScore(prices: number[], window = 20): number {
  if (prices.length < window) return 0;
  const recent = prices.slice(-window);
  const m = mean(recent);
  const s = stddev(recent);
  return s === 0 ? 0 : (prices[prices.length - 1] - m) / s;
}

function annualizedVol(returns: number[]): number {
  return stddev(returns) * Math.sqrt(252) * 100;
}

// ── Max profit target using quant methods ──────────────────────────
function computeMaxProfitTarget(
  closes: number[],
  highs: number[],
  price: number,
  vol: number,
  sr: number,
): { maxTarget: number; confidence: number; method: string } {
  if (closes.length < 20 || price <= 0) {
    return { maxTarget: price * 1.1, confidence: 20, method: "fallback" };
  }

  // Method 1: Statistical resistance — 90th percentile of recent highs
  const recentHighs = highs.length > 0 ? highs.slice(-60) : closes.slice(-60);
  const sorted = [...recentHighs].sort((a, b) => a - b);
  const p90 = sorted[Math.floor(sorted.length * 0.9)];
  const p95 = sorted[Math.floor(sorted.length * 0.95)];

  // Method 2: Drift-based target — expected price using GBM over 60 trading days
  const returns = logReturns(closes);
  const mu = mean(returns);
  const sigma = stddev(returns);
  const driftTarget = price * Math.exp((mu - 0.5 * sigma * sigma) * 60 + sigma * Math.sqrt(60) * 1.28); // 90th percentile path

  // Method 3: Fibonacci extension from recent swing
  const low20 = Math.min(...closes.slice(-20));
  const high20 = Math.max(...closes.slice(-20));
  const fib161 = low20 + (high20 - low20) * 1.618;

  // Weight by Sharpe quality
  const sharpeWeight = Math.max(0, Math.min(sr / 2, 1));
  const maxTarget = Math.round(
    (p90 * 0.3 + driftTarget * (0.3 + sharpeWeight * 0.15) + fib161 * (0.4 - sharpeWeight * 0.15)) * 100
  ) / 100;

  // Confidence based on how achievable the target is
  const upliftPct = ((maxTarget - price) / price) * 100;
  const confidence = Math.round(
    Math.max(20, Math.min(90, 80 - upliftPct * 1.5 + sr * 10 - vol * 0.3))
  );

  return {
    maxTarget: Math.max(maxTarget, price * 1.03), // minimum 3% upside
    confidence: Math.max(15, Math.min(95, confidence)),
    method: "resistance+drift+fibonacci",
  };
}

// ── Composite portfolio return series ──────────────────────────────
function portfolioReturnSeries(
  tickerCloses: Record<string, number[]>,
  weights: Record<string, number>
): number[] {
  const tickers = Object.keys(weights).filter(t => tickerCloses[t]?.length > 10);
  if (tickers.length === 0) return [];

  const minLen = Math.min(...tickers.map(t => tickerCloses[t].length));
  const totalWeight = tickers.reduce((s, t) => s + (weights[t] || 0), 0) || 1;

  const series: number[] = [];
  for (let i = 1; i < minLen; i++) {
    let dayReturn = 0;
    for (const t of tickers) {
      const w = (weights[t] || 0) / totalWeight;
      const c = tickerCloses[t];
      if (c[i] > 0 && c[i - 1] > 0) {
        dayReturn += w * Math.log(c[i] / c[i - 1]);
      }
    }
    series.push(dayReturn);
  }
  return series;
}

// ── Strategy diversity enforcement ─────────────────────────────────
const REQUIRED_STRATEGIES = ["pair_trade", "sector_hedge", "correlation_hedge", "mean_reversion", "vol_arb"];
const MIN_STRATEGY_TYPES = 5; // Must have at least 5 different strategy types

const ALLOWED_STRATEGIES = new Set([
  "equity",
  "pair_trade",
  "futures_leverage",
  "vol_arb",
  "sector_hedge",
  "correlation_hedge",
  "mean_reversion",
  "momentum",
]);

// NOTE: deterministic fallback universes removed by design. The engine now returns
// only AI-generated picks that survive the live data + portfolio risk filters.
// If nothing survives in a given cycle, the response is an honest empty set.

function normalizeCandidate(rec: any): any | null {
  const ticker = String(rec?.ticker || "").trim().toUpperCase();
  if (!ticker || ticker.length > 16) return null;

  const strategy = String(rec?.strategy || "equity").toLowerCase();
  const normalizedStrategy = ALLOWED_STRATEGIES.has(strategy) ? strategy : "equity";
  const marketCap = String(rec?.marketCap || "large").toLowerCase();
  const normalizedMarketCap = ["mega", "large", "mid", "small", "micro"].includes(marketCap)
    ? marketCap
    : "large";

  const entryZone = Array.isArray(rec?.entryZone) && rec.entryZone.length >= 2
    ? [Number(rec.entryZone[0]) || 0, Number(rec.entryZone[1]) || 0]
    : [0, 0];

  return {
    ticker,
    name: String(rec?.name || ticker),
    assetClass: String(rec?.assetClass || "Equity"),
    exchange: String(rec?.exchange || "NASDAQ"),
    currency: String(rec?.currency || "USD"),
    currentEstPrice: Number(rec?.currentEstPrice) || 0,
    entryZone,
    targetPrice: Number(rec?.targetPrice) || 0,
    stopLoss: Number(rec?.stopLoss) || 0,
    timeHorizon: String(rec?.timeHorizon || "3M"),
    suggestedQty: Math.max(1, Math.round(Number(rec?.suggestedQty) || 1)),
    confidence: Math.max(1, Math.min(99, Math.round(Number(rec?.confidence) || 60))),
    thesis: String(rec?.thesis || ""),
    catalyst: String(rec?.catalyst || ""),
    hedgingStrategy: String(rec?.hedgingStrategy || ""),
    riskReward: String(rec?.riskReward || "1:2.0"),
    sector: String(rec?.sector || "Diversified"),
    tags: Array.isArray(rec?.tags) ? rec.tags.slice(0, 6) : [],
    riskProfile: Array.isArray(rec?.riskProfile) ? rec.riskProfile.slice(0, 6) : [],
    strategy: normalizedStrategy,
    pairedInstrument: rec?.pairedInstrument || null,
    pairedStructure: rec?.pairedStructure || null,
    capitalEfficiency: Number(rec?.capitalEfficiency) > 0 ? Number(rec.capitalEfficiency) : 1,
    correlationToPortfolio: String(rec?.correlationToPortfolio || "low"),
    marketCap: normalizedMarketCap,
  };
}

function dedupeCandidates(candidates: any[]): any[] {
  const seen = new Set<string>();
  const out: any[] = [];
  for (const rec of candidates) {
    const normalized = normalizeCandidate(rec);
    if (!normalized) continue;
    if (seen.has(normalized.ticker)) continue;
    seen.add(normalized.ticker);
    out.push(normalized);
  }
  return out;
}

const SECTOR_THESIS: Record<string, { thesis: string; catalyst: string }> = {
  Technology: { thesis: "Secular AI/cloud tailwinds with expanding margins and strong R&D moat. Enterprise adoption acceleration creates durable revenue visibility.", catalyst: "AI capex cycle and enterprise digital transformation driving order book growth." },
  Financials: { thesis: "Rising net interest margins and credit quality improvement in current rate environment. Strong capital return program with buybacks and dividends.", catalyst: "Credit cycle normalization and loan growth reacceleration as rate uncertainty clears." },
  Energy: { thesis: "Supply discipline from OPEC+ and underinvestment cycle supports pricing power. Free cash flow yield among highest in market.", catalyst: "Global energy security spending and dividend growth attracting institutional reallocation." },
  Healthcare: { thesis: "Pipeline optionality with multiple late-stage catalysts. Defensive cash flows with pricing power in specialty segments.", catalyst: "FDA approval cycle and aging demographics driving structural demand growth." },
  "Consumer Discretionary": { thesis: "Consumer spending resilience with market share gains from weaker competitors. Margin expansion through operational efficiency.", catalyst: "Seasonal demand uptick and inventory normalization supporting earnings beat potential." },
  "Consumer Staples": { thesis: "Defensive positioning with consistent dividend growth and pricing power in inflationary environments.", catalyst: "Volume recovery and premiumization trends supporting organic revenue acceleration." },
  Communication: { thesis: "Digital advertising recovery and subscriber monetization improvements. Platform network effects create widening competitive moat.", catalyst: "Ad spend rebound and new product monetization driving revenue re-rating." },
  Industrials: { thesis: "Infrastructure spending cycle and reshoring trends creating multi-year order backlog visibility.", catalyst: "Government infrastructure bills and defense spending uplift driving order growth." },
  Utilities: { thesis: "Regulated returns with data center power demand creating secular growth overlay on traditional defensive profile.", catalyst: "AI-driven electricity demand surge and rate base expansion supporting earnings growth." },
  Commodities: { thesis: "Supply constraints and geopolitical risk premium supporting commodity prices. Portfolio diversification benefits in risk-off environments.", catalyst: "Central bank gold buying and inflation hedge demand from institutional allocators." },
  Index: { thesis: "Broad market exposure with low tracking error. Efficient vehicle for tactical allocation and hedging strategies.", catalyst: "Market breadth improvement and sectoral rotation supporting index-level returns." },
  Hedge: { thesis: "Inverse correlation provides portfolio insurance during drawdown events. Tactical position to reduce net market exposure.", catalyst: "Elevated VIX regime and macro uncertainty creating positive expected value for hedges." },
};

function normalizeAssetType(value: string): string {
  const normalized = String(value || "").trim().toLowerCase();
  if (normalized === "stocks" || normalized === "stock" || normalized === "equity" || normalized === "equities") return "equity";
  if (normalized === "etfs" || normalized === "etf") return "etf";
  if (normalized === "mutual funds" || normalized === "mutual fund" || normalized === "fund") return "mutual_fund";
  if (normalized === "bonds" || normalized === "bond" || normalized === "fixed income") return "bond";
  if (normalized === "commodities" || normalized === "commodity") return "commodity";
  if (normalized === "crypto" || normalized === "cryptocurrency") return "crypto";
  return normalized;
}

function normalizeSectorPreference(value: string): string {
  const normalized = String(value || "").trim().toLowerCase();
  if (["banking", "financial", "financials"].includes(normalized)) return "financials";
  if (["fmcg", "consumer staples"].includes(normalized)) return "consumer staples";
  if (["consumer", "consumer discretionary"].includes(normalized)) return "consumer discretionary";
  if (["auto", "automobile", "automobiles"].includes(normalized)) return "consumer discretionary";
  if (["pharma", "healthcare"].includes(normalized)) return "healthcare";
  if (["infrastructure", "industrials"].includes(normalized)) return "industrials";
  if (["metals", "materials"].includes(normalized)) return "materials";
  return normalized;
}

function summarizeRejects(rejectReasons: Record<string, number>) {
  const labels: Record<string, string> = {
    F0_no_price_history: "lacked usable price history",
    F0_thin_history: "had too little trading history",
    F1_already_held: "were already in your portfolio",
    F1_previous_repeat: "were repeats from recent refreshes",
    F1b_sell_or_highrisk: "conflicted with existing sell or high-risk warnings",
    F1b_avoided_sector: "fell into sectors the system is avoiding",
    F2_target_below_price: "had targets below live price (target auto-recomputed)",
    F2_invalid_target: "had structurally invalid target prices",
    F3_illiquid: "failed the liquidity bar",
    F3_microcap_or_small: "were niche small or micro-cap names",
    F3_loss_maker: "were loss-making businesses",
    F3_weak_quality: "had weak quality or shrinking fundamentals",
    F4_no_upside_extreme_risk: "had poor upside versus extreme risk",
  };

  const ranked = Object.entries(rejectReasons)
    .filter(([key, count]) => count > 0 && key !== "tier_relaxed")
    .sort((a, b) => b[1] - a[1]);

  const rejectSummary = ranked.slice(0, 3).map(([key, count]) => `${count} ${labels[key] || key}`);
  const rejectHeadline = ranked[0]
    ? `Most rejected names ${labels[ranked[0][0]] || "failed screening"}`
    : "No candidate cleared the screening rules";

  return { rejectSummary, rejectHeadline };
}

// Deterministic fallback candidate builder removed by design.

// ── Main serve ─────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Auto-Repair Department: tracks every self-healing step the pipeline takes.
  // When something fails or yields too few results, we don't throw — we log the
  // repair action, fall forward to the next recovery stage, and keep going so
  // the panel always renders real content.
  const repairTrail: string[] = [];
  const repairLog = (step: string) => {
    repairTrail.push(step);
    console.log(`[desirable-assets auto-repair] ${step}`);
  };

  try {
    await requireAuth(req, corsHeaders);
    const body = await req.json().catch(() => ({}));
    const portfolioTickers: string[] = body.portfolioTickers || [];
    const portfolioWeights: Record<string, number> = body.portfolioWeights || {};
    const portfolioSectors: Record<string, string> = body.portfolioSectors || {};
    const portfolioSignals: {
      sellTickers?: string[];
      highRiskTickers?: string[];
      avoidSectors?: string[];
    } = body.portfolioSignals || {};
    const sellTickers: string[] = (portfolioSignals.sellTickers || []).map((t) => String(t).toUpperCase());
    const highRiskTickers: string[] = (portfolioSignals.highRiskTickers || []).map((t) => String(t).toUpperCase());
    const avoidSectorsLower: string[] = (portfolioSignals.avoidSectors || [])
      .map((s) => String(s).toLowerCase().trim())
      .filter(Boolean);
    const portfolioValue = body.portfolioValue || 100000;
    const baseCurrency = (body.baseCurrency || "USD").toUpperCase();
    const provider = String(body.provider || "mistral").toLowerCase();
    const indiaMode = body.indiaMode === true;
    const previousTickers: string[] = body.previousTickers || []; // anti-repeat
    const userBudget: number | undefined = body.userBudget;
    const preferredAssetTypes: string[] | undefined = body.preferredAssetTypes;
    const preferredSectors: string[] | undefined = body.preferredSectors;
    const preferredHorizon: string | undefined = (body.preferredHorizon || "").toString().toLowerCase() || undefined;
    // Allowed: intraday | short_term | medium_term | long_term
    const HORIZON_LABEL: Record<string, string> = {
      intraday: "Intraday (same-day, hours)",
      short_term: "Short-term (1 day – 4 weeks)",
      medium_term: "Medium-term (1 – 6 months)",
      long_term: "Long-term (6 months+)",
    };

    // ── ODGS — Outcome Density Gradient System (client-supplied) ──
    // The user's own learned profit field. Past trades teach the engine
    // which assets, regimes, and synergies have been profitable for THIS
    // user. We surface that to the AI and use it as a reranker on the
    // server. Never overrides hard quant filters; only tilts selection.
    const odgs = body.odgs && typeof body.odgs === "object" ? body.odgs : null;
    const odgsHotMap = new Map<string, number>();
    const odgsColdMap = new Map<string, number>();
    const odgsScarSet = new Set<string>();
    if (odgs) {
      for (const h of (odgs.hotAssets || [])) {
        if (h?.ticker) odgsHotMap.set(String(h.ticker).toUpperCase(), Number(h.bias) || 1);
      }
      for (const c of (odgs.coldAssets || [])) {
        if (c?.ticker) odgsColdMap.set(String(c.ticker).toUpperCase(), Number(c.bias) || 1);
      }
      for (const t of (odgs.scarTickers || [])) {
        if (t) odgsScarSet.add(String(t).toUpperCase());
      }
    }

    const regionInfo = CURRENCY_TO_REGION[baseCurrency];
    const isUSUser = !regionInfo || baseCurrency === "USD";
    const seed = Math.floor(Math.random() * 99999);
    // Reliability-first: avoid Cloudflare free-tier neuron exhaustion loops.
    const effectiveProvider = provider === "cloudflare" ? "cloudflare" : "mistral";

    const existingSectors = [...new Set(Object.values(portfolioSectors))].filter(Boolean);
    const portfolioContext = portfolioTickers.length > 0
      ? `Existing portfolio: ${portfolioTickers.map(t => `${t} (${portfolioSectors[t] || "unknown"}, weight: ${((portfolioWeights[t] || 0) * 100).toFixed(1)}%)`).join(", ")}. Sectors already held: ${existingSectors.join(", ") || "none"}.`
      : "Empty portfolio — recommend foundational positions.";

    // Cross-module consistency: the Analysis & Risk modules already gave a verdict on each
    // holding. Desirable Assets MUST honour those verdicts, not contradict them.
    const crossModuleBlock = (sellTickers.length || highRiskTickers.length || avoidSectorsLower.length)
      ? `\n## CROSS-MODULE PORTFOLIO VERDICTS (HARD CONSTRAINT — DO NOT CONTRADICT):
${sellTickers.length ? `- Stock Analysis flagged these holdings as SELL/EXIT: ${sellTickers.join(", ")}. The user is being told to reduce exposure here. Do NOT recommend these tickers, close substitutes, direct competitors, or other names with the same business model.\n` : ""}${highRiskTickers.length ? `- Risk module flagged these holdings as HIGH RISK (riskScore ≥ 70): ${highRiskTickers.join(", ")}. Do NOT add more risk on top of this — avoid recommending high-volatility / high-beta names that would correlate with these.\n` : ""}${avoidSectorsLower.length ? `- AVOID these sectors entirely (already over-weighted with flagged-Sell or high-risk positions): ${avoidSectorsLower.join(", ")}. Zero recommendations from these sectors.\n` : ""}If a candidate would clearly contradict the user's existing Sell or risk warnings, REJECT it and pick something else. Recommendations must be additive to the portfolio's risk-adjusted profile, never additive to its problems.\n`
      : "";

    const homeMarketRule = indiaMode
      ? "ALL recommendations must be Indian equities listed on NSE (.NS suffix) or BSE (.BO suffix), Indian ETFs (e.g. NIFTYBEES.NS, GOLDBEES.NS), or Indian F&O instruments. No foreign stocks whatsoever."
      : isUSUser
        ? "4-5 US equities from DIFFERENT sectors and market caps (include small/mid-cap under $10B)"
        : `4-5 stocks from ${regionInfo.region} listed on ${regionInfo.exchange} with Yahoo Finance suffix ${regionInfo.suffix}`;

    // Anti-repeat instruction
    // Scoped anti-repeat: only the most recent slate is treated as a soft avoid.
    // We deliberately don't broadcast a 30-deep ban list to the model — that
    // starves the engine and was the root cause of the "Most rejected names
    // were already in your portfolio" failure mode the user kept hitting.
    const recentBan = previousTickers.slice(-12);
    const antiRepeatBlock = recentBan.length > 0
      ? `\n## ANTI-REPEAT (soft):\nAvoid recycling these tickers from the most recent slate unless they are clearly the best available pick today: ${recentBan.join(", ")}. Prefer fresh, equally-liquid alternatives.\n`
      : "";

    // HARD portfolio exclusion: anything the user already owns is NOT a
    // recommendation candidate, full stop. The model frequently ignored a
    // soft mention buried in the prompt — promoting this to its own block
    // with explicit replacement language fixes the "6 already in portfolio"
    // collapse.
    const heldTickersUpper = portfolioTickers.map((t) => String(t).toUpperCase());
    const hardExclusionBlock = heldTickersUpper.length > 0
      ? `\n## HARD EXCLUSION — DO NOT RECOMMEND ANY OF THESE (already held by user):\n${heldTickersUpper.join(", ")}\nDesirable asset != desirable recommendation. If a name on this list would otherwise be your top pick, you MUST emit a different, equally-liquid alternative instead. Do NOT pad the list — keep generating until you have at least 8 valid non-held picks with positive expected upside.\n`
      : "";

    // ODGS prompt block — exposes the user's learned profit field to the model
    // so candidate generation is *biased* by what has actually worked for this
    // user, not just generic quant aesthetics.
    let odgsBlock = "";
    if (odgs && (odgs.totalTrades || 0) >= 5) {
      const hotList = (odgs.hotAssets || [])
        .map((h: any) => `${h.ticker}(×${Number(h.bias).toFixed(2)})`)
        .join(", ");
      const coldList = (odgs.coldAssets || [])
        .map((c: any) => `${c.ticker}(×${Number(c.bias).toFixed(2)})`)
        .join(", ");
      const synergyList = (odgs.synergyPairs || [])
        .map((p: any) => `${p.pair} [synergy ${Number(p.synergy).toFixed(2)}, jointWR ${Math.round((p.jointWinRate || 0) * 100)}%]`)
        .join("; ");
      const zoneList = (odgs.hotZones || [])
        .map((z: any) => `{regime:${z.regime}, assets:[${(z.assets || []).join(",")}], avgPnL:${Number(z.avgPnlPct).toFixed(2)}%}`)
        .join(" | ");
      const featList = (odgs.featureWeights || [])
        .map((f: any) => `${f.feature}:${Number(f.weight).toFixed(2)}`)
        .join(", ");
      const scarList = (odgs.scarTickers || []).join(", ");

      odgsBlock = `\n## ODGS — USER'S OWN LEARNED PROFIT FIELD (gen ${odgs.generation}, ${odgs.totalTrades} trades)
The user's historical trade outcomes have shaped a personalized profit gradient. Use this to TILT selection, not as a hard rule:
- HOT assets (proven winners for this user, prefer when liquid & quant filters pass): ${hotList || "none"}
- COLD / underperforming assets (deprioritize even if narrative is strong): ${coldList || "none"}
- SYNERGY pairs (these combinations historically lifted joint win rate — prefer at least 1 candidate that pairs well with current holdings): ${synergyList || "none"}
- HOT regime zones (asset clusters that have produced density of profits in similar regimes): ${zoneList || "none"}
- Feature weights (what drives this user's profit field — favor candidates whose thesis aligns): ${featList || "none"}
- SCAR tickers (caused real losses for this user — STRONGLY avoid recycling): ${scarList || "none"}

Rules:
1. Prefer hot assets and synergy partners when they pass quality filters.
2. Avoid scar tickers entirely unless thesis is fundamentally different from prior failure pattern.
3. Do NOT over-concentrate the slate in hot assets — diversification still matters.
4. If a hot asset is already held (HARD EXCLUSION above), DO NOT emit it; pick a non-held name with similar exposure instead.
`;
    }

    // ── STAGE 1: AI candidate generation + deterministic reliability fallback ──
    const candidateTools = [
      {
        type: "function",
        function: {
          name: "emit_desirable_assets",
          description: "Return high-quality, tradeable recommendations in strict JSON.",
          parameters: {
            type: "object",
            properties: {
              marketCondition: { type: "string" },
              regimeType: { type: "string", enum: ["risk-on", "risk-off", "transition", "crisis"] },
              recommendations: {
                type: "array",
                minItems: 6,
                maxItems: 12,
                items: {
                  type: "object",
                  properties: {
                    ticker: { type: "string" },
                    name: { type: "string" },
                    assetClass: { type: "string" },
                    exchange: { type: "string" },
                    currency: { type: "string" },
                    currentEstPrice: { type: "number" },
                    entryZone: { type: "array", items: { type: "number" }, minItems: 2, maxItems: 2 },
                    targetPrice: { type: "number" },
                    stopLoss: { type: "number" },
                    timeHorizon: { type: "string" },
                    horizonClass: { type: "string", enum: ["intraday", "short_term", "medium_term", "long_term"], description: "Classify the trade horizon: intraday=same day, short_term=days to 4 weeks, medium_term=1-6 months, long_term=6 months+. MUST match the timeHorizon string." },
                    suggestedQty: { type: "number" },
                    confidence: { type: "number" },
                    thesis: { type: "string" },
                    catalyst: { type: "string" },
                    hedgingStrategy: { type: "string" },
                    riskReward: { type: "string" },
                    sector: { type: "string" },
                    tags: { type: "array", items: { type: "string" } },
                    riskProfile: { type: "array", items: { type: "string" } },
                    strategy: { type: "string", enum: Array.from(ALLOWED_STRATEGIES) },
                    pairedInstrument: { type: ["string", "null"] },
                    pairedStructure: { type: ["string", "null"] },
                    capitalEfficiency: { type: "number" },
                    correlationToPortfolio: { type: "string", enum: ["low", "medium", "high", "negative"] },
                    marketCap: { type: "string", enum: ["mega", "large", "mid", "small", "micro"] },
                  },
                  required: [
                    "ticker",
                    "name",
                    "assetClass",
                    "exchange",
                    "currency",
                    "timeHorizon",
                    "horizonClass",
                    "confidence",
                    "thesis",
                    "catalyst",
                    "hedgingStrategy",
                    "riskReward",
                    "sector",
                    "strategy",
                    "marketCap",
                  ],
                  additionalProperties: false,
                },
              },
            },
            required: ["marketCondition", "regimeType", "recommendations"],
            additionalProperties: false,
          },
        },
      },
    ];

    let parsed: any = { marketCondition: "", regimeType: "transition", recommendations: [] };
    let candidates: any[] = [];

    // Live macro calendar — high-importance events bias the regime call
    let macroBlock = "";
    try {
      const events = await fetchMacroCalendar();
      const high = events.filter((e) => e.importance === "high").slice(0, 8);
      if (high.length > 0) {
        macroBlock = `\nLIVE MACRO CALENDAR (next high-importance events scraped from Trading Economics):\n${high.map((e) => `- ${e.date} ${e.country} ${e.event}${e.actual ? ` actual=${e.actual}` : ""}${e.forecast ? ` forecast=${e.forecast}` : ""}${e.previous ? ` prev=${e.previous}` : ""}`).join("\n")}\nUse these to bias regime, sector tilt, and catalyst timing.\n`;
      }
    } catch (e) { console.warn("Macro calendar fetch failed:", (e as Error).message); }

    try {
      const aiOpts = {
        systemPrompt: `You are an institutional quant PM. Output only liquid, tradeable assets with strict risk controls and evidence-backed portfolio fit.
QUALITY MANDATE:
- Build a diversified recommendation slate, not a popularity contest.
- Avoid clustered lookalikes: do not emit multiple names expressing the same crowded trade, same business model, or same mega-cap factor exposure.
- Every pick must have a concrete catalyst, explicit hedge path, asymmetric risk/reward, and a specific reason it improves the user's portfolio rather than merely sounding good in isolation.
- Obscure, low-coverage, microcap, low-float, meme, and low-liquidity names are forbidden.
- Use exact tickers supported by Yahoo Finance.
- NEVER recommend a ticker the user already owns — those are listed as HARD EXCLUSION in the user prompt and must be replaced with a different, equally-liquid alternative if you would otherwise have picked them.
- Target prices must be set ABOVE the live market price with realistic upside grounded in the catalyst window. If you are unsure of the current price, prefer percentage-based upside framing (e.g. "10–15% over 3M") rather than a stale absolute target.
- Do not output markdown.${indiaMode ? "\nINDIA-ONLY MODE: Recommend ONLY Indian equities listed on NSE (.NS suffix) or BSE (.BO suffix), Indian ETFs, and Indian F&O instruments. Prefer liquid frontline names plus select high-liquidity mid-caps when they diversify the slate. All prices in INR. Consider SEBI/RBI regulations, Indian market structure, and domestic catalysts only. No foreign stocks." : "\nUse liquid US/global listings only. Mix sectors and market caps when liquidity allows. At least one recommendation should come from outside the dominant mega-cap trade when a liquid alternative exists. No OTC, no pink-sheet, no recent IPOs without analyst coverage."}`,
        userPrompt: `[SEED:${seed}] Date: ${new Date().toISOString().split("T")[0]}
Portfolio value: $${portfolioValue.toLocaleString()} (${baseCurrency})
${portfolioContext}
${hardExclusionBlock}${crossModuleBlock}${odgsBlock}${antiRepeatBlock}${macroBlock}
Home-market rule: ${homeMarketRule}
${userBudget ? `\nUser budget: ${baseCurrency} ${userBudget.toLocaleString()}. Ensure each recommendation's suggested quantity × price fits within this budget. Prefer positions sized for this budget.\n` : ""}
${preferredAssetTypes?.length ? `\nPreferred asset types: ${preferredAssetTypes.join(", ")}. Prioritize these asset types heavily. If user wants ETFs, recommend more ETFs. If Mutual Funds, recommend liquid index/sector funds.\n` : ""}
${preferredSectors?.length ? `\nPreferred sectors: ${preferredSectors.join(", ")}. Focus recommendations on these sectors. At least 60% of picks should be from these sectors.\n` : ""}

    Create 8-10 recommendations that prioritize:
1) Diversified opportunity sources across sectors, strategies, and factor exposures
2) Positive earnings momentum + heavy institutional participation
3) Price trend confirmation (above key moving averages) without chasing crowded correlation clusters
4) Catalyst-driven upside in 1-6 months with defendable downside control
5) Deep liquidity and tight bid/ask — must be easily executable in size

Hard constraints:
${preferredAssetTypes?.length ? `- CRITICAL: At least 70% of recommendations MUST be of the user's preferred asset types: ${preferredAssetTypes.join(", ")}. If user selected ETFs, return mostly ETFs (e.g. SPY, QQQ, VTI, ICICI Prudential Nifty ETF, Nippon India ETF etc). If Mutual Funds, return mutual fund tickers. If Bonds, return bond ETFs/instruments. Do NOT default to individual stocks unless "Stocks" is in the preferred list.` : `- Maximum 2 ETFs`}
    - ABSOLUTELY NO obscure, unheard-of, microcap, small-cap, penny, meme, or low-liquidity names unless the user explicitly asked for small caps
    - ABSOLUTELY NO loss-making businesses, deteriorating fundamentals, or broken charts
- Maximum 1 recommendation per sector unless the user's explicit sector filters force concentration
- Do NOT fill the list with close substitutes or same-theme mega-caps just because they are famous
- Prefer names with >$3B market cap and strong liquidity; allow liquid mid-caps when they materially improve diversification
- Provide strategy diversity across at least 3 strategy types
- Each idea must be defendable with evidence, not narrative fluff

Return via the tool call only.`,
        tools: candidateTools,
        toolChoice: { type: "function", function: { name: "emit_desirable_assets" } },
        maxTokens: 2800,
        temperature: 0.35,
      };

      // Fire BOTH providers in parallel for 2x candidate power
      const parallelResults = await callAIParallel(aiOpts);
      console.log(`desirable-assets: ${parallelResults.length} parallel AI responses received`);

      for (const result of parallelResults) {
        try {
          const p = safeParseJSON(result.text);
          const recs = Array.isArray(p?.recommendations) ? p.recommendations : [];
          console.log(`desirable-assets: ${result.provider} returned ${recs.length} candidates`);
          if (!parsed.marketCondition && p?.marketCondition) {
            parsed.marketCondition = p.marketCondition;
            parsed.regimeType = p.regimeType || "transition";
          }
          candidates.push(...recs);
        } catch (parseErr) {
          console.warn(`desirable-assets: ${result.provider} JSON parse failed, skipping:`, (parseErr as Error).message);
        }
      }
      candidates = dedupeCandidates(candidates);
      console.log(`desirable-assets Stage 1 done, seed: ${seed}, merged candidates: ${candidates.length}`);

      // Retry once with a relaxed prompt if the first parallel pass returned nothing usable.
      if (candidates.length === 0) {
        console.warn("desirable-assets: zero AI candidates on first pass, retrying with relaxed prompt");
        try {
          const retryOpts = {
            ...aiOpts,
            userPrompt: `${aiOpts.userPrompt}\n\nRETRY: previous attempt returned no usable picks. Return at least 8 high-quality, deeply liquid large/mega-cap names that any institutional desk would hold today. Favour familiar blue-chip leaders over obscure picks.`,
            temperature: 0.5,
          };
          const retryResults = await callAIParallel(retryOpts);
          for (const result of retryResults) {
            try {
              const p = safeParseJSON(result.text);
              const recs = Array.isArray(p?.recommendations) ? p.recommendations : [];
              if (!parsed.marketCondition && p?.marketCondition) {
                parsed.marketCondition = p.marketCondition;
                parsed.regimeType = p.regimeType || "transition";
              }
              candidates.push(...recs);
            } catch (parseErr) {
              console.warn(`desirable-assets retry: ${result.provider} parse failed:`, (parseErr as Error).message);
            }
          }
          candidates = dedupeCandidates(candidates);
          console.log(`desirable-assets retry returned ${candidates.length} candidates`);
        } catch (retryErr) {
          console.error("desirable-assets retry failed:", (retryErr as Error).message);
        }
      }
    } catch (aiError) {
      console.error("desirable-assets Stage 1 AI generation failed:", aiError);
    }

    // HARD FILTER: When indiaMode is ON, strip any non-Indian tickers from AI candidates
    if (indiaMode) {
      candidates = candidates.filter((c: any) => {
        const t = String(c?.ticker || "").toUpperCase();
        return t.endsWith(".NS") || t.endsWith(".BO");
      });
      console.log(`desirable-assets India hard-filter: ${candidates.length} Indian AI candidates survived`);
    }

    candidates = dedupeCandidates(candidates).slice(0, 28);
    console.log(`desirable-assets: AI returned ${candidates.length} picks (no fallback substitution)`);

    // ── STAGE 1B: Refill pass if first AI pass is contaminated by held/repeat names ──
    // The dominant failure mode was the AI emitting names the user already owns or
    // names we just recommended. Detect that BEFORE the expensive Yahoo / Monte Carlo
    // stage and ask the model for replacements with the explicit exclusion list.
    try {
      const heldSetUpper = new Set(portfolioTickers.map((t) => String(t).toUpperCase()));
      const recentSetUpper = new Set(previousTickers.map((t) => String(t).toUpperCase()));
      const contaminated = candidates.filter((c: any) => {
        const t = String(c?.ticker || "").toUpperCase();
        return heldSetUpper.has(t) || recentSetUpper.has(t);
      });
      const cleanCount = candidates.length - contaminated.length;
      const needsRefill = candidates.length > 0 && (cleanCount < 6 || contaminated.length / candidates.length >= 0.4);
      if (needsRefill) {
        repairLog(`Stage 1B refill: ${contaminated.length}/${candidates.length} candidates collided with held/recent — requesting replacements`);
        const bannedList = [
          ...heldSetUpper,
          ...Array.from(recentSetUpper).slice(-12),
          ...contaminated.map((c: any) => String(c?.ticker || "").toUpperCase()),
        ];
        const uniqueBanned = Array.from(new Set(bannedList)).filter(Boolean);
        const refillOpts = {
          systemPrompt: `You are an institutional quant PM emitting REPLACEMENT picks only.
The previous slate was rejected because too many names were already in the user's portfolio or were recently shown.
You MUST return at least 8 NEW, liquid, tradeable names that are NOT on the banned list, with realistic targets ABOVE the live price.
Output only the tool call. No markdown.${indiaMode ? " India-only listings (.NS / .BO)." : ""}`,
          userPrompt: `[SEED:${seed + 1}] REPLACEMENT REQUEST.
Banned tickers (do NOT emit any of these): ${uniqueBanned.join(", ") || "none"}.
${preferredAssetTypes?.length ? `Preferred asset types: ${preferredAssetTypes.join(", ")}.\n` : ""}${preferredSectors?.length ? `Preferred sectors: ${preferredSectors.join(", ")}.\n` : ""}${userBudget ? `User budget: ${baseCurrency} ${userBudget.toLocaleString()}. Size positions for this budget.\n` : ""}Home-market rule: ${homeMarketRule}
Return 8-10 replacement recommendations via the tool call only. Each must have entryZone, targetPrice (> live price), stopLoss, hedgingStrategy, and a concrete catalyst.`,
          tools: candidateTools,
          toolChoice: { type: "function", function: { name: "emit_desirable_assets" } },
          maxTokens: 2400,
          temperature: 0.55,
        };
        const refillResults = await callAIParallel(refillOpts);
        const refillCandidates: any[] = [];
        for (const result of refillResults) {
          try {
            const p = safeParseJSON(result.text);
            const recs = Array.isArray(p?.recommendations) ? p.recommendations : [];
            refillCandidates.push(...recs);
          } catch (parseErr) {
            console.warn(`desirable-assets refill: ${result.provider} parse failed:`, (parseErr as Error).message);
          }
        }
        // Drop any refill candidate that is itself on the banned list.
        const refillClean = refillCandidates.filter((c: any) => {
          const t = String(c?.ticker || "").toUpperCase();
          return t && !heldSetUpper.has(t) && !recentSetUpper.has(t);
        });
        // Keep originally-clean candidates plus refill output.
        const originallyClean = candidates.filter((c: any) => {
          const t = String(c?.ticker || "").toUpperCase();
          return !heldSetUpper.has(t) && !recentSetUpper.has(t);
        });
        candidates = dedupeCandidates([...originallyClean, ...refillClean]).slice(0, 32);
        repairLog(`Stage 1B refill produced ${refillClean.length} clean replacements; merged total=${candidates.length}`);
      }
    } catch (refillErr) {
      console.warn("desirable-assets refill pass failed:", (refillErr as Error).message);
    }

    // No fallback. If AI produced nothing usable, return an honest empty set.
    if (candidates.length === 0) {
      repairLog("AI produced 0 candidates — returning honest empty set (no deterministic substitution)");
      return new Response(JSON.stringify({
        recommendations: [],
        marketCondition: "",
        regimeType: "transition",
        candidatesGenerated: 0,
        candidatesPassed: 0,
        autoRepaired: false,
        softFailure: true,
        repairTrail,
        repairMessage: "No assets passed the live AI generation step. Retry in a moment.",
        timestamp: Date.now(),
      }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // ── STAGE 2: Fetch real prices + portfolio prices ─────────────
    const allTickers = [
      ...candidates.map((c: any) => c.ticker),
      ...portfolioTickers,
    ];
    const uniqueTickers = [...new Set(allTickers)];

    // Batch Yahoo fetches in groups of 6 to avoid rate limits / timeouts
    const BATCH_SIZE = 10;
    const priceResults: PromiseSettledResult<{ ticker: string; data: any }>[] = [];
    for (let i = 0; i < uniqueTickers.length; i += BATCH_SIZE) {
      const batch = uniqueTickers.slice(i, i + BATCH_SIZE);
      const batchResults = await Promise.allSettled(
        batch.map(async (ticker) => {
          const data = await fetchYahooChart(ticker);
          return { ticker, data };
        })
      );
      priceResults.push(...batchResults);
    }

    const tickerData: Record<string, NonNullable<Awaited<ReturnType<typeof fetchYahooChart>>>> = {};
    for (const r of priceResults) {
      if (r.status === "fulfilled" && r.value.data) {
        tickerData[r.value.ticker] = r.value.data;
      }
    }

    // Auto-Repair: if Yahoo returned no price data at all, retry once with smaller batches
    // (4 per batch) and a 3s cold-start delay — usually fixes transient rate-limit bursts.
    if (Object.keys(tickerData).length === 0) {
      repairLog(`Yahoo returned 0 price rows for ${uniqueTickers.length} tickers — retrying in smaller batches`);
      await new Promise((r) => setTimeout(r, 1500));
      const RETRY_BATCH = 4;
      for (let i = 0; i < uniqueTickers.length; i += RETRY_BATCH) {
        const batch = uniqueTickers.slice(i, i + RETRY_BATCH);
        const batchResults = await Promise.allSettled(
          batch.map(async (ticker) => {
            const data = await fetchYahooChart(ticker);
            return { ticker, data };
          }),
        );
        for (const r of batchResults) {
          if (r.status === "fulfilled" && r.value.data) {
            tickerData[r.value.ticker] = r.value.data;
          }
        }
      }
      repairLog(`Yahoo retry recovered ${Object.keys(tickerData).length} / ${uniqueTickers.length} tickers`);
    }

    // Build portfolio return series for correlation
    const portfolioCloses: Record<string, number[]> = {};
    for (const t of portfolioTickers) {
      if (tickerData[t]?.closes?.length > 10) {
        portfolioCloses[t] = tickerData[t].closes;
      }
    }

    // Default equal weights if none provided
    const weights: Record<string, number> = {};
    for (const t of portfolioTickers) {
      weights[t] = portfolioWeights[t] || (1 / portfolioTickers.length);
    }
    const portReturns = portfolioReturnSeries(portfolioCloses, weights);

    // ── STAGE 3: Tiered quantitative validation — ELITE FILTER ───
    interface ScoredRec {
      rec: any;
      sharpeRatio: number;
      maxDrawdown: number;
      portfolioCorrelation: number;
      riskCompositeScore: number;
      volatility: number;
      zScore: number;
      quantScore: number;
      priceVerified: boolean;
      stalePrice: boolean;
      realPrice: number;
      realCurrency: string;
      priceChange24h: number;
      volume: number;
      fiftyTwoHigh: number;
      fiftyTwoLow: number;
      closes: number[];
      highs: number[];
      maxProfitTarget: number;
      maxProfitConfidence: number;
      maxProfitMethod: string;
      momentum20d: number;
      momentum5d: number;
      trendStrength: number;
      winRate: number;
      filterTier: FilterTier;
      sentimentScore: number;
      sentimentLabel: string;
      earningsSignal: "bullish" | "neutral" | "bearish";
      sentimentHeadline: string;
      sentimentArticleCount: number;
    }

    const scored: ScoredRec[] = [];
    const previousTickerSet = new Set(previousTickers.map((t) => String(t).toUpperCase()));

    // Deterministic-rescue scored builder removed by design.

    let noData = 0, thinData = 0, filtered = 0;
    const rejectReasons: Record<string, number> = {};
    const bumpReject = (k: string) => { rejectReasons[k] = (rejectReasons[k] || 0) + 1; };
    for (const rec of candidates) {
      const td = tickerData[rec.ticker];
      if (!td) { noData++; bumpReject("F0_no_price_history"); continue; }
      if (td.closes.length < 20) { thinData++; bumpReject("F0_thin_history"); continue; }

      const returns = logReturns(td.closes);
      const sr = sharpeRatio(returns);
      const mdd = maxDrawdown(td.closes);
      const vol = annualizedVol(returns);
      const zs = zScore(td.closes);

      // ── MOMENTUM CALCULATIONS ──
      const closes = td.closes;
      const price = td.price;
      const sma20 = mean(closes.slice(-20));
      const sma50 = closes.length >= 50 ? mean(closes.slice(-50)) : sma20;
      const momentum20d = sma20 > 0 ? ((price - sma20) / sma20) * 100 : 0;
      const momentum5d = closes.length >= 5 ? ((price - closes[closes.length - 5]) / closes[closes.length - 5]) * 100 : 0;
      
      // Trend strength: % of last 20 days price was above SMA20
      const last20 = closes.slice(-20);
      const sma20vals: number[] = [];
      for (let j = 0; j < last20.length; j++) {
        const windowStart = Math.max(0, closes.length - 20 + j - 19);
        const windowEnd = closes.length - 20 + j + 1;
        sma20vals.push(mean(closes.slice(windowStart, windowEnd)));
      }
      const daysAboveSma = last20.filter((p, j) => p > (sma20vals[j] || sma20)).length;
      const trendStrength = (daysAboveSma / last20.length) * 100;

      // 52-week position (higher = closer to 52w high = stronger)
      const fiftyTwoPos = td.fiftyTwoHigh > td.fiftyTwoLow
        ? ((price - td.fiftyTwoLow) / (td.fiftyTwoHigh - td.fiftyTwoLow)) * 100
        : 50;

      // ── Recent returns (last 20 days cumulative) ──
      const recentReturns = returns.slice(-20);
      const cumReturn20d = recentReturns.reduce((s, r) => s + r, 0) * 100;

      // Correlation to portfolio
      let portCorr = 0;
      if (portReturns.length > 10) {
        portCorr = pearsonCorrelation(returns, portReturns);
      }

      const isHedge = HEDGE_STRATEGIES.has(String(rec.strategy || ""));
      const isPair = rec.strategy === "pair_trade" || rec.strategy === "vol_arb" || rec.strategy === "mean_reversion";
      const riskCompositeScore = Math.round(clamp(
        vol * 0.55 +
        mdd * 0.65 +
        Math.max(0, portCorr) * 28 +
        Math.max(0, -momentum20d) * 1.4 -
        Math.max(0, sr) * 8,
        5,
        95,
      ));

      // F1: Skip portfolio holdings
      if (portfolioTickers.includes(rec.ticker)) { bumpReject("F1_already_held"); continue; }
      if (previousTickerSet.has(rec.ticker)) { filtered++; bumpReject("F1_previous_repeat"); continue; }

      // F1b: Cross-module veto — never contradict Stock Analysis & Risk verdicts.
      // Reject any candidate whose ticker is on the Sell/high-risk list or whose
      // sector matches a flagged-sector. This is a hard reject, not a score penalty.
      const recTickerUpper = String(rec.ticker || "").toUpperCase();
      if (sellTickers.includes(recTickerUpper) || highRiskTickers.includes(recTickerUpper)) {
        filtered++;
        bumpReject("F1b_sell_or_highrisk");
        continue;
      }
      const recSectorLower = String(rec.sector || "").toLowerCase().trim();
      if (recSectorLower && avoidSectorsLower.some((s) => recSectorLower.includes(s) || s.includes(recSectorLower))) {
        filtered++;
        bumpReject("F1b_avoided_sector");
        continue;
      }

      // F2: Target must be above current price.
      // Repair-first: if the AI's target is stale (below live price), don't throw the
      // name away — clear the field so the downstream quant layer recomputes a fresh
      // target from volatility / 52w range. Only reject if the AI handed us something
      // structurally absurd (e.g. negative or zero target with no recoverable signal).
      if (rec.targetPrice && td.price && rec.targetPrice < td.price * 0.95) {
        rec.targetPrice = 0; // signal to enrichment stage to recompute
        rec.entryZone = null; // let enrichment re-derive entry zone too
      }
      if (rec.targetPrice && rec.targetPrice < 0) { filtered++; bumpReject("F2_invalid_target"); continue; }

      // F3: Liquidity + investability guards (avoid tiny/random names)
      const dollarVolume = (td.volume || 0) * price;
      // Indian stocks trade in INR with lower notional — use 2M INR (~$24K) threshold.
      const minDollarVol = indiaMode ? 2_000_000 : 20_000_000;
      if (!isHedge && dollarVolume < minDollarVol) { filtered++; bumpReject("F3_illiquid"); continue; }
      if (!isHedge && ["micro", "small"].includes(String(rec.marketCap || "").toLowerCase())) { filtered++; bumpReject("F3_microcap_or_small"); continue; }

      const fundamentals = isHedge ? null : await fetchYahooSummary(rec.ticker);
      const profitMarginPct = fundamentals?.profitMargins != null ? fundamentals.profitMargins * 100 : null;
      const roePct = fundamentals?.returnOnEquity != null ? fundamentals.returnOnEquity * 100 : null;
      const earningsGrowthPct = fundamentals?.earningsGrowth != null ? fundamentals.earningsGrowth * 100 : null;
      const revenueGrowthPct = fundamentals?.revenueGrowth != null ? fundamentals.revenueGrowth * 100 : null;
      const analystView = String(fundamentals?.recommendationKey || "").toLowerCase();
      const fundamentalSector = String(fundamentals?.sector || rec.sector || "").trim();

      if (!isHedge && profitMarginPct != null && profitMarginPct < 0) { filtered++; bumpReject("F3_loss_maker"); continue; }
      if (!isHedge) {
        const weakQuality = [
          roePct != null && roePct < 6,
          earningsGrowthPct != null && earningsGrowthPct < -5,
          revenueGrowthPct != null && revenueGrowthPct < -4,
          analystView === "underperform" || analystView === "sell",
        ].filter(Boolean).length;
        if (weakQuality >= 2) { filtered++; bumpReject("F3_weak_quality"); continue; }
      }

      // ── MONTE CARLO MINI-SIM (5000 paths, 60 days) ──
      const mu60 = mean(returns);
      const sig60 = stddev(returns);
      let profitablePaths = 0;
      const simPaths = 5000;
      const simDays = 60;
      for (let p = 0; p < simPaths; p++) {
        let simPrice = price;
        for (let d = 0; d < simDays; d++) {
          // Box-Muller for normal random
          const u1 = Math.random();
          const u2 = Math.random();
          const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
          simPrice *= Math.exp((mu60 - 0.5 * sig60 * sig60) + sig60 * z);
        }
        if (simPrice > price * 1.02) profitablePaths++; // >2% gain
      }
      const winRate = (profitablePaths / simPaths) * 100;

      // Compute max profit target
      const mpt = computeMaxProfitTarget(td.closes, td.highs || [], td.price, vol, sr);
      const expectedUpsidePct = price > 0 ? ((mpt.maxTarget - price) / price) * 100 : 0;

      // F4: Hard floor — only reject if BOTH upside is essentially zero AND risk is extreme.
      // Otherwise we let it into the "relaxed" tier so the panel never goes empty when valid
      // tickers are flowing through with real prices and history.
      if (!isHedge && expectedUpsidePct < -2 && riskCompositeScore >= 85) {
        filtered++; bumpReject("F4_no_upside_extreme_risk"); continue;
      }

      // Three-tier pass logic: strict / balanced / relaxed. We never silently drop a candidate
      // that survived F1–F4 — the worst outcome is "relaxed" so the user always sees the real
      // best-of-what-the-market-offered today, with the tier honestly displayed.
      const strictPass = isHedge || (
        sr >= 0.15 &&
        mdd <= 35 &&
        (!isPair ? price >= sma20 * 0.99 : true) &&
        (!isPair ? trendStrength >= 55 : true) &&
        cumReturn20d >= -8 &&
        fiftyTwoPos >= 30 &&
        (!isPair ? portCorr <= 0.75 : true) &&
        (vol <= 85 || sr >= 0.3) &&
        winRate >= 48 &&
        momentum20d > -2
      );

      const balancedPass = isHedge || (
        sr >= -0.25 &&
        mdd <= 60 &&
        (!isPair ? price >= sma20 * 0.92 : true) &&
        (!isPair ? trendStrength >= 25 : true) &&
        cumReturn20d >= -20 &&
        fiftyTwoPos >= 10 &&
        (!isPair ? portCorr <= 0.92 : true) &&
        winRate >= 35 &&
        momentum20d > -10
      );

      const filterTier: FilterTier = strictPass ? "strict" : balancedPass ? "balanced" : "relaxed";
      if (filterTier === "relaxed") bumpReject("tier_relaxed");

      // ── COMPOSITE SCORE — heavily weighted toward momentum + trend ──
      const normSharpe = Math.min(Math.max(sr / 3, -1), 1);
      const diversification = 1 - Math.abs(portCorr);
      const capEff = rec.capitalEfficiency || 1;
      const conf = (rec.confidence || 50) / 100;
      const momScore = Math.min(Math.max(momentum20d / 20, -1), 1); // normalize momentum
      const trendScore = trendStrength / 100;
      const winRateScore = winRate / 100;
      const hedgeBonus = isHedge && portCorr < -0.1 ? 0.1 : 0;
      const tierBonus = filterTier === "strict" ? 0.1 : 0.04;

      const quantScore = Math.round(
        (0.20 * (normSharpe + 1) / 2 +    // Sharpe quality
         0.15 * diversification +            // Portfolio diversification
         0.10 * conf +                       // AI confidence
         0.05 * Math.min(capEff / 5, 1) +   // Capital efficiency
         0.10 * Math.max(0, 1 - mdd / 35) + // Low drawdown reward
         0.15 * (momScore + 1) / 2 +         // Momentum (NEW)
         0.10 * trendScore +                 // Trend strength (NEW)
         0.15 * winRateScore +               // Monte Carlo win rate (NEW)
         hedgeBonus +
         tierBonus) * 100
      );

      scored.push({
        rec,
        sharpeRatio: Math.round(sr * 100) / 100,
        maxDrawdown: Math.round(mdd * 10) / 10,
        portfolioCorrelation: Math.round(portCorr * 100) / 100,
        riskCompositeScore,
        volatility: Math.round(vol * 10) / 10,
        zScore: Math.round(zs * 100) / 100,
        quantScore: Math.min(quantScore, 99),
        priceVerified: true,
        stalePrice: td.stalePrice || false,
        realPrice: td.price,
        realCurrency: td.currency,
        priceChange24h: Math.round(td.change * 100) / 100,
        volume: td.volume,
        fiftyTwoHigh: td.fiftyTwoHigh,
        fiftyTwoLow: td.fiftyTwoLow,
        closes: td.closes.slice(-60),
        highs: (td.highs || []).slice(-60),
        maxProfitTarget: mpt.maxTarget,
        maxProfitConfidence: mpt.confidence,
        maxProfitMethod: mpt.method,
        momentum20d: Math.round(momentum20d * 100) / 100,
        momentum5d: Math.round(momentum5d * 100) / 100,
        trendStrength: Math.round(trendStrength),
        winRate: Math.round(winRate * 10) / 10,
        filterTier,
        sentimentScore: 0,
        sentimentLabel: "Neutral",
        earningsSignal: "neutral",
        sentimentHeadline: "",
        sentimentArticleCount: 0,
      });
    }

    const { rejectSummary, rejectHeadline } = summarizeRejects(rejectReasons);

    if (scored.length === 0) {
      repairLog(`STAGE 3 yielded 0 scored survivors from ${candidates.length} candidates — no deterministic rescue (by design)`);
    }

    // ── STAGE 3.5: Real-time earnings/news sentiment overlay ───────
    const sentimentCandidates = [...scored].sort((a, b) => b.quantScore - a.quantScore).slice(0, Math.min(8, scored.length));

    const sentimentByTicker: Record<string, RealtimeSentiment> = {};
    const SENTIMENT_BATCH = 4;
    for (let i = 0; i < sentimentCandidates.length; i += SENTIMENT_BATCH) {
      const batch = sentimentCandidates.slice(i, i + SENTIMENT_BATCH);
      const sentimentResults = await Promise.allSettled(
        batch.map((s) => fetchTickerRealtimeSentiment(s.rec.ticker, s.rec.name)),
      );
      for (let j = 0; j < batch.length; j++) {
        const result = sentimentResults[j];
        if (result.status === "fulfilled" && result.value) {
          sentimentByTicker[batch[j].rec.ticker] = result.value;
        }
      }
    }

    for (const s of scored) {
      const sentiment = sentimentByTicker[s.rec.ticker];
      if (!sentiment) continue;

      s.sentimentScore = sentiment.sentimentScore;
      s.sentimentLabel = sentiment.sentimentLabel;
      s.earningsSignal = sentiment.earningsSignal;
      s.sentimentHeadline = sentiment.headline;
      s.sentimentArticleCount = sentiment.articleCount;

      const isHedge = HEDGE_STRATEGIES.has(String(s.rec.strategy || ""));
      const sentimentImpact = Math.round(sentiment.sentimentScore * 0.14);
      const earningsImpact = sentiment.earningsSignal === "bullish" ? 5 : sentiment.earningsSignal === "bearish" ? -8 : 0;
      const severeEarningsPenalty = !isHedge && sentiment.sentimentScore <= -45 && sentiment.earningsSignal === "bearish"
        ? 8
        : 0;

      s.quantScore = clamp(s.quantScore + sentimentImpact + earningsImpact - severeEarningsPenalty, 1, 99);
    }

    // ── STAGE 3.6: ODGS rerank ─────────────────────────────────
    // Tilt scores using the user's learned profit field. Bounded so it can
    // never override a fundamentally bad quant score, only break ties and
    // promote names the user's own history has proven profitable on.
    if (odgs && (odgs.totalTrades || 0) >= 5 && scored.length > 0) {
      let tiltApplied = 0;
      for (const s of scored) {
        const t = String(s.rec.ticker || "").toUpperCase();
        let tilt = 0;
        const hotBias = odgsHotMap.get(t);
        if (hotBias) {
          // bias 1.05..1.5+ → +3..+10 score points
          tilt += clamp(Math.round((hotBias - 1) * 22), 1, 12);
        }
        const coldBias = odgsColdMap.get(t);
        if (coldBias) {
          // bias 0.5..0.85 → -3..-10
          tilt -= clamp(Math.round((1 - coldBias) * 22), 1, 12);
        }
        if (odgsScarSet.has(t)) {
          tilt -= 12; // scarred name penalty
        }
        // Synergy bonus: if any held ticker forms a known synergy pair with rec
        if (Array.isArray(odgs.synergyPairs)) {
          for (const p of odgs.synergyPairs) {
            const pair = String(p?.pair || "").toUpperCase();
            if (!pair.includes(t)) continue;
            const partners = pair.split(/[^A-Z0-9.]+/).filter(Boolean);
            const partnerHeld = partners.some((x) =>
              x !== t && heldTickersUpper.includes(x)
            );
            if (partnerHeld) {
              tilt += clamp(Math.round((Number(p.synergy) || 0) * 6), 1, 8);
              break;
            }
          }
        }
        if (tilt !== 0) {
          s.quantScore = clamp(s.quantScore + tilt, 1, 99);
          tiltApplied++;
        }
      }
      console.log(`[desirable-assets] ODGS rerank applied to ${tiltApplied}/${scored.length} candidates (gen ${odgs.generation})`);
    }

    // ── STAGE 4: Select top candidates by score ─────────────────
    scored.sort((a, b) => b.quantScore - a.quantScore);

    const strictPool = scored.filter((s) => s.filterTier === "strict");
    const balancedPool = scored.filter((s) => s.filterTier === "strict" || s.filterTier === "balanced");

    let selectionPool: ScoredRec[];
    if (strictPool.length >= 8) {
      selectionPool = strictPool;
    } else if (balancedPool.length >= 8) {
      selectionPool = balancedPool;
    } else {
      selectionPool = scored;
    }

    const selected: ScoredRec[] = [];
    const selectedTickers = new Set<string>();
    const selectedSectors = new Map<string, number>();
    const selectedCaps = new Map<string, number>();
    const selectedNonHedge = new Set<string>();
    const forcedSectorMode = (preferredSectors?.length || 0) <= 1;
    const maxPerSector = forcedSectorMode ? 2 : 1;
    const maxPerMarketCap = 2;
    const maxHighlyCorrelatedNames = portfolioTickers.length > 0 ? 1 : 2;

    const getSectorKey = (s: ScoredRec) => normalizeSectorPreference(String(s.rec.sector || "unknown"));
    const getCapKey = (s: ScoredRec) => String(s.rec.marketCap || "large").toLowerCase();
    const isHedgeStrategy = (s: ScoredRec) => HEDGE_STRATEGIES.has(String(s.rec.strategy || ""));
    const passesDiversityGuards = (s: ScoredRec) => {
      if (selectedTickers.has(s.rec.ticker)) return false;
      if (isHedgeStrategy(s)) return true;

      const sectorKey = getSectorKey(s);
      const capKey = getCapKey(s);
      const sectorCount = selectedSectors.get(sectorKey) || 0;
      const capCount = selectedCaps.get(capKey) || 0;
      const highCorrCount = Array.from(selectedNonHedge).filter((ticker) => {
        const other = selected.find((item) => item.rec.ticker === ticker);
        return other ? Math.abs(other.portfolioCorrelation) >= 0.65 : false;
      }).length;

      if (sectorCount >= maxPerSector) return false;
      if (capCount >= maxPerMarketCap) return false;
      if (Math.abs(s.portfolioCorrelation) >= 0.65 && highCorrCount >= maxHighlyCorrelatedNames) return false;
      return true;
    };
    const registerSelection = (s: ScoredRec) => {
      selected.push(s);
      selectedTickers.add(s.rec.ticker);
      if (!isHedgeStrategy(s)) {
        const sectorKey = getSectorKey(s);
        const capKey = getCapKey(s);
        selectedSectors.set(sectorKey, (selectedSectors.get(sectorKey) || 0) + 1);
        selectedCaps.set(capKey, (selectedCaps.get(capKey) || 0) + 1);
        selectedNonHedge.add(s.rec.ticker);
      }
    };

    // First: pick best candidate from each strategy bucket if it passes diversification guards.
    const strategyBuckets: Record<string, ScoredRec[]> = {};
    for (const s of selectionPool) {
      const strat = s.rec.strategy || "equity";
      if (!strategyBuckets[strat]) strategyBuckets[strat] = [];
      strategyBuckets[strat].push(s);
    }
    for (const strat of Object.keys(strategyBuckets)) {
      const bucket = strategyBuckets[strat].sort((a, b) => b.quantScore - a.quantScore);
      const candidate = bucket.find((entry) => passesDiversityGuards(entry));
      if (candidate) registerSelection(candidate);
    }

    // Then fill remaining by quantScore while enforcing sector/cap/correlation limits.
    for (const s of selectionPool) {
      if (selected.length >= 12) break;
      if (passesDiversityGuards(s)) {
        registerSelection(s);
      }
    }

    // If guards were too strict, backfill only with the highest-scoring remaining names.
    if (selected.length < Math.min(6, selectionPool.length)) {
      for (const s of selectionPool) {
        if (selected.length >= Math.min(8, selectionPool.length)) break;
        if (!selectedTickers.has(s.rec.ticker)) {
          registerSelection(s);
        }
      }
    }

    // Reliability backstop removed by design — no deterministic padding.

    // Ensure hedge coverage exists in final set.
    const minHedgeCount = portfolioTickers.length > 0 ? 2 : 1;
    let hedgeCount = selected.filter((s) => HEDGE_STRATEGIES.has(String(s.rec.strategy || ""))).length;
    if (hedgeCount < minHedgeCount) {
      const hedgePool = scored
        .filter((s) => HEDGE_STRATEGIES.has(String(s.rec.strategy || "")) && !selectedTickers.has(s.rec.ticker))
        .sort((a, b) => b.quantScore - a.quantScore);

      for (const hedgeCandidate of hedgePool) {
        if (hedgeCount >= minHedgeCount) break;

        if (selected.length >= 12) {
          let replaceIdx = -1;
          for (let i = selected.length - 1; i >= 0; i--) {
            if (!HEDGE_STRATEGIES.has(String(selected[i].rec.strategy || ""))) {
              replaceIdx = i;
              break;
            }
          }
          if (replaceIdx >= 0) {
            selectedTickers.delete(selected[replaceIdx].rec.ticker);
            selected.splice(replaceIdx, 1);
          } else {
            break;
          }
        }

        selected.push(hedgeCandidate);
        selectedTickers.add(hedgeCandidate.rec.ticker);
        hedgeCount += 1;
      }
    }

    if (selected.length === 0 && scored.length > 0) {
      selected.push(...scored.slice(0, Math.min(8, scored.length)));
    }

    // Verify strategy diversity
    const uniqueStrategies = new Set(selected.map(s => s.rec.strategy || "equity"));

    console.log(`desirable-assets: ${candidates.length} candidates, ${noData} no Yahoo data, ${thinData} thin data, ${scored.length} scored, ${selected.length} selected`);
    if (Object.keys(rejectReasons).length > 0) {
      console.log(`desirable-assets reject breakdown: ${JSON.stringify(rejectReasons)}`);
    }
    console.log(`desirable-assets tiers: strict=${strictPool.length}, balanced=${balancedPool.length - strictPool.length}`);
    console.log(`desirable-assets: ${uniqueStrategies.size} unique strategies: ${[...uniqueStrategies].join(", ")}`);

    // Helper to strip markdown artifacts from any AI text field
    const sanitizeText = (t: string): string =>
      (t || "")
        .replace(/\*{1,3}/g, "")
        .replace(/&\(/g, "(")
        .replace(/#{1,4}\s*/g, "")
        .replace(/`/g, "")
        .replace(/\n+/g, " ")
        .trim();

    const enriched = selected.map(s => {
      const realPrice = s.realPrice;
      let targetPrice = s.rec.targetPrice;
      let stopLoss = s.rec.stopLoss;
      let entryZone = s.rec.entryZone;
      const isHedge = HEDGE_STRATEGIES.has(String(s.rec.strategy || ""));

      // Server-side validation: target must be above current price
      if (!targetPrice || targetPrice < realPrice) {
        // Use quant-computed max profit target instead of arbitrary uplift
        targetPrice = s.maxProfitTarget;
      }

      // Ensure stop loss is below current price
      if (!stopLoss || stopLoss > realPrice) {
        // Dynamic stop based on volatility
        const volFactor = Math.max(0.05, Math.min(0.15, s.volatility / 100 * 2));
        stopLoss = Math.round(realPrice * (1 - volFactor) * 100) / 100;
      }

      // Fix entry zone if nonsensical
      if (!entryZone || entryZone[0] > realPrice * 1.5 || entryZone[1] < realPrice * 0.3) {
        entryZone = [Math.round(realPrice * 0.97 * 100) / 100, Math.round(realPrice * 1.02 * 100) / 100];
      }

      // Fix hedging strategy — NEVER return empty or "no hedge"
      let hedgingStrategy = sanitizeText(s.rec.hedgingStrategy || "");
      const hedgePlan = deriveHedgePlan({
        strategy: s.rec.strategy || "equity",
        sector: s.rec.sector || "",
        regimeType: parsed.regimeType || "transition",
        sentimentScore: s.sentimentScore || 0,
        volatility: s.volatility || 25,
        indiaMode,
      });

      if (!hedgingStrategy || hedgingStrategy.toLowerCase().includes("no hedge") || hedgingStrategy.toLowerCase() === "none" || hedgingStrategy.toLowerCase() === "n/a" || hedgingStrategy.trim().length < 10) {
        const sector = s.rec.sector || "broad market";
        const assetClass = s.rec.assetClass || "Equity";
        const strategy = s.rec.strategy || "equity";
        const stopPct = realPrice > 0 ? Math.round((1 - stopLoss / realPrice) * 100) : 8;

        if (strategy === "pair_trade" || strategy === "sector_hedge") {
          hedgingStrategy = `Built-in hedge via long/short structure. Additional protection: buy ${s.rec.ticker} protective put at ${100 - stopPct}% strike (${s.rec.timeHorizon || "3M"} expiry) to cap downside at ${stopPct}%`;
        } else if (strategy === "correlation_hedge") {
          hedgingStrategy = `Position serves as portfolio hedge. Size to max 4% of portfolio. Set hard stop at $${stopLoss}. Roll if correlation regime shifts.`;
        } else if (assetClass === "ETF") {
          hedgingStrategy = `Collar strategy: sell ${Math.round(((targetPrice / realPrice) - 1) * 100)}% OTM call, buy ${stopPct}% OTM put (${s.rec.timeHorizon || "3M"} expiry). Alternative: pair with inverse ${sector} ETF at 30% ratio.`;
        } else if (assetClass === "Crypto") {
          hedgingStrategy = `Reduce to 2-3% portfolio weight. Set trailing stop at -8%. Hedge with BTC/ETH put options at 90% strike or short perpetual futures at 50% notional.`;
        } else if (assetClass === "Commodity") {
          hedgingStrategy = `Use commodity futures calendar spread (long front, short back). Pair with UUP/DXY at 25% ratio to offset dollar-denominated risk. Stop at $${stopLoss}.`;
        } else {
          hedgingStrategy = `Buy ${s.rec.ticker} protective put at ${100 - stopPct}% strike (${s.rec.timeHorizon || "3M"} expiry). Alternative: collar strategy selling ${Math.round(((targetPrice / realPrice) - 1) * 100)}% OTM call to fund put purchase. Hard stop at $${stopLoss}.`;
        }
      }

      if (!isHedge && hedgePlan.hedgeInstrument !== "SELF-HEDGE") {
        const upperHedge = hedgePlan.hedgeInstrument.toUpperCase();
        if (!hedgingStrategy.toUpperCase().includes(upperHedge)) {
          hedgingStrategy = `${hedgingStrategy} Primary hedge overlay: ${hedgePlan.hedgeInstrument} at ~${hedgePlan.hedgeRatioPct}% notional. ${hedgePlan.hedgeOverlay}`;
        }
      }

      const positionSizing = computeOptimalPositionSize({
        portfolioValue,
        price: realPrice,
        stopLoss,
        confidence: Number(s.rec.confidence) || 60,
        volatility: s.volatility || 25,
        filterTier: s.filterTier,
        isHedge,
        sentimentScore: s.sentimentScore || 0,
        targetPrice,
        userBudget,
      });

      // Compute risk-reward string from validated numbers
      const riskReward = realPrice && targetPrice && stopLoss && (realPrice - stopLoss) > 0
        ? `1:${((targetPrice - realPrice) / (realPrice - stopLoss)).toFixed(1)}`
        : s.rec.riskReward || "—";

      // Generate dynamic thesis/catalyst for fallback candidates with empty text
      let thesis = sanitizeText(s.rec.thesis || "");
      let catalyst = sanitizeText(s.rec.catalyst || "");

      if (!thesis || thesis.length < 15) {
        const sectorInfo = SECTOR_THESIS[s.rec.sector] || SECTOR_THESIS["Technology"];
        const momLabel = s.momentum20d > 3 ? "strong upward momentum" : s.momentum20d > 0 ? "positive trend" : "mean-reversion setup";
        const volLabel = s.volatility < 20 ? "low volatility" : s.volatility < 35 ? "moderate volatility" : "elevated volatility";
        const srLabel = s.sharpeRatio > 0.5 ? "excellent risk-adjusted returns" : s.sharpeRatio > 0 ? "positive risk-adjusted returns" : "recovery potential";
        thesis = `${s.rec.name}: ${sectorInfo.thesis} Currently showing ${momLabel} with ${volLabel} (${srLabel}, Sharpe ${s.sharpeRatio}). MaxDD ${s.maxDrawdown}% over 3 months.`;
      }

      if (!catalyst || catalyst.length < 15) {
        const sectorInfo = SECTOR_THESIS[s.rec.sector] || SECTOR_THESIS["Technology"];
        const sentLabel = s.sentimentScore > 15 ? "Positive news sentiment supports near-term upside." : s.sentimentScore < -15 ? "Contrarian opportunity as negative sentiment may be overextended." : "Neutral sentiment with catalysts pending.";
        catalyst = `${sectorInfo.catalyst} ${sentLabel}`;
      }

      return {
        ...s.rec,
        thesis,
        catalyst,
        riskCompositeScore: s.riskCompositeScore,
        evidenceSummary: [
          `Sharpe ${s.sharpeRatio.toFixed(2)}`,
          `MaxDD ${s.maxDrawdown.toFixed(1)}%`,
          `Corr ${s.portfolioCorrelation.toFixed(2)}`,
          `Vol ${s.volatility.toFixed(1)}%`,
          `${s.filterTier.toUpperCase()} filter`,
        ],
        portfolioFit: Math.abs(s.portfolioCorrelation) <= 0.2
          ? "Low correlation diversifier"
          : s.portfolioCorrelation < 0
            ? "Negative-correlation hedge sleeve"
            : s.portfolioCorrelation <= 0.55
              ? "Moderate correlation, acceptable add"
              : "High correlation, only justified by score strength",
        riskVerdict: s.riskCompositeScore >= 60
          ? "high"
          : s.riskCompositeScore >= 35
            ? "medium"
            : "low",
        suggestedQty: positionSizing.suggestedQty,
        targetPrice: Math.round(targetPrice * 100) / 100,
        stopLoss: Math.round(stopLoss * 100) / 100,
        entryZone,
        hedgingStrategy,
        riskReward,
        realPrice: s.realPrice,
        realCurrency: s.realCurrency,
        priceChange24h: s.priceChange24h,
        priceVerified: s.priceVerified,
        stalePrice: s.stalePrice || false,
        realVolume: s.volume,
        fiftyTwoHigh: s.fiftyTwoHigh,
        fiftyTwoLow: s.fiftyTwoLow,
        sharpeRatio: s.sharpeRatio,
        maxDrawdown: s.maxDrawdown,
        portfolioCorrelation: s.portfolioCorrelation,
        volatility: s.volatility,
        zScore: s.zScore,
        quantScore: s.quantScore,
        closes: s.closes,
        simulationTested: true,
        maxProfitTarget: Math.round(s.maxProfitTarget * 100) / 100,
        maxProfitConfidence: s.maxProfitConfidence,
        maxProfitMethod: s.maxProfitMethod,
        momentum20d: s.momentum20d,
        momentum5d: s.momentum5d,
        trendStrength: s.trendStrength,
        allocationPct: positionSizing.allocationPct,
        positionValue: positionSizing.positionValue,
        riskBudgetPct: positionSizing.riskBudgetPct,
        hedgeInstrument: hedgePlan.hedgeInstrument,
        hedgeRatioPct: hedgePlan.hedgeRatioPct,
        sentimentScore: s.sentimentScore,
        sentimentLabel: s.sentimentLabel,
        earningsSignal: s.earningsSignal,
        sentimentHeadline: s.sentimentHeadline,
        sentimentArticleCount: s.sentimentArticleCount,
      };
    });

    console.log(`desirable-assets: ${candidates.length} candidates → ${enriched.length} passed tiered quant filters`);

    if (enriched.length === 0) {
      repairLog(`enrichment produced 0 rows from ${scored.length} scored — returning honest empty set (no deterministic rescue)`);
    }

    return new Response(JSON.stringify({
      marketCondition: sanitizeText(parsed.marketCondition || ""),
      regimeType: parsed.regimeType || "transition",
      recommendations: enriched,
      baseCurrency,
      candidatesGenerated: candidates.length,
      candidatesPassed: enriched.length,
      rejectHeadline,
      rejectSummary,
      autoRepaired: repairTrail.length > 0,
      repairTrail,
      timestamp: Date.now(),
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  } catch (error: any) {
    console.error("Desirable assets error:", error);
    if (error instanceof Response) return error;
    // Auto-Repair final safety net: never fail hard. Rate limits and auth surface
    // as real errors (client must know to back off), but everything else becomes
    // a soft-failure the client can gracefully handle with cached fallback.
    if (error.status === 429) {
      return new Response(JSON.stringify({
        error: "Rate limit exceeded. Auto-retrying shortly.",
        autoRepaired: true,
        softFailure: true,
        repairTrail: [...repairTrail, "rate-limited — client should back off"],
      }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (error.status === 402) {
      return new Response(JSON.stringify({
        error: "AI credits exhausted. Retrying with deterministic engine.",
        autoRepaired: true,
        softFailure: true,
        repairTrail: [...repairTrail, "AI credits exhausted"],
      }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    // Any other error — return 200 with empty recs + softFailure flag so the
    // client keeps its last-good cached payload visible instead of erroring out.
    return new Response(JSON.stringify({
      recommendations: [],
      marketCondition: "",
      regimeType: "transition",
      candidatesGenerated: 0,
      candidatesPassed: 0,
      rejectHeadline: "Live feed hiccupped during screening",
      rejectSummary: [],
      autoRepaired: true,
      softFailure: true,
      repairTrail: [...repairTrail, `top-level crash: ${String(error?.message || error).slice(0, 140)}`],
      repairMessage: "Live feed hiccupped — auto-recovering with cached intelligence.",
      timestamp: Date.now(),
    }), { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
