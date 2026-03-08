import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { callAI } from "../_shared/callAI.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// HARDCODED FALLBACK — always renders even if AI fails
const FALLBACK_CONFLICTS = [
  { name: "Ukraine-Russia War", lat: 48.5, lng: 37.5, severity: 0.9, type: "war", affectedAssets: ["RSX", "GAZP", "wheat"], summary: "Full-scale war continues with intense fighting in eastern Ukraine. Energy infrastructure targeted.", nearTradeHub: "Rotterdam", distanceKm: 2200, escalationProb: 0.35, actionableIntel: "Monitor European gas prices and defense stocks." },
  { name: "Iran-Israel Tensions", lat: 32.0, lng: 51.0, severity: 0.85, type: "war", affectedAssets: ["XLE", "crude", "gold"], summary: "Elevated military tensions with proxy conflicts across Lebanon and Yemen. Oil supply risk elevated.", nearTradeHub: "Dubai", distanceKm: 900, escalationProb: 0.45, actionableIntel: "Hedge oil exposure. Add gold as safe haven." },
  { name: "Houthi Red Sea Attacks", lat: 14.5, lng: 42.5, severity: 0.75, type: "terrorism", affectedAssets: ["shipping", "ZIM", "MAERSK"], summary: "Continued drone and missile attacks on commercial shipping disrupting Suez Canal trade routes.", nearTradeHub: "Suez Canal", distanceKm: 1500, escalationProb: 0.3, actionableIntel: "Shipping stocks face persistent premium. Watch freight rates." },
  { name: "China-Taiwan Strait", lat: 24.0, lng: 121.0, severity: 0.7, type: "trade_war", affectedAssets: ["TSM", "ASML", "semiconductors"], summary: "Military exercises and gray-zone pressure continue. Semiconductor supply chain at risk.", nearTradeHub: "Shanghai", distanceKm: 700, escalationProb: 0.2, actionableIntel: "Diversify semiconductor exposure away from TSMC concentration." },
  { name: "Sudan Civil War", lat: 15.6, lng: 32.5, severity: 0.65, type: "war", affectedAssets: ["gold", "agriculture"], summary: "Humanitarian crisis deepens as fighting between SAF and RSF continues in Khartoum.", escalationProb: 0.25, actionableIntel: "Limited direct market impact but watch refugee flows to Egypt." },
  { name: "South China Sea Disputes", lat: 12.0, lng: 115.0, severity: 0.55, type: "unrest", affectedAssets: ["shipping", "PHI"], summary: "Escalating confrontations between Chinese coast guard and Philippine vessels near contested reefs.", nearTradeHub: "Singapore", distanceKm: 1800, escalationProb: 0.15, actionableIntel: "Monitor ASEAN shipping routes." },
  { name: "India-Pakistan Border", lat: 34.0, lng: 74.0, severity: 0.45, type: "unrest", affectedAssets: ["NIFTY", "SENSEX"], summary: "Periodic border tensions with occasional ceasefire violations. Currently in managed tension phase.", nearTradeHub: "Mumbai", distanceKm: 1400, escalationProb: 0.1, actionableIntel: "Indian defense stocks as tactical play." },
  { name: "Venezuela Crisis", lat: 10.5, lng: -66.9, severity: 0.4, type: "sanctions", affectedAssets: ["crude", "PBR"], summary: "Ongoing political instability and sanctions affecting oil production capacity.", escalationProb: 0.15, actionableIntel: "Watch for sanctions relief signals — bullish for EM energy." },
  { name: "North Korea Provocations", lat: 39.0, lng: 125.7, severity: 0.5, type: "unrest", affectedAssets: ["KRW", "KOSPI"], summary: "Continued missile tests and nuclear saber-rattling raising regional tensions.", nearTradeHub: "Tokyo", distanceKm: 1200, escalationProb: 0.1, actionableIntel: "Korean won hedges on test days." },
  { name: "Sahel Region Instability", lat: 14.0, lng: 2.0, severity: 0.45, type: "unrest", affectedAssets: ["uranium", "gold"], summary: "Military coups and jihadist insurgencies across Mali, Niger, and Burkina Faso disrupting mining operations.", escalationProb: 0.2, actionableIntel: "Uranium supply disruption risk — nuclear energy play." },
];

