import { useMemo } from "react";
import { Sigma, FunctionSquare, BookOpen, Activity, GitCompareArrows, ShieldAlert, FileText, Download, Quote } from "lucide-react";

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
    <div className="rounded-lg border border-black/10 bg-white p-4 sm:p-5">
      <div className="flex items-start justify-between mb-3 gap-3">
        <div>
          <p className="font-mono text-[9px] tracking-[0.2em] uppercase text-black/40 mb-1">Monte Carlo · GBM</p>
          <h4 className="font-semibold text-sm">10,000 paths per asset</h4>
        </div>
        <div className="text-right">
          <p className="font-mono text-[9px] text-black/40">profit prob</p>
          <p className="font-mono text-sm font-bold text-emerald-600">{profitProb.toFixed(0)}%</p>
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto block">
        {/* Y axis grid */}
        {[0.25, 0.5, 0.75].map((p, i) => (
          <line key={i} x1={padL} x2={W - padR} y1={padT + p * (H - padT - padB)} y2={padT + p * (H - padT - padB)} stroke="rgba(0,0,0,0.05)" />
        ))}
        {/* Baseline (S0) */}
        <line x1={padL} x2={W - padR} y1={y(100)} y2={y(100)} stroke="rgba(0,0,0,0.4)" strokeDasharray="2 3" strokeWidth={0.7} />
        {/* Paths */}
        {paths.map((path, idx) => {
          const last = path[path.length - 1];
          const stroke = last >= 100 ? "rgba(16,185,129,0.32)" : "rgba(239,68,68,0.32)";
          const d = path.map((v, i) => `${i === 0 ? "M" : "L"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
          return <path key={idx} d={d} fill="none" stroke={stroke} strokeWidth={0.8} />;
        })}
        {/* Y labels */}
        <text x={4} y={y(100) + 3} fontSize="9" fontFamily="ui-monospace" fill="rgba(0,0,0,0.45)">S₀</text>
        <text x={4} y={y(maxV) + 8} fontSize="9" fontFamily="ui-monospace" fill="rgba(0,0,0,0.35)">+{((maxV - 100)).toFixed(0)}%</text>
        <text x={4} y={y(minV) - 2} fontSize="9" fontFamily="ui-monospace" fill="rgba(0,0,0,0.35)">{((minV - 100)).toFixed(0)}%</text>
        {/* X labels */}
        <text x={padL} y={H - 6} fontSize="9" fontFamily="ui-monospace" fill="rgba(0,0,0,0.35)">t=0</text>
        <text x={W - padR - 32} y={H - 6} fontSize="9" fontFamily="ui-monospace" fill="rgba(0,0,0,0.35)">t=252d</text>
      </svg>
      <p className="font-mono text-[9px] text-black/45 mt-2 leading-relaxed">
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
    <div className="rounded-lg border border-black/10 bg-white p-4 sm:p-5">
      <div className="flex items-start justify-between mb-3 gap-3">
        <div>
          <p className="font-mono text-[9px] tracking-[0.2em] uppercase text-black/40 mb-1">Risk · VaR + CVaR</p>
          <h4 className="font-semibold text-sm">5,000-sample return distribution</h4>
        </div>
        <div className="text-right">
          <p className="font-mono text-[9px] text-black/40">CVaR<sub>95</sub></p>
          <p className="font-mono text-sm font-bold text-rose-600">{(cvarMean * 100).toFixed(2)}%</p>
        </div>
      </div>
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
              fill={inTail ? "rgba(239,68,68,0.55)" : "rgba(0,0,0,0.55)"}
            />
          );
        })}
        {/* VaR cutoff line */}
        <line
          x1={padL + (var95Idx + 1) * bw}
          x2={padL + (var95Idx + 1) * bw}
          y1={padT}
          y2={H - padB}
          stroke="rgb(239,68,68)"
          strokeWidth={1.5}
          strokeDasharray="3 3"
        />
        <text x={padL + (var95Idx + 1) * bw + 4} y={padT + 10} fontSize="10" fontFamily="ui-monospace" fill="rgb(239,68,68)" fontWeight="bold">VaR₉₅</text>
        {/* axis labels */}
        <text x={padL} y={H - 6} fontSize="9" fontFamily="ui-monospace" fill="rgba(0,0,0,0.35)">−8%</text>
        <text x={W / 2 - 6} y={H - 6} fontSize="9" fontFamily="ui-monospace" fill="rgba(0,0,0,0.35)">0</text>
        <text x={W - padR - 18} y={H - 6} fontSize="9" fontFamily="ui-monospace" fill="rgba(0,0,0,0.35)">+8%</text>
      </svg>
      <p className="font-mono text-[9px] text-black/45 mt-2 leading-relaxed">
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
      return `rgba(16,185,129,${0.12 + a * 0.7})`;
    }
    const a = Math.min(1, -v);
    return `rgba(239,68,68,${0.12 + a * 0.7})`;
  };

  return (
    <div className="rounded-lg border border-black/10 bg-white p-4 sm:p-5">
      <div className="flex items-start justify-between mb-3 gap-3">
        <div>
          <p className="font-mono text-[9px] tracking-[0.2em] uppercase text-black/40 mb-1">Covariance · ρ matrix</p>
          <h4 className="font-semibold text-sm">Real cross-asset correlation</h4>
        </div>
        <div className="text-right">
          <p className="font-mono text-[9px] text-black/40">σ<sub>p</sub> = √(wᵀΣw)</p>
        </div>
      </div>
      <div className="overflow-x-auto -mx-2 px-2">
        <table className="border-collapse mx-auto" style={{ fontFamily: "ui-monospace,monospace" }}>
          <thead>
            <tr>
              <th className="w-10" />
              {tickers.map((t) => (
                <th key={t} className="px-2 py-1 text-[9px] text-black/45 font-normal">{t}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {corr.map((row, i) => (
              <tr key={i}>
                <td className="px-2 py-1 text-[9px] text-black/45 text-right">{tickers[i]}</td>
                {row.map((v, j) => (
                  <td
                    key={j}
                    className="text-[9px] text-center w-10 h-7 border border-white"
                    style={{ background: colorFor(v), color: Math.abs(v) > 0.55 ? "white" : "rgba(0,0,0,0.7)" }}
                  >
                    {v.toFixed(2)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="font-mono text-[9px] text-black/45 mt-3 leading-relaxed">
        Pearson ρ from log-returns, 252d window.  Portfolio σ uses true covariance Σ — not a weighted average — so concentration and diversification are scored honestly.
      </p>
    </div>
  );
}

/* -------------------- 4. Merton distance-to-default -------------------- */
function MertonDD() {
  // Simple visual: probability of default vs distance-to-default (Φ(-DD))
  const points = useMemo(() => {
    const pts: { dd: number; pd: number }[] = [];
    for (let dd = 0; dd <= 6; dd += 0.1) {
      // Φ(-dd) using Abramowitz & Stegun approximation
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

  // Sample issuers
  const issuers = [
    { name: "AAA · 4.8σ", dd: 4.8 },
    { name: "BBB · 2.6σ", dd: 2.6 },
    { name: "B · 1.2σ", dd: 1.2 },
  ];

  return (
    <div className="rounded-lg border border-black/10 bg-white p-4 sm:p-5">
      <div className="flex items-start justify-between mb-3 gap-3">
        <div>
          <p className="font-mono text-[9px] tracking-[0.2em] uppercase text-black/40 mb-1">Credit · Merton 1974</p>
          <h4 className="font-semibold text-sm">Distance-to-default → PD</h4>
        </div>
        <div className="text-right">
          <p className="font-mono text-[9px] text-black/40">PD = Φ(−DD)</p>
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto block">
        {[0.1, 0.2, 0.3, 0.4].map((p) => (
          <g key={p}>
            <line x1={padL} x2={W - padR} y1={y(p)} y2={y(p)} stroke="rgba(0,0,0,0.06)" />
            <text x={4} y={y(p) + 3} fontSize="9" fontFamily="ui-monospace" fill="rgba(0,0,0,0.4)">{(p * 100).toFixed(0)}%</text>
          </g>
        ))}
        <path d={d} fill="none" stroke="rgb(0,0,0)" strokeWidth={1.6} />
        {issuers.map((iss) => {
          const px = x(iss.dd);
          const py = y(points.find(p => Math.abs(p.dd - iss.dd) < 0.06)?.pd ?? 0);
          return (
            <g key={iss.name}>
              <circle cx={px} cy={py} r={3.5} fill="rgb(239,68,68)" />
              <text x={px + 6} y={py - 4} fontSize="9" fontFamily="ui-monospace" fill="rgba(0,0,0,0.6)">{iss.name}</text>
            </g>
          );
        })}
        {[0, 1, 2, 3, 4, 5, 6].map(d => (
          <text key={d} x={x(d) - 3} y={H - 8} fontSize="9" fontFamily="ui-monospace" fill="rgba(0,0,0,0.4)">{d}σ</text>
        ))}
        <text x={W / 2 - 30} y={H - 0} fontSize="9" fontFamily="ui-monospace" fill="rgba(0,0,0,0.45)">distance-to-default</text>
      </svg>
      <p className="font-mono text-[9px] text-black/45 mt-2 leading-relaxed">
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
    <div className="rounded-lg border border-black/10 bg-white p-4 sm:p-5">
      <div className="flex items-start justify-between mb-3 gap-3">
        <div>
          <p className="font-mono text-[9px] tracking-[0.2em] uppercase text-black/40 mb-1">Stat-arb · Ornstein–Uhlenbeck</p>
          <h4 className="font-semibold text-sm">Mean-reversion z-score & half-life</h4>
        </div>
        <div className="text-right">
          <p className="font-mono text-[9px] text-black/40">half-life</p>
          <p className="font-mono text-sm font-bold">~12d</p>
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto block">
        {/* z bands */}
        {[2, -2].map(z => (
          <line key={z} x1={padL} x2={W - padR} y1={y(z)} y2={y(z)} stroke="rgba(239,68,68,0.35)" strokeDasharray="3 3" />
        ))}
        {[1, -1].map(z => (
          <line key={z} x1={padL} x2={W - padR} y1={y(z)} y2={y(z)} stroke="rgba(0,0,0,0.1)" strokeDasharray="2 4" />
        ))}
        <line x1={padL} x2={W - padR} y1={y(0)} y2={y(0)} stroke="rgba(0,0,0,0.5)" />
        <path d={path} fill="none" stroke="rgb(0,0,0)" strokeWidth={1.3} />
        {[2, 1, 0, -1, -2].map(z => (
          <text key={z} x={4} y={y(z) + 3} fontSize="9" fontFamily="ui-monospace" fill="rgba(0,0,0,0.4)">{z > 0 ? `+${z}σ` : z === 0 ? "μ" : `${z}σ`}</text>
        ))}
      </svg>
      <p className="font-mono text-[9px] text-black/45 mt-2 leading-relaxed">
        dS<sub>t</sub> = θ(μ − S<sub>t</sub>)dt + σ dW<sub>t</sub>.  Half-life = ln(2)/θ.  Triggers fire only when |z| ≥ 2 and half-life is short enough to round-trip inside the regime.
      </p>
    </div>
  );
}

/* -------------------- Section -------------------- */
const RESEARCH = [
  { tag: "Risk", title: "Value at Risk & Expected Shortfall", cite: "Acerbi & Tasche (2002), Rockafellar & Uryasev (2000)", desc: "Why CVaR is the coherent risk measure VaR isn't — and why we report both at 95% and 99%." },
  { tag: "Credit", title: "Pricing of Corporate Debt", cite: "Merton (1974), J. of Finance 29(2)", desc: "Equity as a call option on assets. Distance-to-default replaces the rating-agency black box with a structural number." },
  { tag: "Vol", title: "GARCH & stochastic volatility", cite: "Bollerslev (1986), Heston (1993)", desc: "Why a single σ is a lie — and how we feed clustered, regime-aware vol into Monte Carlo paths." },
  { tag: "Stat-arb", title: "Pairs trading: performance of a relative-value strategy", cite: "Gatev, Goetzmann & Rouwenhorst (2006)", desc: "The empirical foundation under our cointegration + OU mean-reversion engine." },
  { tag: "Portfolio", title: "Portfolio selection", cite: "Markowitz (1952), J. of Finance 7(1)", desc: "The reason Σ matters more than σᵢ alone — and why we always solve √(wᵀΣw)." },
  { tag: "Reflexivity", title: "The Alchemy of Finance", cite: "Soros (1987)", desc: "Markets aren't a mirror of fundamentals; they shape them. Our reflexivity engine quantifies the feedback loop." },
];

export default function MathResearch() {
  return (
    <section className="border-t border-black/5 bg-white">
      <div className="max-w-6xl mx-auto px-4 sm:px-6 py-14 sm:py-20">
        <div className="text-center mb-8 sm:mb-12">
          <p className="font-mono text-[10px] tracking-[0.3em] uppercase text-black/40 mb-3">Under the hood</p>
          <h2 className="text-2xl sm:text-4xl font-bold tracking-tight mb-3">
            The math is real. Here's what it looks like.
          </h2>
          <p className="text-sm sm:text-base text-black/55 max-w-2xl mx-auto">
            Every model below runs live in the terminal on your real holdings.  No proxies, no sine-wave placeholders, no rating-agency hand-waving.
          </p>
        </div>

        {/* Capability strip */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-black/5 rounded-xl overflow-hidden border border-black/10 mb-8 sm:mb-10">
          {[
            { icon: Sigma, label: "1-year daily history", sub: "per holding, log-returns" },
            { icon: FunctionSquare, label: "True σ, μ, ρ, Σ", sub: "no proxy, no heuristic" },
            { icon: Activity, label: "10,000 GBM paths", sub: "with jump-diffusion" },
            { icon: ShieldAlert, label: "Merton 1974", sub: "structural credit DD/PD" },
          ].map((c) => (
            <div key={c.label} className="bg-white p-4 sm:p-5">
              <c.icon className="h-4 w-4 text-black/45 mb-2" />
              <p className="font-semibold text-xs sm:text-sm">{c.label}</p>
              <p className="font-mono text-[9px] sm:text-[10px] text-black/45 mt-1">{c.sub}</p>
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
        <div className="mt-12 sm:mt-16 pt-10 border-t border-black/10">
          <div className="flex items-center justify-center gap-2 mb-3">
            <BookOpen className="h-4 w-4 text-black/45" />
            <p className="font-mono text-[10px] tracking-[0.3em] uppercase text-black/45">The research it's built on</p>
          </div>
          <h3 className="text-xl sm:text-2xl font-bold tracking-tight text-center mb-2">
            What you're missing if you're trading without it
          </h3>
          <p className="text-sm text-black/55 max-w-2xl mx-auto text-center mb-8">
            Six papers and books that quietly underpin most of what an institutional desk does.  Every one of them is wired into a layer of the terminal.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {RESEARCH.map((r) => (
              <article key={r.title} className="rounded-lg border border-black/10 bg-white p-5 hover:border-black/25 transition-colors">
                <div className="flex items-center gap-2 mb-2">
                  <GitCompareArrows className="h-3.5 w-3.5 text-black/40" />
                  <span className="font-mono text-[9px] tracking-wider uppercase text-black/40">{r.tag}</span>
                </div>
                <h4 className="font-semibold text-sm mb-1.5 leading-snug">{r.title}</h4>
                <p className="font-mono text-[10px] text-black/45 mb-2 leading-snug">{r.cite}</p>
                <p className="text-xs text-black/60 leading-relaxed">{r.desc}</p>
              </article>
            ))}
          </div>

          <p className="font-mono text-[10px] text-black/35 text-center mt-8 max-w-2xl mx-auto leading-relaxed">
            All formulas above are implemented in <span className="text-black/60">src/lib/quant-engine.ts</span> and surfaced through the Methodology panel on every metric in the terminal.
          </p>
        </div>

        {/* Original Research — CLANK Theory whitepaper */}
        <div className="mt-12 sm:mt-16 pt-10 border-t border-black/10">
          <div className="flex items-center justify-center gap-2 mb-3">
            <FileText className="h-4 w-4 text-black/45" />
            <p className="font-mono text-[10px] tracking-[0.3em] uppercase text-black/45">Original research</p>
          </div>
          <h3 className="text-xl sm:text-2xl font-bold tracking-tight text-center mb-2">
            We didn't just borrow the math. We wrote some of it.
          </h3>
          <p className="text-sm text-black/55 max-w-2xl mx-auto text-center mb-8">
            The CLANK engine inside the terminal is built on a structural theory of deterministic
            opportunity in complex systems — formalised in a peer-distributed manuscript on SSRN.
          </p>

          <article className="rounded-xl border border-black/10 bg-gradient-to-br from-white to-black/[0.02] p-6 sm:p-8 max-w-4xl mx-auto">
            <div className="flex items-center gap-2 mb-3">
              <span className="font-mono text-[9px] tracking-[0.2em] uppercase text-black/40 px-2 py-0.5 border border-black/10 rounded">Working Paper · 2026</span>
              <span className="font-mono text-[9px] tracking-[0.2em] uppercase text-black/40">SSRN · 6464440</span>
            </div>
            <h4 className="text-lg sm:text-2xl font-bold tracking-tight mb-2 leading-tight">
              CLANK: A Structural Theory of Deterministic Opportunity in Complex Systems
            </h4>
            <p className="font-mono text-[11px] text-black/55 mb-5">Pratik Sehwag · March 2026 · 30 pages</p>

            <div className="border-l-2 border-black/15 pl-4 mb-5">
              <Quote className="h-3.5 w-3.5 text-black/30 mb-1.5" />
              <p className="text-xs sm:text-sm text-black/65 leading-relaxed italic">
                "Within many complex systems there exist fleeting intervals during which probabilistic rules
                are suspended in favour of rigid structural determinism. The system 'clanks' into a state of
                temporary, absolute certainty — a deterministic opportunity where the future state is no
                longer a matter of probability, but of structural necessity."
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-px bg-black/5 rounded-lg overflow-hidden border border-black/10 mb-5">
              {[
                { k: "Latent Asymmetry α", v: "the gradient of the possible" },
                { k: "Internal Pressure Π", v: "interaction density / throughput" },
                { k: "Boundary Constraints B", v: "the structural walls" },
              ].map((x) => (
                <div key={x.k} className="bg-white p-3 sm:p-4">
                  <p className="font-mono text-[9px] tracking-[0.15em] uppercase text-black/40 mb-1">{x.k}</p>
                  <p className="text-[11px] sm:text-xs text-black/70 leading-snug">{x.v}</p>
                </div>
              ))}
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
              {[
                "Structural lock manifold",
                "Reflexivity paradox",
                "Latency & yield strength",
                "Failure modes catalogue",
              ].map((t) => (
                <div key={t} className="text-[11px] text-black/60 leading-snug">
                  <span className="text-black/30 mr-1">§</span>{t}
                </div>
              ))}
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <a
                href="/research/clank-theory-sehwag-2026.pdf"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 bg-black text-white text-xs font-semibold tracking-wide rounded-md hover:bg-black/85 transition-colors"
              >
                <Download className="h-3.5 w-3.5" />
                Read the manuscript (PDF)
              </a>
              <a
                href="https://papers.ssrn.com/sol3/papers.cfm?abstract_id=6464440"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 px-4 py-2.5 border border-black/15 text-black/75 text-xs font-semibold tracking-wide rounded-md hover:border-black/40 hover:text-black transition-colors"
              >
                View on SSRN
              </a>
            </div>

            <div className="mt-6 rounded-lg overflow-hidden border border-black/10 bg-white">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-black/10 px-4 py-3">
                <div>
                  <p className="font-semibold text-sm">Read the paper inside the page</p>
                  <p className="font-mono text-[10px] text-black/40">Embedded PDF viewer</p>
                </div>
                <a
                  href="/research/clank-theory-sehwag-2026.pdf"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs font-semibold text-black/65 hover:text-black transition-colors"
                >
                  Open full screen
                </a>
              </div>
              <div className="relative w-full h-[520px] sm:h-[720px] bg-neutral-100 overflow-hidden">
                <iframe
                  title="CLANK research paper"
                  src="/research/clank-theory-sehwag-2026.pdf#view=Fit&zoom=page-fit&toolbar=1&navpanes=0&scrollbar=1"
                  className="absolute inset-0 w-full h-full border-0"
                  loading="lazy"
                />
              </div>
            </div>

            <p className="font-mono text-[10px] text-black/35 mt-5 leading-relaxed">
              Wired into the terminal as the <span className="text-black/60">CLANK Structural Constraint Engine</span> —
              identifying institutional pressure points, structural locks and deterministic windows
              before the rest of the market sees them.
            </p>
          </article>
        </div>
      </div>
    </section>
  );
}
