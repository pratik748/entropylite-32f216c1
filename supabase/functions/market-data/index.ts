import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function fetchYahooQuote(symbol: string) {
  const t = Date.now();
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=5d&_t=${t}`;
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
      "Accept": "application/json",
      "Cache-Control": "no-cache, no-store",
    },
  });
  const data = await res.json();
  const meta = data?.chart?.result?.[0]?.meta;
  if (!meta) return null;
  const prevClose = meta.chartPreviousClose || meta.previousClose || 0;
  const currentPrice = meta.regularMarketPrice || 0;
  return { price: currentPrice, prevClose, change: currentPrice - prevClose, changePct: prevClose > 0 ? ((currentPrice - prevClose) / prevClose) * 100 : 0, currency: meta.currency || "USD" };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    // Global indices
    const allIndices = [
      // US
      { symbol: "^GSPC", name: "S&P 500", region: "US" },
      { symbol: "^IXIC", name: "NASDAQ", region: "US" },
      { symbol: "^DJI", name: "Dow Jones", region: "US" },
      // Europe
      { symbol: "^FTSE", name: "FTSE 100", region: "Europe" },
      { symbol: "^GDAXI", name: "DAX", region: "Europe" },
      { symbol: "^FCHI", name: "CAC 40", region: "Europe" },
      // Asia
      { symbol: "^N225", name: "Nikkei 225", region: "Asia" },
      { symbol: "^HSI", name: "Hang Seng", region: "Asia" },
      { symbol: "000001.SS", name: "Shanghai", region: "Asia" },
      // India
      { symbol: "^NSEI", name: "NIFTY 50", region: "India" },
      { symbol: "^BSESN", name: "SENSEX", region: "India" },
      { symbol: "^NSEBANK", name: "BANK NIFTY", region: "India" },
    ];

    // Fetch all indices + macro data in parallel
    const [indexResults, usdInrData, crudeData, vixData, goldData, eurUsdData, gbpUsdData, btcData] = await Promise.all([
      Promise.all(allIndices.map(async (idx) => {
        try {
          const q = await fetchYahooQuote(idx.symbol);
          if (!q) return null;
          return { ...idx, price: q.price, change: q.change, changePct: q.changePct, currency: q.currency };
        } catch (e) {
          console.error(`Error ${idx.symbol}:`, e);
          return null;
        }
      })),
      fetchYahooQuote("USDINR=X").catch(() => null),
      fetchYahooQuote("BZ=F").catch(() => null),
      fetchYahooQuote("^VIX").catch(() => null),
      fetchYahooQuote("GC=F").catch(() => null),
      fetchYahooQuote("EURUSD=X").catch(() => null),
      fetchYahooQuote("GBPUSD=X").catch(() => null),
      fetchYahooQuote("BTC-USD").catch(() => null),
    ]);

    const indexData = indexResults.filter(Boolean);

    // Sector indices (global)
    const sectorSymbols = [
      { symbol: "XLK", name: "Technology" },
      { symbol: "XLF", name: "Financials" },
      { symbol: "XLE", name: "Energy" },
      { symbol: "XLV", name: "Healthcare" },
      { symbol: "XLI", name: "Industrials" },
      { symbol: "XLC", name: "Communication" },
      { symbol: "XLRE", name: "Real Estate" },
      { symbol: "XLU", name: "Utilities" },
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

    // AI for market mood and insights
    let aiMacro: any = null;
    if (LOVABLE_API_KEY) {
      try {
        const sp500Change = indexData.find(i => i?.name === "S&P 500")?.changePct || 0;
        const niftyChange = indexData.find(i => i?.name === "NIFTY 50")?.changePct || 0;
        const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash-lite",
            messages: [
              { role: "system", content: "You are a global market analyst. Return ONLY valid JSON, no markdown." },
              {
                role: "user",
                content: `Today is ${new Date().toISOString().split("T")[0]}. S&P 500 changed ${sp500Change.toFixed(2)}%. NIFTY changed ${niftyChange.toFixed(2)}%. USD/INR: ${realUsdInr.toFixed(2)}. VIX: ${realVix.toFixed(2)}. Brent: $${realCrude.toFixed(2)}. Gold: $${realGold.toFixed(2)}. BTC: $${realBtc.toFixed(0)}.

Provide:
{
  "marketMood": "<Bullish | Bearish | Neutral | Cautious>",
  "moodScore": <-100 to 100>,
  "fiiFlow": "<today's FII flow estimate>",
  "diiFlow": "<today's DII flow estimate>",
  "topMovers": [{"name": "<stock>", "change": <% number>}],
  "keyEvents": ["<event1>", "<event2>", "<event3>", "<event4>"],
  "outlook": "<2 sentence GLOBAL market outlook>"
}`,
              },
            ],
            temperature: 0.3,
            max_tokens: 600,
          }),
        });
        const aiData = await aiRes.json();
        if (aiData.choices?.[0]?.message?.content) {
          const raw = aiData.choices[0].message.content.trim().replace(/^```json?\n?/, "").replace(/\n?```$/, "");
          aiMacro = JSON.parse(raw);
        }
      } catch (e) { console.error("AI macro error:", e); }
    }

    const macro = {
      marketMood: aiMacro?.marketMood || "Neutral",
      moodScore: aiMacro?.moodScore || 0,
      fiiFlow: aiMacro?.fiiFlow || "—",
      diiFlow: aiMacro?.diiFlow || "—",
      vix: realVix,
      usdInr: realUsdInr,
      crudeBrent: realCrude,
      goldPrice: realGold,
      eurUsd: realEurUsd,
      gbpUsd: realGbpUsd,
      btcUsd: realBtc,
      topMovers: aiMacro?.topMovers || [],
      keyEvents: aiMacro?.keyEvents || [],
      outlook: aiMacro?.outlook || "",
    };

    return new Response(
      JSON.stringify({ indices: indexData, sectors: sectorData, macro, timestamp: Date.now() }),
      { headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0" } }
    );
  } catch (error) {
    console.error("Error in market-data:", error);
    return new Response(
      JSON.stringify({ error: "Failed to fetch market data", details: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
