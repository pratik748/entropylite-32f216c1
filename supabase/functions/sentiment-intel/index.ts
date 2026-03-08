import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { requireAuth } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// Source tier classification
const TIER_1 = ["reuters", "associated press", "ap", "bloomberg"];
const TIER_2 = ["cnbc", "wall street journal", "wsj", "financial times", "ft", "economist"];
const TIER_3 = ["marketwatch", "seeking alpha", "investopedia", "yahoo finance", "barrons"];

function classifySource(source: string): { tier: number; name: string } {
  const s = source.toLowerCase();
  for (const t1 of TIER_1) if (s.includes(t1)) return { tier: 1, name: source };
  for (const t2 of TIER_2) if (s.includes(t2)) return { tier: 2, name: source };
  for (const t3 of TIER_3) if (s.includes(t3)) return { tier: 3, name: source };
  return { tier: 4, name: source };
}

function sentimentToNumber(s: string | null): number {
  if (!s) return 0;
  const l = s.toLowerCase();
  if (l.includes("pos")) return 1;
  if (l.includes("neg")) return -1;
  return 0;
}

// --- CNN Fear & Greed ---
async function fetchCNNFearGreed() {
  try {
    const res = await fetch("https://production.dataviz.cnn.io/index/fearandgreed/graphdata", {
      headers: { "User-Agent": "Mozilla/5.0 (compatible; EntropyLite/1.0)" },
    });
    if (!res.ok) {
      console.warn("CNN F&G returned", res.status);
      return null;
    }
    const data = await res.json();
    const current = data.fear_and_greed;
    const history = (data.fear_and_greed_historical?.data || [])
      .slice(-30)
      .map((d: any) => ({ date: d.x, score: d.y }));

    const score = Math.round(current?.score ?? 50);
    let label = "Neutral";
    if (score <= 25) label = "Extreme Fear";
    else if (score <= 45) label = "Fear";
    else if (score <= 55) label = "Neutral";
    else if (score <= 75) label = "Greed";
    else label = "Extreme Greed";

    return {
      score,
      label,
      previousClose: Math.round(current?.previous_close ?? score),
      weekAgo: Math.round(current?.previous_1_week ?? score),
      monthAgo: Math.round(current?.previous_1_month ?? score),
      history,
    };
  } catch (err) {
    console.error("CNN F&G fetch error:", err);
    return null;
  }
}

// --- GDELT Global Tone ---
async function fetchGDELTTone(ticker?: string) {
  try {
    const query = ticker ? `${ticker} stock market` : "global economy stock market";
    const url = `https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(query)}&mode=ArtList&maxrecords=50&format=json&sort=DateDesc`;
    const res = await fetch(url);
    if (!res.ok) {
      console.warn("GDELT returned", res.status);
      return null;
    }
    const data = await res.json();
    const articles = data.articles || [];
    if (articles.length === 0) return { avgTone: 0, articleCount: 0, trendDirection: "stable", articles: [] };

    // GDELT provides tone in article metadata
    let totalTone = 0;
    let toneCount = 0;
    const toneByDate: Record<string, { sum: number; count: number }> = {};

    const processed = articles.slice(0, 30).map((a: any) => {
      const tone = a.tone ? parseFloat(String(a.tone).split(",")[0]) : 0;
      if (!isNaN(tone)) {
        totalTone += tone;
        toneCount++;
        const dateKey = (a.seendate || "").substring(0, 8);
        if (dateKey) {
          if (!toneByDate[dateKey]) toneByDate[dateKey] = { sum: 0, count: 0 };
          toneByDate[dateKey].sum += tone;
          toneByDate[dateKey].count++;
        }
      }
      return {
        title: a.title || "",
        url: a.url || "",
        source: a.domain || a.sourcecountry || "Unknown",
        tone: tone,
        date: a.seendate || "",
      };
    });

    const avgTone = toneCount > 0 ? Math.round((totalTone / toneCount) * 100) / 100 : 0;

    // Calculate trend from date buckets
    const dates = Object.keys(toneByDate).sort();
    let trendDirection: "improving" | "deteriorating" | "stable" = "stable";
    if (dates.length >= 2) {
      const recent = toneByDate[dates[dates.length - 1]];
      const older = toneByDate[dates[0]];
      const recentAvg = recent.sum / recent.count;
      const olderAvg = older.sum / older.count;
      if (recentAvg - olderAvg > 0.5) trendDirection = "improving";
      else if (olderAvg - recentAvg > 0.5) trendDirection = "deteriorating";
    }

    const toneTrend = dates.map(d => ({
      date: d,
      tone: Math.round((toneByDate[d].sum / toneByDate[d].count) * 100) / 100,
    }));

    return { avgTone, articleCount: articles.length, trendDirection, toneTrend, articles: processed };
  } catch (err) {
    console.error("GDELT fetch error:", err);
    return null;
  }
}

