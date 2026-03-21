import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { callAI } from "../_shared/callAI.ts";
import { safeParseJSON } from "../_shared/safeParseJSON.ts";
import { requireAuth } from "../_shared/auth.ts";

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

// ── Yahoo Finance helpers ──────────────────────────────────────────
async function fetchYahooChart(symbol: string, range = "3mo", interval = "1d") {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${interval}&range=${range}&_t=${Date.now()}`;
    const res = await fetch(url, { headers: { "User-Agent": UA, "Cache-Control": "no-cache, no-store" } });
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

const ELITE_FALLBACK_UNIVERSE = [
  { ticker: "MSFT", name: "Microsoft", sector: "Technology", marketCap: "mega", strategy: "equity" },
  { ticker: "NVDA", name: "NVIDIA", sector: "Technology", marketCap: "mega", strategy: "momentum" },
  { ticker: "AMZN", name: "Amazon", sector: "Consumer Discretionary", marketCap: "mega", strategy: "equity" },
  { ticker: "META", name: "Meta Platforms", sector: "Communication", marketCap: "mega", strategy: "equity" },
  { ticker: "GOOGL", name: "Alphabet", sector: "Communication", marketCap: "mega", strategy: "equity" },
  { ticker: "AVGO", name: "Broadcom", sector: "Technology", marketCap: "large", strategy: "momentum" },
  { ticker: "LLY", name: "Eli Lilly", sector: "Healthcare", marketCap: "large", strategy: "equity" },
  { ticker: "JPM", name: "JPMorgan Chase", sector: "Financials", marketCap: "large", strategy: "equity" },
  { ticker: "XOM", name: "Exxon Mobil", sector: "Energy", marketCap: "large", strategy: "equity" },
  { ticker: "UNH", name: "UnitedHealth", sector: "Healthcare", marketCap: "large", strategy: "equity" },
  { ticker: "COST", name: "Costco", sector: "Consumer Staples", marketCap: "large", strategy: "equity" },
  { ticker: "ORCL", name: "Oracle", sector: "Technology", marketCap: "large", strategy: "equity" },
  { ticker: "TSM", name: "Taiwan Semiconductor", sector: "Technology", marketCap: "large", strategy: "pair_trade" },
  { ticker: "ASML", name: "ASML", sector: "Technology", marketCap: "large", strategy: "mean_reversion" },
  { ticker: "V", name: "Visa", sector: "Financials", marketCap: "large", strategy: "equity" },
  { ticker: "MA", name: "Mastercard", sector: "Financials", marketCap: "large", strategy: "equity" },
  { ticker: "QQQ", name: "Invesco QQQ ETF", sector: "Technology", marketCap: "large", strategy: "momentum", assetClass: "ETF" },
  { ticker: "XLE", name: "Energy Select Sector SPDR", sector: "Energy", marketCap: "large", strategy: "sector_hedge", assetClass: "ETF" },
  { ticker: "GLD", name: "SPDR Gold Shares", sector: "Commodities", marketCap: "large", strategy: "correlation_hedge", assetClass: "ETF" },
  { ticker: "SH", name: "ProShares Short S&P500", sector: "Hedge", marketCap: "large", strategy: "sector_hedge", assetClass: "ETF" },
];

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
    thesis: String(rec?.thesis || "Strong momentum and earnings quality with favorable risk/reward."),
    catalyst: String(rec?.catalyst || "Earnings and institutional flow support over next quarter."),
    hedgingStrategy: String(rec?.hedgingStrategy || "Protective put and strict stop-loss discipline."),
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

function buildDeterministicCandidates(previousTickers: string[]): any[] {
  const blocked = new Set(previousTickers.map((t) => String(t).trim().toUpperCase()));
  return ELITE_FALLBACK_UNIVERSE
    .filter((c) => !blocked.has(c.ticker))
    .slice(0, 16)
    .map((c, i) => ({
      ticker: c.ticker,
      name: c.name,
      assetClass: c.assetClass || "Equity",
      exchange: "NASDAQ",
      currency: "USD",
      currentEstPrice: 0,
      entryZone: [0, 0],
      targetPrice: 0,
      stopLoss: 0,
      timeHorizon: i % 3 === 0 ? "1M" : "3M",
      suggestedQty: 1,
      confidence: 68,
      thesis: `${c.name} is a liquid institutional-grade name with strong trend persistence and robust balance sheet quality.`,
      catalyst: "Upcoming earnings and continued institutional flow momentum.",
      hedgingStrategy: "Use protective puts and hard stop-loss discipline.",
      riskReward: "1:2.2",
      sector: c.sector,
      tags: ["liquid", "institutional", "momentum"],
      riskProfile: ["medium_term", "high_conviction"],
      strategy: c.strategy,
      pairedInstrument: null,
      pairedStructure: null,
      capitalEfficiency: 1,
      correlationToPortfolio: "low",
      marketCap: c.marketCap,
    }));
}

// ── Main serve ─────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    await requireAuth(req, corsHeaders);
    const body = await req.json().catch(() => ({}));
    const portfolioTickers: string[] = body.portfolioTickers || [];
    const portfolioWeights: Record<string, number> = body.portfolioWeights || {};
    const portfolioSectors: Record<string, string> = body.portfolioSectors || {};
    const portfolioValue = body.portfolioValue || 100000;
    const baseCurrency = (body.baseCurrency || "USD").toUpperCase();
    const provider = String(body.provider || "mistral").toLowerCase();
    const previousTickers: string[] = body.previousTickers || []; // anti-repeat

    const regionInfo = CURRENCY_TO_REGION[baseCurrency];
    const isUSUser = !regionInfo || baseCurrency === "USD";
    const seed = Math.floor(Math.random() * 99999);
    // Reliability-first: avoid Cloudflare free-tier neuron exhaustion loops.
    const effectiveProvider = provider === "cloudflare" ? "cloudflare" : "mistral";

    const existingSectors = [...new Set(Object.values(portfolioSectors))].filter(Boolean);
    const portfolioContext = portfolioTickers.length > 0
      ? `Existing portfolio: ${portfolioTickers.map(t => `${t} (${portfolioSectors[t] || "unknown"}, weight: ${((portfolioWeights[t] || 0) * 100).toFixed(1)}%)`).join(", ")}. Sectors already held: ${existingSectors.join(", ") || "none"}.`
      : "Empty portfolio — recommend foundational positions.";

    const homeMarketRule = isUSUser
      ? "4-5 US equities from DIFFERENT sectors and market caps (include small/mid-cap under $10B)"
      : `4-5 stocks from ${regionInfo.region} listed on ${regionInfo.exchange} with Yahoo Finance suffix ${regionInfo.suffix}`;

    // Anti-repeat instruction
    const antiRepeatBlock = previousTickers.length > 0
      ? `\n## ANTI-REPEAT RULE:\nDo NOT recommend ANY of these tickers (previously recommended): ${previousTickers.join(", ")}. Pick COMPLETELY DIFFERENT assets.\n`
      : "";

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
                minItems: 12,
                maxItems: 18,
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

    try {
      const result = await callAI({
        systemPrompt: `You are an institutional quant PM. Output only liquid, tradeable assets with strict risk controls and no fluff.
Reject low-quality names, random microcaps, and weak momentum setups.
Every pick must include a concrete catalyst, hedge, and asymmetric risk/reward.
Prefer large/mid-cap leaders, strong earnings trends, and positive sentiment dislocations with recovery setups.
Use exact tickers supported by Yahoo Finance.
Do not output markdown.`,
        userPrompt: `[SEED:${seed}] Date: ${new Date().toISOString().split("T")[0]}
Portfolio value: $${portfolioValue.toLocaleString()} (${baseCurrency})
${portfolioContext}
${antiRepeatBlock}
Home-market rule: ${homeMarketRule}

Create 14-16 recommendations that prioritize:
1) Positive earnings momentum + institutional participation
2) Price trend confirmation (above key averages)
3) Catalyst-driven upside in 1-6 months
4) Sentiment-aware setups (avoid structural breakdowns)
5) Liquidity and execution quality

Hard constraints:
- Maximum 3 ETFs
- No penny stocks / meme stocks / niche illiquid names
- No deteriorating fundamentals
- Provide strategy diversity across at least 5 strategy types

Return via the tool call only.`,
        tools: candidateTools,
        toolChoice: { type: "function", function: { name: "emit_desirable_assets" } },
        maxTokens: 5200,
        temperature: 0.35,
        provider: effectiveProvider,
      });

      parsed = safeParseJSON(result.text);
      candidates = dedupeCandidates(Array.isArray(parsed?.recommendations) ? parsed.recommendations : []);
      console.log(`desirable-assets Stage 1 done, provider: ${result.provider}, seed: ${seed}, aiCandidates: ${candidates.length}`);
    } catch (aiError) {
      console.error("desirable-assets Stage 1 AI generation failed:", aiError);
    }

    // Always blend in deterministic institutional fallback universe to prevent empty or low-quality sets.
    const deterministicCandidates = buildDeterministicCandidates(previousTickers);
    candidates = dedupeCandidates([...candidates, ...deterministicCandidates]).slice(0, 25);

    if (candidates.length === 0) {
      throw new Error("No candidates available after deterministic fallback");
    }

    // ── STAGE 2: Fetch real prices + portfolio prices ─────────────
    const allTickers = [
      ...candidates.map((c: any) => c.ticker),
      ...portfolioTickers,
    ];
    const uniqueTickers = [...new Set(allTickers)];

    // Batch Yahoo fetches in groups of 6 to avoid rate limits / timeouts
    const BATCH_SIZE = 6;
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
      volatility: number;
      zScore: number;
      quantScore: number;
      priceVerified: boolean;
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
      filterTier: "strict" | "balanced" | "rescue";
    }

    const scored: ScoredRec[] = [];

    let noData = 0, thinData = 0, filtered = 0;
    for (const rec of candidates) {
      const td = tickerData[rec.ticker];
      if (!td) { noData++; continue; }
      if (td.closes.length < 20) { thinData++; continue; }

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

      const isHedge = rec.strategy === "correlation_hedge" || rec.strategy === "sector_hedge";
      const isPair = rec.strategy === "pair_trade" || rec.strategy === "vol_arb" || rec.strategy === "mean_reversion";

      // F1: Skip portfolio holdings
      if (portfolioTickers.includes(rec.ticker)) continue;

      // F2: Target must be above current price
      if (rec.targetPrice && td.price && rec.targetPrice < td.price * 0.95) { filtered++; continue; }

      // F3: Liquidity + investability guards (avoid tiny/random names)
      const dollarVolume = (td.volume || 0) * price;
      if (!isHedge && dollarVolume < 20_000_000) { filtered++; continue; }
      if (!isHedge && String(rec.marketCap || "").toLowerCase() === "micro") { filtered++; continue; }

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

      // F4: Avoid weak upside profiles
      if (!isHedge && expectedUpsidePct < 4) { filtered++; continue; }

      // Tiered pass logic to avoid empty result sets while preserving quality.
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
        sr >= -0.1 &&
        mdd <= 50 &&
        (!isPair ? price >= sma20 * 0.95 : true) &&
        (!isPair ? trendStrength >= 35 : true) &&
        cumReturn20d >= -15 &&
        fiftyTwoPos >= 15 &&
        (!isPair ? portCorr <= 0.88 : true) &&
        winRate >= 40 &&
        momentum20d > -6
      );

      const rescuePass = isHedge || (
        sr >= -0.35 &&
        mdd <= 65 &&
        (!isPair ? price >= sma20 * 0.9 : true) &&
        winRate >= 34 &&
        momentum20d > -12
      );

      if (!strictPass && !balancedPass && !rescuePass) { filtered++; continue; }
      const filterTier: "strict" | "balanced" | "rescue" = strictPass
        ? "strict"
        : balancedPass
          ? "balanced"
          : "rescue";

      // ── COMPOSITE SCORE — heavily weighted toward momentum + trend ──
      const normSharpe = Math.min(Math.max(sr / 3, -1), 1);
      const diversification = 1 - Math.abs(portCorr);
      const capEff = rec.capitalEfficiency || 1;
      const conf = (rec.confidence || 50) / 100;
      const momScore = Math.min(Math.max(momentum20d / 20, -1), 1); // normalize momentum
      const trendScore = trendStrength / 100;
      const winRateScore = winRate / 100;
      const hedgeBonus = isHedge && portCorr < -0.1 ? 0.1 : 0;
      const tierBonus = filterTier === "strict" ? 0.1 : filterTier === "balanced" ? 0.04 : -0.06;

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
        volatility: Math.round(vol * 10) / 10,
        zScore: Math.round(zs * 100) / 100,
        quantScore: Math.min(quantScore, 99),
        priceVerified: true,
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
      });
    }

    // ── STAGE 4: Select top candidates by score ─────────────────
    scored.sort((a, b) => b.quantScore - a.quantScore);

    const strictPool = scored.filter((s) => s.filterTier === "strict");
    const balancedPool = scored.filter((s) => s.filterTier === "strict" || s.filterTier === "balanced");
    const rescuePool = scored.filter((s) => s.filterTier === "rescue");

    let selectionPool: ScoredRec[];
    if (strictPool.length >= 8) {
      selectionPool = strictPool;
    } else if (balancedPool.length >= 8) {
      selectionPool = balancedPool;
    } else {
      selectionPool = scored.filter((s) => s.quantScore >= 32);
      if (selectionPool.length === 0) selectionPool = scored;
    }

    const selected: ScoredRec[] = [];
    const selectedTickers = new Set<string>();

    // First: try to pick one from each available strategy bucket for diversity
    const strategyBuckets: Record<string, ScoredRec[]> = {};
    for (const s of selectionPool) {
      const strat = s.rec.strategy || "equity";
      if (!strategyBuckets[strat]) strategyBuckets[strat] = [];
      strategyBuckets[strat].push(s);
    }
    for (const strat of Object.keys(strategyBuckets)) {
      const bucket = strategyBuckets[strat];
      if (bucket.length > 0 && !selectedTickers.has(bucket[0].rec.ticker)) {
        selected.push(bucket[0]);
        selectedTickers.add(bucket[0].rec.ticker);
      }
    }

    // Then fill remaining by quantScore — allow ALL that passed filters (up to 25)
    for (const s of selectionPool) {
      if (selected.length >= 25) break;
      if (!selectedTickers.has(s.rec.ticker)) {
        selected.push(s);
        selectedTickers.add(s.rec.ticker);
      }
    }

    if (selected.length === 0 && scored.length > 0) {
      selected.push(...scored.slice(0, Math.min(8, scored.length)));
    }

    // Verify strategy diversity
    const uniqueStrategies = new Set(selected.map(s => s.rec.strategy || "equity"));

    console.log(`desirable-assets: ${candidates.length} candidates, ${noData} no Yahoo data, ${thinData} thin data, ${scored.length} scored, ${selected.length} selected`);
    console.log(`desirable-assets tiers: strict=${strictPool.length}, balanced=${balancedPool.length - strictPool.length}, rescue=${rescuePool.length}`);
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

      // Compute risk-reward string from validated numbers
      const riskReward = realPrice && targetPrice && stopLoss && (realPrice - stopLoss) > 0
        ? `1:${((targetPrice - realPrice) / (realPrice - stopLoss)).toFixed(1)}`
        : s.rec.riskReward || "—";

      return {
        ...s.rec,
        thesis: sanitizeText(s.rec.thesis || ""),
        catalyst: sanitizeText(s.rec.catalyst || ""),
        targetPrice: Math.round(targetPrice * 100) / 100,
        stopLoss: Math.round(stopLoss * 100) / 100,
        entryZone,
        hedgingStrategy,
        riskReward,
        realPrice: s.realPrice,
        realCurrency: s.realCurrency,
        priceChange24h: s.priceChange24h,
        priceVerified: s.priceVerified,
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
      };
    });

    console.log(`desirable-assets: ${candidates.length} candidates → ${enriched.length} passed tiered quant filters`);

    return new Response(JSON.stringify({
      marketCondition: sanitizeText(parsed.marketCondition || ""),
      regimeType: parsed.regimeType || "transition",
      recommendations: enriched,
      baseCurrency,
      candidatesGenerated: candidates.length,
      candidatesPassed: enriched.length,
      timestamp: Date.now(),
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  } catch (error: any) {
    console.error("Desirable assets error:", error);
    if (error instanceof Response) return error;
    if (error.status === 429) return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again shortly." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    if (error.status === 402) return new Response(JSON.stringify({ error: "AI credits exhausted. Please top up your OpenRouter account." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
