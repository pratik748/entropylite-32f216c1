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
    if (!res.ok) { console.warn("CNN F&G returned", res.status); return null; }
    const data = await res.json();
    const current = data.fear_and_greed;
    const history = (data.fear_and_greed_historical?.data || []).slice(-30).map((d: any) => ({ date: d.x, score: d.y }));
    const score = Math.round(current?.score ?? 50);
    let label = "Neutral";
    if (score <= 25) label = "Extreme Fear";
    else if (score <= 45) label = "Fear";
    else if (score <= 55) label = "Neutral";
    else if (score <= 75) label = "Greed";
    else label = "Extreme Greed";
    return { score, label, previousClose: Math.round(current?.previous_close ?? score), weekAgo: Math.round(current?.previous_1_week ?? score), monthAgo: Math.round(current?.previous_1_month ?? score), history };
  } catch (err) { console.error("CNN F&G fetch error:", err); return null; }
}

// --- GDELT Global Tone ---
async function fetchGDELTTone(ticker?: string) {
  try {
    const query = ticker ? `${ticker} stock market` : "global economy stock market";
    const url = `https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(query)}&mode=ArtList&maxrecords=50&format=json&sort=DateDesc`;
    const res = await fetch(url);
    if (!res.ok) { console.warn("GDELT returned", res.status); return null; }
    const data = await res.json();
    const articles = data.articles || [];
    if (articles.length === 0) return { avgTone: 0, articleCount: 0, trendDirection: "stable", articles: [], toneTrend: [] };

    let totalTone = 0, toneCount = 0;
    const toneByDate: Record<string, { sum: number; count: number }> = {};
    const processed = articles.slice(0, 30).map((a: any) => {
      const tone = a.tone ? parseFloat(String(a.tone).split(",")[0]) : 0;
      if (!isNaN(tone)) {
        totalTone += tone; toneCount++;
        const dateKey = (a.seendate || "").substring(0, 8);
        if (dateKey) {
          if (!toneByDate[dateKey]) toneByDate[dateKey] = { sum: 0, count: 0 };
          toneByDate[dateKey].sum += tone; toneByDate[dateKey].count++;
        }
      }
      return { title: a.title || "", url: a.url || "", source: a.domain || a.sourcecountry || "Unknown", tone, date: a.seendate || "" };
    });
    const avgTone = toneCount > 0 ? Math.round((totalTone / toneCount) * 100) / 100 : 0;
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
    const toneTrend = dates.map(d => ({ date: d, tone: Math.round((toneByDate[d].sum / toneByDate[d].count) * 100) / 100 }));
    return { avgTone, articleCount: articles.length, trendDirection, toneTrend, articles: processed };
  } catch (err) { console.error("GDELT fetch error:", err); return null; }
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
      if (!sourceMap[sourceName]) sourceMap[sourceName] = { positive: 0, negative: 0, neutral: 0, count: 0, tier };
      sourceMap[sourceName].count++;
      if (sentVal > 0) sourceMap[sourceName].positive++;
      else if (sentVal < 0) sourceMap[sourceName].negative++;
      else sourceMap[sourceName].neutral++;
    }
    return Object.entries(sourceMap).map(([source, data]) => ({
      source, tier: data.tier, positive: data.positive, negative: data.negative, neutral: data.neutral, count: data.count,
      score: data.count > 0 ? Math.round(((data.positive - data.negative) / data.count) * 100) : 0,
    })).sort((a, b) => a.tier - b.tier || b.count - a.count);
  } catch (err) { console.error("Source breakdown error:", err); return []; }
}

