import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { requireAuth } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Junk patterns to filter out non-financial noise
const JUNK_PATTERNS = [
  /horoscope/i, /astrology/i, /zodiac/i, /tarot/i,
  /celebrity/i, /bollywood/i, /hollywood/i, /kardashian/i,
  /cricket/i, /football|soccer/i, /sports score/i, /ipl\b/i,
  /recipe/i, /cooking/i, /lifestyle/i, /fashion week/i,
  /wedding/i, /divorce/i, /dating/i,
  /women.?day/i, /entrepreneur.*women/i, /women.*entrepreneur/i,
  /lineman diwas/i, /felicitate/i, /awareness programme/i,
  /MSME awareness/i, /congratulat/i, /startup scene/i,
];

// High-value financial keywords for relevance scoring
const FINANCE_KEYWORDS = [
  /\b(stock|equit|share|market|index|indices)\b/i,
  /\b(inflation|cpi|gdp|employment|payroll|jobs report)\b/i,
  /\b(fed|federal reserve|ecb|rbi|boj|central bank|rate cut|rate hike|monetary policy)\b/i,
  /\b(earning|revenue|profit|eps|guidance|forecast|outlook)\b/i,
  /\b(oil|crude|brent|gold|silver|copper|commodity)\b/i,
  /\b(bond|yield|treasury|fixed income)\b/i,
  /\b(crypto|bitcoin|btc|ethereum|eth)\b/i,
  /\b(ipo|merger|acquisition|m&a|buyback|dividend)\b/i,
  /\b(tariff|sanction|trade war|geopolitic|conflict)\b/i,
  /\b(recession|slowdown|crash|correction|bear market|bull market|rally)\b/i,
  /\b(s&p|nasdaq|dow|nifty|sensex|ftse|dax|nikkei|hang seng)\b/i,
  /\b(hedge fund|institutional|wall street|goldman|jpmorgan|morgan stanley)\b/i,
  /\b(forex|currency|dollar|euro|yen|rupee)\b/i,
  /\b(volatility|vix|risk|liquidity)\b/i,
];

function isJunk(title: string, desc: string): boolean {
  const text = `${title} ${desc}`;
  return JUNK_PATTERNS.some(p => p.test(text));
}

function relevanceScore(title: string, desc: string): number {
  const text = `${title} ${desc}`;
  return FINANCE_KEYWORDS.reduce((score, kw) => score + (kw.test(text) ? 1 : 0), 0);
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { ticker, category } = await req.json();
    const NEWSDATA_API_KEY = Deno.env.get("NEWSDATA_API_KEY");

    if (!NEWSDATA_API_KEY) {
      return new Response(
        JSON.stringify({ error: "News API key not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build high-authority financial query
    const cleanTicker = (ticker || "").replace(/\.(NS|BO|BSE)$/i, "").trim();
    
    // If we have a ticker, search for it specifically; otherwise use broad financial keywords
    const query = cleanTicker
      ? `${cleanTicker} stock market`
      : "stock market OR earnings OR inflation";

    // Fetch from global sources, not just India
    const url = `https://newsdata.io/api/1/latest?apikey=${NEWSDATA_API_KEY}&q=${encodeURIComponent(query)}&language=en&category=business`;

    console.log("Fetching news for:", query);

    const res = await fetch(url);
    const data = await res.json();

    if (data.status !== "success") {
      console.error("Newsdata.io error:", data);
      return new Response(
        JSON.stringify({ error: "Failed to fetch news", details: data.results?.message || "Unknown error" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Filter and rank articles
    const filtered = (data.results || [])
      .map((a: any) => ({
        title: a.title || "",
        description: a.description || "",
        link: a.link,
        source: a.source_name || a.source_id,
        pubDate: a.pubDate,
        imageUrl: a.image_url,
        category: a.category?.[0] || "business",
        sentiment: a.sentiment || null,
      }))
      .filter((a: any) => !isJunk(a.title, a.description))
      .map((a: any) => ({ ...a, _score: relevanceScore(a.title, a.description) }))
      .sort((a: any, b: any) => b._score - a._score)
      .slice(0, 15)
      .map(({ _score, ...a }: any) => a);

    return new Response(
      JSON.stringify({ articles: filtered, totalResults: filtered.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in fetch-news:", error);
    return new Response(
      JSON.stringify({ error: "Failed to fetch news", details: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
