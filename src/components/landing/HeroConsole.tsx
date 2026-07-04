import { useEffect, useMemo, useState } from "react";

/**
 * The operating picture — a rendered, code-real depiction of the terminal
 * used as the hero artifact. No screenshots, no chrome theatrics: flat
 * carbon panels, hairline separators, tabular numerals, one amber accent
 * for live market data. Representative portfolio for illustration.
 */

/* Deterministic PRNG so the console renders identically on every load */
function mulberry32(a: number) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function boxMuller(rng: () => number) {
  let u = 0,
    v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

const TAPE = [
  { s: "ES1", v: "5,987.25", d: "+0.34%", up: true },
  { s: "NQ1", v: "21,842.50", d: "+0.51%", up: true },
  { s: "US10Y", v: "4.212%", d: "−2.1bp", up: false },
  { s: "DXY", v: "103.418", d: "−0.12%", up: false },
  { s: "WTI", v: "78.42", d: "+1.08%", up: true },
  { s: "VIX", v: "14.86", d: "−0.42", up: false },
];

const POSITIONS = [
  { t: "AAPL", qty: "1,200", last: "227.84", chg: "+0.62", w: "18.42", var95: "−2.31" },
  { t: "MSFT", qty: "640", last: "512.30", chg: "+0.41", w: "22.07", var95: "−2.12" },
  { t: "NVDA", qty: "850", last: "178.42", chg: "−1.24", w: "10.21", var95: "−4.87" },
  { t: "JPM", qty: "1,450", last: "248.11", chg: "+0.18", w: "24.22", var95: "−1.94" },
  { t: "XOM", qty: "2,100", last: "112.67", chg: "+0.87", w: "15.93", var95: "−2.45" },
  { t: "GLD", qty: "980", last: "246.05", chg: "+0.09", w: "9.15", var95: "−1.12" },
];

const RISK_CELLS = [
  { k: "VaR 95 · 1D", v: "−2.41%", tone: "neg" },
  { k: "CVaR 95 · 1D", v: "−3.87%", tone: "neg" },
  { k: "σ · annualised", v: "18.40%", tone: "flat" },
  { k: "Sharpe · 252D", v: "1.32", tone: "flat" },
];

function MonteCarloFan() {
  const bands = useMemo(() => {
    const rng = mulberry32(11);
    const N = 400;
    const STEPS = 64;
    const mu = 0.0005;
    const sigma = 0.014;
    const paths: number[][] = [];
    for (let p = 0; p < N; p++) {
      let s = 100;
      const path = [s];
      for (let t = 1; t <= STEPS; t++) {
        s = s * Math.exp(mu - 0.5 * sigma * sigma + sigma * boxMuller(rng));
        path.push(s);
      }
      paths.push(path);
    }
    const q = (arr: number[], p: number) => {
      const a = [...arr].sort((x, y) => x - y);
      return a[Math.min(a.length - 1, Math.floor(p * a.length))];
    };
    const p05: number[] = [], p25: number[] = [], p50: number[] = [], p75: number[] = [], p95: number[] = [];
    for (let t = 0; t <= STEPS; t++) {
      const col = paths.map((p) => p[t]);
      p05.push(q(col, 0.05));
      p25.push(q(col, 0.25));
      p50.push(q(col, 0.5));
      p75.push(q(col, 0.75));
      p95.push(q(col, 0.95));
    }
    return { p05, p25, p50, p75, p95, STEPS };
  }, []);

  const W = 520, H = 148, padL = 6, padR = 40, padT = 8, padB = 8;
  const lo = Math.min(...bands.p05);
  const hi = Math.max(...bands.p95);
  const x = (i: number) => padL + (i / bands.STEPS) * (W - padL - padR);
  const y = (v: number) => padT + (1 - (v - lo) / (hi - lo)) * (H - padT - padB);
  const line = (arr: number[]) =>
    arr.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  const area = (upper: number[], lower: number[]) =>
    line(upper) +
    lower
      .map((v, i, a) => `L${x(a.length - 1 - i).toFixed(1)},${y(lower[a.length - 1 - i]).toFixed(1)}`)
      .join("") +
    "Z";
  const endLabel = (arr: number[], t: string) => (
    <text
      x={W - padR + 5}
      y={y(arr[arr.length - 1]) + 3}
      fontSize="8"
      fontFamily="IBM Plex Mono, ui-monospace, monospace"
      fill="rgba(255,255,255,0.38)"
    >
      {t}
    </text>
  );

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto block" aria-label="Monte Carlo percentile fan, 10,000 simulated paths">
      <path d={area(bands.p95, bands.p05)} fill="rgba(255,255,255,0.05)" />
      <path d={area(bands.p75, bands.p25)} fill="rgba(255,255,255,0.09)" />
      <path d={line(bands.p50)} fill="none" stroke="rgba(255,255,255,0.85)" strokeWidth={1.1} />
      <line x1={padL} x2={W - padR} y1={y(100)} y2={y(100)} stroke="rgba(255,255,255,0.22)" strokeDasharray="2 4" strokeWidth={0.7} />
      {endLabel(bands.p95, "P95")}
      {endLabel(bands.p50, "P50")}
      {endLabel(bands.p05, "P05")}
    </svg>
  );
}

