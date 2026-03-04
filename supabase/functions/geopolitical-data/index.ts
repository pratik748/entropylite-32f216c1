import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const forexPairs = [
  { symbol: "USDINR=X", country: "India", lat: 20.5, lng: 78.9, currency: "INR" },
  { symbol: "USDTRY=X", country: "Turkey", lat: 39.9, lng: 32.8, currency: "TRY" },
  { symbol: "USDRUB=X", country: "Russia", lat: 55.7, lng: 37.6, currency: "RUB" },
  { symbol: "USDBRL=X", country: "Brazil", lat: -15.7, lng: -47.9, currency: "BRL" },
  { symbol: "USDCNY=X", country: "China", lat: 39.9, lng: 116.4, currency: "CNY" },
  { symbol: "USDMXN=X", country: "Mexico", lat: 19.4, lng: -99.1, currency: "MXN" },
  { symbol: "USDZAR=X", country: "South Africa", lat: -25.7, lng: 28.2, currency: "ZAR" },
  { symbol: "USDEGP=X", country: "Egypt", lat: 30.0, lng: 31.2, currency: "EGP" },
  { symbol: "USDJPY=X", country: "Japan", lat: 35.6, lng: 139.6, currency: "JPY" },
  { symbol: "GBPUSD=X", country: "United Kingdom", lat: 51.5, lng: -0.1, currency: "GBP" },
  { symbol: "EURUSD=X", country: "EU", lat: 50.8, lng: 4.3, currency: "EUR" },
  { symbol: "USDKRW=X", country: "South Korea", lat: 37.5, lng: 126.9, currency: "KRW" },
  { symbol: "USDTHB=X", country: "Thailand", lat: 13.7, lng: 100.5, currency: "THB" },
  { symbol: "USDNGN=X", country: "Nigeria", lat: 9.0, lng: 7.4, currency: "NGN" },
  { symbol: "USDARS=X", country: "Argentina", lat: -34.6, lng: -58.3, currency: "ARS" },
];

const tradeHubs = [
  { name: "New York", lat: 40.7, lng: -74.0, type: "finance" },
  { name: "London", lat: 51.5, lng: -0.1, type: "finance" },
  { name: "Shanghai", lat: 31.2, lng: 121.4, type: "trade" },
  { name: "Singapore", lat: 1.3, lng: 103.8, type: "trade" },
  { name: "Dubai", lat: 25.2, lng: 55.2, type: "energy" },
  { name: "Mumbai", lat: 19.0, lng: 72.8, type: "finance" },
  { name: "Tokyo", lat: 35.6, lng: 139.6, type: "finance" },
  { name: "Hong Kong", lat: 22.3, lng: 114.1, type: "finance" },
  { name: "Strait of Malacca", lat: 2.5, lng: 101.5, type: "shipping" },
  { name: "Suez Canal", lat: 30.4, lng: 32.3, type: "shipping" },
  { name: "Panama Canal", lat: 9.1, lng: -79.6, type: "shipping" },
  { name: "Rotterdam", lat: 51.9, lng: 4.5, type: "trade" },
];

async function fetchYahooQuote(symbol: string) {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=5d&_t=${Date.now()}`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0", "Cache-Control": "no-cache, no-store" },
    });
    const data = await res.json();
    const meta = data?.chart?.result?.[0]?.meta;
    if (!meta) return null;
    const prevClose = meta.chartPreviousClose || meta.previousClose || 0;
    const price = meta.regularMarketPrice || 0;
    return { price, prevClose, change: prevClose > 0 ? ((price - prevClose) / prevClose) * 100 : 0 };
  } catch { return null; }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");

    // 1. Fetch real forex volatility
    const forexResults = await Promise.all(
      forexPairs.map(async (pair) => {
        const quote = await fetchYahooQuote(pair.symbol);
        return {
          ...pair,
          rate: quote?.price || 0,
          change24h: quote?.change || 0,
          isStressed: Math.abs(quote?.change || 0) > 2,
        };
      })
    );

    // 2. Use AI for current geopolitical hotspots
    let conflictEvents: any[] = [];
    let geopoliticalInsights: any = {};
    
    if (LOVABLE_API_KEY) {
      try {
        const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
          method: "POST",
          headers: { Authorization: `Bearer ${LOVABLE_API_KEY}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "google/gemini-2.5-flash",
            messages: [
              { role: "system", content: "You are a geopolitical intelligence analyst. Return ONLY valid JSON." },
              { role: "user", content: `Today is ${new Date().toISOString().split("T")[0]}. Provide current geopolitical conflict zones and crisis areas affecting global markets.

Return JSON:
{
  "conflicts": [
    { "name": "<conflict/crisis name>", "lat": <number>, "lng": <number>, "severity": <0.1-1.0>, "type": "<war|sanctions|unrest|terrorism|trade_war>", "affectedAssets": ["<ticker1>"], "summary": "<1 sentence>", "nearTradeHub": "<name or null>", "distanceKm": <number or null> }
  ],
  "supplyChainRisks": [
    { "route": "<trade route>", "startLat": <num>, "startLng": <num>, "endLat": <num>, "endLng": <num>, "riskLevel": "<high|medium|low>", "reason": "<1 sentence>" }
  ],
  "globalRiskScore": <0-100>,
  "regimeSignal": "<stable|transition|crisis>",
  "keyThreats": ["<threat1>", "<threat2>", "<threat3>"],
  "capitalFlowDirection": "<risk-on|risk-off|mixed>"
}

Include 8-12 REAL current conflicts/crises. Use accurate coordinates.` },
            ],
            temperature: 0.3,
            max_tokens: 2000,
          }),
        });

        const aiData = await aiRes.json();
        if (aiData.choices?.[0]?.message?.content) {
          const raw = aiData.choices[0].message.content.trim().replace(/^```json?\n?/, "").replace(/\n?```$/, "");
          geopoliticalInsights = JSON.parse(raw);
          conflictEvents = geopoliticalInsights.conflicts || [];
        }
      } catch (e) { console.error("AI geo error:", e); }
    }

    // 3. Compute high-entropy zones (conflict near trade hub + currency stress)
    const highEntropyZones = conflictEvents
      .filter((c: any) => c.severity > 0.5)
      .map((conflict: any) => {
        const nearbyForex = forexResults.filter(f => {
          const dist = Math.sqrt(Math.pow(f.lat - conflict.lat, 2) + Math.pow(f.lng - conflict.lng, 2));
          return dist < 20; // rough proximity
        });
        const currencyStress = nearbyForex.reduce((max, f) => Math.max(max, Math.abs(f.change24h)), 0);
        const entropyScore = (conflict.severity * 50) + (currencyStress * 10);
        return {
          ...conflict,
          currencyStress,
          entropyScore,
          isHighEntropy: entropyScore > 30 || (conflict.severity > 0.7 && currencyStress > 1),
          affectedCurrencies: nearbyForex.filter(f => f.isStressed).map(f => f.currency),
        };
      })
      .filter((z: any) => z.isHighEntropy);

    return new Response(JSON.stringify({
      conflictEvents,
      forexVolatility: forexResults,
      highEntropyZones,
      tradeHubs,
      supplyChainRisks: geopoliticalInsights.supplyChainRisks || [],
      globalRiskScore: geopoliticalInsights.globalRiskScore || 50,
      regimeSignal: geopoliticalInsights.regimeSignal || "stable",
      keyThreats: geopoliticalInsights.keyThreats || [],
      capitalFlowDirection: geopoliticalInsights.capitalFlowDirection || "mixed",
      timestamp: Date.now(),
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("Geopolitical data error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