const FALLBACK_SUPPLY_CHAINS = [
  { route: "Suez Canal → Mediterranean", startLat: 30.4, startLng: 32.3, endLat: 35.0, endLng: 18.0, riskLevel: "high", reason: "Houthi attacks forcing rerouting via Cape of Good Hope", affectedCommodities: ["oil", "LNG", "containers"] },
  { route: "Strait of Malacca", startLat: 1.3, startLng: 103.8, endLat: 6.0, endLng: 100.0, riskLevel: "medium", reason: "China-ASEAN tensions and piracy risk", affectedCommodities: ["oil", "electronics"] },
  { route: "Black Sea Grain Corridor", startLat: 46.0, startLng: 31.0, endLat: 41.0, endLng: 29.0, riskLevel: "high", reason: "Russia-Ukraine war disrupting grain exports", affectedCommodities: ["wheat", "corn", "sunflower oil"] },
  { route: "Taiwan Strait", startLat: 24.0, startLng: 121.0, endLat: 25.0, endLng: 119.5, riskLevel: "medium", reason: "Chinese military exercises near shipping lanes", affectedCommodities: ["semiconductors", "electronics"] },
];

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
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0", "Cache-Control": "no-cache, no-store" } });
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
    // 1. Fetch real forex volatility
    const forexResults = await Promise.all(
      forexPairs.map(async (pair) => {
        const quote = await fetchYahooQuote(pair.symbol);
        return { ...pair, rate: quote?.price || 0, change24h: quote?.change || 0, isStressed: Math.abs(quote?.change || 0) > 2 };
      })
    );

    // 2. AI geopolitical intelligence (with fallback)
    let conflictEvents = FALLBACK_CONFLICTS;
    let geopoliticalInsights: any = {};

    try {
      const stressedCurrencies = forexResults.filter(f => f.isStressed).map(f => `${f.currency}: ${f.change24h > 0 ? "+" : ""}${f.change24h.toFixed(2)}%`).join(", ");

      const result = await callAI({
        systemPrompt: "You are a geopolitical intelligence analyst at a sovereign wealth fund. Return ONLY valid JSON.",
        userPrompt: `Today is ${new Date().toISOString().split("T")[0]}. 
REAL-TIME FOREX STRESS: ${stressedCurrencies || "No currencies stressed >2%"}

Provide 12-18 REAL current conflicts/crises. MUST include Iran/Israel, Houthis/Red Sea, Ukraine-Russia, China-Taiwan. Be specific with coordinates.

Return JSON:
{
  "conflicts": [{ "name": "<name>", "lat": <num>, "lng": <num>, "severity": <0.1-1.0>, "type": "<war|sanctions|unrest|terrorism|trade_war|cyber|energy>", "affectedAssets": ["<ticker>"], "summary": "<2 sentence brief>", "nearTradeHub": "<name or null>", "distanceKm": <num or null>, "escalationProb": <0-1>, "actionableIntel": "<1 sentence>" }],
  "supplyChainRisks": [{ "route": "<route>", "startLat": <num>, "startLng": <num>, "endLat": <num>, "endLng": <num>, "riskLevel": "<high|medium|low>", "reason": "<1 sentence>", "affectedCommodities": ["<commodity>"] }],
  "globalRiskScore": <0-100>,
  "regimeSignal": "<stable|transition|crisis>",
  "keyThreats": ["<threat1>", "<threat2>", "<threat3>", "<threat4>", "<threat5>"],
  "capitalFlowDirection": "<risk-on|risk-off|mixed>",
  "safeHavenDemand": "<low|moderate|high|extreme>",
  "intelligenceSummary": "<3-4 sentence executive briefing>"
}`,
        maxTokens: 3000,
        temperature: 0.25,
      });

      console.log(`geopolitical-data used provider: ${result.provider}`);
      geopoliticalInsights = JSON.parse(result.text);
      if (geopoliticalInsights.conflicts?.length > 0) {
        conflictEvents = geopoliticalInsights.conflicts;
      }
    } catch (e) { console.error("AI geo error (using fallback):", e); }

    // 3. Compute high-entropy zones
    const highEntropyZones = conflictEvents
      .filter((c: any) => c.severity > 0.5)
      .map((conflict: any) => {
        const nearbyForex = forexResults.filter(f => Math.sqrt(Math.pow(f.lat - conflict.lat, 2) + Math.pow(f.lng - conflict.lng, 2)) < 20);
        const currencyStress = nearbyForex.reduce((max, f) => Math.max(max, Math.abs(f.change24h)), 0);
        const entropyScore = (conflict.severity * 50) + (currencyStress * 10) + ((conflict.escalationProb || 0) * 20);
        return { ...conflict, currencyStress, entropyScore, isHighEntropy: entropyScore > 30 || (conflict.severity > 0.7 && currencyStress > 1), affectedCurrencies: nearbyForex.filter(f => f.isStressed).map(f => f.currency) };
      })
      .filter((z: any) => z.isHighEntropy);

    return new Response(JSON.stringify({
      conflictEvents,
      forexVolatility: forexResults,
      highEntropyZones,
      tradeHubs,
      supplyChainRisks: geopoliticalInsights.supplyChainRisks || FALLBACK_SUPPLY_CHAINS,
      globalRiskScore: geopoliticalInsights.globalRiskScore || 62,
      regimeSignal: geopoliticalInsights.regimeSignal || "transition",
      keyThreats: geopoliticalInsights.keyThreats || ["Iran-Israel escalation risk", "Red Sea shipping disruptions", "Ukraine-Russia energy war", "China-Taiwan semiconductor risk", "Global inflation persistence"],
      capitalFlowDirection: geopoliticalInsights.capitalFlowDirection || "mixed",
      safeHavenDemand: geopoliticalInsights.safeHavenDemand || "moderate",
      intelligenceSummary: geopoliticalInsights.intelligenceSummary || "Global risk landscape remains elevated with multiple active conflicts. Iran-Israel tensions and Red Sea shipping attacks continue to pressure energy and freight markets. Ukraine-Russia war sustains European energy risk premium. Capital flows remain mixed with selective risk-on in US tech.",
      timestamp: Date.now(),
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  } catch (error) {
    console.error("Geopolitical data error:", error);
    return new Response(JSON.stringify({
      conflictEvents: FALLBACK_CONFLICTS,
      forexVolatility: [],
      highEntropyZones: [],
      tradeHubs,
      supplyChainRisks: FALLBACK_SUPPLY_CHAINS,
      globalRiskScore: 62,
      regimeSignal: "transition",
      keyThreats: ["Iran-Israel escalation", "Red Sea attacks", "Ukraine-Russia war", "China-Taiwan tensions"],
      capitalFlowDirection: "mixed",
      safeHavenDemand: "moderate",
      intelligenceSummary: "Fallback intelligence: Multiple active conflict zones globally. Markets in transition regime.",
      timestamp: Date.now(),
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" },
    });
  }
});
