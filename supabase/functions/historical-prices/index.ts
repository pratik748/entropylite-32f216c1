import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { requireAuth } from "../_shared/auth.ts";
import { buildTickerCandidates, normalizeTickerInput } from "../_shared/ticker.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

async function fetchHistorical(symbol: string, range = "3mo", interval = "1d"): Promise<{ closes: number[]; volumes: number[]; timestamps: number[] } | null> {
  try {
    const t = Date.now();
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${interval}&range=${range}&_t=${t}`;
    const res = await fetch(url, {
      headers: { "User-Agent": UA, "Cache-Control": "no-cache, no-store" },
    });
    if (!res.ok) { await res.text(); return null; }
    const data = await res.json();
    const result = data?.chart?.result?.[0];
    if (!result) return null;

    const timestamps = result.timestamp || [];
    const closes = result.indicators?.quote?.[0]?.close || [];
    const volumes = result.indicators?.quote?.[0]?.volume || [];

    // Filter out nulls
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

    if (validCloses.length < 5) return null;
    return { closes: validCloses, volumes: validVolumes, timestamps: validTimestamps };
  } catch {
    return null;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    await requireAuth(req, corsHeaders);
    const { tickers, range, interval } = await req.json();

    if (!tickers || !Array.isArray(tickers) || tickers.length === 0) {
      return new Response(JSON.stringify({ error: "tickers array required" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const results: Record<string, { closes: number[]; volumes: number[]; timestamps: number[] }> = {};

    await Promise.allSettled(
      tickers.map(async (rawTicker: string) => {
        const ticker = normalizeTickerInput(rawTicker);
        if (!ticker) return;

        const symbolsToTry = buildTickerCandidates(ticker);
        for (const sym of symbolsToTry) {
          if (results[rawTicker]) break;
          const result = await fetchHistorical(sym, range || "3mo", interval || "1d");
          if (result) {
            results[rawTicker] = result;
          }
        }
      })
    );

    return new Response(JSON.stringify({ data: results, timestamp: Date.now() }), {
      headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("historical-prices error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
