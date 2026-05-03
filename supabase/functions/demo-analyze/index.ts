// Public no-auth demo endpoint. Fetches live Yahoo data for a ticker and
// returns a slim institutional snapshot: technicals, risk metrics,
// 5,000-path Monte Carlo, and recent headlines. No buyPrice/quantity needed.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

function clamp(v: number, lo: number, hi: number) { return Math.min(hi, Math.max(lo, v)); }
function mean(a: number[]) { return a.length ? a.reduce((s, x) => s + x, 0) / a.length : 0; }
function stdev(a: number[]) {
  if (a.length < 2) return 0;
  const m = mean(a);
  return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1));
}
function pctile(a: number[], p: number) {
  if (!a.length) return 0;
  const s = [...a].sort((x, y) => x - y);
  const i = clamp((s.length - 1) * p, 0, s.length - 1);
  const lo = Math.floor(i), hi = Math.ceil(i);
  return lo === hi ? s[lo] : s[lo] + (i - lo) * (s[hi] - s[lo]);
}

function normalizeTicker(raw: string) {
  const t = raw.trim().toUpperCase().replace(/\s+/g, "");
  if (!t) return "";
  return t;
}

function candidates(t: string) {
  const out = [t];
  if (!/\.(NS|BO)$/i.test(t) && !/[-=]/.test(t)) {
    out.push(`${t}.NS`, `${t}.BO`);
  }
  return out;
}

async function fetchYahoo(symbol: string) {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=6mo`;
    const res = await fetch(url, { headers: { "User-Agent": UA } });
    if (!res.ok) return null;
    const j = await res.json();
    const r = j?.chart?.result?.[0];
    if (!r?.meta?.regularMarketPrice) return null;
    const closes: number[] = (r.indicators?.quote?.[0]?.close || []).filter((x: any) => Number.isFinite(x));
    return {
      symbol: r.meta.symbol || symbol,
      currency: r.meta.currency || "USD",
      currentPrice: r.meta.regularMarketPrice,
      prevClose: r.meta.chartPreviousClose || r.meta.previousClose || 0,
      dayHigh: r.meta.regularMarketDayHigh || 0,
      dayLow: r.meta.regularMarketDayLow || 0,
      fiftyTwoHigh: r.meta.fiftyTwoWeekHigh || 0,
      fiftyTwoLow: r.meta.fiftyTwoWeekLow || 0,
      closes,
      exchange: r.meta.exchangeName || r.meta.fullExchangeName || "",
    };
  } catch { return null; }
}

async function fetchHeadlines(ticker: string): Promise<string[]> {
  try {
    const apiKey = Deno.env.get("NEWSDATA_API_KEY");
    if (!apiKey) return [];
    const url = `https://newsdata.io/api/1/news?apikey=${apiKey}&q=${encodeURIComponent(ticker)}&language=en&size=5`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const j = await res.json();
    return (j?.results || []).map((r: any) => String(r.title || "")).filter(Boolean).slice(0, 5);
  } catch { return []; }
}

