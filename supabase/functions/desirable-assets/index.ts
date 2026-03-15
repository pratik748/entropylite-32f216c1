import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { callAI } from "../_shared/callAI.ts";
import { safeParseJSON } from "../_shared/safeParseJSON.ts";
import { requireAuth } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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

async function fetchYahooPrice(symbol: string) {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=5d&_t=${Date.now()}`;
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0", "Cache-Control": "no-cache, no-store" } });
    const data = await res.json();
    const meta = data?.chart?.result?.[0]?.meta;
    if (!meta) return null;
    const prevClose = meta.chartPreviousClose || meta.previousClose || 0;
    return {
      price: meta.regularMarketPrice || 0,
      currency: meta.currency || "USD",
      change: prevClose > 0 ? ((meta.regularMarketPrice - prevClose) / prevClose) * 100 : 0,
      volume: meta.regularMarketVolume || 0,
      fiftyTwoHigh: meta.fiftyTwoWeekHigh || 0,
      fiftyTwoLow: meta.fiftyTwoWeekLow || 0,
    };
  } catch { return null; }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    await requireAuth(req, corsHeaders);
    const body = await req.json().catch(() => ({}));
    const portfolioTickers = body.portfolioTickers || [];
    const portfolioValue = body.portfolioValue || 100000;
    const baseCurrency = (body.baseCurrency || "USD").toUpperCase();
    const provider = body.provider || "mistral";

    const regionInfo = CURRENCY_TO_REGION[baseCurrency];
    const isUSUser = !regionInfo || baseCurrency === "USD";
    const seed = Math.floor(Math.random() * 99999);

    const homeMarketRule = isUSUser
      ? "3-4 US equities from DIFFERENT sectors and market caps (include at least 1 small/mid-cap under $10B market cap)"
      : `3-4 stocks from ${regionInfo.region} listed on ${regionInfo.exchange} with Yahoo Finance suffix ${regionInfo.suffix}, priced in ${baseCurrency}. These MUST be real tickers tradeable on that exchange.`;

    const result = await callAI({
      systemPrompt: "You are an elite multi-asset portfolio strategist at a $50B+ global asset manager. You have deep knowledge of every stock exchange worldwide. Return ONLY valid JSON.",
      userPrompt: `[SEED:${seed}] Today is ${new Date().toISOString().split("T")[0]}. Portfolio value: $${portfolioValue.toLocaleString()}. User's base currency: ${baseCurrency}. Existing tickers (DO NOT recommend these): ${portfolioTickers.join(", ") || "none"}.

Recommend exactly 10 assets to buy RIGHT NOW. You MUST follow these STRICT diversity rules:

## MANDATORY DISTRIBUTION:
1. HOME MARKET (${isUSUser ? "US" : regionInfo.region}): ${homeMarketRule}
2. GLOBAL EQUITIES: 2-3 stocks from DIFFERENT countries/regions outside the home market (e.g., if home is India, pick from US, Europe, Japan, etc.)
3. ETFs: 1-2 thematic or sector ETFs (NOT just SPY/QQQ — pick specific themes like clean energy, semiconductors, emerging markets, healthcare innovation, etc.)
4. ALTERNATIVES: 1 cryptocurrency + 1 commodity or defensive asset (gold ETF, treasury ETF, etc.)

## CRITICAL RULES:
- Each recommendation MUST be from a DIFFERENT sector. NO two stocks from the same industry.
- Include at least 2 small/mid-cap opportunities (under $10B market cap), not just mega-caps.
- DO NOT recommend the same popular stocks every time (avoid always suggesting AAPL, MSFT, GOOGL, AMZN, NVDA unless there's a very specific catalyst RIGHT NOW).
- Use CORRECT Yahoo Finance tickers with exchange suffixes: .NS for NSE India, .L for London, .T for Tokyo, .DE for XETRA, .PA for Paris, .HK for Hong Kong, .TO for Toronto, .AX for ASX, .SA for B3 Brazil.
- For crypto use standard tickers like BTC-USD, ETH-USD, SOL-USD, etc.
- All prices for ${isUSUser ? "US" : regionInfo.region} stocks MUST be in ${baseCurrency}.
- Think contrarian: include at least 1 beaten-down recovery play or undervalued opportunity.
- Vary your picks — imagine you're advising a sophisticated client who already knows the mega-caps.

Return JSON:
{
  "marketCondition": "<3-4 sentence market regime assessment with specific data points>",
  "regimeType": "<risk-on|risk-off|transition|crisis>",
  "recommendations": [{
    "ticker": "<exact Yahoo Finance ticker with exchange suffix>",
    "name": "<full company/asset name>",
    "assetClass": "<Equity|ETF|Crypto|Commodity|Forex>",
    "exchange": "<exchange name>",
    "currency": "<currency code>",
    "currentEstPrice": <number in correct currency>,
    "entryZone": [<support level>, <resistance breakout>],
    "targetPrice": <number>,
    "stopLoss": <number>,
    "timeHorizon": "<1W|1M|3M|6M|1Y>",
    "suggestedQty": <number based on position sizing>,
    "confidence": <0-100>,
    "thesis": "<3-4 sentence detailed rationale with specific metrics/catalysts>",
    "catalyst": "<specific upcoming catalyst with date if possible>",
    "hedgingStrategy": "<specific actionable hedge>",
    "riskReward": "<e.g. 1:3.5>",
    "sector": "<specific sector>",
    "tags": ["<tag>"],
    "correlationToPortfolio": "<low|medium|high>",
    "maxDrawdownEstimate": <percentage number>,
    "marketCap": "<mega|large|mid|small|micro>"
  }]
}`,
      maxTokens: 5000,
      temperature: 0.65,
      provider,
    });

    console.log(`desirable-assets used provider: ${result.provider}, seed: ${seed}, baseCurrency: ${baseCurrency}`);
    
    const parsed = safeParseJSON(result.text);

    // Validate prices with real Yahoo data
    const enriched = await Promise.all(
      (parsed.recommendations || []).map(async (rec: any) => {
        const real = await fetchYahooPrice(rec.ticker);
        return {
          ...rec,
          realPrice: real?.price || rec.currentEstPrice,
          realCurrency: real?.currency || rec.currency,
          priceChange24h: real?.change || 0,
          priceVerified: !!real,
          realVolume: real?.volume || 0,
          fiftyTwoHigh: real?.fiftyTwoHigh || 0,
          fiftyTwoLow: real?.fiftyTwoLow || 0,
        };
      })
    );

    return new Response(JSON.stringify({
      marketCondition: parsed.marketCondition,
      regimeType: parsed.regimeType || "transition",
      recommendations: enriched,
      baseCurrency,
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
