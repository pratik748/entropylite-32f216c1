import { useMemo } from "react";
import { FileText, Download } from "lucide-react";

/* -------------------- Deterministic PRNG so the page renders identically every load -------------------- */
function mulberry32(a: number) {
  return function () {
    let t = (a += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function boxMuller(rng: () => number) {
  let u = 0, v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/* Shared chart palette — monochrome structure, muted pos/neg, nothing else */
const MONO = "rgba(255,255,255,0.85)";
const MONO_SOFT = "rgba(255,255,255,0.38)";
const MONO_FAINT = "rgba(255,255,255,0.16)";
const GRID = "rgba(255,255,255,0.06)";
const POS = "rgba(78,158,114,";
const NEG = "rgba(196,86,79,";
const FONT = "IBM Plex Mono, ui-monospace, monospace";

function PanelHeader({ eyebrow, title, right }: { eyebrow: string; title: string; right?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between mb-3 gap-3">
      <div>
        <p className="mkt-label text-[9px] text-white/35 mb-1">{eyebrow}</p>
        <h4 className="font-semibold text-sm text-white tracking-tight">{title}</h4>
      </div>
      {right}
    </div>
  );
}

/* -------------------- 1. Monte Carlo GBM paths (mini) -------------------- */
function MonteCarloMini() {
  const { paths, finalReturns } = useMemo(() => {
    const rng = mulberry32(7);
    const N_PATHS = 60;
    const STEPS = 90;
    const mu = 0.0006;     // ~15% annualised drift
    const sigma = 0.018;   // ~28% annualised vol
    const S0 = 100;
    const ps: number[][] = [];
    const finals: number[] = [];
    for (let p = 0; p < N_PATHS; p++) {
      const path = [S0];
      let s = S0;
      for (let t = 1; t <= STEPS; t++) {
        const z = boxMuller(rng);
        s = s * Math.exp((mu - 0.5 * sigma * sigma) + sigma * z);
        path.push(s);
      }
      ps.push(path);
      finals.push((path[path.length - 1] - S0) / S0);
    }
    return { paths: ps, finalReturns: finals };
  }, []);

  const W = 600, H = 220, padL = 28, padR = 8, padT = 10, padB = 22;
  const allVals = paths.flat();
  const minV = Math.min(...allVals);
  const maxV = Math.max(...allVals);
  const x = (i: number) => padL + (i / (paths[0].length - 1)) * (W - padL - padR);
  const y = (v: number) => padT + (1 - (v - minV) / (maxV - minV)) * (H - padT - padB);

  const profitProb = (finalReturns.filter(r => r > 0).length / finalReturns.length) * 100;
  const sorted = [...finalReturns].sort((a, b) => a - b);
  const var95 = -sorted[Math.floor(0.05 * sorted.length)] * 100;

  return (
    <div className="border border-hairline bg-carbon-900 p-4 sm:p-5">
      <PanelHeader
        eyebrow="Monte Carlo · GBM"
        title="10,000 paths per asset"
        right={
          <div className="text-right">
            <p className="mkt-label text-[9px] text-white/35">profit prob</p>
            <p className="mkt-num text-sm text-pos">{profitProb.toFixed(0)}%</p>
          </div>
        }
      />
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto block">
        {[0.25, 0.5, 0.75].map((p, i) => (
          <line key={i} x1={padL} x2={W - padR} y1={padT + p * (H - padT - padB)} y2={padT + p * (H - padT - padB)} stroke={GRID} />
        ))}
        <line x1={padL} x2={W - padR} y1={y(100)} y2={y(100)} stroke={MONO_SOFT} strokeDasharray="2 3" strokeWidth={0.7} />
        {paths.map((path, idx) => {
          const last = path[path.length - 1];
          const stroke = last >= 100 ? `${POS}0.30)` : `${NEG}0.30)`;
          const d = path.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
          return <path key={idx} d={d} fill="none" stroke={stroke} strokeWidth={0.8} />;
        })}
        <text x={4} y={y(100) + 3} fontSize="9" fontFamily={FONT} fill={MONO_SOFT}>S₀</text>
        <text x={4} y={y(maxV) + 8} fontSize="9" fontFamily={FONT} fill={MONO_SOFT}>+{((maxV - 100)).toFixed(0)}%</text>
        <text x={4} y={y(minV) - 2} fontSize="9" fontFamily={FONT} fill={MONO_SOFT}>{((minV - 100)).toFixed(0)}%</text>
        <text x={padL} y={H - 6} fontSize="9" fontFamily={FONT} fill={MONO_SOFT}>t=0</text>
        <text x={W - padR - 38} y={H - 6} fontSize="9" fontFamily={FONT} fill={MONO_SOFT}>t=252d</text>
      </svg>
      <p className="mkt-num text-[9px] text-white/40 mt-2 leading-relaxed">
        S<sub>t+1</sub> = S<sub>t</sub> · exp((μ − σ²/2)Δt + σ√Δt · Z),  Z ~ N(0,1).  Implied 1-day VaR<sub>95</sub> ≈ {var95.toFixed(1)}%.
      </p>
    </div>
  );
}

/* -------------------- 2. VaR / CVaR distribution -------------------- */
function VaRDistribution() {
  const { bins, var95Idx, cvarMean } = useMemo(() => {
    const rng = mulberry32(13);
    const N = 5000;
    const sigma = 0.022;
    const samples: number[] = [];
    for (let i = 0; i < N; i++) samples.push(boxMuller(rng) * sigma);
    samples.sort((a, b) => a - b);
    const var95 = samples[Math.floor(0.05 * N)];
    const tail = samples.slice(0, Math.floor(0.05 * N));
    const cvar = tail.reduce((s, x) => s + x, 0) / tail.length;
    const BINS = 50;
    const min = -0.08, max = 0.08;
    const step = (max - min) / BINS;
    const counts = new Array(BINS).fill(0);
    for (const s of samples) {
      const idx = Math.min(BINS - 1, Math.max(0, Math.floor((s - min) / step)));
      counts[idx]++;
    }
    const var95Idx = Math.floor((var95 - min) / step);
    return { bins: counts, var95Idx, cvarMean: cvar };
  }, []);

  const W = 600, H = 220, padL = 8, padR = 8, padT = 14, padB = 24;
  const maxC = Math.max(...bins);
  const bw = (W - padL - padR) / bins.length;

  return (
    <div className="border border-hairline bg-carbon-900 p-4 sm:p-5">
      <PanelHeader
        eyebrow="Risk · VaR + CVaR"
        title="5,000-sample return distribution"
        right={
          <div className="text-right">
            <p className="mkt-label text-[9px] text-white/35">CVaR₉₅</p>
            <p className="mkt-num text-sm text-neg">{(cvarMean * 100).toFixed(2)}%</p>
          </div>
        }
      />
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto block">
        {bins.map((c, i) => {
          const h = (c / maxC) * (H - padT - padB);
          const inTail = i <= var95Idx;
          return (
            <rect
              key={i}
              x={padL + i * bw + 0.5}
              y={H - padB - h}
              width={bw - 1}
              height={h}
              fill={inTail ? `${NEG}0.55)` : "rgba(255,255,255,0.35)"}
            />
          );
        })}
        <line
          x1={padL + (var95Idx + 1) * bw}
          x2={padL + (var95Idx + 1) * bw}
          y1={padT}
          y2={H - padB}
          stroke={`${NEG}0.9)`}
          strokeWidth={1.2}
          strokeDasharray="3 3"
        />
        <text x={padL + (var95Idx + 1) * bw + 4} y={padT + 10} fontSize="10" fontFamily={FONT} fill={`${NEG}1)`}>VaR₉₅</text>
        <text x={padL} y={H - 6} fontSize="9" fontFamily={FONT} fill={MONO_SOFT}>−8%</text>
        <text x={W / 2 - 6} y={H - 6} fontSize="9" fontFamily={FONT} fill={MONO_SOFT}>0</text>
        <text x={W - padR - 22} y={H - 6} fontSize="9" fontFamily={FONT} fill={MONO_SOFT}>+8%</text>
      </svg>
      <p className="mkt-num text-[9px] text-white/40 mt-2 leading-relaxed">
        Historical VaR<sub>α</sub> = −quantile(returns, 1−α).  CVaR<sub>α</sub> = E[r | r ≤ −VaR<sub>α</sub>].  Computed live on 252-day windows per holding.
      </p>
    </div>
  );
}

/* -------------------- 3. Covariance / correlation heatmap -------------------- */
function CovarianceHeatmap() {
  const tickers = ["AAPL", "MSFT", "NVDA", "JPM", "XOM", "GLD", "TLT"];
  const corr = useMemo(() => {
    // Plausible cross-asset correlations (equities high among themselves, banks/energy lower, gold/treasuries diversifiers)
    return [
      [1.00, 0.78, 0.71, 0.42, 0.18, -0.06, -0.21],
      [0.78, 1.00, 0.74, 0.45, 0.16, -0.04, -0.18],
      [0.71, 0.74, 1.00, 0.39, 0.12, -0.08, -0.25],
      [0.42, 0.45, 0.39, 1.00, 0.36, -0.02, -0.31],
      [0.18, 0.16, 0.12, 0.36, 1.00, 0.21, -0.15],
      [-0.06, -0.04, -0.08, -0.02, 0.21, 1.00, 0.34],
      [-0.21, -0.18, -0.25, -0.31, -0.15, 0.34, 1.00],
    ];
  }, []);

  const colorFor = (v: number) => {
    if (v >= 0) {
      const a = Math.min(1, v);
      return `${POS}${(0.08 + a * 0.55).toFixed(2)})`;
    }
    const a = Math.min(1, -v);
    return `${NEG}${(0.08 + a * 0.55).toFixed(2)})`;
  };

  return (
    <div className="border border-hairline bg-carbon-900 p-4 sm:p-5">
      <PanelHeader
        eyebrow="Covariance · ρ matrix"
        title="Real cross-asset correlation"
        right={
          <div className="text-right">
            <p className="mkt-label text-[9px] text-white/35">σ<sub>p</sub> = √(wᵀΣw)</p>
          </div>
        }
      />
      <div className="overflow-x-auto -mx-2 px-2">
        <table className="border-collapse mx-auto" style={{ fontFamily: FONT }}>
          <thead>
            <tr>
              <th className="w-10" />
              {tickers.map((t) => (
                <th key={t} className="px-2 py-1 text-[9px] text-white/40 font-normal">{t}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {corr.map((row, i) => (
              <tr key={i}>
                <td className="px-2 py-1 text-[9px] text-white/40 text-right">{tickers[i]}</td>
                {row.map((v, j) => (
                  <td
                    key={j}
                    className="text-[9px] text-center w-10 h-7 border border-carbon-900"
                    style={{ background: colorFor(v), color: Math.abs(v) > 0.55 ? "rgba(255,255,255,0.92)" : "rgba(255,255,255,0.6)" }}
                  >
                    {v.toFixed(2)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="mkt-num text-[9px] text-white/40 mt-3 leading-relaxed">
        Pearson ρ from log-returns, 252d window.  Portfolio σ uses true covariance Σ, not a weighted average, so concentration and diversification are scored honestly.
      </p>
    </div>
  );
}

/* -------------------- 4. Merton distance-to-default -------------------- */
function MertonDD() {
  // Probability of default vs distance-to-default (Φ(−DD))
  const points = useMemo(() => {
    const pts: { dd: number; pd: number }[] = [];
    for (let dd = 0; dd <= 6; dd += 0.1) {
      // Φ(−dd) using Abramowitz & Stegun approximation
      const z = -dd;
      const t = 1 / (1 + 0.2316419 * Math.abs(z));
      const d = 0.3989422804 * Math.exp((-z * z) / 2);
      let p = d * t * (0.31938153 + t * (-0.356563782 + t * (1.781477937 + t * (-1.821255978 + t * 1.330274429))));
      if (z > 0) p = 1 - p;
      pts.push({ dd, pd: p });
    }
    return pts;
  }, []);

  const W = 600, H = 220, padL = 30, padR = 12, padT = 12, padB = 26;
  const x = (dd: number) => padL + (dd / 6) * (W - padL - padR);
  const y = (pd: number) => padT + (1 - Math.min(1, Math.max(0, pd / 0.5))) * (H - padT - padB);

  const d = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(p.dd).toFixed(1)},${y(p.pd).toFixed(1)}`).join(" ");

  const issuers = [
    { name: "AAA · 4.8σ", dd: 4.8 },
    { name: "BBB · 2.6σ", dd: 2.6 },
    { name: "B · 1.2σ", dd: 1.2 },
  ];

  return (
    <div className="border border-hairline bg-carbon-900 p-4 sm:p-5">
      <PanelHeader
        eyebrow="Credit · Merton 1974"
        title="Distance-to-default → PD"
        right={
          <div className="text-right">
            <p className="mkt-label text-[9px] text-white/35">PD = Φ(−DD)</p>
          </div>
        }
      />
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto block">
        {[0.1, 0.2, 0.3, 0.4].map((p) => (
          <g key={p}>
            <line x1={padL} x2={W - padR} y1={y(p)} y2={y(p)} stroke={GRID} />
            <text x={4} y={y(p) + 3} fontSize="9" fontFamily={FONT} fill={MONO_SOFT}>{(p * 100).toFixed(0)}%</text>
          </g>
        ))}
        <path d={d} fill="none" stroke={MONO} strokeWidth={1.4} />
        {issuers.map((iss) => {
          const px = x(iss.dd);
          const py = y(points.find(p => Math.abs(p.dd - iss.dd) < 0.06)?.pd ?? 0);
          return (
            <g key={iss.name}>
              <circle cx={px} cy={py} r={3} fill={`${NEG}0.9)`} />
              <text x={px + 6} y={py - 4} fontSize="9" fontFamily={FONT} fill={MONO_SOFT}>{iss.name}</text>
            </g>
          );
        })}
        {[0, 1, 2, 3, 4, 5, 6].map(d => (
          <text key={d} x={x(d) - 3} y={H - 8} fontSize="9" fontFamily={FONT} fill={MONO_SOFT}>{d}σ</text>
        ))}
        <text x={W / 2 - 30} y={H - 0} fontSize="9" fontFamily={FONT} fill={MONO_SOFT}>distance-to-default</text>
      </svg>
      <p className="mkt-num text-[9px] text-white/40 mt-2 leading-relaxed">
        DD = (ln(V/D) + (μ − σ²/2)T) / (σ√T).  Replaces ratings with a structural, equity-vol-driven probability of default per holding.
      </p>
    </div>
  );
}

/* -------------------- 5. Stat-arb: Ornstein–Uhlenbeck spread + half-life -------------------- */
function StatArbMini() {
  const series = useMemo(() => {
    const rng = mulberry32(21);
    const N = 200;
    const theta = 0.06;   // mean reversion speed
    const mu = 0;
    const sigma = 0.4;
    let s = 1.8;
    const out: number[] = [];
    for (let i = 0; i < N; i++) {
      const dW = boxMuller(rng);
      s = s + theta * (mu - s) + sigma * dW;
      out.push(s);
    }
    return out;
  }, []);

  const W = 600, H = 200, padL = 30, padR = 8, padT = 12, padB = 22;
  const lo = Math.min(...series, -2.5);
  const hi = Math.max(...series, 2.5);
  const x = (i: number) => padL + (i / (series.length - 1)) * (W - padL - padR);
  const y = (v: number) => padT + (1 - (v - lo) / (hi - lo)) * (H - padT - padB);
  const path = series.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");

  return (
    <div className="border border-hairline bg-carbon-900 p-4 sm:p-5">
      <PanelHeader
        eyebrow="Stat-arb · Ornstein–Uhlenbeck"
        title="Mean-reversion z-score & half-life"
        right={
          <div className="text-right">
            <p className="mkt-label text-[9px] text-white/35">half-life</p>
            <p className="mkt-num text-sm text-white/90">~12d</p>
          </div>
        }
      />
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto block">
        {[2, -2].map(z => (
          <line key={z} x1={padL} x2={W - padR} y1={y(z)} y2={y(z)} stroke={`${NEG}0.4)`} strokeDasharray="3 3" />
        ))}
        {[1, -1].map(z => (
          <line key={z} x1={padL} x2={W - padR} y1={y(z)} y2={y(z)} stroke={MONO_FAINT} strokeDasharray="2 4" />
        ))}
        <line x1={padL} x2={W - padR} y1={y(0)} y2={y(0)} stroke={MONO_SOFT} />
        <path d={path} fill="none" stroke={MONO} strokeWidth={1.2} />
        {[2, 1, 0, -1, -2].map(z => (
          <text key={z} x={4} y={y(z) + 3} fontSize="9" fontFamily={FONT} fill={MONO_SOFT}>{z > 0 ? `+${z}σ` : z === 0 ? "μ" : `${z}σ`}</text>
        ))}
      </svg>
      <p className="mkt-num text-[9px] text-white/40 mt-2 leading-relaxed">
        dS<sub>t</sub> = θ(μ − S<sub>t</sub>)dt + σ dW<sub>t</sub>.  Half-life = ln(2)/θ.  Triggers fire only when |z| ≥ 2 and half-life is short enough to round-trip inside the regime.
      </p>
    </div>
  );
}

/* -------------------- Section -------------------- */
const RESEARCH = [
  { tag: "Risk", title: "Value at Risk & Expected Shortfall", cite: "Acerbi & Tasche (2002), Rockafellar & Uryasev (2000)", desc: "Why CVaR is the coherent risk measure VaR isn't, and why we report both at 95% and 99%." },
  { tag: "Credit", title: "Pricing of Corporate Debt", cite: "Merton (1974), J. of Finance 29(2)", desc: "Equity as a call option on assets. Distance-to-default replaces the rating-agency black box with a structural number." },
  { tag: "Vol", title: "GARCH & stochastic volatility", cite: "Bollerslev (1986), Heston (1993)", desc: "Why a single σ is insufficient, and how clustered, regime-aware vol feeds the Monte Carlo paths." },
  { tag: "Stat-arb", title: "Pairs trading: performance of a relative-value strategy", cite: "Gatev, Goetzmann & Rouwenhorst (2006)", desc: "The empirical foundation under the cointegration + OU mean-reversion engine." },
  { tag: "Portfolio", title: "Portfolio selection", cite: "Markowitz (1952), J. of Finance 7(1)", desc: "The reason Σ matters more than σᵢ alone, and why the system always solves √(wᵀΣw)." },
  { tag: "Reflexivity", title: "The Alchemy of Finance", cite: "Soros (1987)", desc: "Markets aren't a mirror of fundamentals; they shape them. The reflexivity engine quantifies the feedback loop." },
];

export default function MathResearch() {
  return (
    <section className="bg-carbon-950">
      <div className="max-w-7xl mx-auto px-5 sm:px-8 py-14 sm:py-20">
        {/* Capability strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 border-t border-l border-hairline mb-8 sm:mb-10">
          {[
            { label: "1-year daily history", sub: "per holding, log-returns" },
            { label: "True σ, μ, ρ, Σ", sub: "no proxy, no heuristic" },
            { label: "10,000 GBM paths", sub: "with jump-diffusion" },
            { label: "Merton 1974", sub: "structural credit DD/PD" },
          ].map((c) => (
            <div key={c.label} className="border-b border-r border-hairline bg-carbon-900 p-4 sm:p-5">
              <p className="font-semibold text-xs sm:text-sm text-white tracking-tight">{c.label}</p>
              <p className="mkt-num text-[9px] sm:text-[10px] text-white/40 mt-1">{c.sub}</p>
            </div>
          ))}
        </div>

        {/* Live mini-visualizations */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-5">
          <MonteCarloMini />
          <VaRDistribution />
          <CovarianceHeatmap />
          <MertonDD />
          <div className="lg:col-span-2">
            <StatArbMini />
          </div>
        </div>

        {/* Research / reading list */}
        <div className="mt-12 sm:mt-16 pt-10 border-t border-hairline">
          <div className="flex items-center gap-3 mb-6">
            <span className="h-px w-8 bg-hairline-strong" />
            <p className="mkt-label text-[10px] text-white/55">The research it's built on</p>
          </div>
          <h3 className="mkt-display-2 text-white mb-3">
            Six foundations, <span className="text-white/40">wired into production.</span>
          </h3>
          <p className="text-sm text-white/50 max-w-2xl mb-10 leading-relaxed">
            The papers and books that underpin what an institutional desk does daily.
            Every one of them is implemented in a layer of the terminal.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 border-t border-l border-hairline">
            {RESEARCH.map((r) => (
              <article key={r.title} className="border-b border-r border-hairline bg-carbon-900 p-5 hover:bg-carbon-800 transition-colors duration-150 ease-out">
                <span className="mkt-label text-[9px] text-white/35">{r.tag}</span>
                <h4 className="font-semibold text-sm text-white tracking-tight mt-2 mb-1.5 leading-snug">{r.title}</h4>
                <p className="mkt-num text-[10px] text-white/40 mb-2 leading-snug">{r.cite}</p>
                <p className="text-xs text-white/55 leading-relaxed">{r.desc}</p>
              </article>
            ))}
          </div>

          <p className="mkt-num text-[10px] text-white/30 mt-8 max-w-2xl leading-relaxed">
            All formulas above are implemented in <span className="text-white/55">src/lib/quant-engine.ts</span> and surfaced through the Methodology panel on every metric in the terminal.
          </p>
        </div>

        {/* Original research — CLANK manuscript */}
        <div className="mt-12 sm:mt-16 pt-10 border-t border-hairline">
          <div className="flex items-center gap-3 mb-6">
            <span className="h-px w-8 bg-hairline-strong" />
            <p className="mkt-label text-[10px] text-white/55">Original research</p>
          </div>
          <h3 className="mkt-display-2 text-white mb-3">
            The CLANK manuscript.
          </h3>
          <p className="text-sm text-white/50 max-w-2xl mb-10 leading-relaxed">
            The constraint engine inside the terminal is built on a structural theory of
            deterministic opportunity in complex systems, formalised in a working paper
            distributed on SSRN.
          </p>

          <article className="border border-hairline bg-carbon-900 p-6 sm:p-8 max-w-4xl">
            <div className="flex items-center gap-4 mb-4 flex-wrap">
              <span className="mkt-label text-[9px] text-white/40 px-2 py-1 border border-hairline">Working Paper · 2026</span>
              <span className="mkt-label text-[9px] text-white/40">SSRN · 6464440</span>
            </div>
            <h4 className="text-lg sm:text-2xl font-semibold tracking-tight mb-2 leading-tight text-white">
              CLANK: A Structural Theory of Deterministic Opportunity in Complex Systems
            </h4>
            <p className="mkt-num text-[11px] text-white/50 mb-6">Pratik Sehwag · March 2026 · 30 pages</p>

            <blockquote className="border-l border-hairline-strong pl-4 mb-6">
              <p className="text-xs sm:text-sm text-white/60 leading-relaxed italic">
                "Within many complex systems there exist fleeting intervals during which probabilistic rules
                are suspended in favour of rigid structural determinism. The system 'clanks' into a state of
                temporary, absolute certainty, a deterministic opportunity where the future state is no
                longer a matter of probability, but of structural necessity."
              </p>
            </blockquote>

            <div className="grid grid-cols-1 sm:grid-cols-3 border-t border-l border-hairline mb-6">
              {[
                { k: "Latent Asymmetry α", v: "the gradient of the possible" },
                { k: "Internal Pressure Π", v: "interaction density / throughput" },
                { k: "Boundary Constraints B", v: "the structural walls" },
              ].map((x) => (
                <div key={x.k} className="border-b border-r border-hairline bg-carbon-950 p-3 sm:p-4">
                  <p className="mkt-label text-[9px] text-white/35 mb-1">{x.k}</p>
                  <p className="text-[11px] sm:text-xs text-white/60 leading-snug">{x.v}</p>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-7">
              {[
                "Structural lock manifold",
                "Reflexivity paradox",
                "Latency & yield strength",
                "Failure modes catalogue",
              ].map((t) => (
                <div key={t} className="text-[11px] text-white/55 leading-snug">
                  <span className="text-white/25 mr-1">§</span>{t}
                </div>
              ))}
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <a
                href="/research/clank-theory-sehwag-2026.pdf"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-11 items-center justify-center gap-2 px-5 bg-white text-carbon-950 text-xs font-semibold tracking-tight hover:bg-white/85 transition-colors duration-150 ease-out"
              >
                <Download className="h-3.5 w-3.5" />
                Read the manuscript (PDF)
              </a>
              <a
                href="https://papers.ssrn.com/sol3/papers.cfm?abstract_id=6464440"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-11 items-center justify-center gap-2 px-5 border border-hairline-strong text-white/70 text-xs font-medium tracking-tight hover:border-white/40 hover:text-white transition-colors duration-150 ease-out"
              >
                View on SSRN
              </a>
            </div>

            <div className="mt-7 border border-hairline bg-carbon-950">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-hairline px-4 py-3">
                <div>
                  <p className="font-semibold text-sm text-white tracking-tight">Read the paper inside the page</p>
                  <p className="mkt-label text-[9px] text-white/35 mt-0.5 inline-flex items-center gap-1.5">
                    <FileText className="h-3 w-3" /> Embedded PDF viewer
                  </p>
                </div>
                <a
                  href="/research/clank-theory-sehwag-2026.pdf"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-medium text-white/55 hover:text-white transition-colors duration-150 ease-out"
                >
                  Open full screen
                </a>
              </div>
              <div className="relative w-full h-[520px] sm:h-[720px] bg-carbon-850 overflow-hidden">
                <iframe
                  title="CLANK research paper"
                  src="/research/clank-theory-sehwag-2026.pdf#view=Fit&zoom=page-fit&toolbar=1&navpanes=0&scrollbar=1"
                  className="absolute inset-0 w-full h-full border-0"
                  loading="lazy"
                />
              </div>
            </div>

            <p className="mkt-num text-[10px] text-white/30 mt-5 leading-relaxed">
              Wired into the terminal as the <span className="text-white/55">CLANK Structural Constraint Engine</span>,
              identifying institutional pressure points, structural locks and deterministic windows
              before the rest of the market sees them.
            </p>
          </article>
        </div>
      </div>
    </section>
  );
}
