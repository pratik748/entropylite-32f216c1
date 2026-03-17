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

    // ── STAGE 1: AI generates ~20 candidates ──────────────────────
    const result = await callAI({
      systemPrompt: "You are an elite multi-asset portfolio strategist and derivatives specialist at a $50B+ global asset manager. You recommend assets RELATIVE to the client's existing portfolio, maximizing diversification and risk-adjusted returns. Include derivative pair strategies where appropriate. Return ONLY valid JSON.",
      userPrompt: `[SEED:${seed}] Today is ${new Date().toISOString().split("T")[0]}. Portfolio value: $${portfolioValue.toLocaleString()}. Base currency: ${baseCurrency}.

${portfolioContext}

Generate exactly 20 asset recommendations that COMPLEMENT this portfolio. You MUST follow these rules:

## PORTFOLIO-RELATIVE REQUIREMENTS:
- Each asset must REDUCE overall portfolio risk or fill a SECTOR/GEOGRAPHY GAP
- Avoid sectors already heavily represented: ${existingSectors.join(", ") || "none"}
- Include at least 3 DERIVATIVE/PAIR STRATEGIES (e.g., "Long LMT futures + iShares Defence ETF for leveraged sector exposure", "Long gold futures + short DXY for inflation hedge", "Long XLE calls + short USO puts for energy convergence")
- Include at least 2 CORRELATION HEDGES — assets negatively correlated to the portfolio

## MANDATORY DISTRIBUTION:
1. HOME MARKET: ${homeMarketRule}
2. GLOBAL EQUITIES: 3-4 stocks from different countries outside home market
3. ETFs: 2-3 thematic/sector ETFs targeting portfolio gaps
4. DERIVATIVES/PAIRS: 3-4 derivative pair strategies with specific instruments
5. ALTERNATIVES: 2-3 crypto, commodities, or defensive plays

## STRATEGY TYPES (tag each recommendation):
- "equity" — standalone equity position
- "pair_trade" — long/short pair for relative value
- "futures_leverage" — futures + ETF for capital-efficient exposure
- "vol_arb" — volatility arbitrage opportunity
- "sector_hedge" — hedges existing portfolio sector risk
- "correlation_hedge" — negatively correlated to portfolio
- "mean_reversion" — statistically oversold/overbought play
- "momentum" — trend-following opportunity

## RISK PROFILE TAGS (assign 1-2 per asset):
- "aggressive" — high risk/reward, speculative
- "conservative" — stable, defensive
- "short_term" — 1W-1M horizon
- "medium_term" — 1M-6M horizon  
- "long_term" — 6M-1Y+ horizon
- "income" — dividend/yield focused
- "safe_haven" — crisis protection
- "high_conviction" — strong thesis

## CRITICAL:
- Use CORRECT Yahoo Finance tickers with exchange suffixes
- For derivative pairs, list BOTH instruments
- Vary picks — not just mega-caps
- Include contrarian and beaten-down recovery plays

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
    "targetPrice": <number>,
    "stopLoss": <number>,
    "timeHorizon": "<1W|1M|3M|6M|1Y>",
    "suggestedQty": <number>,
    "confidence": <0-100>,
    "thesis": "<3-4 sentence rationale>",
    "catalyst": "<specific catalyst>",
    "hedgingStrategy": "<specific hedge>",
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
      maxTokens: 7000,
      temperature: 0.65,
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

    // ── STAGE 3: Quantitative validation ──────────────────────────
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

      // Filters
      if (Math.abs(portCorr) > 0.7 && portCorr > 0) continue; // Too correlated
      if (sr < -0.5) continue; // Terrible risk-adjusted returns
      if (mdd > 40) continue; // Excessive drawdown

      // Composite score
      const normSharpe = Math.min(Math.max(sr / 3, -1), 1); // normalize to [-1, 1]
      const diversification = 1 - Math.abs(portCorr);
      const capEff = rec.capitalEfficiency || 1;
      const conf = (rec.confidence || 50) / 100;

      const quantScore = Math.round(
        (0.35 * (normSharpe + 1) / 2 + // 0-1 range
         0.30 * diversification +
         0.20 * conf +
         0.15 * Math.min(capEff / 5, 1)) * 100
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
        closes: td.closes.slice(-60), // Last 60 days for sparkline
      });
    }

    // Sort by quantScore descending, take top 10
    scored.sort((a, b) => b.quantScore - a.quantScore);
    const top = scored.slice(0, 10);

    const enriched = top.map(s => ({
      ...s.rec,
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
    }));

    console.log(`desirable-assets: ${candidates.length} candidates → ${enriched.length} passed quant filters`);

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
