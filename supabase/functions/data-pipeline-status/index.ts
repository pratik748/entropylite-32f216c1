import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface SourceStatus {
  source: string;
  type: string;
  status: "LIVE" | "DEGRADED" | "DOWN" | "SCHEDULED";
  latency: number;
  lastCheck: string;
  credibilityScore: number;
  recordsEstimate: number;
  endpoint: string;
}

async function checkEndpoint(name: string, url: string, type: string, credibility: number): Promise<SourceStatus> {
  const start = Date.now();
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    const res = await fetch(url, {
      method: "HEAD",
      signal: controller.signal,
      headers: { "User-Agent": "EntropyLite/1.0" },
    });
    clearTimeout(timeout);
    const latency = Date.now() - start;
    await res.text().catch(() => {});

    return {
      source: name,
      type,
      status: res.ok ? (latency > 3000 ? "DEGRADED" : "LIVE") : "DEGRADED",
      latency,
      lastCheck: new Date().toISOString(),
      credibilityScore: credibility,
      recordsEstimate: 0,
      endpoint: url.split("?")[0],
    };
  } catch {
    return {
      source: name,
      type,
      status: "DOWN",
      latency: Date.now() - start,
      lastCheck: new Date().toISOString(),
      credibilityScore: credibility,
      recordsEstimate: 0,
      endpoint: url.split("?")[0],
    };
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const checks = [
      checkEndpoint("Yahoo Finance", "https://query1.finance.yahoo.com/v8/finance/chart/AAPL?interval=1d&range=1d", "Market Data", 92),
      checkEndpoint("FRED (St. Louis Fed)", "https://api.stlouisfed.org/fred/series?series_id=DGS10&api_key=DEMO_KEY&file_type=json", "Economic", 98),
      checkEndpoint("World Bank", "https://api.worldbank.org/v2/country/WLD/indicator/NY.GDP.MKTP.KD.ZG?format=json&per_page=1", "Economic", 97),
      checkEndpoint("SEC EDGAR", "https://efts.sec.gov/LATEST/search-index?q=AAPL&forms=10-K&from=0&size=1", "Regulatory", 99),
      checkEndpoint("GDELT News", "https://api.gdeltproject.org/api/v2/doc/doc?query=finance&mode=artlist&maxrecords=1&format=json", "News", 78),
      checkEndpoint("Wikipedia Pageviews", "https://wikimedia.org/api/rest_v1/metrics/pageviews/per-article/en.wikipedia/all-access/all-agents/Apple_Inc./daily/20250101/20250102", "Alternative", 70),
      checkEndpoint("GitHub API", "https://api.github.com/orgs/microsoft/repos?per_page=1", "Alternative", 65),
      checkEndpoint("newsdata.io", "https://newsdata.io/api/1/news?apikey=test&q=markets&language=en", "News", 80),
      checkEndpoint("Alpha Vantage", "https://www.alphavantage.co/query?function=TIME_SERIES_DAILY&symbol=AAPL&apikey=demo", "Market Data", 88),
      checkEndpoint("Finnhub", "https://finnhub.io/api/v1/quote?symbol=AAPL&token=demo", "Market Data", 85),
    ];

    const results = await Promise.all(checks);

    // Estimate records based on source type
    const recordEstimates: Record<string, number> = {
      "Market Data": 15000, "Economic": 2500, "News": 5000, "Regulatory": 1200, "Alternative": 800,
    };
    for (const r of results) {
      r.recordsEstimate = recordEstimates[r.type] || 1000;
    }

    const liveCount = results.filter(r => r.status === "LIVE").length;
    const avgLatency = Math.round(results.reduce((s, r) => s + r.latency, 0) / results.length);
    const totalRecords = results.reduce((s, r) => s + r.recordsEstimate, 0);

    return new Response(JSON.stringify({
      sources: results,
      summary: {
        total: results.length,
        live: liveCount,
        degraded: results.filter(r => r.status === "DEGRADED").length,
        down: results.filter(r => r.status === "DOWN").length,
        avgLatency,
        totalRecordsEstimate: totalRecords,
        overallHealth: liveCount / results.length * 100,
        avgCredibility: Math.round(results.reduce((s, r) => s + r.credibilityScore, 0) / results.length),
      },
      timestamp: Date.now(),
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("data-pipeline-status error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
