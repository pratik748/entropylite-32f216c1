import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { requireAuth } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

interface SymbolHit {
  ticker: string;
  name: string;
  exchange: string;
  kind: "equity" | "etf" | "index" | "crypto" | "fx" | "commodity";
}

function mapQuoteType(q: string | undefined): SymbolHit["kind"] {
  switch ((q || "").toUpperCase()) {
    case "ETF": return "etf";
    case "INDEX": return "index";
    case "CRYPTOCURRENCY": return "crypto";
    case "CURRENCY": return "fx";
    case "FUTURE": return "commodity";
    default: return "equity";
  }
}

async function yahooSearch(q: string, limit: number): Promise<SymbolHit[]> {
  try {
    const url = `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(q)}&quotesCount=${limit}&newsCount=0&listsCount=0&enableFuzzyQuery=true`;
    const res = await fetch(url, { headers: { "User-Agent": UA, "Accept": "application/json" } });
    if (!res.ok) return [];
    const data = await res.json();
    const quotes: any[] = data?.quotes || [];
    const out: SymbolHit[] = [];
    for (const item of quotes) {
      const sym = item?.symbol;
      if (!sym || typeof sym !== "string") continue;
      out.push({
        ticker: sym,
        name: item.shortname || item.longname || item.name || sym,
        exchange: item.exchDisp || item.exchange || "",
        kind: mapQuoteType(item.quoteType),
      });
    }
    return out;
  } catch {
    return [];
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    await requireAuth(req, corsHeaders);
    const { query, limit } = await req.json().catch(() => ({}));
    const q = (query || "").toString().trim();
    if (q.length < 1) {
      return new Response(JSON.stringify({ results: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const lim = Math.min(Math.max(Number(limit) || 10, 1), 20);
    const results = await yahooSearch(q, lim);
    return new Response(JSON.stringify({ results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "public, max-age=60" },
    });
  } catch (e: any) {
    if (e instanceof Response) return e;
    return new Response(JSON.stringify({ error: e?.message || "symbol-search failed", results: [] }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
