import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { callAI } from "../_shared/callAI.ts";
import { safeParseJSON } from "../_shared/safeParseJSON.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

async function fetchYahooQuote(symbol: string) {
  const t = Date.now();
  
  // Try v8 first
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=5d&_t=${t}`;
    const res = await fetch(url, {
      headers: { "User-Agent": UA, "Accept": "application/json", "Cache-Control": "no-cache, no-store" },
    });
    if (res.ok) {
      const data = await res.json();
      const meta = data?.chart?.result?.[0]?.meta;
      if (meta?.regularMarketPrice && meta.regularMarketPrice > 0) {
        const prevClose = meta.chartPreviousClose || meta.previousClose || 0;
        const currentPrice = meta.regularMarketPrice;
        return { price: currentPrice, prevClose, change: currentPrice - prevClose, changePct: prevClose > 0 ? ((currentPrice - prevClose) / prevClose) * 100 : 0, currency: meta.currency || "USD", volume: meta.regularMarketVolume || 0 };
      }
    }
  } catch { /* fall through */ }

  // Fallback to v10 quoteSummary
  try {
    const url = `https://query2.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=price`;
    const res = await fetch(url, {
      headers: { "User-Agent": UA, "Cache-Control": "no-cache, no-store" },
    });
    if (res.ok) {
      const data = await res.json();
      const pm = data?.quoteSummary?.result?.[0]?.price;
      const currentPrice = pm?.regularMarketPrice?.raw;
      const prevClose = pm?.regularMarketPreviousClose?.raw || 0;
      if (currentPrice && currentPrice > 0) {
        return { price: currentPrice, prevClose, change: currentPrice - prevClose, changePct: prevClose > 0 ? ((currentPrice - prevClose) / prevClose) * 100 : 0, currency: pm?.currency || "USD", volume: pm?.regularMarketVolume?.raw || 0 };
      }
    }
  } catch { /* fall through */ }

  return null;
}

