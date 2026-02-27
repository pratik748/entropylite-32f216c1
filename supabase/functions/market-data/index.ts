import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    // Fetch major Indian indices from Yahoo Finance
    const indices = [
      { symbol: "^NSEI", name: "NIFTY 50" },
      { symbol: "^BSESN", name: "SENSEX" },
      { symbol: "^NSEBANK", name: "BANK NIFTY" },
    ];

    const indexData = [];
    for (const idx of indices) {
      try {
        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(idx.symbol)}?interval=1d&range=5d`;
        const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
        const data = await res.json();
        const meta = data?.chart?.result?.[0]?.meta;
        const closes = data?.chart?.result?.[0]?.indicators?.quote?.[0]?.close || [];
        const prevClose = meta?.chartPreviousClose || meta?.previousClose || 0;
        const currentPrice = meta?.regularMarketPrice || 0;
        const change = currentPrice - prevClose;
        const changePct = prevClose > 0 ? (change / prevClose) * 100 : 0;

        indexData.push({
          symbol: idx.symbol,
          name: idx.name,
          price: currentPrice,
          change,
          changePct,
          prevClose,
        });
      } catch (e) {
        console.error(`Error fetching ${idx.symbol}:`, e);
      }
    }

    // Fetch sector indices
    const sectors = [
      { symbol: "^CNXIT", name: "NIFTY IT" },
      { symbol: "^CNXPHARMA", name: "NIFTY Pharma" },
      { symbol: "^CNXFMCG", name: "NIFTY FMCG" },
      { symbol: "^CNXAUTO", name: "NIFTY Auto" },
      { symbol: "^CNXMETAL", name: "NIFTY Metal" },
      { symbol: "^CNXREALTY", name: "NIFTY Realty" },
    ];

    const sectorData = [];
    for (const sec of sectors) {
      try {
        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sec.symbol)}?interval=1d&range=1d`;
        const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
        const data = await res.json();
        const meta = data?.chart?.result?.[0]?.meta;
        const prevClose = meta?.chartPreviousClose || meta?.previousClose || 0;
        const currentPrice = meta?.regularMarketPrice || 0;
        const change = currentPrice - prevClose;
        const changePct = prevClose > 0 ? (change / prevClose) * 100 : 0;

        sectorData.push({
          name: sec.name,
          price: currentPrice,
          change,
          changePct,
        });
      } catch (e) {
        console.error(`Error fetching ${sec.symbol}:`, e);
      }
    }

    // Use AI for macro summary
    let macroSummary = null;
    if (LOVABLE_API_KEY) {
      try {
        const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${LOVABLE_API_KEY}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash-lite",
            messages: [
              { role: "system", content: "You are an Indian market analyst. Return only valid JSON." },
              {
                role: "user",
                content: `Today is ${new Date().toISOString().split("T")[0]}. Provide a brief Indian market overview as JSON:
{
  "marketMood": "<Bullish | Bearish | Neutral | Cautious>",
  "moodScore": <number -100 to 100>,
  "fiiFlow": "<string e.g. 'Net buyers ₹2,300 Cr'>",
  "diiFlow": "<string e.g. 'Net buyers ₹1,800 Cr'>",
  "vix": <number>,
  "usdInr": <number>,
  "crudeBrent": <number>,
  "topMovers": [{"name": "<stock>", "change": <number %>}],
  "keyEvents": ["<event1>", "<event2>", "<event3>"],
  "outlook": "<2 sentence market outlook>"
}`,
              },
            ],
            temperature: 0.5,
            max_tokens: 800,
          }),
        });

        const aiData = await aiRes.json();
        if (aiData.choices?.[0]?.message?.content) {
          const raw = aiData.choices[0].message.content.trim();
          const jsonStr = raw.replace(/^```json?\n?/, "").replace(/\n?```$/, "");
          macroSummary = JSON.parse(jsonStr);
        }
      } catch (e) {
        console.error("AI macro error:", e);
      }
    }

    return new Response(
      JSON.stringify({ indices: indexData, sectors: sectorData, macro: macroSummary }),
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
