import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { requireAuth } from "../_shared/auth.ts";
import { buildTickerCandidates, isIndianTicker, normalizeTickerInput } from "../_shared/ticker.ts";

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

// Yahoo v6 quote and v10 quoteSummary endpoints retired: both now require
// cookie+crumb authentication and fail for bare server fetches.

/** Combined fetch. Yahoo v8 chart is the live contract; the retired v6/v10
 * quote endpoints (401/403 without cookie+crumb auth) were removed. */
async function fetchPrice(symbol: string): Promise<{ price: number; currency: string } | null> {
  const v8 = await fetchYahooV8(symbol);
  if (v8) return v8;

  return null;
}

/** Sanity check for known assets, reject obviously wrong prices */
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
        const requestKey = rawTicker.trim().toUpperCase();
        const ticker = normalizeTickerInput(rawTicker);
        if (!ticker) return;

        const symbolsToTry = buildTickerCandidates(ticker);
        const sanityKey = ticker.replace(/\.(NS|BO)$/, "");

        for (const sym of symbolsToTry) {
          if (results[requestKey] || results[ticker]) break;
          const result = await fetchPrice(sym);
          if (result && sanityCheck(sanityKey, result.price)) {
            const normalizedResult = {
              price: result.price,
              currency: isIndianTicker(sym) ? "INR" : (result.currency || "USD"),
            };
            results[requestKey] = normalizedResult;
            results[ticker] = normalizedResult;
          } else if (result) {
            console.warn(`Sanity check failed for ${ticker}: got ${result.currency || "USD"} ${result.price}, rejecting`);
          }
        }
      })
    );

    return new Response(JSON.stringify({ prices: results, timestamp: t }), {
      headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  } catch (error) {
    // requireAuth throws a Response (401), pass it through unchanged.
    if (error instanceof Response) return error;
    console.error("Price feed error:", error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