function getRegionContext(region: string) {
  const regionMap: Record<string, { focus: string; indices: string; centralBank: string; currency: string }> = {
    India: {
      focus: "Indian equity markets (NIFTY 50, SENSEX, BANK NIFTY)",
      indices: "NIFTY 50, SENSEX, BANK NIFTY",
      centralBank: "RBI (Reserve Bank of India)",
      currency: "INR/USD",
    },
    Europe: {
      focus: "European markets (FTSE 100, DAX, CAC 40, Euro Stoxx 50)",
      indices: "FTSE 100, DAX, CAC 40, Euro Stoxx 50",
      centralBank: "ECB (European Central Bank)",
      currency: "EUR/USD, GBP/USD",
    },
    Asia: {
      focus: "Asian markets (Nikkei 225, Hang Seng, Shanghai Composite, KOSPI)",
      indices: "Nikkei 225, Hang Seng, Shanghai, KOSPI",
      centralBank: "BOJ, PBOC",
      currency: "USD/JPY, USD/CNY",
    },
    US: {
      focus: "US markets (S&P 500, NASDAQ, Dow Jones, Russell 2000)",
      indices: "S&P 500, NASDAQ, Dow Jones, Russell 2000",
      centralBank: "Federal Reserve",
      currency: "DXY, USD",
    },
  };
  return regionMap[region] || regionMap.US;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    // Market data is public (used on landing page) — no auth required.
    const body = await req.json().catch(() => ({}));
    const provider = body.provider || "mistral";
    const indiaMode = body.indiaMode === true;
    const region = indiaMode ? "India" : (body.region || "All");
    const requestedTickers: string[] = Array.isArray(body.tickers) ? body.tickers : [];
    const allIndices = [
      { symbol: "^GSPC", name: "S&P 500", region: "US" },
      { symbol: "^IXIC", name: "NASDAQ", region: "US" },
      { symbol: "^DJI", name: "Dow Jones", region: "US" },
      { symbol: "^RUT", name: "Russell 2000", region: "US" },
      { symbol: "^FTSE", name: "FTSE 100", region: "Europe" },
      { symbol: "^GDAXI", name: "DAX", region: "Europe" },
      { symbol: "^FCHI", name: "CAC 40", region: "Europe" },
      { symbol: "^STOXX50E", name: "Euro Stoxx 50", region: "Europe" },
      { symbol: "^N225", name: "Nikkei 225", region: "Asia" },
      { symbol: "^HSI", name: "Hang Seng", region: "Asia" },
      { symbol: "000001.SS", name: "Shanghai", region: "Asia" },
      { symbol: "^KS11", name: "KOSPI", region: "Asia" },
      { symbol: "^NSEI", name: "NIFTY 50", region: "India" },
      { symbol: "^BSESN", name: "SENSEX", region: "India" },
      { symbol: "^NSEBANK", name: "BANK NIFTY", region: "India" },
    ];

    const [indexResults, usdInrData, crudeData, vixData, goldData, eurUsdData, gbpUsdData, btcData, ethData, silverData] = await Promise.all([
      Promise.all(allIndices.map(async (idx) => {
        try {
          const q = await fetchYahooQuote(idx.symbol);
          if (!q) return null;
          return { ...idx, price: q.price, change: q.change, changePct: q.changePct, currency: q.currency, volume: q.volume };
        } catch { return null; }
      })),
      fetchYahooQuote("USDINR=X").catch(() => null),
      fetchYahooQuote("BZ=F").catch(() => null),
      fetchYahooQuote("^VIX").catch(() => null),
      fetchYahooQuote("GC=F").catch(() => null),
      fetchYahooQuote("EURUSD=X").catch(() => null),
      fetchYahooQuote("GBPUSD=X").catch(() => null),
      fetchYahooQuote("BTC-USD").catch(() => null),
      fetchYahooQuote("ETH-USD").catch(() => null),
      fetchYahooQuote("SI=F").catch(() => null),
    ]);

    let indexData = indexResults.filter(Boolean);

    // When indiaMode, filter indices to India only
    if (indiaMode) {
      indexData = indexData.filter((i: any) => i?.region === "India");
    }

    // Resolve any extra tickers the client asked for that aren't already in indexData
    if (requestedTickers.length > 0) {
      const have = new Set(indexData.map((i: any) => i?.symbol));
      const missing = requestedTickers.filter((s) => s && !have.has(s));
      const extra = await Promise.all(missing.map(async (sym) => {
        try {
          const q = await fetchYahooQuote(sym);
          if (!q) return null;
          return { symbol: sym, name: sym, region: "Other", price: q.price, change: q.change, changePct: q.changePct, currency: q.currency, volume: q.volume };
        } catch { return null; }
      }));
      indexData = [...indexData, ...extra.filter(Boolean)];
    }

    const indiaSectorSymbols = [
      { symbol: "NIFTYBEES.NS", name: "Nifty 50" }, { symbol: "BANKBEES.NS", name: "Bank Nifty" },
      { symbol: "ITBEES.NS", name: "IT" }, { symbol: "PSUBNKBEES.NS", name: "PSU Banks" },
      { symbol: "PHARMABEES.NS", name: "Pharma" }, { symbol: "CPSEETF.NS", name: "CPSE/PSU" },
      { symbol: "GOLDBEES.NS", name: "Gold" }, { symbol: "JUNIORBEES.NS", name: "Nifty Next 50" },
    ];

    const globalSectorSymbols = [
      { symbol: "XLK", name: "Technology" }, { symbol: "XLF", name: "Financials" },
      { symbol: "XLE", name: "Energy" }, { symbol: "XLV", name: "Healthcare" },
      { symbol: "XLI", name: "Industrials" }, { symbol: "XLC", name: "Communication" },
      { symbol: "XLRE", name: "Real Estate" }, { symbol: "XLU", name: "Utilities" },
      { symbol: "XLY", name: "Consumer Disc." }, { symbol: "XLP", name: "Consumer Staples" },
    ];

    const sectorSymbols = indiaMode ? indiaSectorSymbols : globalSectorSymbols;

    const sectorResults = await Promise.all(sectorSymbols.map(async (sec) => {
      try {
        const q = await fetchYahooQuote(sec.symbol);
        if (!q) return null;
        return { name: sec.name, price: q.price, change: q.change, changePct: q.changePct };
      } catch { return null; }
    }));
    const sectorData = sectorResults.filter(Boolean);

    const realUsdInr = usdInrData?.price || 0;
    const realCrude = crudeData?.price || 0;
    const realVix = vixData?.price || 0;
    const realGold = goldData?.price || 0;
    const realEurUsd = eurUsdData?.price || 0;
    const realGbpUsd = gbpUsdData?.price || 0;
    const realBtc = btcData?.price || 0;
    const realEth = ethData?.price || 0;
    const realSilver = silverData?.price || 0;

    // ── Deterministic macro reads from the REAL quotes we just fetched ──
    // Top movers are measured moves, never AI-invented names/percentages.
    const regionScoped = region === "All"
      ? indexData
      : indexData.filter((i: any) => i?.region === region);
    const moverPool = (regionScoped.length > 0 ? regionScoped : indexData) as any[];
    const topMovers = [...moverPool, ...sectorData as any[]]
      .filter((m: any) => m && Number.isFinite(m.changePct))
      .sort((a: any, b: any) => Math.abs(b.changePct) - Math.abs(a.changePct))
      .slice(0, 5)
      .map((m: any) => ({ name: m.name, change: Number(m.changePct.toFixed(2)) }));

    // Breadth: share of tracked indices trading up (measured).
    const upCount = moverPool.filter((i: any) => (i?.changePct ?? 0) > 0).length;
    const breadthPct = moverPool.length > 0 ? Math.round((upCount / moverPool.length) * 100) : null;

    // Mood score, computed from data per the stated formula:
    // VIX level 40% (14→+40 … 30→−40), index breadth 30%, avg index move 30%.
    const vixComponent = realVix > 0 ? Math.max(-40, Math.min(40, ((22 - realVix) / 8) * 40)) : 0;
    const breadthComponent = breadthPct != null ? ((breadthPct - 50) / 50) * 30 : 0;
    const avgMove = moverPool.length > 0
      ? moverPool.reduce((s: number, i: any) => s + (i?.changePct ?? 0), 0) / moverPool.length
      : 0;
    const moveComponent = Math.max(-30, Math.min(30, avgMove * 20));
    const computedMoodScore = Math.round(vixComponent + breadthComponent + moveComponent);
    const computedMood = realVix > 22 && avgMove < 0
      ? "Risk-Off"
      : computedMoodScore > 25
        ? "Bullish"
        : computedMoodScore < -25
          ? "Bearish"
          : Math.abs(vixComponent) > 20 && Math.sign(vixComponent) !== Math.sign(moveComponent)
            ? "Cautious"
            : "Neutral";

    let aiMacro: any = null;
    let aiProviderUsed: string | undefined;
    try {
      const regionCtx = getRegionContext(region === "All" ? "US" : region);
      
      // Build region-specific index data for prompt
      const relevantIndices = region === "All"
        ? indexData
        : indexData.filter((i: any) => i?.region === region || region === "All");
      const indexSummary = relevantIndices.slice(0, 5).map((i: any) => `${i?.name}: ${i?.changePct?.toFixed(2)}%`).join(", ");

      // Resolve a CONCRETE label for the prompt — never literally pass "All" into
      // the JSON template (the model treats "All" as ambiguous and often returns
      // empty keyEvents/outlook).
      const focusLabel = region === "All" ? "global" : region;
      const fxLine = region === "India"
        ? `USD/INR: ${realUsdInr.toFixed(2)}`
        : region === "Europe"
          ? `EUR/USD: ${realEurUsd.toFixed(4)}, GBP/USD: ${realGbpUsd.toFixed(4)}`
          : region === "Asia"
            ? `USD/JPY proxy via DXY (n/a here)`
            : `DXY/USD majors: EUR/USD ${realEurUsd.toFixed(4)}, GBP/USD ${realGbpUsd.toFixed(4)}`;

      const moversLine = topMovers.map((m) => `${m.name} ${m.change > 0 ? "+" : ""}${m.change}%`).join(", ");
      const result = await callAI({
        provider,
        systemPrompt: `You are a sell-side global macro strategist writing morning commentary. You are given LIVE measured prices, the measured top movers, and a mood score COMPUTED from that data. Your job is ONLY interpretation — you translate the given numbers into a regional read.

HARD RULES — the desk audits every claim:
1. NEVER invent a number. Do not state fund-flow amounts, price levels, or percentage moves that are not in the data provided. If you don't have a figure, describe direction qualitatively or omit it.
2. NEVER present an event as scheduled fact unless you are confident it is a recurring, well-known fixture (e.g. monthly CPI, FOMC cycle). watchItems are things to CHECK, phrased as watch items ("Watch for RBI MPC commentary"), not as confirmed calendar entries with dates.
3. outlook: EXACTLY 3 sentences — (i) regime read from the given data, (ii) what to watch next, (iii) the asymmetric risk. Ground every claim in the numbers provided.
4. sectorRotation: describe rotation ONLY if the given sector moves support it; otherwise say what the sector tape shows.
5. riskAppetite: 1 sentence, defended by the given VIX/breadth/mover data.
6. It is acceptable — preferred — to say a signal is unclear when the data is mixed.

VOICE: trading-desk concise, no hedging filler, no marketing language. Strings ≤ 220 chars. Return ONLY valid JSON.`,
        userPrompt: `Today is ${new Date().toISOString().split("T")[0]}. Regional focus: ${regionCtx.focus} (label: ${focusLabel}).

MEASURED DATA (the only numbers you may cite):
Indices: ${indexSummary}
VIX: ${realVix.toFixed(2)}, Crude: $${realCrude.toFixed(2)}, Gold: $${realGold.toFixed(0)}, BTC: $${realBtc.toFixed(0)}, ${fxLine}
Top movers (measured): ${moversLine || "none available"}
Breadth: ${breadthPct != null ? `${breadthPct}% of tracked indices up` : "unavailable"}
Computed mood score: ${computedMoodScore} (${computedMood})

Focus on ${regionCtx.indices} and ${regionCtx.centralBank} policy. Provide:
{
  "watchItems": ["<watch item 1 for ${focusLabel}>", "<watch item 2>", "<watch item 3>"],
  "outlook": "<3-sentence ${focusLabel} read grounded in the measured data above>",
  "sectorRotation": "<what the given sector tape shows for ${focusLabel}>",
  "riskAppetite": "<1 sentence defended by the given data>"
}`,
        maxTokens: 800,
        temperature: 0.3,
        provider,
      });

      console.log(`market-data used provider: ${result.provider}, region: ${region}, indiaMode: ${indiaMode}`);
      aiProviderUsed = result.provider;
      aiMacro = safeParseJSON(result.text);
      if (!aiMacro?.watchItems?.length || !aiMacro?.outlook) {
        console.warn(`market-data: AI returned incomplete commentary (watchItems=${aiMacro?.watchItems?.length || 0}, outlook=${aiMacro?.outlook ? "yes" : "no"}) — provider=${result.provider}`);
      }
    } catch (e) { console.error("AI macro error:", e); }

    const macro = {
      // Computed from measured quotes — formula documented above; never AI-invented.
      marketMood: computedMood,
      moodScore: computedMoodScore,
      moodBasis: "computed: VIX 40% + index breadth 30% + avg index move 30%",
      // No FII/DII flow data source is connected. We report that honestly
      // instead of letting a model fabricate plausible-sounding figures.
      fiiFlow: null,
      diiFlow: null,
      flowDataAvailable: false,
      breadthPct,
      vix: realVix, usdInr: realUsdInr, crudeBrent: realCrude, goldPrice: realGold,
      silverPrice: realSilver, eurUsd: realEurUsd, gbpUsd: realGbpUsd, btcUsd: realBtc, ethUsd: realEth,
      // Measured moves from the quotes fetched above — not model output.
      topMovers,
      // Model-suggested things to check — NOT confirmed calendar entries.
      keyEvents: aiMacro?.watchItems || [],
      outlook: aiMacro?.outlook || "",
      sectorRotation: aiMacro?.sectorRotation || "",
      riskAppetite: aiMacro?.riskAppetite || "",
      aiProvider: aiProviderUsed,
      // Fields whose text is model interpretation (grounded in measured data).
      aiGeneratedFields: ["keyEvents", "outlook", "sectorRotation", "riskAppetite"],
    };

    return new Response(JSON.stringify({ indices: indexData, sectors: sectorData, macro, timestamp: Date.now() }), {
      headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0" },
    });
  } catch (error) {
    // If something downstream threw a Response (e.g. auth helpers), forward it verbatim
    if (error instanceof Response) return error;
    console.error("Error in market-data:", error);
    return new Response(JSON.stringify({ error: "Failed to fetch market data", details: error.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }
});
