import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { requireAuth } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const pairs = [
  "USDINR=X", "EURUSD=X", "GBPUSD=X", "USDJPY=X", "USDCNY=X",
  "USDKRW=X", "USDBRL=X", "USDRUB=X", "USDTRY=X", "USDCHF=X",
  "AUDUSD=X", "CADUSD=X", "USDSGD=X", "USDHKD=X", "USDSEK=X",
  "USDNOK=X", "USDDKK=X", "NZDUSD=X", "USDZAR=X", "USDMXN=X",
  "USDPLN=X", "USDTHB=X",
];

async function fetchRate(symbol: string) {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d&_t=${Date.now()}`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0", "Cache-Control": "no-cache" },
    });
    const data = await res.json();
    const price = data?.chart?.result?.[0]?.meta?.regularMarketPrice;
    return price && price > 0 ? price : null;
  } catch { return null; }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    await requireAuth(req, corsHeaders);
    const results = await Promise.all(
      pairs.map(async (symbol) => {
        const rate = await fetchRate(symbol);
        return { symbol, rate };
      })
    );

    // Build rates map: all rates relative to USD
    const rates: Record<string, number> = { USD: 1 };
    
    for (const { symbol, rate } of results) {
      if (!rate) continue;
      // USDINR=X means 1 USD = X INR, so INR rate = 1/X (value of 1 INR in USD)
      // EURUSD=X means 1 EUR = X USD, so EUR rate = X (value of 1 EUR in USD)
      if (symbol.startsWith("USD")) {
        const currency = symbol.replace("USD", "").replace("=X", "");
        rates[currency] = 1 / rate; // 1 unit of currency = this many USD
      } else if (symbol.endsWith("USD=X")) {
        const currency = symbol.replace("USD=X", "");
        rates[currency] = rate; // 1 unit of currency = this many USD
      }
    }

    return new Response(JSON.stringify({
      rates, // Each value = how many USD per 1 unit of that currency
      timestamp: Date.now(),
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "max-age=60" },
    });
  } catch (error) {
    console.error("FX rates error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