// --- Reddit WSB + Stocks Sentiment ---
async function fetchRedditSentiment(ticker?: string) {
  try {
    const subreddits = ["wallstreetbets", "stocks", "investing"];
    const results: { subreddit: string; posts: any[]; bullishCount: number; bearishCount: number; totalPosts: number; avgUpvoteRatio: number }[] = [];
    const bullishWords = ["bull", "moon", "rocket", "calls", "buy", "long", "pump", "diamond", "hold", "yolo", "tendies", "squeeze", "rally", "breakout", "undervalued"];
    const bearishWords = ["bear", "puts", "short", "sell", "crash", "dump", "overvalued", "bubble", "collapse", "drill", "tank", "bagholder", "loss"];

    for (const sub of subreddits) {
      try {
        const url = `https://www.reddit.com/r/${sub}/hot.json?limit=25`;
        const res = await fetch(url, {
          headers: { "User-Agent": "Mozilla/5.0 (compatible; EntropyLite/1.0; +https://entropy.app)" },
        });
        if (!res.ok) { console.warn(`Reddit r/${sub} returned ${res.status}`); continue; }
        const data = await res.json();
        const posts = (data?.data?.children || []).map((c: any) => c.data);
        let bullish = 0, bearish = 0;
        const tickerUpper = ticker?.toUpperCase();

        const relevantPosts = posts.filter((p: any) => {
          if (!ticker) return true;
          const text = `${p.title} ${p.selftext || ""}`.toUpperCase();
          return text.includes(tickerUpper!) || text.includes(`$${tickerUpper}`);
        });

        const postsToAnalyze = relevantPosts.length > 0 ? relevantPosts : posts;

        for (const p of postsToAnalyze) {
          const text = `${p.title} ${p.selftext || ""}`.toLowerCase();
          const bScore = bullishWords.filter(w => text.includes(w)).length;
          const beScore = bearishWords.filter(w => text.includes(w)).length;
          if (bScore > beScore) bullish++;
          else if (beScore > bScore) bearish++;
        }

        const avgUpvoteRatio = postsToAnalyze.length > 0
          ? postsToAnalyze.reduce((s: number, p: any) => s + (p.upvote_ratio || 0.5), 0) / postsToAnalyze.length
          : 0.5;

        results.push({
          subreddit: sub,
          posts: postsToAnalyze.slice(0, 5).map((p: any) => ({
            title: p.title, score: p.score, upvoteRatio: p.upvote_ratio, comments: p.num_comments, url: `https://reddit.com${p.permalink}`,
          })),
          bullishCount: bullish, bearishCount: bearish, totalPosts: postsToAnalyze.length, avgUpvoteRatio: Math.round(avgUpvoteRatio * 100) / 100,
        });
      } catch (e) { console.warn(`Reddit r/${sub} error:`, e); }
    }

    if (results.length === 0) return null;

    const totalBullish = results.reduce((s, r) => s + r.bullishCount, 0);
    const totalBearish = results.reduce((s, r) => s + r.bearishCount, 0);
    const total = totalBullish + totalBearish || 1;
    // Score from -100 (all bearish) to +100 (all bullish)
    const retailScore = Math.round(((totalBullish - totalBearish) / total) * 100);
    const mood = retailScore > 30 ? "Bullish" : retailScore > 10 ? "Mildly Bullish" : retailScore < -30 ? "Bearish" : retailScore < -10 ? "Mildly Bearish" : "Mixed";

    return { retailScore, mood, totalBullish, totalBearish, subreddits: results, topPosts: results.flatMap(r => r.posts).sort((a, b) => b.score - a.score).slice(0, 8) };
  } catch (err) { console.error("Reddit sentiment error:", err); return null; }
}

