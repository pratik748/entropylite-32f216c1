import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { requireAuth } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ── Source tiers (institutional ranking) ──
const TIER_1 = ["reuters", "associated press", "ap news", "bloomberg"];
const TIER_2 = ["cnbc", "wall street journal", "wsj", "financial times", "ft", "new york times", "nyt", "economist", "bbc"];
const TIER_3 = ["marketwatch", "seeking alpha", "investopedia", "yahoo finance", "barrons", "cnn"];

function getSourceTier(source: string): number {
  const s = source.toLowerCase();
  for (const t of TIER_1) if (s.includes(t)) return 1;
  for (const t of TIER_2) if (s.includes(t)) return 2;
  for (const t of TIER_3) if (s.includes(t)) return 3;
  return 4;
}

// ── RSS feed definitions ──
interface RSSSource {
  url: string;
  name: string;
  tier: number;
}

const RSS_SOURCES: RSSSource[] = [
  { url: "https://www.reutersagency.com/feed/?best-topics=business-finance&post_type=best", name: "Reuters", tier: 1 },
  { url: "https://rss.nytimes.com/services/xml/rss/nyt/Business.xml", name: "New York Times", tier: 2 },
  { url: "https://feeds.bbci.co.uk/news/business/rss.xml", name: "BBC Business", tier: 2 },
  { url: "https://search.cnbc.com/rs/search/combinedcms/view.xml?partnerId=wrss01&id=100003114", name: "CNBC", tier: 2 },
  { url: "https://rss.cnn.com/rss/money_latest.rss", name: "CNN Business", tier: 3 },
  { url: "https://feeds.marketwatch.com/marketwatch/topstories/", name: "MarketWatch", tier: 3 },
];

// ── Junk patterns ──
const JUNK_PATTERNS = [
  /horoscope/i, /astrology/i, /zodiac/i, /tarot/i,
  /celebrity/i, /bollywood/i, /hollywood/i, /kardashian/i,
  /cricket/i, /football|soccer/i, /sports score/i, /ipl\b/i,
  /recipe/i, /cooking/i, /lifestyle/i, /fashion week/i,
  /wedding/i, /divorce/i, /dating/i,
  /women.?day/i, /lineman diwas/i, /felicitate/i, /awareness programme/i,
  /MSME awareness/i, /congratulat/i,
];

// ── Financial relevance keywords ──
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

function relevanceScore(title: string, desc: string, tier: number): number {
  const text = `${title} ${desc}`;
  const kwScore = FINANCE_KEYWORDS.reduce((s, kw) => s + (kw.test(text) ? 1 : 0), 0);
  // Boost higher-tier sources
  const tierBoost = tier === 1 ? 5 : tier === 2 ? 3 : tier === 3 ? 1 : 0;
  return kwScore + tierBoost;
}

// ── Lightweight RSS XML parser (no deps) ──
function parseRSSXml(xml: string, sourceName: string, tier: number): Article[] {
  const articles: Article[] = [];
  // Match <item>...</item> blocks
  const itemRegex = /<item[\s>]([\s\S]*?)<\/item>/gi;
  let match;
  while ((match = itemRegex.exec(xml)) !== null) {
    const block = match[1];
    const title = extractTag(block, "title");
    const link = extractTag(block, "link") || extractGuid(block);
    const description = stripHtml(extractTag(block, "description") || "");
    const pubDate = extractTag(block, "pubDate") || extractTag(block, "dc:date") || "";

    if (title && link) {
      articles.push({
        title: stripCdata(title).trim(),
        description: description.slice(0, 300) || null,
        link: link.trim(),
        source: sourceName,
        pubDate,
        imageUrl: extractImageFromEnclosure(block),
        category: "business",
        sentiment: null,
        sourceTier: tier,
        origin: "rss",
      });
    }
  }
  return articles;
}

function extractTag(block: string, tag: string): string | null {
  const regex = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i");
  const m = block.match(regex);
  return m ? stripCdata(m[1]) : null;
}

function extractGuid(block: string): string | null {
  const m = block.match(/<guid[^>]*>([\s\S]*?)<\/guid>/i);
  return m ? stripCdata(m[1]) : null;
}

function extractImageFromEnclosure(block: string): string | null {
  const m = block.match(/<enclosure[^>]*url=["']([^"']+)["'][^>]*>/i);
  if (m) return m[1];
  const media = block.match(/<media:content[^>]*url=["']([^"']+)["'][^>]*>/i);
  return media ? media[1] : null;
}

function stripCdata(s: string): string {
  return s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
}

function stripHtml(s: string): string {
  return s.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'").trim();
}

// ── Standardized article type ──
interface Article {
  title: string;
  description: string | null;
  link: string;
  source: string;
  pubDate: string;
  imageUrl: string | null;
  category: string;
  sentiment: string | null;
  sourceTier: number;
  origin: string;
}