// --- Newsdata.io Source Breakdown ---
async function fetchSourceBreakdown(ticker?: string) {
  const key = Deno.env.get("NEWSDATA_API_KEY");
  if (!key) return [];

  try {
    const query = ticker ? `${ticker} stock` : "stock market OR earnings OR economy";
    const url = `https://newsdata.io/api/1/latest?apikey=${key}&q=${encodeURIComponent(query)}&language=en&category=business`;
    const res = await fetch(url);
    const data = await res.json();
    if (data.status !== "success") return [];

    const sourceMap: Record<string, { positive: number; negative: number; neutral: number; count: number; tier: number }> = {};

    for (const article of (data.results || [])) {
      const sourceName = article.source_name || article.source_id || "Unknown";
      const { tier } = classifySource(sourceName);
      const sentVal = sentimentToNumber(article.sentiment);

      if (!sourceMap[sourceName]) {
        sourceMap[sourceName] = { positive: 0, negative: 0, neutral: 0, count: 0, tier };
      }
      sourceMap[sourceName].count++;
      if (sentVal > 0) sourceMap[sourceName].positive++;
      else if (sentVal < 0) sourceMap[sourceName].negative++;
      else sourceMap[sourceName].neutral++;
    }

    return Object.entries(sourceMap)
      .map(([source, data]) => ({
        source,
        tier: data.tier,
        positive: data.positive,
        negative: data.negative,
        neutral: data.neutral,
        count: data.count,
        score: data.count > 0 ? Math.round(((data.positive - data.negative) / data.count) * 100) : 0,
      }))
      .sort((a, b) => a.tier - b.tier || b.count - a.count);
  } catch (err) {
    console.error("Source breakdown error:", err);
    return [];
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    await requireAuth(req, corsHeaders);
    const { ticker } = await req.json().catch(() => ({}));

    // Fetch all sources in parallel
    const [cnnFearGreed, gdeltTone, sourceBreakdown] = await Promise.all([
      fetchCNNFearGreed(),
      fetchGDELTTone(ticker),
      fetchSourceBreakdown(ticker),
    ]);

    // Compute composite sentiment score (-100 to +100)
    let compositeScore = 0;
    let signals = 0;

    // CNN F&G contribution: normalize 0-100 to -100 to +100
    if (cnnFearGreed) {
      compositeScore += (cnnFearGreed.score - 50) * 2 * 0.35; // 35% weight
      signals++;
    }

    // GDELT tone contribution: tone typically ranges -10 to +10, normalize
    if (gdeltTone) {
      compositeScore += Math.max(-100, Math.min(100, gdeltTone.avgTone * 10)) * 0.35; // 35% weight
      signals++;
    }

    // Source breakdown contribution
    if (sourceBreakdown.length > 0) {
      const avgSourceScore = sourceBreakdown.reduce((s, src) => s + src.score, 0) / sourceBreakdown.length;
      compositeScore += avgSourceScore * 0.3; // 30% weight
      signals++;
    }

    compositeScore = Math.round(Math.max(-100, Math.min(100, compositeScore)));

    // Determine overall trend
    let trend: "improving" | "deteriorating" | "stable" = "stable";
    if (gdeltTone?.trendDirection === "improving" && (cnnFearGreed?.score ?? 50) > (cnnFearGreed?.previousClose ?? 50)) {
      trend = "improving";
    } else if (gdeltTone?.trendDirection === "deteriorating" && (cnnFearGreed?.score ?? 50) < (cnnFearGreed?.previousClose ?? 50)) {
      trend = "deteriorating";
    } else if (gdeltTone?.trendDirection !== "stable") {
      trend = gdeltTone?.trendDirection || "stable";
    }

    const result = {
      cnnFearGreed,
      gdeltTone,
      sourceBreakdown,
      compositeScore,
      trend,
      signalCount: signals,
      ticker: ticker || null,
      timestamp: new Date().toISOString(),
    };

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Sentiment intel error:", error);
    return new Response(
      JSON.stringify({ error: "Failed to fetch sentiment data", details: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
