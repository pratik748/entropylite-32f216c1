import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { requireAuth } from "../_shared/auth.ts";
import { buildTickerCandidates, normalizeTickerInput } from "../_shared/ticker.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
const ALPHA_VANTAGE_KEY = Deno.env.get("ALPHAVANTAGE_API_KEY") || "";

interface Bars { closes: number[]; volumes: number[]; timestamps: number[]; source?: string }

// ── Yahoo (primary) ──────────────────────────────────────────────
async function fetchYahoo(symbol: string, range = "1y", interval = "1d"): Promise<Bars | null> {
  try {
    const t = Date.now();
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${interval}&range=${range}&_t=${t}`;
    const res = await fetch(url, { headers: { "User-Agent": UA, "Cache-Control": "no-cache, no-store" } });
    if (!res.ok) { await res.text(); return null; }
    const data = await res.json();
    const result = data?.chart?.result?.[0];
    if (!result) return null;
    const timestamps = result.timestamp || [];
    const closes = result.indicators?.quote?.[0]?.close || [];
    const volumes = result.indicators?.quote?.[0]?.volume || [];
    const validCloses: number[] = [], validVolumes: number[] = [], validTimestamps: number[] = [];
    for (let i = 0; i < closes.length; i++) {
      if (closes[i] != null && closes[i] > 0) {
        validCloses.push(closes[i]);
        validVolumes.push(volumes[i] || 0);
        validTimestamps.push(timestamps[i] || 0);
      }
    }
    if (validCloses.length < 5) return null;
    return { closes: validCloses, volumes: validVolumes, timestamps: validTimestamps, source: "yahoo" };
  } catch { return null; }
}

// ── Alpha Vantage (fallback) ─────────────────────────────────────
async function fetchAlphaVantage(symbol: string, range = "1y"): Promise<Bars | null> {
  if (!ALPHA_VANTAGE_KEY) return null;
  // Only fallback for US-style tickers (Alpha Vantage is weaker on .NS / .BO)
  const cleanSym = symbol.replace(/\.(NS|BO)$/, "");
  try {
    const outputsize = (range === "5y" || range === "max") ? "full" : "compact"; // compact = 100 days
    const url = `https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=${encodeURIComponent(cleanSym)}&outputsize=${outputsize}&apikey=${ALPHA_VANTAGE_KEY}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const data = await res.json();
    const series = data?.["Time Series (Daily)"];
    if (!series) return null;
    const dates = Object.keys(series).sort(); // ascending
    const closes: number[] = [], volumes: number[] = [], timestamps: number[] = [];
    for (const d of dates) {
      const c = parseFloat(series[d]["4. close"]);
      const v = parseFloat(series[d]["5. volume"]);
      if (!isNaN(c) && c > 0) {
        closes.push(c);
        volumes.push(isNaN(v) ? 0 : v);
        timestamps.push(Math.floor(new Date(d).getTime() / 1000));
      }
    }
    if (closes.length < 5) return null;
    // Trim to requested window
    const wanted = range === "1mo" ? 21 : range === "3mo" ? 63 : range === "6mo" ? 126 : range === "1y" ? 252 : range === "2y" ? 504 : closes.length;
    return {
      closes: closes.slice(-wanted),
      volumes: volumes.slice(-wanted),
      timestamps: timestamps.slice(-wanted),
      source: "alphavantage",
    };
  } catch { return null; }
}

async function fetchHistorical(symbol: string, range = "1y", interval = "1d"): Promise<Bars | null> {
  const yahoo = await fetchYahoo(symbol, range, interval);
  if (yahoo) return yahoo;
  return await fetchAlphaVantage(symbol, range);
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

    const results: Record<string, Bars> = {};

    await Promise.allSettled(
      tickers.map(async (rawTicker: string) => {
        const ticker = normalizeTickerInput(rawTicker);
        if (!ticker) return;
        const symbolsToTry = buildTickerCandidates(ticker);
        for (const sym of symbolsToTry) {
          if (results[rawTicker]) break;
          const result = await fetchHistorical(sym, range || "1y", interval || "1d");
          if (result) results[rawTicker] = result;
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