export default function HeroConsole() {
  const [utc, setUtc] = useState("");
  useEffect(() => {
    const tick = () => setUtc(new Date().toISOString().slice(11, 19));
    tick();
    const iv = setInterval(tick, 1000);
    return () => clearInterval(iv);
  }, []);

  return (
    <figure className="mkt-reveal">
      <div className="border border-hairline bg-carbon-900">
        {/* Console header */}
        <div className="flex items-center justify-between border-b border-hairline px-4 h-9">
          <span className="mkt-label text-[10px] text-white/45">
            Entropy Terminal · Portfolio operations
          </span>
          <span className="flex items-center gap-4">
            <span className="mkt-num text-[10px] text-white/35 hidden sm:inline">{utc} UTC</span>
            <span className="flex items-center gap-1.5">
              <span className="h-1.5 w-1.5 bg-signal" aria-hidden="true" />
              <span className="mkt-label text-[10px] text-signal">Live</span>
            </span>
          </span>
        </div>

        {/* Market tape */}
        <div className="grid grid-cols-3 lg:grid-cols-6 border-b border-hairline">
          {TAPE.map((q, i) => (
            <div
              key={q.s}
              className={`px-4 py-2.5 ${i > 0 ? "border-l border-hairline-faint" : ""} ${i > 2 ? "max-lg:border-t max-lg:border-hairline-faint" : ""}`}
            >
              <div className="flex items-baseline justify-between gap-2">
                <span className="mkt-label text-[9px] text-white/35">{q.s}</span>
                <span className={`mkt-num text-[10px] ${q.up ? "text-pos" : "text-neg"}`}>{q.d}</span>
              </div>
              <div className="mkt-num text-[13px] text-white/90 mt-0.5">{q.v}</div>
            </div>
          ))}
        </div>

        {/* Body */}
        <div className="grid grid-cols-1 lg:grid-cols-12">
          {/* Positions */}
          <div className="lg:col-span-7 lg:border-r border-hairline">
            <div className="flex items-center justify-between px-4 h-8 border-b border-hairline-faint">
              <span className="mkt-label text-[9px] text-white/40">Positions · Base USD</span>
              <span className="mkt-num text-[9px] text-white/30">6 holdings</span>
            </div>
            <table className="w-full">
              <thead>
                <tr className="border-b border-hairline-faint">
                  {["Ticker", "Qty", "Last", "Δ 1D%", "Weight%", "VaR95%"].map((h, i) => (
                    <th
                      key={h}
                      className={`mkt-label text-[8.5px] text-white/30 font-medium px-4 py-2 ${i === 0 ? "text-left" : "text-right"}`}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {POSITIONS.map((p) => (
                  <tr key={p.t} className="border-b border-hairline-faint last:border-b-0 hover:bg-carbon-750 transition-colors duration-150 ease-out">
                    <td className="px-4 py-[7px] mkt-num text-[11.5px] text-white/90">{p.t}</td>
                    <td className="px-4 py-[7px] mkt-num text-[11.5px] text-white/55 text-right">{p.qty}</td>
                    <td className="px-4 py-[7px] mkt-num text-[11.5px] text-white/85 text-right">{p.last}</td>
                    <td className={`px-4 py-[7px] mkt-num text-[11.5px] text-right ${p.chg.startsWith("−") ? "text-neg" : "text-pos"}`}>{p.chg}</td>
                    <td className="px-4 py-[7px] mkt-num text-[11.5px] text-white/55 text-right">{p.w}</td>
                    <td className="px-4 py-[7px] mkt-num text-[11.5px] text-white/70 text-right">{p.var95}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Right rail: risk surface + simulation */}
          <div className="lg:col-span-5 max-lg:border-t border-hairline">
            <div className="flex items-center justify-between px-4 h-8 border-b border-hairline-faint">
              <span className="mkt-label text-[9px] text-white/40">Risk surface</span>
              <span className="mkt-num text-[9px] text-white/30">252D window</span>
            </div>
            <div className="grid grid-cols-2">
              {RISK_CELLS.map((c, i) => (
                <div
                  key={c.k}
                  className={`px-4 py-3 border-b border-hairline-faint ${i % 2 === 1 ? "border-l border-hairline-faint" : ""}`}
                >
                  <div className="mkt-label text-[8.5px] text-white/30 mb-1">{c.k}</div>
                  <div className={`mkt-num text-[16px] ${c.tone === "neg" ? "text-neg" : "text-white/90"}`}>{c.v}</div>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between px-4 h-8 border-b border-hairline-faint">
              <span className="mkt-label text-[9px] text-white/40">Monte Carlo · 10,000 paths</span>
              <span className="mkt-num text-[9px] text-white/30">64D horizon</span>
            </div>
            <div className="px-4 pt-3 pb-1">
              <MonteCarloFan />
            </div>
            <div className="grid grid-cols-2 border-t border-hairline-faint">
              <div className="px-4 py-2.5">
                <div className="mkt-label text-[8.5px] text-white/30 mb-0.5">P(profit) · 64D</div>
                <div className="mkt-num text-[13px] text-white/90">61.4%</div>
              </div>
              <div className="px-4 py-2.5 border-l border-hairline-faint">
                <div className="mkt-label text-[8.5px] text-white/30 mb-0.5">Regime</div>
                <div className="mkt-num text-[13px] text-signal">Vol expansion watch</div>
              </div>
            </div>
          </div>
        </div>

        {/* Console footer */}
        <div className="flex flex-wrap items-center gap-x-6 gap-y-1 border-t border-hairline px-4 h-8">
          <span className="mkt-num text-[9px] text-white/30">ENGINES 12/12 NOMINAL</span>
          <span className="mkt-num text-[9px] text-white/30 hidden sm:inline">FULL PASS 62MS</span>
          <span className="mkt-num text-[9px] text-white/30 hidden md:inline">VaR RECOMPUTE CONTINUOUS</span>
          <span className="mkt-num text-[9px] text-white/30 ml-auto hidden sm:inline">FEED CONSOLIDATED · NORMALISED USD</span>
        </div>
      </div>
      <figcaption className="mkt-label text-[9px] text-white/25 mt-3">
        Representative portfolio, rendered by the production interface components. Not investment advice.
      </figcaption>
    </figure>
  );
}
