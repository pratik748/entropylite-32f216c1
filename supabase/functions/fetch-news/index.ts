import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Junk content filters
const JUNK_PATTERNS = [
  /horoscope/i, /rashifal/i, /zodiac/i, /astrology/i, /astrological/i,
  /daily horoscope/i, /weekly horoscope/i, /monthly horoscope/i,
  /pisces|aries|taurus|gemini|cancer|leo|virgo|libra|scorpio|sagittarius|capricorn|aquarius/i,
  /cricket|ipl|match.*score|bollywood|celebrity|gossip|entertainment/i,
  /recipe|cooking|lifestyle|fashion|beauty|skincare/i,
  /tarot|numerology|vastu|feng.?shui/i,
];

function isJunk(title: string, description: string | null): boolean {
  const text = `${title} ${description || ""}`;
  return JUNK_PATTERNS.some(p => p.test(text));
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

    // Build query - strip .NS/.BO suffix for search
    const cleanTicker = (ticker || "").replace(/\.(NS|BO|BSE)$/i, "");
    
    // Use financial-specific queries when no ticker
    const query = cleanTicker || "stock market OR economy OR inflation OR central bank OR earnings OR trade OR oil OR GDP";

    const url = `https://newsdata.io/api/1/latest?apikey=${NEWSDATA_API_KEY}&q=${encodeURIComponent(query)}&language=en&category=business`;

    console.log("Fetching financial news for:", query);

    const res = await fetch(url);
    const data = await res.json();

    if (data.status !== "success") {
      console.error("Newsdata.io error:", data);
      return new Response(
        JSON.stringify({ error: "Failed to fetch news", details: data.results?.message || "Unknown error" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Filter out junk content and keep only financial intelligence
    const articles = (data.results || [])
      .filter((a: any) => !isJunk(a.title || "", a.description))
      .slice(0, 12)
      .map((a: any) => ({
        title: a.title,
        description: a.description,
        link: a.link,
        source: a.source_name || a.source_id,
        pubDate: a.pubDate,
        imageUrl: a.image_url,
        category: a.category?.[0] || "business",
        sentiment: a.sentiment || null,
      }));

    return new Response(
      JSON.stringify({ articles, totalResults: data.totalResults }),
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
