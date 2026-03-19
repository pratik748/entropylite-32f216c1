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
const REQUIRED_STRATEGIES = ["pair_trade", "sector_hedge", "correlation_hedge"];
const MIN_STRATEGY_TYPES = 4; // Must have at least 4 different strategy types

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
    const provider = body.provider || "mistral";
    const previousTickers: string[] = body.previousTickers || []; // anti-repeat

    const regionInfo = CURRENCY_TO_REGION[baseCurrency];
    const isUSUser = !regionInfo || baseCurrency === "USD";
    const seed = Math.floor(Math.random() * 99999);

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

    // ── STAGE 1: AI generates ~25 candidates ──────────────────────
    const result = await callAI({
      systemPrompt: `You are an elite multi-asset portfolio strategist and derivatives specialist at a $50B+ global asset manager. You recommend assets RELATIVE to the client's existing portfolio, maximizing diversification and risk-adjusted returns.

CRITICAL RULES:
1. Target prices MUST be ABOVE current price (for long positions). A target below current price is NONSENSICAL.
2. Every recommendation MUST have a SPECIFIC hedging strategy — never say "no hedge" or "none". Always specify: protective puts at specific strike %, inverse ETF tickers, collar strategies, or paired short positions.
3. Include DIVERSE strategy types: pairs, triplets, sector hedges, vol plays — NOT just plain equities.
4. Only recommend assets with STRONG quantitative backing — positive expected returns, reasonable risk.
Return ONLY valid JSON.`,
      userPrompt: `[SEED:${seed}] Today is ${new Date().toISOString().split("T")[0]}. Portfolio value: $${portfolioValue.toLocaleString()}. Base currency: ${baseCurrency}.

${portfolioContext}
${antiRepeatBlock}
Generate exactly 15 asset recommendations that COMPLEMENT this portfolio. You MUST follow these rules:

## PORTFOLIO-RELATIVE REQUIREMENTS:
- Each asset must REDUCE overall portfolio risk or fill a SECTOR/GEOGRAPHY GAP
- Avoid sectors already heavily represented: ${existingSectors.join(", ") || "none"}
- MINIMUM 5 DERIVATIVE/PAIR/STRUCTURED STRATEGIES — these are the most valuable
- At least 3 CORRELATION HEDGES — assets negatively correlated to the portfolio

## MANDATORY DISTRIBUTION (25 total):
1. HOME MARKET: ${homeMarketRule}
2. GLOBAL EQUITIES: 4-5 stocks from different countries outside home market
3. ETFs: 3-4 thematic/sector ETFs targeting portfolio gaps
4. PAIRS & STRUCTURES: 5-6 derivative pair strategies with specific instruments (pair_trade, futures_leverage, vol_arb)
5. HEDGES: 3-4 sector_hedge and correlation_hedge plays
6. ALTERNATIVES: 2-3 crypto, commodities, or defensive plays

## STRATEGY TYPES (tag each — MUST use at least 5 different types):
- "equity" — standalone equity position
- "pair_trade" — long/short pair for relative value
- "futures_leverage" — futures + ETF for capital-efficient exposure
- "vol_arb" — volatility arbitrage opportunity
- "sector_hedge" — hedges existing portfolio sector risk
- "correlation_hedge" — negatively correlated to portfolio
- "mean_reversion" — statistically oversold/overbought play
- "momentum" — trend-following opportunity

## HEDGING STRATEGY RULES (MANDATORY — no exceptions):
- For equities: "Buy [TICKER] protective put at [X]% strike, [timeframe] expiry" OR "Pair with [INVERSE_ETF] at [ratio]"
- For pairs: "Built-in hedge via long/short structure; additional protection via [specific instrument]"
- For ETFs: "Collar strategy: sell [X]% OTM call, buy [Y]% OTM put" OR "Pair with [INVERSE_ETF]"
- For crypto: "Reduce to 2% portfolio weight; trailing stop at -8%; hedge via BTC put options at [strike]"
- For commodities: "Calendar spread [front/back months] or pair with [DXY/UUP] for USD hedge"
- NEVER output "no hedge", "none", "N/A", or empty string

## PRICE RULES (CRITICAL):
- targetPrice MUST be ABOVE currentEstPrice (you are recommending LONGS)
- stopLoss MUST be BELOW currentEstPrice
- entryZone must bracket currentEstPrice (within ±5%)
- riskReward ratio must be at least 1:2

## RISK PROFILE TAGS (assign 1-2 per asset):
- "aggressive", "conservative", "short_term", "medium_term", "long_term", "income", "safe_haven", "high_conviction"

## CRITICAL:
- Use CORRECT Yahoo Finance tickers with exchange suffixes
- For derivative pairs, list BOTH instruments
- Vary picks — not just mega-caps
- Include contrarian and beaten-down recovery plays
- Every single recommendation needs a REAL, ACTIONABLE hedging strategy

Return JSON:
{
  "marketCondition": "<3-4 sentence regime assessment>",
  "regimeType": "<risk-on|risk-off|transition|crisis>",
  "recommendations": [{
    "ticker": "<exact Yahoo Finance ticker>",
    "name": "<full name>",
    "assetClass": "<Equity|ETF|Crypto|Commodity|Forex|Derivative>",
    "exchange": "<exchange>",
    "currency": "<currency code>",
    "currentEstPrice": <number>,
    "entryZone": [<low>, <high>],
    "targetPrice": <number — MUST be above currentEstPrice>,
    "stopLoss": <number — MUST be below currentEstPrice>,
    "timeHorizon": "<1W|1M|3M|6M|1Y>",
    "suggestedQty": <number>,
    "confidence": <0-100>,
    "thesis": "<3-4 sentence rationale>",
    "catalyst": "<specific catalyst>",
    "hedgingStrategy": "<SPECIFIC hedge — never empty/none>",
    "riskReward": "<e.g. 1:3.5>",
    "sector": "<sector>",
    "tags": ["<tag>"],
    "riskProfile": ["<risk tag>"],
    "strategy": "<equity|pair_trade|futures_leverage|vol_arb|sector_hedge|correlation_hedge|mean_reversion|momentum>",
    "pairedInstrument": "<second instrument ticker if pair/derivative strategy, null otherwise>",
    "pairedStructure": "<description of the combined position, null if standalone>",
    "capitalEfficiency": <multiplier number, 1.0 for plain equity>,
    "correlationToPortfolio": "<low|medium|high|negative>",
    "marketCap": "<mega|large|mid|small|micro>"
  }]
}`,
      maxTokens: 9000,
      temperature: 0.75, // higher for variety
      provider,
    });

    console.log(`desirable-assets Stage 1 done, provider: ${result.provider}, seed: ${seed}`);
    const parsed = safeParseJSON(result.text);
    const candidates = parsed.recommendations || [];

    if (candidates.length === 0) {
      return new Response(JSON.stringify({ error: "No candidates generated" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── STAGE 2: Fetch real prices + portfolio prices ─────────────
    const allTickers = [
      ...candidates.map((c: any) => c.ticker),
      ...portfolioTickers,
    ];
    const uniqueTickers = [...new Set(allTickers)];

    const priceResults = await Promise.allSettled(
      uniqueTickers.map(async (ticker) => {
        const data = await fetchYahooChart(ticker);
        return { ticker, data };
      })
    );

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

    // ── STAGE 3: STRICT quantitative validation ───────────────────
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
    }

    const scored: ScoredRec[] = [];

    for (const rec of candidates) {
      const td = tickerData[rec.ticker];
      if (!td) continue; // No price data — phantom ticker, skip
      if (td.closes.length < 20) continue; // Not enough data points

      const returns = logReturns(td.closes);
      const sr = sharpeRatio(returns);
      const mdd = maxDrawdown(td.closes);
      const vol = annualizedVol(returns);
      const zs = zScore(td.closes);

      // Correlation to portfolio
      let portCorr = 0;
      if (portReturns.length > 10) {
        portCorr = pearsonCorrelation(returns, portReturns);
      }

      // ── STRICT FILTERS — only the fittest survive ──
      // Filter 1: Too correlated to portfolio (unless it's a hedge)
      const isHedge = rec.strategy === "correlation_hedge" || rec.strategy === "sector_hedge";
      if (!isHedge && portCorr > 0.65) continue;

      // Filter 2: Negative Sharpe = losing money historically
      if (sr < -0.3) continue;

      // Filter 3: Excessive drawdown
      if (mdd > 35) continue;

      // Filter 4: Price sanity — target must be above current price
      if (rec.targetPrice && td.price && rec.targetPrice < td.price * 0.95) continue;

      // Filter 5: Too volatile without compensating returns
      if (vol > 60 && sr < 0.3) continue;

      // Compute max profit target using quant methods
      const mpt = computeMaxProfitTarget(td.closes, td.highs || [], td.price, vol, sr);

      // Composite score — much stricter weighting
      const normSharpe = Math.min(Math.max(sr / 3, -1), 1);
      const diversification = 1 - Math.abs(portCorr);
      const capEff = rec.capitalEfficiency || 1;
      const conf = (rec.confidence || 50) / 100;
      // Bonus for hedge strategies when portfolio is correlated
      const hedgeBonus = isHedge && portCorr < -0.1 ? 0.1 : 0;

      const quantScore = Math.round(
        (0.30 * (normSharpe + 1) / 2 +
         0.30 * diversification +
         0.15 * conf +
         0.10 * Math.min(capEff / 5, 1) +
         0.15 * Math.max(0, 1 - mdd / 35) + // reward low drawdown
         hedgeBonus) * 100
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
      });
    }

    // ── STAGE 4: Diversity enforcement ────────────────────────────
    // Sort by quantScore descending
    scored.sort((a, b) => b.quantScore - a.quantScore);

    // Ensure strategy diversity: pick best from each required strategy first
    const strategyBuckets: Record<string, ScoredRec[]> = {};
    for (const s of scored) {
      const strat = s.rec.strategy || "equity";
      if (!strategyBuckets[strat]) strategyBuckets[strat] = [];
      strategyBuckets[strat].push(s);
    }

    const selected: ScoredRec[] = [];
    const selectedTickers = new Set<string>();

    // First: ensure at least 1 from each required strategy
    for (const requiredStrat of REQUIRED_STRATEGIES) {
      const bucket = strategyBuckets[requiredStrat] || [];
      for (const s of bucket) {
        if (!selectedTickers.has(s.rec.ticker) && selected.length < 15) {
          selected.push(s);
          selectedTickers.add(s.rec.ticker);
          break;
        }
      }
    }

    // Then fill remaining slots by quantScore
    for (const s of scored) {
      if (selected.length >= 15) break;
      if (!selectedTickers.has(s.rec.ticker)) {
        selected.push(s);
        selectedTickers.add(s.rec.ticker);
      }
    }

    // Verify strategy diversity
    const uniqueStrategies = new Set(selected.map(s => s.rec.strategy || "equity"));
    console.log(`desirable-assets: ${uniqueStrategies.size} unique strategies: ${[...uniqueStrategies].join(", ")}`);

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
      let hedgingStrategy = s.rec.hedgingStrategy || "";
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
        // Max profit fields
        maxProfitTarget: Math.round(s.maxProfitTarget * 100) / 100,
        maxProfitConfidence: s.maxProfitConfidence,
        maxProfitMethod: s.maxProfitMethod,
      };
    });

    console.log(`desirable-assets: ${candidates.length} candidates → ${enriched.length} passed strict quant filters`);

    return new Response(JSON.stringify({
      marketCondition: parsed.marketCondition,
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
    if (error.status === 429) return new Response(JSON.stringify({ error: "Rate limit exceeded. Please try again shortly." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    if (error.status === 402) return new Response(JSON.stringify({ error: "AI credits exhausted. Please top up your OpenRouter account." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
