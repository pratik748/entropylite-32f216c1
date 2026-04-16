import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface PolymarketEvent {
  id: string;
  slug: string;
  title: string;
  outcomes: string[];
  outcomePrices: string;
  volume: number;
  volume24hr: number;
  liquidity: number;
  endDate: string;
  active: boolean;
  closed: boolean;
}

interface PolymarketSignal {
  market: string;
  slug: string;
  category: string;
  probability: number;
  volume24h: number;
  totalVolume: number;
  liquidity: number;
  direction: "BULLISH" | "BEARISH" | "NEUTRAL";
  conviction: number; // 0-100 based on volume + liquidity
  marketImpact: "high" | "medium" | "low";
  reasoning: string;
}

// Key prediction markets that skew financial signals
const MARKET_CATEGORIES: Record<string, string[]> = {
  macro: [
    "fed", "rate", "recession", "inflation", "gdp", "unemployment", "interest",
    "treasury", "debt", "ceiling", "shutdown", "cpi", "fomc", "central bank",
    "monetary", "fiscal", "stimulus", "default", "bond", "yield",
  ],
  geopolitical: [
    "war", "china", "russia", "ukraine", "taiwan", "sanctions", "military",
    "trade", "tariff", "nato", "middle-east", "iran", "israel", "conflict",
    "invasion", "ceasefire", "peace", "nuclear", "korea", "india", "border",
  ],
  crypto: [
    "bitcoin", "ethereum", "crypto", "btc", "eth", "solana", "defi", "nft",
    "stablecoin", "usdc", "tether", "binance", "coinbase", "sec",
  ],
  elections: [
    "president", "election", "congress", "senate", "trump", "biden", "governor",
    "vote", "poll", "primary", "inaug", "democrat", "republican", "cabinet",
  ],
  tech: [
    "ai ", "openai", "google", "apple", "nvidia", "regulation", "antitrust",
    "microsoft", "meta", "amazon", "spacex", "tesla",
  ],
};

// Sports/entertainment keywords to filter out false positives
const EXCLUDE_KEYWORDS = [
  "nba", "nfl", "mlb", "nhl", "ufc", "pgl", "esport", "lpl", "lol", "cs2",
  "warriors", "lakers", "yankees", "pirates", "nationals", "dodgers", "celtics",
  "finals", "championship", "game ", "match", "tournament", "league",
  "oscar", "grammy", "emmy", "box office", "movie", "album", "song",
  "donk", "streamer", "twitch", "youtube",
];

function categorizeMarket(title: string, slug: string): string {
  const text = `${title} ${slug}`.toLowerCase();
  // Exclude sports/entertainment
  if (EXCLUDE_KEYWORDS.some(k => text.includes(k))) return "other";
  for (const [cat, keywords] of Object.entries(MARKET_CATEGORIES)) {
    if (keywords.some(k => text.includes(k))) return cat;
  }
  return "other";
}

function computeDirection(probability: number, category: string): "BULLISH" | "BEARISH" | "NEUTRAL" {
  // For macro negative events (recession, inflation), high prob = bearish
  const bearishCategories = ["recession", "war", "sanctions", "shutdown"];
  const isBearishEvent = bearishCategories.some(k => category.includes(k));
  
  if (probability > 0.65) return isBearishEvent ? "BEARISH" : "BULLISH";
  if (probability < 0.35) return isBearishEvent ? "BULLISH" : "BEARISH";
  return "NEUTRAL";
}

function computeConviction(volume24h: number, liquidity: number): number {
  // Higher volume + liquidity = higher conviction
  const volScore = Math.min(50, (volume24h / 100000) * 50);
  const liqScore = Math.min(50, (liquidity / 500000) * 50);
  return Math.round(volScore + liqScore);
}