// Box-Muller
function gauss(): number {
  const u = 1 - Math.random();
  const v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function monteCarlo(spot: number, mu: number, sigma: number, days: number, paths: number) {
  const dt = 1 / 252;
  const drift = (mu - 0.5 * sigma * sigma) * dt;
  const vol = sigma * Math.sqrt(dt);
  const finals: number[] = new Array(paths);
  let wins = 0;
  for (let p = 0; p < paths; p++) {
    let s = spot;
    for (let d = 0; d < days; d++) s *= Math.exp(drift + vol * gauss());
    finals[p] = s;
    if (s > spot) wins++;
  }
  finals.sort((a, b) => a - b);
  return {
    paths,
    days,
    median: pctile(finals, 0.5),
    p5: pctile(finals, 0.05),
    p95: pctile(finals, 0.95),
    profitProbability: Math.round((wins / paths) * 100),
    expected: mean(finals),
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const { ticker } = await req.json();
    const t = normalizeTicker(String(ticker || ""));
    if (!t || t.length > 20) {
      return new Response(JSON.stringify({ error: "Enter a valid ticker (e.g. AAPL, RELIANCE.NS, BTC-USD)" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    let snap: Awaited<ReturnType<typeof fetchYahoo>> = null;
    let resolved = t;
    for (const c of candidates(t)) {
      const s = await fetchYahoo(c);
      if (s) { snap = s; resolved = c; break; }
    }
    if (!snap || snap.closes.length < 30) {
      return new Response(JSON.stringify({ error: `Could not load data for "${t}". Try a different ticker.` }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const closes = snap.closes;
    const returns: number[] = [];
    for (let i = 1; i < closes.length; i++) returns.push(Math.log(closes[i] / closes[i - 1]));

    const sigmaDaily = stdev(returns);
    const muDaily = mean(returns);
    const annualVol = sigmaDaily * Math.sqrt(252) * 100;
    const annualMu = muDaily * 252;
    const annualSigma = sigmaDaily * Math.sqrt(252);

    // Technicals
    const recent20 = closes.slice(-20);
    const sma20 = mean(recent20);
    const sma50 = mean(closes.slice(-50));
    const sma200 = mean(closes.slice(-200));
    const stdev20 = stdev(recent20);
    const zScore = stdev20 > 0 ? (snap.currentPrice - sma20) / stdev20 : 0;
    const changePct = snap.prevClose ? ((snap.currentPrice - snap.prevClose) / snap.prevClose) * 100 : 0;
    const posIn52w = snap.fiftyTwoHigh > snap.fiftyTwoLow
      ? ((snap.currentPrice - snap.fiftyTwoLow) / (snap.fiftyTwoHigh - snap.fiftyTwoLow)) * 100
      : 50;
    const trend: "bullish" | "bearish" | "sideways" =
      snap.currentPrice > sma50 && sma50 > sma200 ? "bullish"
      : snap.currentPrice < sma50 && sma50 < sma200 ? "bearish"
      : "sideways";
    const support = Math.min(...closes.slice(-30));
    const resistance = Math.max(...closes.slice(-30));

    // Risk: 1-day VaR/CVaR from historical returns
    const lossPct = returns.map((r) => -r * 100).sort((a, b) => b - a);
    const var95 = pctile(lossPct, 0.95);
    const var99 = pctile(lossPct, 0.99);
    const tail = lossPct.filter((x) => x >= var95);
    const cvar95 = tail.length ? mean(tail) : var95;
    const downside = returns.filter((r) => r < 0);
    const downsideVol = stdev(downside) * Math.sqrt(252);
    const sharpe = annualSigma > 0 ? annualMu / annualSigma : 0;
    const sortino = downsideVol > 0 ? annualMu / downsideVol : 0;
    const maxDD = (() => {
      let peak = closes[0], mdd = 0;
      for (const c of closes) {
        if (c > peak) peak = c;
        const dd = (peak - c) / peak;
        if (dd > mdd) mdd = dd;
      }
      return mdd * 100;
    })();

    // Signal score
    let signal = 0;
    if (trend === "bullish") signal += 2;
    if (trend === "bearish") signal -= 2;
    if (zScore > 1.5) signal -= 1;
    if (zScore < -1.5) signal += 1;
    if (sharpe > 1) signal += 1;
    if (sharpe < -0.5) signal -= 1;
    if (posIn52w > 90) signal -= 1;
    if (posIn52w < 15) signal += 1;
    const verdict: "BUY" | "SELL" | "HOLD" =
      signal >= 2 ? "BUY" : signal <= -2 ? "SELL" : "HOLD";

    // Monte Carlo: 5k paths, 21 trading days
    const mc = monteCarlo(snap.currentPrice, annualMu, annualSigma, 21, 5000);

    // Headlines (best effort)
    const headlines = await fetchHeadlines(resolved.replace(/\.(NS|BO)$/, ""));

    const out = {
      ticker: resolved,
      currency: snap.currency,
      exchange: snap.exchange,
      currentPrice: Number(snap.currentPrice.toFixed(2)),
      changePct: Number(changePct.toFixed(2)),
      fiftyTwoHigh: snap.fiftyTwoHigh,
      fiftyTwoLow: snap.fiftyTwoLow,
      posIn52w: Math.round(posIn52w),
      technicals: {
        sma20: Number(sma20.toFixed(2)),
        sma50: Number(sma50.toFixed(2)),
        sma200: Number(sma200.toFixed(2)),
        zScore: Number(zScore.toFixed(2)),
        trend,
        support: Number(support.toFixed(2)),
        resistance: Number(resistance.toFixed(2)),
        annualVol: Number(annualVol.toFixed(1)),
      },
      risk: {
        var95: Number(var95.toFixed(2)),
        var99: Number(var99.toFixed(2)),
        cvar95: Number(cvar95.toFixed(2)),
        sharpe: Number(sharpe.toFixed(2)),
        sortino: Number(sortino.toFixed(2)),
        maxDrawdown: Number(maxDD.toFixed(1)),
      },
      monteCarlo: {
        paths: mc.paths,
        horizonDays: mc.days,
        median: Number(mc.median.toFixed(2)),
        p5: Number(mc.p5.toFixed(2)),
        p95: Number(mc.p95.toFixed(2)),
        expected: Number(mc.expected.toFixed(2)),
        profitProbability: mc.profitProbability,
      },
      verdict,
      signalScore: signal,
      headlines,
      generatedAt: new Date().toISOString(),
      demo: true,
    };

    return new Response(JSON.stringify(out), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || "Demo failed" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});