// --- Wikipedia Pageview Spike Detection ---
async function fetchWikipediaAttention(ticker?: string) {
  if (!ticker) return null;
  try {
    // Map common tickers to Wikipedia article titles
    const tickerToArticle: Record<string, string> = {
      "AAPL": "Apple_Inc.", "MSFT": "Microsoft", "GOOGL": "Alphabet_Inc.", "AMZN": "Amazon_(company)",
      "TSLA": "Tesla,_Inc.", "META": "Meta_Platforms", "NVDA": "Nvidia", "JPM": "JPMorgan_Chase",
      "V": "Visa_Inc.", "WMT": "Walmart", "DIS": "The_Walt_Disney_Company", "NFLX": "Netflix",
      "AMD": "Advanced_Micro_Devices", "INTC": "Intel", "BA": "Boeing", "GS": "Goldman_Sachs",
      "BTC-USD": "Bitcoin", "ETH-USD": "Ethereum",
    };
    const article = tickerToArticle[ticker.toUpperCase()] || ticker;
    const today = new Date();
    const endDate = `${today.getFullYear()}${String(today.getMonth() + 1).padStart(2, "0")}${String(today.getDate()).padStart(2, "0")}`;
    const start = new Date(today.getTime() - 30 * 24 * 60 * 60 * 1000);
    const startDate = `${start.getFullYear()}${String(start.getMonth() + 1).padStart(2, "0")}${String(start.getDate()).padStart(2, "0")}`;

    const url = `https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/all-agents/${encodeURIComponent(article)}/daily/${startDate}/${endDate}`;
    const res = await fetch(url, { headers: { "User-Agent": "EntropyLite/1.0 (entropy@app.com)" } });
    if (!res.ok) { console.warn("Wikipedia returned", res.status); return null; }
    const data = await res.json();
    const items = data.items || [];
    if (items.length < 7) return null;

    const views = items.map((i: any) => i.views);
    const recent7 = views.slice(-7);
    const older = views.slice(0, -7);
    const recentAvg = recent7.reduce((a: number, b: number) => a + b, 0) / recent7.length;
    const olderAvg = older.length > 0 ? older.reduce((a: number, b: number) => a + b, 0) / older.length : recentAvg;
    const spikeRatio = olderAvg > 0 ? recentAvg / olderAvg : 1;
    const isSpike = spikeRatio > 1.5;
    const trend = items.slice(-14).map((i: any) => ({ date: i.article ? i.timestamp : i.timestamp, views: i.views }));

    return {
      article, recentAvgViews: Math.round(recentAvg), historicAvgViews: Math.round(olderAvg),
      spikeRatio: Math.round(spikeRatio * 100) / 100, isSpike, trend,
      attentionScore: Math.min(100, Math.round((spikeRatio - 1) * 100)), // 0-100, >50 = notable spike
    };
  } catch (err) { console.error("Wikipedia attention error:", err); return null; }
}

