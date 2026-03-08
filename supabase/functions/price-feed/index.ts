import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { requireAuth } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { tickers } = await req.json();
    if (!tickers || !Array.isArray(tickers) || tickers.length === 0) {
      return new Response(JSON.stringify({ error: "tickers array required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const t = Date.now();
    const results: Record<string, { price: number; currency: string }> = {};

    await Promise.allSettled(
      tickers.map(async (rawTicker: string) => {
        const ticker = rawTicker.trim();
        if (!ticker) return;

        // Try the ticker as-is first, then .NS and .BO for plain alpha tickers
        const hasSpecialChars = /[.\-=^]/.test(ticker);
        const symbolsToTry = hasSpecialChars ? [ticker] : [ticker, `${ticker}.NS`, `${ticker}.BO`];

        for (const sym of symbolsToTry) {
          if (results[ticker]) break; // already found
          try {
            const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?interval=1d&range=1d&_t=${t}`;
            const res = await fetch(url, {
              headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36", "Cache-Control": "no-cache, no-store" },
            });
            const data = await res.json();
            const meta = data?.chart?.result?.[0]?.meta;
            if (meta?.regularMarketPrice && meta.regularMarketPrice > 0) {
              results[ticker] = { price: meta.regularMarketPrice, currency: meta.currency || "USD" };
            }
          } catch (e) { console.error(`Price error ${sym}:`, e); }
        }
      })
    );

    return new Response(JSON.stringify({ prices: results, timestamp: t }), {
      headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("Price feed error:", error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});