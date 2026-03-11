import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { callAI } from "../_shared/callAI.ts";
import { requireAuth } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

async function fetchYahooQuote(symbol: string) {
  const t = Date.now();
  
  // Try v8 first
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=5d&_t=${t}`;
    const res = await fetch(url, {
      headers: { "User-Agent": UA, "Accept": "application/json", "Cache-Control": "no-cache, no-store" },
    });
    if (res.ok) {
      const data = await res.json();
      const meta = data?.chart?.result?.[0]?.meta;
      if (meta?.regularMarketPrice && meta.regularMarketPrice > 0) {
        const prevClose = meta.chartPreviousClose || meta.previousClose || 0;
        const currentPrice = meta.regularMarketPrice;
        return { price: currentPrice, prevClose, change: currentPrice - prevClose, changePct: prevClose > 0 ? ((currentPrice - prevClose) / prevClose) * 100 : 0, currency: meta.currency || "USD", volume: meta.regularMarketVolume || 0 };
      }
    }
  } catch { /* fall through */ }

  // Fallback to v10 quoteSummary
  try {
    const url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=price`;
    const res = await fetch(url, {
      headers: { "User-Agent": UA, "Cache-Control": "no-cache, no-store" },
    });
    if (res.ok) {
      const data = await res.json();
      const pm = data?.quoteSummary?.result?.[0]?.price;
      const currentPrice = pm?.regularMarketPrice?.raw;
      const prevClose = pm?.regularMarketPreviousClose?.raw || 0;
      if (currentPrice && currentPrice > 0) {
        return { price: currentPrice, prevClose, change: currentPrice - prevClose, changePct: prevClose > 0 ? ((currentPrice - prevClose) / prevClose) * 100 : 0, currency: pm?.currency || "USD", volume: pm?.regularMarketVolume?.raw || 0 };
      }
    }
  } catch { /* fall through */ }

  return null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    await requireAuth(req, corsHeaders);
    const body = await req.json().catch(() => ({}));
    const provider = body.provider || "mistral";
    const allIndices = [
      { symbol: "^GSPC", name: "S&P 500", region: "US" },
      { symbol: "^IXIC", name: "NASDAQ", region: "US" },
      { symbol: "^DJI", name: "Dow Jones", region: "US" },
      { symbol: "^RUT", name: "Russell 2000", region: "US" },
      { symbol: "^FTSE", name: "FTSE 100", region: "Europe" },
      { symbol: "^GDAXI", name: "DAX", region: "Europe" },
      { symbol: "^FCHI", name: "CAC 40", region: "Europe" },
      { symbol: "^STOXX50E", name: "Euro Stoxx 50", region: "Europe" },
      { symbol: "^N225", name: "Nikkei 225", region: "Asia" },
      { symbol: "^HSI", name: "Hang Seng", region: "Asia" },
      { symbol: "000001.SS", name: "Shanghai", region: "Asia" },
      { symbol: "^KS11", name: "KOSPI", region: "Asia" },
      { symbol: "^NSEI", name: "NIFTY 50", region: "India" },
      { symbol: "^BSESN", name: "SENSEX", region: "India" },
      { symbol: "^NSEBANK", name: "BANK NIFTY", region: "India" },
    ];

    const [indexResults, usdInrData, crudeData, vixData, goldData, eurUsdData, gbpUsdData, btcData, ethData, silverData] = await Promise.all([
      Promise.all(allIndices.map(async (idx) => {
        try {
          const q = await fetchYahooQuote(idx.symbol);
          if (!q) return null;
          return { ...idx, price: q.price, change: q.change, changePct: q.changePct, currency: q.currency, volume: q.volume };
        } catch { return null; }
      })),
      fetchYahooQuote("USDINR=X").catch(() => null),
      fetchYahooQuote("BZ=F").catch(() => null),
      fetchYahooQuote("^VIX").catch(() => null),
      fetchYahooQuote("GC=F").catch(() => null),
      fetchYahooQuote("EURUSD=X").catch(() => null),
      fetchYahooQuote("GBPUSD=X").catch(() => null),
      fetchYahooQuote("BTC-USD").catch(() => null),
      fetchYahooQuote("ETH-USD").catch(() => null),
      fetchYahooQuote("SI=F").catch(() => null),
    ]);

    const indexData = indexResults.filter(Boolean);

    const sectorSymbols = [
      { symbol: "XLK", name: "Technology" }, { symbol: "XLF", name: "Financials" },
      { symbol: "XLE", name: "Energy" }, { symbol: "XLV", name: "Healthcare" },
      { symbol: "XLI", name: "Industrials" }, { symbol: "XLC", name: "Communication" },
      { symbol: "XLRE", name: "Real Estate" }, { symbol: "XLU", name: "Utilities" },
      { symbol: "XLY", name: "Consumer Disc." }, { symbol: "XLP", name: "Consumer Staples" },
    ];

    const sectorResults = await Promise.all(sectorSymbols.map(async (sec) => {
      try {
        const q = await fetchYahooQuote(sec.symbol);
        if (!q) return null;
        return { name: sec.name, price: q.price, change: q.change, changePct: q.changePct };
      } catch { return null; }
    }));
    const sectorData = sectorResults.filter(Boolean);

    const realUsdInr = usdInrData?.price || 0;
    const realCrude = crudeData?.price || 0;
    const realVix = vixData?.price || 0;
    const realGold = goldData?.price || 0;
    const realEurUsd = eurUsdData?.price || 0;
    const realGbpUsd = gbpUsdData?.price || 0;
    const realBtc = btcData?.price || 0;
    const realEth = ethData?.price || 0;
    const realSilver = silverData?.price || 0;

    let aiMacro: any = null;
    try {
      const sp500 = indexData.find(i => i?.name === "S&P 500");
      const nifty = indexData.find(i => i?.name === "NIFTY 50");

      const result = await callAI({
        systemPrompt: "You are a global macro strategist. Return ONLY valid JSON, no markdown.",
        userPrompt: `Today is ${new Date().toISOString().split("T")[0]}. S&P 500: ${sp500?.changePct?.toFixed(2) || "N/A"}%, NIFTY: ${nifty?.changePct?.toFixed(2) || "N/A"}%, VIX: ${realVix.toFixed(2)}, Crude: $${realCrude.toFixed(2)}, Gold: $${realGold.toFixed(0)}, BTC: $${realBtc.toFixed(0)}

Provide:
{
  "marketMood": "<Bullish|Bearish|Neutral|Cautious|Risk-Off>",
  "moodScore": <-100 to 100>,
  "fiiFlow": "<direction and magnitude>",
  "diiFlow": "<direction and magnitude>",
  "topMovers": [{"name": "<stock/index>", "change": <% number>}],
  "keyEvents": ["<event1>", "<event2>", "<event3>"],
  "outlook": "<3 sentence global market outlook>",
  "sectorRotation": "<inflows vs outflows>",
  "riskAppetite": "<1 sentence>"
}`,
        maxTokens: 800,
        temperature: 0.3,
        provider,
      });

      console.log(`market-data used provider: ${result.provider}`);
      aiMacro = JSON.parse(result.text);
    } catch (e) { console.error("AI macro error:", e); }

    const macro = {
      marketMood: aiMacro?.marketMood || "Neutral",
      moodScore: aiMacro?.moodScore || 0,
      fiiFlow: aiMacro?.fiiFlow || "—",
      diiFlow: aiMacro?.diiFlow || "—",
      vix: realVix, usdInr: realUsdInr, crudeBrent: realCrude, goldPrice: realGold,
      silverPrice: realSilver, eurUsd: realEurUsd, gbpUsd: realGbpUsd, btcUsd: realBtc, ethUsd: realEth,
      topMovers: aiMacro?.topMovers || [],
      keyEvents: aiMacro?.keyEvents || [],
      outlook: aiMacro?.outlook || "",
      sectorRotation: aiMacro?.sectorRotation || "",
      riskAppetite: aiMacro?.riskAppetite || "",
    };

    return new Response(JSON.stringify({ indices: indexData, sectors: sectorData, macro, timestamp: Date.now() }), {
      headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0" },
    });
  } catch (error) {
    console.error("Error in market-data:", error);
    return new Response(JSON.stringify({ error: "Failed to fetch market data", details: error.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