// --- Macro Sentiment Proxy (uses publicly available data) ---
async function fetchMacroSignals() {
  try {
    // Fetch VIX and yield curve proxy from Yahoo Finance (same as market-data)
    const [vixRes, yieldRes] = await Promise.all([
      fetch(`https://query1.finance.yahoo.com/v8/finance/chart/%5EVIX?interval=1d&range=5d`, {
        headers: { "User-Agent": "Mozilla/5.0" },
      }).catch(() => null),
      fetch(`https://query1.finance.yahoo.com/v8/finance/chart/%5EIRX?interval=1d&range=5d`, {
        headers: { "User-Agent": "Mozilla/5.0" },
      }).catch(() => null),
    ]);

    let vix = 0, vixChange = 0;
    if (vixRes?.ok) {
      const data = await vixRes.json();
      const meta = data?.chart?.result?.[0]?.meta;
      if (meta) {
        vix = meta.regularMarketPrice || 0;
        const prevClose = meta.chartPreviousClose || meta.previousClose || vix;
        vixChange = prevClose > 0 ? ((vix - prevClose) / prevClose) * 100 : 0;
      }
    }

    let shortYield = 0;
    if (yieldRes?.ok) {
      const data = await yieldRes.json();
      const meta = data?.chart?.result?.[0]?.meta;
      if (meta) shortYield = meta.regularMarketPrice || 0;
    }

    // VIX-based fear: >30 = extreme fear, <15 = complacency
    const vixSentiment = vix > 35 ? -80 : vix > 30 ? -60 : vix > 25 ? -30 : vix > 20 ? -10 : vix > 15 ? 10 : 30;
    const vixLabel = vix > 35 ? "Panic" : vix > 30 ? "High Fear" : vix > 25 ? "Elevated" : vix > 20 ? "Cautious" : vix > 15 ? "Calm" : "Complacent";

    return {
      vix: Math.round(vix * 100) / 100, vixChange: Math.round(vixChange * 100) / 100,
      vixSentiment, vixLabel, shortYield: Math.round(shortYield * 100) / 100,
      macroScore: vixSentiment, // simplified
    };
  } catch (err) { console.error("Macro signals error:", err); return null; }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    await requireAuth(req, corsHeaders);
    const { ticker } = await req.json().catch(() => ({}));

    // Fetch ALL sources in parallel
    const [cnnFearGreed, gdeltTone, sourceBreakdown, redditSentiment, wikiAttention, macroSignals] = await Promise.all([
      fetchCNNFearGreed(),
      fetchGDELTTone(ticker),
      fetchSourceBreakdown(ticker),
      fetchRedditSentiment(ticker),
      fetchWikipediaAttention(ticker),
      fetchMacroSignals(),
    ]);

    // Compute composite sentiment score (-100 to +100) with 6 signals
    let compositeScore = 0;
    let totalWeight = 0;

    if (cnnFearGreed) {
      compositeScore += (cnnFearGreed.score - 50) * 2 * 0.25; // 25%
      totalWeight += 0.25;
    }
    if (gdeltTone) {
      compositeScore += Math.max(-100, Math.min(100, gdeltTone.avgTone * 10)) * 0.20; // 20%
      totalWeight += 0.20;
    }
    if (sourceBreakdown.length > 0) {
      const avgSourceScore = sourceBreakdown.reduce((s, src) => s + src.score, 0) / sourceBreakdown.length;
      compositeScore += avgSourceScore * 0.15; // 15%
      totalWeight += 0.15;
    }
    if (redditSentiment) {
      compositeScore += redditSentiment.retailScore * 0.15; // 15%
      totalWeight += 0.15;
    }
    if (macroSignals) {
      compositeScore += macroSignals.macroScore * 0.15; // 15%
      totalWeight += 0.15;
    }
    if (wikiAttention) {
      // Attention itself is neutral — high attention with positive market = bullish, with negative = amplifier
      const attentionBias = (compositeScore > 0 ? 1 : compositeScore < 0 ? -1 : 0) * Math.min(30, wikiAttention.attentionScore);
      compositeScore += attentionBias * 0.10; // 10%
      totalWeight += 0.10;
    }

    // Normalize if not all signals available
    if (totalWeight > 0 && totalWeight < 1) {
      compositeScore = compositeScore / totalWeight;
    }
    compositeScore = Math.round(Math.max(-100, Math.min(100, compositeScore)));

    // Determine overall trend
    let trend: "improving" | "deteriorating" | "stable" = "stable";
    if (gdeltTone?.trendDirection === "improving" && (cnnFearGreed?.score ?? 50) > (cnnFearGreed?.previousClose ?? 50)) {
      trend = "improving";
    } else if (gdeltTone?.trendDirection === "deteriorating" && (cnnFearGreed?.score ?? 50) < (cnnFearGreed?.previousClose ?? 50)) {
      trend = "deteriorating";
    } else if (gdeltTone?.trendDirection !== "stable") {
      trend = gdeltTone?.trendDirection as any || "stable";
    }

    const result = {
      cnnFearGreed,
      gdeltTone,
      sourceBreakdown,
      redditSentiment,
      wikiAttention,
      macroSignals,
      compositeScore,
      trend,
      signalCount: [cnnFearGreed, gdeltTone, sourceBreakdown.length > 0 ? true : null, redditSentiment, wikiAttention, macroSignals].filter(Boolean).length,
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
