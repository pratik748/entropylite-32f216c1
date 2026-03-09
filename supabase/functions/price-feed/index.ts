import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { requireAuth } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

/** Primary: Yahoo v8 chart endpoint */
async function fetchYahooV8(symbol: string): Promise<{ price: number; currency: string } | null> {
  try {
    const t = Date.now();
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d&_t=${t}`;
    const res = await fetch(url, {
      headers: { "User-Agent": UA, "Cache-Control": "no-cache, no-store" },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const meta = data?.chart?.result?.[0]?.meta;
    if (meta?.regularMarketPrice && meta.regularMarketPrice > 0) {
      return { price: meta.regularMarketPrice, currency: meta.currency || "USD" };
    }
    return null;
  } catch {
    return null;
  }
}

/** Secondary: Yahoo v6 quote endpoint */
async function fetchYahooV6(symbol: string): Promise<{ price: number; currency: string } | null> {
  try {
    const url = `https://query2.finance.yahoo.com/v6/finance/quote?symbols=${encodeURIComponent(symbol)}`;
    const res = await fetch(url, {
      headers: { "User-Agent": UA, "Cache-Control": "no-cache, no-store" },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const quote = data?.quoteResponse?.result?.[0];
    if (quote?.regularMarketPrice && quote.regularMarketPrice > 0) {
      return { price: quote.regularMarketPrice, currency: quote.currency || "USD" };
    }
    return null;
  } catch {
    return null;
  }
}

/** Tertiary: Yahoo v10 quoteSummary endpoint */
async function fetchYahooV10(symbol: string): Promise<{ price: number; currency: string } | null> {
  try {
    const url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=price`;
    const res = await fetch(url, {
      headers: { "User-Agent": UA, "Cache-Control": "no-cache, no-store" },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const priceModule = data?.quoteSummary?.result?.[0]?.price;
    const price = priceModule?.regularMarketPrice?.raw;
    if (price && price > 0) {
      return { price, currency: priceModule?.currency || "USD" };
    }
    return null;
  } catch {
    return null;
  }
}

/** Combined fetch with triple fallback */
async function fetchPrice(symbol: string): Promise<{ price: number; currency: string } | null> {
  // Try v8 first (fastest)
  const v8 = await fetchYahooV8(symbol);
  if (v8) return v8;
  
  // Fallback to v6
  const v6 = await fetchYahooV6(symbol);
  if (v6) return v6;
  
  // Fallback to v10
  const v10 = await fetchYahooV10(symbol);
  if (v10) return v10;
  
  return null;
}

/** Sanity check for known assets — reject obviously wrong prices */
function sanityCheck(ticker: string, price: number): boolean {
  const checks: Record<string, { min: number; max: number }> = {
    "BTC-USD": { min: 10000, max: 500000 },
    "ETH-USD": { min: 500, max: 50000 },
    "GC=F": { min: 1000, max: 10000 },    // Gold
    "SI=F": { min: 10, max: 200 },          // Silver
    "BZ=F": { min: 20, max: 300 },          // Brent Crude
    "CL=F": { min: 20, max: 300 },          // WTI Crude
  };
  const check = checks[ticker];
  if (!check) return true; // no check available, accept
  return price >= check.min && price <= check.max;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    await requireAuth(req, corsHeaders);
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
          if (results[ticker]) break;
          const result = await fetchPrice(sym);
          if (result && sanityCheck(ticker, result.price)) {
            results[ticker] = result;
          } else if (result) {
            console.warn(`Sanity check failed for ${ticker}: got $${result.price}, rejecting`);
          }
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