function computeImpact(volume24h: number, category: string): "high" | "medium" | "low" {
  if (category === "macro" || category === "geopolitical") {
    return volume24h > 50000 ? "high" : volume24h > 10000 ? "medium" : "low";
  }
  return volume24h > 100000 ? "high" : volume24h > 25000 ? "medium" : "low";
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const apiKey = Deno.env.get("POLYMARKET_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "POLYMARKET_API_KEY not configured" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => ({}));
    const categories = body.categories || ["macro", "geopolitical", "crypto", "elections", "tech"];
    const limit = body.limit || 50;

    // Use Gamma API directly — it has question/slug fields
    const gammaUrl = `https://gamma-api.polymarket.com/markets?limit=${limit}&active=true&closed=false&order=volume24hr&ascending=false`;
    const gammaRes = await fetch(gammaUrl);
    let markets: any[] = [];
    if (gammaRes.ok) {
      const gammaData = await gammaRes.json();
      markets = Array.isArray(gammaData) ? gammaData : (gammaData.data || []);
    } else {
      await gammaRes.text();
    }

    // Process markets into signals
    const signals: PolymarketSignal[] = [];

    for (const market of markets) {
      try {
        const title = market.question || market.title || "";
        const slug = market.slug || market.condition_id || "";
        const category = categorizeMarket(title, slug);

        // Skip sports, entertainment, and other non-financial markets
        if (category === "other") continue;
        if (!categories.includes(category)) continue;

        // Parse outcome prices (probability)
        let probability = 0.5;
        if (market.outcomePrices) {
          try {
            const prices = typeof market.outcomePrices === "string"
              ? JSON.parse(market.outcomePrices)
              : market.outcomePrices;
            probability = parseFloat(prices[0]) || 0.5;
          } catch { probability = 0.5; }
        } else if (market.bestAsk !== undefined) {
          probability = parseFloat(market.bestAsk) || 0.5;
        } else if (market.lastTradePrice !== undefined) {
          probability = parseFloat(market.lastTradePrice) || 0.5;
        }

        const volume24h = parseFloat(market.volume24hr || market.volume_24h || "0");
        const totalVolume = parseFloat(market.volume || market.volumeNum || "0");
        const liquidity = parseFloat(market.liquidity || market.liquidityNum || "0");

        if (volume24h < 1000 && totalVolume < 10000) continue; // skip illiquid

        const direction = computeDirection(probability, `${category} ${title.toLowerCase()}`);
        const conviction = computeConviction(volume24h, liquidity);
        const marketImpact = computeImpact(volume24h, category);

        signals.push({
          market: title.length > 80 ? title.slice(0, 77) + "..." : title,
          slug,
          category,
          probability: parseFloat(probability.toFixed(3)),
          volume24h: Math.round(volume24h),
          totalVolume: Math.round(totalVolume),
          liquidity: Math.round(liquidity),
          direction,
          conviction,
          marketImpact,
          reasoning: `${(probability * 100).toFixed(0)}% prob | $${(volume24h / 1000).toFixed(0)}K 24h vol | ${conviction}% conviction`,
        });
      } catch (e) {
        console.error("Market processing error:", e);
      }
    }

    // Sort by conviction (volume * probability relevance)
    signals.sort((a, b) => b.conviction - a.conviction);

    // Aggregate sentiment
    const bullish = signals.filter(s => s.direction === "BULLISH").length;
    const bearish = signals.filter(s => s.direction === "BEARISH").length;
    const highImpact = signals.filter(s => s.marketImpact === "high");

    const overallSentiment = bullish > bearish ? "RISK_ON"
      : bearish > bullish ? "RISK_OFF" : "NEUTRAL";

    return new Response(JSON.stringify({
      signals: signals.slice(0, 20),
      aggregate: {
        overallSentiment,
        bullishCount: bullish,
        bearishCount: bearish,
        neutralCount: signals.length - bullish - bearish,
        highImpactSignals: highImpact.length,
        totalMarketsScanned: markets.length,
      },
      categories: Object.fromEntries(
        Object.keys(MARKET_CATEGORIES).map(cat => [
          cat,
          signals.filter(s => s.category === cat).length,
        ])
      ),
      timestamp: Date.now(),
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("polymarket-signals error:", error);
    return new Response(JSON.stringify({ error: error.message || "Polymarket signals failed" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
