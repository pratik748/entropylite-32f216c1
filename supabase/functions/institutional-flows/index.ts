import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface OptionsFlow {
  ticker: string;
  putCallRatio: number;
  totalCallVolume: number;
  totalPutVolume: number;
  unusualActivity: boolean;
  impliedVolatility: number;
  signal: "bullish" | "bearish" | "neutral";
}

interface ETFFlow {
  symbol: string;
  name: string;
  sector: string;
  price: number;
  change: number;
  volume: number;
  flowSignal: "inflow" | "outflow" | "neutral";
}

interface InstitutionalPosition {
  fund: string;
  ticker: string;
  action: "increased" | "decreased" | "new" | "exited";
  shares: number;
  value: number;
  quarterReported: string;
}

// Fetch options data from Yahoo Finance
async function fetchOptionsFlow(tickers: string[]): Promise<OptionsFlow[]> {
  const flows: OptionsFlow[] = [];

  for (const ticker of tickers.slice(0, 5)) {
    try {
      const url = `https://query1.finance.yahoo.com/v7/finance/options/${ticker}`;
      const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
      if (!res.ok) { await res.text(); continue; }
      const data = await res.json();

      const chain = data.optionChain?.result?.[0];
      if (!chain) continue;

      const options = chain.options?.[0];
      if (!options) continue;

      const calls = options.calls || [];
      const puts = options.puts || [];

      const totalCallVol = calls.reduce((s: number, c: any) => s + (c.volume || 0), 0);
      const totalPutVol = puts.reduce((s: number, p: any) => s + (p.volume || 0), 0);
      const pcRatio = totalCallVol > 0 ? totalPutVol / totalCallVol : 1;

      const avgIV = calls.length > 0
        ? calls.reduce((s: number, c: any) => s + (c.impliedVolatility || 0), 0) / calls.length
        : 0.3;

      const unusual = totalCallVol + totalPutVol > 10000 || pcRatio > 1.5 || pcRatio < 0.5;

      flows.push({
        ticker,
        putCallRatio: parseFloat(pcRatio.toFixed(3)),
        totalCallVolume: totalCallVol,
        totalPutVolume: totalPutVol,
        unusualActivity: unusual,
        impliedVolatility: parseFloat((avgIV * 100).toFixed(1)),
        signal: pcRatio < 0.7 ? "bullish" : pcRatio > 1.3 ? "bearish" : "neutral",
      });
    } catch (e) {
      console.error(`Options flow ${ticker}:`, e);
    }
  }

  return flows;
}

// Fetch ETF sector rotation signals
async function fetchETFFlows(): Promise<ETFFlow[]> {
  const etfs = [
    { symbol: "SPY", name: "S&P 500", sector: "Broad Market" },
    { symbol: "QQQ", name: "NASDAQ 100", sector: "Technology" },
    { symbol: "XLF", name: "Financial Select", sector: "Financials" },
    { symbol: "XLE", name: "Energy Select", sector: "Energy" },
    { symbol: "XLV", name: "Health Care Select", sector: "Healthcare" },
    { symbol: "XLK", name: "Technology Select", sector: "Technology" },
    { symbol: "XLI", name: "Industrial Select", sector: "Industrials" },
    { symbol: "GLD", name: "Gold Trust", sector: "Commodities" },
    { symbol: "TLT", name: "20+ Year Treasury", sector: "Bonds" },
    { symbol: "HYG", name: "High Yield Corp Bond", sector: "Credit" },
  ];

  const flows: ETFFlow[] = [];
  const symbols = etfs.map(e => e.symbol).join(",");

  try {
    const url = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${symbols}`;
    const res = await fetch(url, { headers: { "User-Agent": "Mozilla/5.0" } });
    if (!res.ok) { await res.text(); return flows; }
    const data = await res.json();

    for (const quote of data.quoteResponse?.result || []) {
      const etf = etfs.find(e => e.symbol === quote.symbol);
      if (!etf) continue;

      const vol = quote.regularMarketVolume || 0;
      const avgVol = quote.averageDailyVolume10Day || vol;
      const volRatio = avgVol > 0 ? vol / avgVol : 1;
      const change = quote.regularMarketChangePercent || 0;

      flows.push({
        symbol: etf.symbol,
        name: etf.name,
        sector: etf.sector,
        price: quote.regularMarketPrice || 0,
        change: parseFloat(change.toFixed(2)),
        volume: vol,
        flowSignal: volRatio > 1.3 && change > 0 ? "inflow" : volRatio > 1.3 && change < 0 ? "outflow" : "neutral",
      });
    }
  } catch (e) {
    console.error("ETF flow fetch failed:", e);
  }

  return flows;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const tickers: string[] = body.tickers || ["AAPL", "MSFT", "GOOGL", "TSLA", "NVDA"];

    const [optionsFlow, etfFlows] = await Promise.all([
      fetchOptionsFlow(tickers),
      fetchETFFlows(),
    ]);

    // Compute aggregate signals
    const bullishOptions = optionsFlow.filter(o => o.signal === "bullish").length;
    const bearishOptions = optionsFlow.filter(o => o.signal === "bearish").length;
    const inflows = etfFlows.filter(e => e.flowSignal === "inflow").length;
    const outflows = etfFlows.filter(e => e.flowSignal === "outflow").length;

    const smartMoneyDirection = (bullishOptions + inflows) > (bearishOptions + outflows) ? "RISK_ON" :
      (bearishOptions + outflows) > (bullishOptions + inflows) ? "RISK_OFF" : "NEUTRAL";

    return new Response(JSON.stringify({
      optionsFlow,
      etfFlows,
      aggregate: {
        smartMoneyDirection,
        optionsSentiment: { bullish: bullishOptions, bearish: bearishOptions, neutral: optionsFlow.length - bullishOptions - bearishOptions },
        etfSentiment: { inflows, outflows, neutral: etfFlows.length - inflows - outflows },
        unusualActivityCount: optionsFlow.filter(o => o.unusualActivity).length,
      },
      timestamp: Date.now(),
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("institutional-flows error:", error);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
