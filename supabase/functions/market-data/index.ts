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
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      "Accept": "application/json",
      "Cache-Control": "no-cache, no-store",
    },
  });
  const data = await res.json();
  const meta = data?.chart?.result?.[0]?.meta;
  if (!meta) return null;
  const prevClose = meta.chartPreviousClose || meta.previousClose || 0;
  const currentPrice = meta.regularMarketPrice || 0;
  return { price: currentPrice, prevClose, change: currentPrice - prevClose, changePct: prevClose > 0 ? ((currentPrice - prevClose) / prevClose) * 100 : 0 };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    // Fetch major Indian indices
    const indexSymbols = [
      { symbol: "^NSEI", name: "NIFTY 50" },
      { symbol: "^BSESN", name: "SENSEX" },
      { symbol: "^NSEBANK", name: "BANK NIFTY" },
    ];

    // Fetch indices + macro data (USD/INR, Crude, VIX) in parallel
    const [indexResults, usdInrData, crudeData, vixData, goldData] = await Promise.all([
      Promise.all(indexSymbols.map(async (idx) => {
        try {
          const q = await fetchYahooQuote(idx.symbol);
          if (!q) return null;
          return { symbol: idx.symbol, name: idx.name, price: q.price, change: q.change, changePct: q.changePct, prevClose: q.prevClose };
        } catch (e) {
          console.error(`Error ${idx.symbol}:`, e);
          return null;
        }
      })),
      fetchYahooQuote("USDINR=X").catch(() => null),
      fetchYahooQuote("BZ=F").catch(() => null),
      fetchYahooQuote("^INDIAVIX").catch(() => null),
      fetchYahooQuote("GC=F").catch(() => null),
    ]);

    const indexData = indexResults.filter(Boolean);

    // Fetch sector indices
    const sectorSymbols = [
      { symbol: "^CNXIT", name: "NIFTY IT" },
      { symbol: "^CNXPHARMA", name: "NIFTY Pharma" },
      { symbol: "^CNXFMCG", name: "NIFTY FMCG" },
      { symbol: "^CNXAUTO", name: "NIFTY Auto" },
      { symbol: "^CNXMETAL", name: "NIFTY Metal" },
      { symbol: "^CNXREALTY", name: "NIFTY Realty" },
    ];

    const sectorResults = await Promise.all(sectorSymbols.map(async (sec) => {
      try {
        const q = await fetchYahooQuote(sec.symbol);
        if (!q) return null;
        return { name: sec.name, price: q.price, change: q.change, changePct: q.changePct };
      } catch (e) {
        console.error(`Error ${sec.symbol}:`, e);
        return null;
      }
    }));

    const sectorData = sectorResults.filter(Boolean);

    // Build macro from REAL data
    const realUsdInr = usdInrData?.price || 0;
    const realCrude = crudeData?.price || 0;
    const realVix = vixData?.price || 0;
    const realGold = goldData?.price || 0;

    // Use AI only for FII/DII flows and market mood (things we can't get from Yahoo)
    let aiMacro: any = null;
    if (LOVABLE_API_KEY) {
      try {
        const niftyChange = indexData.find(i => i?.name === "NIFTY 50")?.changePct || 0;
        const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash-lite",
            messages: [
              { role: "system", content: "You are an Indian market analyst. Return ONLY valid JSON, no markdown." },
              {
                role: "user",
                content: `Today is ${new Date().toISOString().split("T")[0]}. NIFTY 50 changed ${niftyChange.toFixed(2)}%. USD/INR is at ${realUsdInr.toFixed(2)}. India VIX is ${realVix.toFixed(2)}. Brent crude is $${realCrude.toFixed(2)}.

Based on these REAL numbers, provide ONLY:
{
  "marketMood": "<Bullish | Bearish | Neutral | Cautious>",
  "moodScore": <number -100 to 100>,
  "fiiFlow": "<today's estimated FII flow>",
  "diiFlow": "<today's estimated DII flow>",
  "topMovers": [{"name": "<stock>", "change": <number %>}],
  "keyEvents": ["<event1>", "<event2>", "<event3>"],
  "outlook": "<2 sentence market outlook based on real data>"
}`,
              },
            ],
            temperature: 0.3,
            max_tokens: 600,
          }),
        });

        const aiData = await aiRes.json();
        if (aiData.choices?.[0]?.message?.content) {
          const raw = aiData.choices[0].message.content.trim();
          const jsonStr = raw.replace(/^```json?\n?/, "").replace(/\n?```$/, "");
          aiMacro = JSON.parse(jsonStr);
        }
      } catch (e) {
        console.error("AI macro error:", e);
      }
    }

    // Merge real data with AI insights
    const macro = {
      marketMood: aiMacro?.marketMood || "Neutral",
      moodScore: aiMacro?.moodScore || 0,
      fiiFlow: aiMacro?.fiiFlow || "Data unavailable",
      diiFlow: aiMacro?.diiFlow || "Data unavailable",
      vix: realVix,
      usdInr: realUsdInr,
      crudeBrent: realCrude,
      goldPrice: realGold,
      topMovers: aiMacro?.topMovers || [],
      keyEvents: aiMacro?.keyEvents || [],
      outlook: aiMacro?.outlook || "",
    };

    return new Response(
      JSON.stringify({ indices: indexData, sectors: sectorData, macro, timestamp: Date.now() }),
      { headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0", "Pragma": "no-cache" } }
    );
  } catch (error) {
    console.error("Error in market-data:", error);
    return new Response(
      JSON.stringify({ error: "Failed to fetch market data", details: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
