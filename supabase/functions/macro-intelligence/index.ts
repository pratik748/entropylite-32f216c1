import "https://deno.land/x/xhr@0.1.0/mod.ts";
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface MacroIndicator {
  id: string;
  name: string;
  category: string;
  value: number | string;
  previousValue?: number | string;
  trend: "rising" | "falling" | "stable";
  impact: "high" | "medium" | "low";
  source: string;
  lastUpdated: string;
}

interface MacroRegime {
  regime: "expansion" | "slowdown" | "contraction" | "recovery";
  confidence: number;
  signals: string[];
}

// FRED API (free, no key needed for basic series)
async function fetchFRED(): Promise<MacroIndicator[]> {
  const indicators: MacroIndicator[] = [];
  const series = [
    { id: "DGS10", name: "US 10Y Yield", category: "rates", impact: "high" as const },
    { id: "DGS2", name: "US 2Y Yield", category: "rates", impact: "high" as const },
    { id: "T10Y2Y", name: "Yield Curve (10Y-2Y)", category: "rates", impact: "high" as const },
    { id: "UNRATE", name: "Unemployment Rate", category: "labor", impact: "high" as const },
    { id: "CPIAUCSL", name: "CPI (All Urban)", category: "inflation", impact: "high" as const },
    { id: "FEDFUNDS", name: "Fed Funds Rate", category: "rates", impact: "high" as const },
    { id: "M2SL", name: "M2 Money Supply", category: "monetary", impact: "medium" as const },
    { id: "VIXCLS", name: "VIX Close", category: "volatility", impact: "high" as const },
  ];

  const apiKey = Deno.env.get("ALPHAVANTAGE_API_KEY");

  for (const s of series) {
    try {
      // Use FRED's free JSON API
      const url = `https://api.stlouisfed.org/fred/series/observations?series_id=${s.id}&api_key=DEMO_KEY&file_type=json&sort_order=desc&limit=2`;
      const res = await fetch(url);
      if (!res.ok) { await res.text(); continue; }
      const data = await res.json();
      const obs = data.observations;
      if (!obs || obs.length === 0) continue;

      const current = parseFloat(obs[0].value);
      const previous = obs.length > 1 ? parseFloat(obs[1].value) : undefined;
      if (isNaN(current)) continue;

      const trend = previous !== undefined && !isNaN(previous)
        ? current > previous ? "rising" : current < previous ? "falling" : "stable"
        : "stable";

      indicators.push({
        id: s.id,
        name: s.name,
        category: s.category,
        value: current,
        previousValue: previous,
        trend,
        impact: s.impact,
        source: "FRED",
        lastUpdated: obs[0].date,
      });
    } catch (e) {
      console.error(`FRED ${s.id} failed:`, e);
    }
  }

  return indicators;
}

// World Bank API (free, no key)
async function fetchWorldBank(): Promise<MacroIndicator[]> {
  const indicators: MacroIndicator[] = [];
  const wbSeries = [
    { id: "NY.GDP.MKTP.KD.ZG", name: "World GDP Growth", impact: "high" as const },
    { id: "FP.CPI.TOTL.ZG", name: "Global Inflation", impact: "medium" as const },
  ];

  for (const s of wbSeries) {
    try {
      const url = `https://api.worldbank.org/v2/country/WLD/indicator/${s.id}?format=json&per_page=2&mrv=2`;
      const res = await fetch(url);
      if (!res.ok) { await res.text(); continue; }
      const data = await res.json();
      if (!data[1] || data[1].length === 0) continue;

      const current = data[1][0].value;
      const previous = data[1].length > 1 ? data[1][1].value : undefined;
      if (current === null) continue;

      indicators.push({
        id: s.id,
        name: s.name,
        category: "macro",
        value: parseFloat(current.toFixed(2)),
        previousValue: previous ? parseFloat(previous.toFixed(2)) : undefined,
        trend: previous ? (current > previous ? "rising" : current < previous ? "falling" : "stable") : "stable",
        impact: s.impact,
        source: "World Bank",
        lastUpdated: data[1][0].date,
      });
    } catch (e) {
      console.error(`World Bank ${s.id} failed:`, e);
    }
  }

  return indicators;
}

function classifyRegime(indicators: MacroIndicator[]): MacroRegime {
  const signals: string[] = [];
  let expansionScore = 0;

  const yieldCurve = indicators.find(i => i.id === "T10Y2Y");
  if (yieldCurve && typeof yieldCurve.value === "number") {
    if (yieldCurve.value < 0) { expansionScore -= 2; signals.push("Inverted yield curve → recession risk"); }
    else if (yieldCurve.value > 0.5) { expansionScore += 1; signals.push("Positive yield curve → expansion signal"); }
  }

  const unemployment = indicators.find(i => i.id === "UNRATE");
  if (unemployment && typeof unemployment.value === "number") {
    if (unemployment.value < 4) { expansionScore += 1; signals.push("Low unemployment → strong labor market"); }
    else if (unemployment.value > 6) { expansionScore -= 1; signals.push("High unemployment → labor weakness"); }
  }

  const cpi = indicators.find(i => i.id === "CPIAUCSL");
  if (cpi && cpi.trend === "rising") { signals.push("Rising CPI → inflationary pressure"); }

  const vix = indicators.find(i => i.id === "VIXCLS");
  if (vix && typeof vix.value === "number") {
    if (vix.value > 25) { expansionScore -= 1; signals.push("Elevated VIX → market stress"); }
    else if (vix.value < 15) { expansionScore += 1; signals.push("Low VIX → complacency/calm"); }
  }

  let regime: MacroRegime["regime"];
  if (expansionScore >= 2) regime = "expansion";
  else if (expansionScore >= 0) regime = "recovery";
  else if (expansionScore >= -1) regime = "slowdown";
  else regime = "contraction";

  return { regime, confidence: Math.min(90, 50 + Math.abs(expansionScore) * 15), signals };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const [fredData, wbData] = await Promise.all([fetchFRED(), fetchWorldBank()]);
    const allIndicators = [...fredData, ...wbData];
    const regime = classifyRegime(allIndicators);

    return new Response(JSON.stringify({
      indicators: allIndicators,
      regime,
      sources: { fred: fredData.length, worldBank: wbData.length },
      timestamp: Date.now(),
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("macro-intelligence error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
