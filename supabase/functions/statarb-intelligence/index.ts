// supabase/functions/statarb-intelligence/index.ts
//
// Server-side compute for the StatArb Intelligence Layer.
// Heavy lifts only: cointegration + HMM Baum-Welch fit on full history.
// Cheap real-time updates (Viterbi step, OU on a rolling window, MC sims)
// are done client-side from the model returned here.
//
// Pure overlay — never overrides base StatArb signals.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { requireAuth } from "../_shared/auth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";

// ── In-memory cache (per cold-start) ─────────────────────────────────
const CACHE = new Map<string, { ts: number; payload: unknown }>();
const CACHE_TTL_MS = 5 * 60 * 1000;

// ── Yahoo historical fetch ───────────────────────────────────────────
async function fetchClose(symbol: string, range = "1y", interval = "1d"): Promise<number[] | null> {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${interval}&range=${range}&_t=${Date.now()}`;
    const res = await fetch(url, { headers: { "User-Agent": UA, "Cache-Control": "no-cache" } });
    if (!res.ok) return null;
    const data = await res.json();
    const closes = data?.chart?.result?.[0]?.indicators?.quote?.[0]?.close ?? [];
    return closes.filter((c: number | null) => c != null && c > 0) as number[];
  } catch {
    return null;
  }
}

// ── Math: OLS, ADF, Engle-Granger cointegration ──────────────────────
function ols(x: number[], y: number[]): { alpha: number; beta: number } {
  const n = Math.min(x.length, y.length);
  if (n < 3) return { alpha: 0, beta: 0 };
  let sx = 0, sy = 0, sxx = 0, sxy = 0;
  for (let i = 0; i < n; i++) { sx += x[i]; sy += y[i]; sxx += x[i] * x[i]; sxy += x[i] * y[i]; }
  const denom = n * sxx - sx * sx;
  const beta = denom === 0 ? 0 : (n * sxy - sx * sy) / denom;
  return { alpha: (sy - beta * sx) / n, beta };
}

function adfTest(series: number[]): number {
  const n = series.length;
  if (n < 20) return 0;
  const dy: number[] = [], yLag: number[] = [], dyLag: number[] = [];
  for (let i = 2; i < n; i++) {
    dy.push(series[i] - series[i - 1]);
    yLag.push(series[i - 1]);
    dyLag.push(series[i - 1] - series[i - 2]);
  }
  const m = dy.length;
  let s11 = 0, s12 = 0, s22 = 0, t1 = 0, t2 = 0;
  for (let i = 0; i < m; i++) {
    s11 += yLag[i] * yLag[i]; s12 += yLag[i] * dyLag[i]; s22 += dyLag[i] * dyLag[i];
    t1 += yLag[i] * dy[i]; t2 += dyLag[i] * dy[i];
  }
  const det = s11 * s22 - s12 * s12;
  if (Math.abs(det) < 1e-12) return 0;
  const rho = (s22 * t1 - s12 * t2) / det;
  const gamma = (s11 * t2 - s12 * t1) / det;
  let rss = 0;
  for (let i = 0; i < m; i++) {
    const e = dy[i] - rho * yLag[i] - gamma * dyLag[i];
    rss += e * e;
  }
  const sigma2 = rss / Math.max(1, m - 2);
  const seRho = Math.sqrt(Math.max(0, sigma2 * s22 / det));
  return seRho > 0 ? rho / seRho : 0;
}

function adfPValue(t: number): number {
  if (t <= -3.90) return 0.01;
  if (t <= -3.34) return 0.01 + 0.04 * ((t + 3.90) / (-3.34 + 3.90));
  if (t <= -3.04) return 0.05 + 0.05 * ((t + 3.34) / (-3.04 + 3.34));
  if (t <= 0)    return 0.10 + 0.40 * ((t + 3.04) / (0 + 3.04));
  return Math.min(0.99, 0.50 + t * 0.1);
}

function cointegrate(x: number[], y: number[]) {
  const n = Math.min(x.length, y.length);
  const xs = x.slice(0, n), ys = y.slice(0, n);
  const { alpha, beta } = ols(xs, ys);
  const residuals = ys.map((v, i) => v - (alpha + beta * xs[i]));
  const adfStat = adfTest(residuals);
  const pValue = adfPValue(adfStat);
  return {
    beta, alpha, adfStat, pValue,
    isCointegrated: pValue < 0.05 && residuals.length >= 30,
    residuals,
  };
}

// ── HMM (Baum-Welch fit) ─────────────────────────────────────────────
const REGIMES = ["mean-reverting", "trending", "volatile", "broken"] as const;
const EPS = 1e-12;

function gaussianPdf(x: number, mu: number, sigma: number): number {
  const s = Math.max(sigma, 1e-6);
  const z = (x - mu) / s;
  return Math.exp(-0.5 * z * z) / (s * Math.sqrt(2 * Math.PI));
}

interface HMMModel {
  initial: number[];
  transitions: number[][];
  emissionMeans: number[][];
  emissionStds: number[][];
}

function emissionProb(m: HMMModel, k: number, o: [number, number]): number {
  return gaussianPdf(o[0], m.emissionMeans[k][0], m.emissionStds[k][0]) *
         gaussianPdf(o[1], m.emissionMeans[k][1], m.emissionStds[k][1]);
}

function buildObservations(prices: number[], volWindow = 10): [number, number][] {
  if (prices.length < volWindow + 2) return [];
  const rets: number[] = [];
  for (let i = 1; i < prices.length; i++) rets.push(Math.log(prices[i] / prices[i - 1]));
  const out: [number, number][] = [];
  for (let i = volWindow; i < rets.length; i++) {
    const win = rets.slice(i - volWindow, i);
    const m = win.reduce((s, v) => s + v, 0) / win.length;
    const v = win.reduce((s, x) => s + (x - m) ** 2, 0) / win.length;
    out.push([rets[i], Math.sqrt(v)]);
  }
  return out;
}

function defaultModel(obs: [number, number][]): HMMModel {
  const n = Math.max(1, obs.length);
  const meanRet = obs.reduce((s, o) => s + o[0], 0) / n;
  const meanVol = obs.reduce((s, o) => s + o[1], 0) / n;
  const stdRet = Math.sqrt(obs.reduce((s, o) => s + (o[0] - meanRet) ** 2, 0) / n) || 0.01;
  const stdVol = Math.sqrt(obs.reduce((s, o) => s + (o[1] - meanVol) ** 2, 0) / n) || 0.005;
  return {
    initial: [0.4, 0.3, 0.2, 0.1],
    transitions: [
      [0.85, 0.07, 0.05, 0.03],
      [0.07, 0.85, 0.05, 0.03],
      [0.10, 0.10, 0.75, 0.05],
      [0.05, 0.05, 0.10, 0.80],
    ],
    emissionMeans: [
      [meanRet * 0.2, meanVol * 0.6],
      [meanRet * 1.5, meanVol * 0.9],
      [meanRet,       meanVol * 1.6],
      [meanRet - 2 * stdRet, meanVol * 2.4],
    ],
    emissionStds: [
      [stdRet * 0.6, stdVol * 0.6],
      [stdRet * 1.0, stdVol * 0.8],
      [stdRet * 1.4, stdVol * 1.2],
      [stdRet * 2.0, stdVol * 1.8],
    ],
  };
}

function baumWelch(obs: [number, number][], iterations = 25): HMMModel {
  if (obs.length < 20) return defaultModel(obs);
  let model = defaultModel(obs);
  const K = REGIMES.length, T = obs.length;

  for (let iter = 0; iter < iterations; iter++) {
    const c = new Array(T).fill(0);
    const alpha = Array.from({ length: T }, () => new Array(K).fill(0));
    const beta  = Array.from({ length: T }, () => new Array(K).fill(0));

    for (let k = 0; k < K; k++) alpha[0][k] = model.initial[k] * emissionProb(model, k, obs[0]);
    c[0] = alpha[0].reduce((a, b) => a + b, 0) || EPS;
    for (let k = 0; k < K; k++) alpha[0][k] /= c[0];

    for (let t = 1; t < T; t++) {
      for (let k = 0; k < K; k++) {
        let acc = 0;
        for (let j = 0; j < K; j++) acc += alpha[t - 1][j] * model.transitions[j][k];
        alpha[t][k] = acc * emissionProb(model, k, obs[t]);
      }
      c[t] = alpha[t].reduce((a, b) => a + b, 0) || EPS;
      for (let k = 0; k < K; k++) alpha[t][k] /= c[t];
    }

    for (let k = 0; k < K; k++) beta[T - 1][k] = 1;
    for (let t = T - 2; t >= 0; t--) {
      for (let k = 0; k < K; k++) {
        let acc = 0;
        for (let j = 0; j < K; j++) {
          acc += model.transitions[k][j] * emissionProb(model, j, obs[t + 1]) * beta[t + 1][j];
        }
        beta[t][k] = acc / (c[t + 1] || EPS);
      }
    }

    const gamma = Array.from({ length: T }, () => new Array(K).fill(0));
    const xiSum = Array.from({ length: K }, () => new Array(K).fill(0));
    for (let t = 0; t < T; t++) {
      let s = 0;
      for (let k = 0; k < K; k++) { gamma[t][k] = alpha[t][k] * beta[t][k]; s += gamma[t][k]; }
      if (s > 0) for (let k = 0; k < K; k++) gamma[t][k] /= s;
    }
    for (let t = 0; t < T - 1; t++) {
      let s = 0;
      const tmp = Array.from({ length: K }, () => new Array(K).fill(0));
      for (let i = 0; i < K; i++) for (let j = 0; j < K; j++) {
        tmp[i][j] = alpha[t][i] * model.transitions[i][j] * emissionProb(model, j, obs[t + 1]) * beta[t + 1][j];
        s += tmp[i][j];
      }
      if (s > 0) for (let i = 0; i < K; i++) for (let j = 0; j < K; j++) xiSum[i][j] += tmp[i][j] / s;
    }

    const newInitial = gamma[0].slice();
    const newTrans = Array.from({ length: K }, () => new Array(K).fill(0));
    const gammaSum = new Array(K).fill(0);
    for (let t = 0; t < T - 1; t++) for (let k = 0; k < K; k++) gammaSum[k] += gamma[t][k];
    for (let i = 0; i < K; i++) {
      const denom = gammaSum[i] || EPS;
      for (let j = 0; j < K; j++) newTrans[i][j] = xiSum[i][j] / denom;
    }
    const newMeans = Array.from({ length: K }, () => [0, 0]);
    const newStds  = Array.from({ length: K }, () => [0, 0]);
    const fullGammaSum = new Array(K).fill(0);
    for (let t = 0; t < T; t++) for (let k = 0; k < K; k++) fullGammaSum[k] += gamma[t][k];
    for (let k = 0; k < K; k++) {
      const denom = fullGammaSum[k] || EPS;
      for (let t = 0; t < T; t++) {
        newMeans[k][0] += gamma[t][k] * obs[t][0];
        newMeans[k][1] += gamma[t][k] * obs[t][1];
      }
      newMeans[k][0] /= denom; newMeans[k][1] /= denom;
      for (let t = 0; t < T; t++) {
        newStds[k][0] += gamma[t][k] * (obs[t][0] - newMeans[k][0]) ** 2;
        newStds[k][1] += gamma[t][k] * (obs[t][1] - newMeans[k][1]) ** 2;
      }
      newStds[k][0] = Math.sqrt(Math.max(1e-10, newStds[k][0] / denom));
      newStds[k][1] = Math.sqrt(Math.max(1e-10, newStds[k][1] / denom));
    }
    model = { initial: newInitial, transitions: newTrans, emissionMeans: newMeans, emissionStds: newStds };
  }
  return model;
}

function forward(model: HMMModel, obs: [number, number][]): number[][] {
  const T = obs.length, K = REGIMES.length;
  const alpha = Array.from({ length: T }, () => new Array(K).fill(0));
  if (T === 0) return alpha;
  for (let k = 0; k < K; k++) alpha[0][k] = model.initial[k] * emissionProb(model, k, obs[0]);
  let s = alpha[0].reduce((a, b) => a + b, 0) || EPS;
  for (let k = 0; k < K; k++) alpha[0][k] /= s;
  for (let t = 1; t < T; t++) {
    for (let k = 0; k < K; k++) {
      let acc = 0;
      for (let j = 0; j < K; j++) acc += alpha[t - 1][j] * model.transitions[j][k];
      alpha[t][k] = acc * emissionProb(model, k, obs[t]);
    }
    s = alpha[t].reduce((a, b) => a + b, 0) || EPS;
    for (let k = 0; k < K; k++) alpha[t][k] /= s;
  }
  return alpha;
}

function posteriorStability(p: number[]): number {
  const K = p.length;
  let h = 0;
  for (let k = 0; k < K; k++) if (p[k] > 0) h -= p[k] * Math.log(p[k]);
  const hMax = Math.log(K);
  return hMax > 0 ? 1 - h / hMax : 1;
}

// ── Handler ──────────────────────────────────────────────────────────
serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    await requireAuth(req, corsHeaders);
    const body = await req.json();
    const tickerA = String(body?.tickerA ?? "").trim().toUpperCase();
    const tickerB = String(body?.tickerB ?? "").trim().toUpperCase();
    const lookback = String(body?.lookback ?? "1y");
    const iterations = Math.min(50, Math.max(5, Number(body?.iterations ?? 25)));

    if (!tickerA || !tickerB) {
      return new Response(
        JSON.stringify({ error: "tickerA and tickerB required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const cacheKey = `${tickerA}|${tickerB}|${lookback}|${iterations}`;
    const cached = CACHE.get(cacheKey);
    if (cached && Date.now() - cached.ts < CACHE_TTL_MS) {
      return new Response(JSON.stringify({ ...(cached.payload as object), cached: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const [a, b] = await Promise.all([
      fetchClose(tickerA, lookback),
      fetchClose(tickerB, lookback),
    ]);

    if (!a || !b || a.length < 60 || b.length < 60) {
      return new Response(
        JSON.stringify({
          error: "insufficient-history",
          message: "Need at least 60 bars on both legs to fit the model.",
          fitBars: Math.min(a?.length ?? 0, b?.length ?? 0),
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const n = Math.min(a.length, b.length);
    const x = a.slice(a.length - n);
    const y = b.slice(b.length - n);

    const coint = cointegrate(x, y);

    // Fit HMM on the residual (spread) series — most discriminative signal
    // for mean-reverting vs trending vs volatile vs broken behaviour.
    const obs = buildObservations(coint.residuals);
    const model = baumWelch(obs, iterations);
    const alpha = forward(model, obs);
    const last = alpha[alpha.length - 1] ?? [0.25, 0.25, 0.25, 0.25];
    let bestK = 0;
    for (let k = 1; k < REGIMES.length; k++) if (last[k] > last[bestK]) bestK = k;

    const payload = {
      tickerA,
      tickerB,
      lookback,
      fitBars: n,
      cointegration: {
        beta: coint.beta,
        alpha: coint.alpha,
        adfStat: coint.adfStat,
        pValue: coint.pValue,
        isCointegrated: coint.isCointegrated,
      },
      // Send the spread back so the client can fit OU + run MC on a rolling tail.
      spread: coint.residuals,
      hmm: {
        model,
        regime: {
          state: REGIMES[bestK],
          probabilities: {
            "mean-reverting": last[0],
            trending: last[1],
            volatile: last[2],
            broken: last[3],
          },
          stability: posteriorStability(last),
        },
      },
      modelHealth: {
        ready: obs.length >= 50,
        status: obs.length >= 50 ? "ok" : "insufficient-history",
        fitBars: n,
      },
      generatedAt: Date.now(),
    };

    CACHE.set(cacheKey, { ts: Date.now(), payload });
    return new Response(JSON.stringify(payload), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    if (err instanceof Response) return err;
    console.error("statarb-intelligence error:", err);
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