// ── Fetch all RSS feeds in parallel ──
async function fetchAllRSS(): Promise<{ articles: Article[]; successCount: number }> {
  const results = await Promise.allSettled(
    RSS_SOURCES.map(async (src) => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 8000);
      try {
        const res = await fetch(src.url, {
          signal: controller.signal,
          headers: { "User-Agent": "EntropyNewsBot/1.0" },
        });
        clearTimeout(timeout);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const xml = await res.text();
        return parseRSSXml(xml, src.name, src.tier);
      } catch (e) {
        clearTimeout(timeout);
        console.warn(`RSS fetch failed for ${src.name}:`, e.message);
        return [] as Article[];
      }
    })
  );

  let successCount = 0;
  const articles: Article[] = [];
  for (const r of results) {
    if (r.status === "fulfilled" && r.value.length > 0) {
      successCount++;
      articles.push(...r.value);
    }
  }
  return { articles, successCount };
}

// ── GDELT API ──
async function fetchGDELT(query: string): Promise<Article[]> {
  try {
    const q = encodeURIComponent(query || "market OR economy OR stocks");
    const url = `https://api.gdeltproject.org/api/v2/doc/doc?query=${q} sourcelang:eng&mode=artlist&maxrecords=20&format=json`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timeout);
    if (!res.ok) return [];
    const data = await res.json();
    return (data.articles || []).map((a: any) => ({
      title: a.title || "",
      description: "",
      link: a.url || "",
      source: a.domain || "GDELT",
      pubDate: a.seendate || "",
      imageUrl: a.socialimage || null,
      category: "business",
      sentiment: null,
      sourceTier: getSourceTier(a.domain || ""),
      origin: "gdelt",
    }));
  } catch (e) {
    console.warn("GDELT fetch failed:", e.message);
    return [];
  }
}

// ── Newsdata.io (existing) ──
async function fetchNewsdata(query: string): Promise<Article[]> {
  const NEWSDATA_API_KEY = Deno.env.get("NEWSDATA_API_KEY");
  if (!NEWSDATA_API_KEY) return [];
  try {
    const url = `https://newsdata.io/api/1/latest?apikey=${NEWSDATA_API_KEY}&q=${encodeURIComponent(query)}&language=en&category=business`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.status !== "success") return [];
    return (data.results || []).map((a: any) => ({
      title: a.title || "",
      description: a.description || null,
      link: a.link || "",
      source: a.source_name || a.source_id || "Newsdata",
      pubDate: a.pubDate || "",
      imageUrl: a.image_url || null,
      category: a.category?.[0] || "business",
      sentiment: a.sentiment || null,
      sourceTier: getSourceTier(a.source_name || a.source_id || ""),
      origin: "newsdata",
    }));
  } catch (e) {
    console.warn("Newsdata fetch failed:", e.message);
    return [];
  }
}

// ── Deduplication by normalized title similarity ──
function normalize(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9 ]/g, "").replace(/\s+/g, " ").trim();
}

function isDuplicate(a: string, existing: string[]): boolean {
  const na = normalize(a);
  if (na.length < 15) return false;
  for (const e of existing) {
    // Check if titles share 80%+ of words
    const wordsA = new Set(na.split(" "));
    const wordsB = new Set(e.split(" "));
    const intersection = [...wordsA].filter(w => wordsB.has(w)).length;
    const union = new Set([...wordsA, ...wordsB]).size;
    if (union > 0 && intersection / union > 0.6) return true;
  }
  return false;
}

function deduplicateArticles(articles: Article[]): Article[] {
  const seen: string[] = [];
  const result: Article[] = [];
  for (const a of articles) {
    if (!isDuplicate(a.title, seen)) {
      seen.push(normalize(a.title));
      result.push(a);
    }
  }
  return result;
}

// ── Main handler ──
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    await requireAuth(req, corsHeaders);
    const { ticker } = await req.json();
    const cleanTicker = (ticker || "").replace(/\.(NS|BO|BSE)$/i, "").trim();
    const query = cleanTicker ? `${cleanTicker} stock market` : "stock market OR earnings OR inflation";

    console.log("Multi-source news fetch for:", query);

    // Fetch all sources in parallel
    const [rssResult, gdeltArticles, newsdataArticles] = await Promise.all([
      fetchAllRSS(),
      fetchGDELT(query),
      fetchNewsdata(query),
    ]);

    const rssFeeds = rssResult.successCount;

    // Merge all sources
    const allArticles = [
      ...rssResult.articles,
      ...gdeltArticles,
      ...newsdataArticles,
    ];

    // Filter junk, deduplicate, score, rank
    const filtered = allArticles
      .filter(a => a.title && !isJunk(a.title, a.description || ""))
      .sort((a, b) => relevanceScore(b.title, b.description || "", b.sourceTier) - relevanceScore(a.title, a.description || "", a.sourceTier));

    const deduplicated = deduplicateArticles(filtered);
    const top = deduplicated.slice(0, 25);

    const sourcesPolled = rssFeeds + (gdeltArticles.length > 0 ? 1 : 0) + (newsdataArticles.length > 0 ? 1 : 0);

    return new Response(
      JSON.stringify({
        articles: top,
        totalResults: top.length,
        sourcesPolled,
        breakdown: {
          rss: rssResult.articles.length,
          gdelt: gdeltArticles.length,
          newsdata: newsdataArticles.length,
        },
      }),
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
