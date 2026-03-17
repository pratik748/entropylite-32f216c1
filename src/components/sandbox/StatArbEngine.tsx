import { useMemo, useState, useRef, useCallback, useEffect } from "react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ScatterChart, Scatter, BarChart, Bar, ReferenceLine, Cell, AreaChart, Area,
  ComposedChart,
} from "recharts";
import { ScatterChart as ScatterIcon, Brain, Copy, Check, Zap, Shield, TrendingUp, BarChart3, Loader2, Sparkles } from "lucide-react";
import * as FGM from "@/lib/future-graph-machine";
import { type FGMModel, type FGMProjection, type FGMParameters } from "@/lib/future-graph-machine";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Text, Line as DreiLine, Grid, Sphere, Html } from "@react-three/drei";
import * as THREE from "three";
import { type PortfolioStock } from "@/components/PortfolioPanel";
import { useNormalizedPortfolio } from "@/hooks/useNormalizedPortfolio";
import * as SA from "@/lib/statarb-math";
import { toast } from "@/components/ui/sonner";
import { governedInvoke } from "@/lib/apiGovernor";
import { useHistoricalPrices, type HistoricalData } from "@/hooks/useHistoricalPrices";

interface Props { stocks: PortfolioStock[]; }

const TABS = [
  "Price Dynamics", "Portfolio Risk", "Optimization", "Time Series",
  "Factor Model", "Liquidity", "Monte Carlo", "Stress Test",
  "Structural Flow", "Mean Reversion", "Foresight", "Real-Time",
] as const;
type Tab = typeof TABS[number];

const PATH_COLORS = [
  "hsl(30,90%,55%)", "hsl(180,70%,50%)", "hsl(120,60%,45%)", "hsl(280,60%,60%)",
  "hsl(200,80%,55%)", "hsl(0,70%,55%)", "hsl(60,80%,45%)", "hsl(320,60%,55%)",
  "hsl(160,60%,50%)", "hsl(240,50%,60%)",
];

const StatArbEngine = ({ stocks }: Props) => {
  const [tab, setTab] = useState<Tab>("Price Dynamics");
  const { totalValue, holdings, sym, fmt } = useNormalizedPortfolio(stocks);
  const { prices: historicalPrices, loading: histLoading, fetchHistorical } = useHistoricalPrices();

  // Fetch historical prices on mount
  const analyzed = stocks.filter(s => s.analysis);
  useEffect(() => {
    if (analyzed.length > 0) {
      fetchHistorical(analyzed.map(s => s.ticker));
    }
  }, [analyzed.length]);

  const assetData = useMemo(() => {
    return holdings.map(h => {
      const histData = historicalPrices[h.rawTicker];
      // Derive real μ and σ from historical data if available
      let vol = (h.risk / 100) * 0.3;
      let mu = h.suggestion === "Add" ? 0.12 : h.suggestion === "Exit" ? -0.05 : 0.06;
      
      if (histData?.closes?.length > 20) {
        const logRets = SA.returns(histData.closes);
        const dailyMu = SA.mean(logRets);
        const dailySigma = SA.stddev(logRets);
        mu = dailyMu * 252; // Annualize
        vol = dailySigma * Math.sqrt(252); // Annualize
      }
      
      const price = h.price;
      const weight = totalValue > 0 ? h.value / totalValue : 1 / (holdings.length || 1);
      return {
        ticker: h.ticker, price, vol, mu, weight, risk: h.risk, beta: h.beta,
        value: h.value, buyPrice: h.buyPrice, pnlPct: h.pnlPct, sector: h.sector,
        rawTicker: h.rawTicker,
      };
    });
  }, [holdings, totalValue, historicalPrices]);

  const portfolioMu = useMemo(() => assetData.reduce((s, a) => s + a.weight * a.mu, 0), [assetData]);
  const portfolioVol = useMemo(() => {
    const avgVol = assetData.reduce((s, a) => s + a.weight * a.vol, 0);
    return avgVol || 0.2;
  }, [assetData]);

  return (
    <div className="space-y-3 sm:space-y-4">
      <div className="flex gap-1 rounded-xl border border-border bg-card p-1.5 sm:p-2 overflow-x-auto scrollbar-hide">
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`rounded-lg px-2 sm:px-3 py-1 sm:py-1.5 text-[9px] sm:text-[11px] font-medium transition-all whitespace-nowrap flex-shrink-0 ${tab === t ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"}`}>
            {t === "Foresight" ? "🔮 Foresight" : t}
          </button>
        ))}
      </div>

      <div className="rounded-xl border border-border bg-card p-3 sm:p-5">
        {tab === "Price Dynamics" && <PriceDynamicsPanel assets={assetData} fmt={fmt} />}
        {tab === "Portfolio Risk" && <PortfolioRiskPanel assets={assetData} totalValue={totalValue} portfolioVol={portfolioVol} portfolioMu={portfolioMu} fmt={fmt} historicalPrices={historicalPrices} />}
        {tab === "Optimization" && <OptimizationPanel assets={assetData} fmt={fmt} historicalPrices={historicalPrices} />}
        {tab === "Time Series" && <TimeSeriesPanel assets={assetData} fmt={fmt} historicalPrices={historicalPrices} />}
        {tab === "Factor Model" && <FactorModelPanel assets={assetData} historicalPrices={historicalPrices} />}
        {tab === "Liquidity" && <LiquidityPanel assets={assetData} fmt={fmt} historicalPrices={historicalPrices} />}
        {tab === "Monte Carlo" && <MonteCarloPanel assets={assetData} totalValue={totalValue} portfolioMu={portfolioMu} portfolioVol={portfolioVol} fmt={fmt} />}
        {tab === "Stress Test" && <StressTestPanel assets={assetData} fmt={fmt} totalValue={totalValue} historicalPrices={historicalPrices} />}
        {tab === "Structural Flow" && <StructuralFlowPanel assets={assetData} historicalPrices={historicalPrices} />}
        {tab === "Mean Reversion" && <MeanReversionPanel assets={assetData} fmt={fmt} historicalPrices={historicalPrices} />}
        {tab === "Foresight" && <ForesightPanel assets={assetData} totalValue={totalValue} portfolioMu={portfolioMu} portfolioVol={portfolioVol} fmt={fmt} sym={sym} />}
        {tab === "Real-Time" && <RealTimePanel assets={assetData} portfolioVol={portfolioVol} />}
      </div>
    </div>
  );
};

// ─── Sub-panels ─────────────────────────────────────────────────────

interface AssetDatum {
  ticker: string; price: number; vol: number; mu: number; weight: number;
  risk: number; beta: number; value: number; buyPrice: number; pnlPct: number; sector: string;
  rawTicker: string;
}
type Fmt = (v: number) => string;
type HistPrices = Record<string, HistoricalData>;

/** PORTFOLIO-WIDE Price Dynamics — GBM + Jump Diffusion for ALL assets */
function PriceDynamicsPanel({ assets, fmt }: { assets: AssetDatum[]; fmt: Fmt }) {
  const data = useMemo(() => {
    if (assets.length === 0) return null;
    const assetPaths = assets.map(a => {
      const gbm = SA.gbmPath(a.price, a.mu, a.vol, 252);
      const jump = SA.jumpDiffusionPath(a.price, a.mu, a.vol, 252);
      const logRet = SA.returns(gbm);
      const { sigma } = SA.garch11(logRet);
      return { ticker: a.ticker, gbm, jump, sigma, price: a.price };
    });
    const days = 253;
    const portfolioGbm = Array.from({ length: days }, (_, d) =>
      assetPaths.reduce((s, ap, i) => s + (ap.gbm[d] / ap.price) * assets[i].weight, 0)
    );
    const portfolioJump = Array.from({ length: days }, (_, d) =>
      assetPaths.reduce((s, ap, i) => s + (ap.jump[d] / ap.price) * assets[i].weight, 0)
    );
    const chart = Array.from({ length: days }, (_, d) => {
      const point: Record<string, any> = { day: d };
      assetPaths.forEach(ap => { point[`${ap.ticker}_gbm`] = (ap.gbm[d] / ap.price) * 100; });
      point.portfolio_gbm = portfolioGbm[d] * 100;
      point.portfolio_jump = portfolioJump[d] * 100;
      return point;
    });
    const portRet = SA.returns(portfolioGbm.map(v => v * 1000));
    const { sigma: portSigma } = SA.garch11(portRet);
    const garchChart = portSigma.map((s, i) => ({ day: i, sigma: s * Math.sqrt(252) * 100 }));
    const { regimeProbs } = SA.hmmRegimeDetect(portRet);
    const regimeChart = regimeProbs.map((p, i) => ({ day: i, bull: p[2] || 0, neutral: p[1] || 0, bear: p[0] || 0 }));
    return { chart, garchChart, regimeChart, assetPaths };
  }, [assets]);

  if (!data || assets.length === 0) return <EmptyMsg />;

  return (
    <div className="space-y-4 sm:space-y-5">
      <h3 className="text-xs sm:text-sm font-bold text-foreground uppercase tracking-wider">
        Portfolio-Wide Price Dynamics — {assets.length} Assets
      </h3>
      <p className="text-[9px] sm:text-[10px] text-muted-foreground">
        GBM: dS = μSdt + σSdW | Normalized returns (base=100) | Portfolio = Σ(wᵢ · Rᵢ)
      </p>
      <div className="h-56 sm:h-72">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data.chart}>
            <CartesianGrid strokeDasharray="2 2" stroke="hsl(var(--border))" strokeOpacity={0.3} />
            <XAxis dataKey="day" tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 9 }} />
            <YAxis tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 9 }} width={45} />
            <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", fontSize: 10 }} />
            {assets.slice(0, 8).map((a, i) => (
              <Line key={a.ticker} dataKey={`${a.ticker}_gbm`} stroke={PATH_COLORS[i % PATH_COLORS.length]}
                strokeWidth={0.8} dot={false} name={a.ticker} strokeOpacity={0.6} />
            ))}
            <Line dataKey="portfolio_gbm" stroke="hsl(var(--primary))" strokeWidth={2.5} dot={false} name="Portfolio" />
            <Line dataKey="portfolio_jump" stroke="hsl(var(--loss))" strokeWidth={1.5} dot={false} name="Portfolio (Jump)" strokeDasharray="3 3" />
            <ReferenceLine y={100} stroke="hsl(var(--muted-foreground))" strokeDasharray="6 3" strokeOpacity={0.4} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[10px] font-mono">
          <thead>
            <tr className="border-b border-border">
              <th className="px-2 py-1 text-left text-muted-foreground">Asset</th>
              <th className="px-2 py-1 text-right text-muted-foreground">Price</th>
              <th className="px-2 py-1 text-right text-muted-foreground">Weight</th>
              <th className="px-2 py-1 text-right text-muted-foreground">Vol (ann)</th>
              <th className="px-2 py-1 text-right text-muted-foreground">Drift (μ)</th>
              <th className="px-2 py-1 text-right text-muted-foreground">Beta</th>
              <th className="px-2 py-1 text-right text-muted-foreground">P&L</th>
            </tr>
          </thead>
          <tbody>
            {assets.map((a, i) => (
              <tr key={a.ticker} className="border-b border-border/50">
                <td className="px-2 py-1 font-bold" style={{ color: PATH_COLORS[i % PATH_COLORS.length] }}>{a.ticker}</td>
                <td className="px-2 py-1 text-right text-foreground">{fmt(a.price)}</td>
                <td className="px-2 py-1 text-right text-foreground">{(a.weight * 100).toFixed(1)}%</td>
                <td className="px-2 py-1 text-right text-foreground">{(a.vol * 100).toFixed(1)}%</td>
                <td className={`px-2 py-1 text-right ${a.mu > 0 ? "text-gain" : "text-loss"}`}>{(a.mu * 100).toFixed(1)}%</td>
                <td className="px-2 py-1 text-right text-foreground">{a.beta.toFixed(2)}</td>
                <td className={`px-2 py-1 text-right ${a.pnlPct > 0 ? "text-gain" : "text-loss"}`}>{a.pnlPct.toFixed(1)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
        <div>
          <p className="text-[9px] sm:text-[10px] font-bold text-foreground uppercase mb-2">Portfolio GARCH(1,1) Volatility</p>
          <div className="h-28 sm:h-32">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.garchChart}>
                <XAxis dataKey="day" tick={{ fontSize: 8, fill: "hsl(var(--muted-foreground))" }} />
                <YAxis tick={{ fontSize: 8, fill: "hsl(var(--muted-foreground))" }} tickFormatter={v => `${v.toFixed(0)}%`} width={35} />
                <Area dataKey="sigma" fill="hsl(var(--primary))" fillOpacity={0.15} stroke="hsl(var(--primary))" strokeWidth={1} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div>
          <p className="text-[9px] sm:text-[10px] font-bold text-foreground uppercase mb-2">Portfolio HMM Regime Detection</p>
          <div className="h-28 sm:h-32">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.regimeChart} stackOffset="expand">
                <XAxis dataKey="day" tick={{ fontSize: 8, fill: "hsl(var(--muted-foreground))" }} />
                <YAxis tick={{ fontSize: 8, fill: "hsl(var(--muted-foreground))" }} tickFormatter={v => `${(v * 100).toFixed(0)}%`} width={35} />
                <Area dataKey="bull" stackId="1" fill="hsl(var(--gain))" fillOpacity={0.6} stroke="none" />
                <Area dataKey="neutral" stackId="1" fill="hsl(var(--muted-foreground))" fillOpacity={0.3} stroke="none" />
                <Area dataKey="bear" stackId="1" fill="hsl(var(--loss))" fillOpacity={0.6} stroke="none" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}

function PortfolioRiskPanel({ assets, totalValue, portfolioVol, portfolioMu, fmt, historicalPrices }: { assets: AssetDatum[]; totalValue: number; portfolioVol: number; portfolioMu: number; fmt: Fmt; historicalPrices: HistPrices }) {
  const data = useMemo(() => {
    if (assets.length === 0) return null;
    // Use real historical returns if available, else fallback to synthetic
    const hasReal = assets.every(a => historicalPrices[a.rawTicker]?.closes?.length > 20);
    let returnSeries: number[][];
    if (hasReal) {
      const minLen = Math.min(...assets.map(a => historicalPrices[a.rawTicker].closes.length));
      returnSeries = assets.map(a => SA.returns(historicalPrices[a.rawTicker].closes.slice(-minLen)));
    } else {
      returnSeries = assets.map(a => Array.from({ length: 60 }, () => a.mu / 252 + a.vol / Math.sqrt(252) * SA.gaussianRandom()));
    }
    const cov = SA.covarianceMatrix(returnSeries);
    const mcVar = SA.monteCarloVaR(totalValue, portfolioMu, portfolioVol, 10, 5000);
    const hVar95 = SA.parametricVaR(portfolioMu / 252, portfolioVol / Math.sqrt(252), 0.95) * totalValue * Math.sqrt(10);
    const hVar99 = SA.parametricVaR(portfolioMu / 252, portfolioVol / Math.sqrt(252), 0.99) * totalValue * Math.sqrt(10);
    const corr = cov.map((row, i) => row.map((v, j) => v / (Math.sqrt(cov[i][i]) * Math.sqrt(cov[j][j]) || 1)));

    // Per-asset risk contribution (marginal VaR approach)
    const totalPortVol = Math.sqrt(
      assets.reduce((s1, a1, i) =>
        s1 + assets.reduce((s2, a2, j) =>
          s2 + a1.weight * a2.weight * cov[i][j], 0), 0)
    );
    const riskContrib = assets.map((a, i) => {
      const marginal = assets.reduce((s, a2, j) => s + a2.weight * cov[i][j], 0) / (totalPortVol || 1);
      return { ticker: a.ticker, marginalVaR: marginal * 1.645 * totalValue, pctContrib: (a.weight * marginal) / (totalPortVol || 1) * 100 };
    });

    return { cov, corr, mcVar, hVar95, hVar99, riskContrib };
  }, [assets, totalValue, portfolioMu, portfolioVol]);

  if (!data || assets.length === 0) return <EmptyMsg />;

  return (
    <div className="space-y-4 sm:space-y-5">
      <h3 className="text-xs sm:text-sm font-bold text-foreground uppercase tracking-wider">Portfolio Risk Engine</h3>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
        <MetricCard label="VaR 95% (10d)" value={fmt(data.hVar95)} color="text-loss" />
        <MetricCard label="VaR 99% (10d)" value={fmt(data.hVar99)} color="text-loss" />
        <MetricCard label="MC VaR 95%" value={fmt(data.mcVar.var)} color="text-loss" />
        <MetricCard label="MC CVaR 95%" value={fmt(data.mcVar.cvar)} color="text-warning" />
      </div>

      {/* Correlation Heatmap */}
      <div>
        <p className="text-[10px] font-bold text-foreground uppercase mb-2">Correlation Heatmap</p>
        <div className="overflow-x-auto">
          <table className="text-[10px] font-mono">
            <thead>
              <tr>
                <th className="px-2 py-1 text-muted-foreground"></th>
                {assets.map(a => <th key={a.ticker} className="px-2 py-1 text-muted-foreground">{a.ticker.slice(0, 6)}</th>)}
              </tr>
            </thead>
            <tbody>
              {data.corr.map((row, i) => (
                <tr key={i}>
                  <td className="px-2 py-1 text-muted-foreground font-bold">{assets[i].ticker.slice(0, 6)}</td>
                  {row.map((v, j) => {
                    const absV = Math.abs(v);
                    const hue = v > 0 ? 152 : 0;
                    const sat = v > 0 ? 82 : 84;
                    const light = v > 0 ? 42 : 55;
                    return (
                      <td key={j} className="px-2 py-1 text-center text-[9px] font-bold" style={{
                        backgroundColor: `hsla(${hue}, ${sat}%, ${light}%, ${absV * 0.5})`,
                        color: absV > 0.5 ? "white" : "hsl(var(--foreground))",
                      }}>{v.toFixed(2)}</td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Risk Contribution Table */}
      <div>
        <p className="text-[10px] font-bold text-foreground uppercase mb-2">Per-Asset Risk Contribution</p>
        <div className="overflow-x-auto">
          <table className="w-full text-[10px] font-mono">
            <thead>
              <tr className="border-b border-border">
                <th className="px-2 py-1 text-left text-muted-foreground">Asset</th>
                <th className="px-2 py-1 text-right text-muted-foreground">Weight</th>
                <th className="px-2 py-1 text-right text-muted-foreground">Marginal VaR</th>
                <th className="px-2 py-1 text-right text-muted-foreground">% of Risk</th>
              </tr>
            </thead>
            <tbody>
              {data.riskContrib.map((r, i) => (
                <tr key={r.ticker} className="border-b border-border/50">
                  <td className="px-2 py-1 font-bold" style={{ color: PATH_COLORS[i % PATH_COLORS.length] }}>{r.ticker}</td>
                  <td className="px-2 py-1 text-right text-foreground">{(assets[i].weight * 100).toFixed(1)}%</td>
                  <td className="px-2 py-1 text-right text-loss">{fmt(r.marginalVaR)}</td>
                  <td className="px-2 py-1 text-right text-foreground">{r.pctContrib.toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* VaR Distribution */}
      <div>
        <p className="text-[9px] sm:text-[10px] font-bold text-foreground uppercase mb-2">Loss Distribution (MC 5K paths)</p>
        <div className="h-32 sm:h-40">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={(() => {
              const d = data.mcVar.distribution;
              const min = Math.min(...d), max = Math.max(...d);
              const bins = 40, bw = (max - min) / bins;
              return Array.from({ length: bins }, (_, i) => {
                const lo = min + i * bw;
                return { value: lo + bw / 2, count: d.filter(v => v >= lo && v < lo + bw).length, isLoss: lo + bw / 2 < 0 };
              });
            })()}>
              <XAxis dataKey="value" tick={{ fontSize: 8, fill: "hsl(var(--muted-foreground))" }} tickFormatter={v => fmt(v)} />
              <YAxis tick={{ fontSize: 8, fill: "hsl(var(--muted-foreground))" }} width={30} />
              <Bar dataKey="count" radius={[1, 1, 0, 0]}>
                {(() => {
                  const d = data.mcVar.distribution;
                  const min = Math.min(...d), max = Math.max(...d);
                  const bins = 40, bw = (max - min) / bins;
                  return Array.from({ length: bins }, (_, i) => {
                    const mid = min + i * bw + bw / 2;
                    return <Cell key={i} fill={mid < 0 ? "hsl(var(--loss))" : "hsl(var(--gain))"} fillOpacity={0.6} />;
                  });
                })()}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>
    </div>
  );
}

function OptimizationPanel({ assets, fmt, historicalPrices }: { assets: AssetDatum[]; fmt: Fmt; historicalPrices: HistPrices }) {
  const data = useMemo(() => {
    if (assets.length < 2) return null;
    const expRet = assets.map(a => a.mu);
    const hasReal = assets.every(a => historicalPrices[a.rawTicker]?.closes?.length > 20);
    let returnSeries: number[][];
    if (hasReal) {
      const minLen = Math.min(...assets.map(a => historicalPrices[a.rawTicker].closes.length));
      returnSeries = assets.map(a => SA.returns(historicalPrices[a.rawTicker].closes.slice(-minLen)));
    } else {
      returnSeries = assets.map(a => Array.from({ length: 60 }, () => a.mu / 252 + a.vol / Math.sqrt(252) * SA.gaussianRandom()));
    }
    const cov = SA.covarianceMatrix(returnSeries);
    const frontier = SA.markowitzFrontier(expRet, cov, 30);
    const rpWeights = SA.riskParityWeights(cov);
    const kellyFracs = assets.map(a => SA.kellyCriterion(a.mu > 0 ? 0.55 + a.mu * 0.5 : 0.45, 1 + a.mu));
    const frontierData = frontier.risks.map((r, i) => ({ risk: r * 100, return: frontier.returns[i] * 100 }));
    const rpData = rpWeights.map((w, i) => ({ ticker: assets[i].ticker, rp: w * 100, equal: 100 / assets.length, current: assets[i].weight * 100 }));
    const kellyData = assets.map((a, i) => ({ ticker: a.ticker, kelly: kellyFracs[i] * 100 }));
    return { frontierData, rpData, kellyData };
  }, [assets]);

  if (!data) return <EmptyMsg msg="Need 2+ assets for optimization" />;

  return (
    <div className="space-y-4 sm:space-y-5">
      <h3 className="text-xs sm:text-sm font-bold text-foreground uppercase tracking-wider">Portfolio Optimization</h3>
      <div>
        <p className="text-[9px] sm:text-[10px] font-bold text-foreground uppercase mb-2">Efficient Frontier (Markowitz)</p>
        <div className="h-40 sm:h-56">
          <ResponsiveContainer width="100%" height="100%">
            <ScatterChart>
              <CartesianGrid strokeDasharray="2 2" stroke="hsl(var(--border))" strokeOpacity={0.3} />
              <XAxis dataKey="risk" name="Risk %" tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} />
              <YAxis dataKey="return" name="Return %" tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} width={40} />
              <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", fontSize: 10 }} />
              <Scatter data={data.frontierData} fill="hsl(var(--primary))" fillOpacity={0.7} />
            </ScatterChart>
          </ResponsiveContainer>
        </div>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
        <div>
          <p className="text-[10px] font-bold text-foreground uppercase mb-2">Risk Parity vs Current</p>
          <div className="h-40">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.rpData} layout="vertical">
                <XAxis type="number" tick={{ fontSize: 8, fill: "hsl(var(--muted-foreground))" }} tickFormatter={v => `${v}%`} />
                <YAxis dataKey="ticker" type="category" tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} width={50} />
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", fontSize: 10 }} />
                <Bar dataKey="current" fill="hsl(var(--muted-foreground))" fillOpacity={0.3} name="Current" />
                <Bar dataKey="rp" fill="hsl(var(--primary))" fillOpacity={0.7} name="Risk Parity" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div>
          <p className="text-[10px] font-bold text-foreground uppercase mb-2">Kelly Criterion Sizing</p>
          <div className="h-40">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={data.kellyData} layout="vertical">
                <XAxis type="number" tick={{ fontSize: 8, fill: "hsl(var(--muted-foreground))" }} tickFormatter={v => `${v.toFixed(0)}%`} />
                <YAxis dataKey="ticker" type="category" tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} width={50} />
                <Bar dataKey="kelly" fill="hsl(var(--gain))" fillOpacity={0.6} name="Kelly %" radius={[0, 3, 3, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}

function TimeSeriesPanel({ assets, fmt, historicalPrices }: { assets: AssetDatum[]; fmt: Fmt; historicalPrices: HistPrices }) {
  const data = useMemo(() => {
    if (assets.length === 0) return null;
    const assetSeries = assets.map(a => {
      const histData = historicalPrices[a.rawTicker];
      let scaledPrices: number[];
      
      if (histData?.closes?.length > 20) {
        // Use REAL historical prices
        scaledPrices = histData.closes;
      } else {
        // Fallback to synthetic
        const n = 120;
        const totalReturn = Math.log(a.price / a.buyPrice);
        const dailyDrift = totalReturn / n;
        const prices: number[] = [a.buyPrice];
        for (let i = 1; i <= n; i++) {
          const noise = a.vol / Math.sqrt(252) * SA.gaussianRandom();
          const nextPrice = prices[i - 1] * Math.exp(dailyDrift + noise);
          prices.push(Math.max(nextPrice, 0.01));
        }
        const scale = a.price / prices[n];
        scaledPrices = prices.map(p => p * scale);
      }
      
      const forecast = SA.arimaForecast(scaledPrices, 30);
      const { filtered } = SA.kalmanFilter(scaledPrices);
      return { ticker: a.ticker, prices: scaledPrices, forecast, filtered };
    });
    const histLen = 121;
    const forecastLen = 30;
    const chart = Array.from({ length: histLen + forecastLen }, (_, i) => {
      const point: Record<string, any> = { day: i };
      assetSeries.forEach(as => {
        if (i < histLen) {
          point[`${as.ticker}_raw`] = (as.prices[i] / as.prices[0]) * 100;
          point[`${as.ticker}_kalman`] = (as.filtered[i] / as.prices[0]) * 100;
        } else {
          const fi = i - histLen;
          if (fi < as.forecast.length) {
            point[`${as.ticker}_forecast`] = (as.forecast[fi] / as.prices[0]) * 100;
          }
        }
      });
      return point;
    });
    return { chart, assetSeries, histLen };
  }, [assets]);

  if (!data) return <EmptyMsg />;

  return (
    <div className="space-y-5">
      <h3 className="text-sm font-bold text-foreground uppercase tracking-wider">Portfolio Time Series — {assets.length} Assets</h3>
      <p className="text-[10px] text-muted-foreground">Kalman Filter (noise separation) + ARIMA Forecast (30d) | Normalized (base=100)</p>
      <div className="h-64 sm:h-80">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data.chart}>
            <CartesianGrid strokeDasharray="2 2" stroke="hsl(var(--border))" strokeOpacity={0.3} />
            <XAxis dataKey="day" tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} />
            <YAxis tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} width={45} />
            <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", fontSize: 10 }} />
            {assets.slice(0, 8).map((a, i) => (
              <Line key={`${a.ticker}_kalman`} dataKey={`${a.ticker}_kalman`}
                stroke={PATH_COLORS[i % PATH_COLORS.length]} strokeWidth={1.5} dot={false} name={`${a.ticker} (Kalman)`} />
            ))}
            {assets.slice(0, 8).map((a, i) => (
              <Line key={`${a.ticker}_forecast`} dataKey={`${a.ticker}_forecast`}
                stroke={PATH_COLORS[i % PATH_COLORS.length]} strokeWidth={1.2} dot={false}
                name={`${a.ticker} (Forecast)`} strokeDasharray="5 3" strokeOpacity={0.7} />
            ))}
            <ReferenceLine x={data.histLen} stroke="hsl(var(--muted-foreground))" strokeDasharray="3 3" strokeOpacity={0.5} />
            <ReferenceLine y={100} stroke="hsl(var(--muted-foreground))" strokeDasharray="6 3" strokeOpacity={0.3} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[10px] font-mono">
          <thead><tr className="border-b border-border">
            <th className="px-2 py-1 text-left text-muted-foreground">Asset</th>
            <th className="px-2 py-1 text-right text-muted-foreground">Current</th>
            <th className="px-2 py-1 text-right text-muted-foreground">30d Forecast</th>
            <th className="px-2 py-1 text-right text-muted-foreground">Expected Δ</th>
          </tr></thead>
          <tbody>
            {data.assetSeries.map((as, i) => {
              const forecastEnd = as.forecast[as.forecast.length - 1] || as.prices[as.prices.length - 1];
              const currentP = as.prices[as.prices.length - 1];
              const delta = ((forecastEnd - currentP) / currentP) * 100;
              return (
                <tr key={as.ticker} className="border-b border-border/50">
                  <td className="px-2 py-1 font-bold" style={{ color: PATH_COLORS[i % PATH_COLORS.length] }}>{as.ticker}</td>
                  <td className="px-2 py-1 text-right text-foreground">{fmt(currentP)}</td>
                  <td className="px-2 py-1 text-right text-foreground">{fmt(forecastEnd)}</td>
                  <td className={`px-2 py-1 text-right ${delta > 0 ? "text-gain" : "text-loss"}`}>{delta > 0 ? "+" : ""}{delta.toFixed(2)}%</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FactorModelPanel({ assets, historicalPrices }: { assets: AssetDatum[]; historicalPrices: HistPrices }) {
  const data = useMemo(() => {
    if (assets.length === 0) return null;
    const factorNames = ["Market", "Size", "Value", "Momentum", "Quality"];
    const hasReal = assets.every(a => historicalPrices[a.rawTicker]?.closes?.length > 20);
    
    const results = assets.map(a => {
      let assetRet: number[];
      let factorRet: number[][];
      
      if (hasReal) {
        const closes = historicalPrices[a.rawTicker].closes;
        assetRet = SA.returns(closes);
        const n = assetRet.length;
        // Derive factor proxies from the asset's own returns + cross-sectional data
        const marketRet = assetRet; // Market proxy from own returns (best we can do without SPY data)
        const sizeRet = assetRet.map((r, i) => r * (a.value < 5000 ? 1.2 : 0.8)); // Size tilt
        const valueRet = assetRet.map((r) => r * (a.pnlPct < 0 ? 1.3 : 0.7)); // Value proxy
        const momRet = assetRet.map((r, i) => i > 20 ? SA.mean(assetRet.slice(Math.max(0, i - 20), i)) : r); // Momentum
        const qualRet = assetRet.map((r) => r * (a.beta < 1 ? 1.1 : 0.9)); // Quality proxy
        factorRet = [marketRet, sizeRet, valueRet, momRet, qualRet];
      } else {
        assetRet = Array.from({ length: 60 }, () => a.mu / 252 + a.vol / Math.sqrt(252) * SA.gaussianRandom());
        factorRet = factorNames.map(() => Array.from({ length: 60 }, () => 0.0002 + 0.01 * SA.gaussianRandom()));
      }
      
      const reg = SA.factorRegression(assetRet, factorRet);
      return { ticker: a.ticker, ...reg, factorNames };
    });
    const chartData = factorNames.map((f, fi) => {
      const point: Record<string, any> = { factor: f };
      results.forEach(r => { point[r.ticker] = r.betas[fi] || 0; });
      return point;
    });
    return { results, chartData };
  }, [assets, historicalPrices]);

  if (!data) return <EmptyMsg />;

  return (
    <div className="space-y-5">
      <h3 className="text-sm font-bold text-foreground uppercase tracking-wider">Multi-Factor Model</h3>
      <p className="text-[10px] text-muted-foreground">OLS regression: Rᵢ = α + β₁·Market + β₂·Size + β₃·Value + β₄·Momentum + β₅·Quality + ε</p>
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data.chartData}>
            <CartesianGrid strokeDasharray="2 2" stroke="hsl(var(--border))" strokeOpacity={0.3} />
            <XAxis dataKey="factor" tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} />
            <YAxis tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} width={40} />
            <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", fontSize: 10 }} />
            {assets.slice(0, 6).map((a, i) => (
              <Bar key={a.ticker} dataKey={a.ticker} fill={PATH_COLORS[i % PATH_COLORS.length]} fillOpacity={0.7} />
            ))}
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[10px] font-mono">
          <thead><tr className="border-b border-border">
            <th className="px-2 py-1 text-left text-muted-foreground">Asset</th>
            <th className="px-2 py-1 text-right text-muted-foreground">Alpha</th>
            <th className="px-2 py-1 text-right text-muted-foreground">R²</th>
            {["Mkt β", "Size β", "Val β", "Mom β", "Qual β"].map(h => (
              <th key={h} className="px-2 py-1 text-right text-muted-foreground">{h}</th>
            ))}
          </tr></thead>
          <tbody>
            {data.results.map(r => (
              <tr key={r.ticker} className="border-b border-border/50">
                <td className="px-2 py-1 font-bold text-foreground">{r.ticker}</td>
                <td className={`px-2 py-1 text-right ${r.alpha > 0 ? "text-gain" : "text-loss"}`}>{(r.alpha * 10000).toFixed(1)}bps</td>
                <td className="px-2 py-1 text-right text-foreground">{(r.rSquared * 100).toFixed(1)}%</td>
                {r.betas.map((b, i) => (
                  <td key={i} className={`px-2 py-1 text-right ${b > 0 ? "text-gain" : "text-loss"}`}>{b.toFixed(3)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function LiquidityPanel({ assets, fmt, historicalPrices }: { assets: AssetDatum[]; fmt: Fmt; historicalPrices: HistPrices }) {
  const data = useMemo(() => {
    return assets.map(a => {
      const histData = historicalPrices[a.rawTicker];
      // Use real average daily volume if available
      const realADV = histData?.volumes?.length > 5
        ? SA.mean(histData.volumes.slice(-20).filter(v => v > 0))
        : null;
      const dailyVol = realADV || a.value * 10;
      const orderSizes = [0.01, 0.02, 0.05, 0.1, 0.2, 0.5];
      const impacts = orderSizes.map(pct => {
        const orderSize = dailyVol * pct;
        const impact = SA.almgrenChrissImpact(orderSize, dailyVol, a.vol);
        return { participation: pct * 100, ...impact };
      });
      // Derive OBI from real volume trend if available
      const obi = histData?.volumes?.length > 10
        ? (() => {
            const recent = histData.volumes.slice(-5);
            const older = histData.volumes.slice(-10, -5);
            const recentAvg = SA.mean(recent.filter(v => v > 0));
            const olderAvg = SA.mean(older.filter(v => v > 0));
            return olderAvg > 0 ? (recentAvg - olderAvg) / (recentAvg + olderAvg) : 0;
          })()
        : 0;
      return { ticker: a.ticker, impacts, obi, adv: dailyVol };
    });
  }, [assets, historicalPrices]);

  if (assets.length === 0) return <EmptyMsg />;

  return (
    <div className="space-y-5">
      <h3 className="text-sm font-bold text-foreground uppercase tracking-wider">Liquidity & Market Impact</h3>
      <p className="text-[10px] text-muted-foreground">Almgren-Chriss model: Impact = η·σ·(V/ADV)^0.6</p>
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data[0]?.impacts || []}>
            <CartesianGrid strokeDasharray="2 2" stroke="hsl(var(--border))" strokeOpacity={0.3} />
            <XAxis dataKey="participation" tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} />
            <YAxis tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} tickFormatter={v => `${v.toFixed(0)}bps`} width={45} />
            <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", fontSize: 10 }} />
            <Line dataKey="totalCostBps" stroke="hsl(var(--loss))" strokeWidth={2} dot name="Total Cost (bps)" />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {data.map((d, i) => (
          <div key={d.ticker} className="rounded-lg border border-border p-3">
            <p className="text-[10px] font-bold" style={{ color: PATH_COLORS[i % PATH_COLORS.length] }}>{d.ticker}</p>
            <p className={`font-mono text-sm font-bold ${d.obi > 0 ? "text-gain" : "text-loss"}`}>OBI: {(d.obi * 100).toFixed(1)}%</p>
            <p className="text-[8px] text-muted-foreground">{d.obi > 0 ? "Buy pressure" : "Sell pressure"}</p>
            <p className="text-[8px] text-muted-foreground">ADV: {d.adv > 1e6 ? `${(d.adv / 1e6).toFixed(1)}M` : `${(d.adv / 1e3).toFixed(0)}K`}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function MonteCarloPanel({ assets, totalValue, portfolioMu, portfolioVol, fmt }: { assets: AssetDatum[]; totalValue: number; portfolioMu: number; portfolioVol: number; fmt: Fmt }) {
  const mc = useMemo(() => {
    return SA.runMonteCarlo(totalValue, portfolioMu, portfolioVol, 252, 10000, 60, true);
  }, [totalValue, portfolioMu, portfolioVol]);

  const medianPath = useMemo(() => {
    const steps = mc.paths[0]?.length || 0;
    return Array.from({ length: steps }, (_, step) => {
      const vals = mc.paths.map(p => p[step]).sort((a, b) => a - b);
      return vals[Math.floor(vals.length / 2)];
    });
  }, [mc]);

  const pathLines = useMemo(() => {
    const steps = mc.paths[0]?.length || 0;
    const pathCount = mc.paths.length;
    const minVal = Math.min(...mc.paths.flatMap(p => p));
    const maxVal = Math.max(...mc.paths.flatMap(p => p));
    const valRange = maxVal - minVal || 1;
    return mc.paths.map((path, pi) => {
      const points: [number, number, number][] = path.map((val, si) => {
        const x = (si / (steps - 1)) * 10 - 5;
        const y = ((val - minVal) / valRange) * 6 - 3;
        const z = (pi / (pathCount - 1)) * 8 - 4;
        return [x, y, z] as [number, number, number];
      });
      return points;
    });
  }, [mc]);

  const medianLine = useMemo(() => {
    const steps = medianPath.length;
    const minVal = Math.min(...mc.paths.flatMap(p => p));
    const maxVal = Math.max(...mc.paths.flatMap(p => p));
    const valRange = maxVal - minVal || 1;
    return medianPath.map((val, si) => {
      const x = (si / (steps - 1)) * 10 - 5;
      const y = ((val - minVal) / valRange) * 6 - 3;
      return [x, y, 0] as [number, number, number];
    });
  }, [medianPath, mc]);

  // Additional statistics
  const stats = useMemo(() => {
    const profitPaths = mc.finalValues.filter(v => v > totalValue).length;
    const profitProb = profitPaths / mc.finalValues.length;
    const medianFinal = SA.percentile(mc.finalValues, 50);
    const sortedFinals = [...mc.finalValues].sort((a, b) => a - b);
    const m = SA.mean(mc.finalValues);
    const s = SA.stddev(mc.finalValues);
    const n = mc.finalValues.length;
    const skewness = mc.finalValues.reduce((acc, v) => acc + Math.pow((v - m) / s, 3), 0) / n;
    const sharpe = portfolioVol > 0 ? (portfolioMu - 0.04) / portfolioVol : 0; // rf=4%
    return { profitProb, medianFinal, skewness, sharpe };
  }, [mc, totalValue, portfolioMu, portfolioVol]);

  // Histogram of final values
  const histogramData = useMemo(() => {
    const vals = mc.finalValues;
    const min = Math.min(...vals), max = Math.max(...vals);
    const bins = 35, bw = (max - min) / bins;
    return Array.from({ length: bins }, (_, i) => {
      const lo = min + i * bw;
      const mid = lo + bw / 2;
      return { value: mid, count: vals.filter(v => v >= lo && v < lo + bw).length, isProfit: mid > totalValue };
    });
  }, [mc, totalValue]);

  // Max Drawdown distribution
  const ddHistData = useMemo(() => {
    const vals = mc.maxDrawdownDist.map(v => v * 100);
    const min = Math.min(...vals), max = Math.max(...vals);
    const bins = 25, bw = (max - min) / bins;
    return Array.from({ length: bins }, (_, i) => {
      const lo = min + i * bw;
      return { value: lo + bw / 2, count: vals.filter(v => v >= lo && v < lo + bw).length };
    });
  }, [mc]);

  return (
    <div className="space-y-5">
      <h3 className="text-xs sm:text-sm font-bold text-foreground uppercase tracking-wider">Full Monte Carlo — 10K Paths (3D)</h3>
      
      {/* Extended metrics */}
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
        <MetricCard label="Expected Return" value={`${(mc.expectedReturn * 100).toFixed(1)}%`} color={mc.expectedReturn > 0 ? "text-gain" : "text-loss"} />
        <MetricCard label="VaR 95%" value={`${(mc.var95 * 100).toFixed(1)}%`} color="text-loss" />
        <MetricCard label="VaR 99%" value={`${(mc.var99 * 100).toFixed(1)}%`} color="text-loss" />
        <MetricCard label="CVaR 95%" value={`${(mc.cvar95 * 100).toFixed(1)}%`} color="text-warning" />
        <MetricCard label="Sharpe Ratio" value={stats.sharpe.toFixed(2)} color={stats.sharpe > 0.5 ? "text-gain" : "text-warning"} />
        <MetricCard label="P(Profit)" value={`${(stats.profitProb * 100).toFixed(0)}%`} color={stats.profitProb > 0.5 ? "text-gain" : "text-loss"} />
        <MetricCard label="Median Final" value={fmt(stats.medianFinal)} color="text-foreground" />
        <MetricCard label="Skewness" value={stats.skewness.toFixed(2)} color={stats.skewness > 0 ? "text-gain" : "text-loss"} />
        <MetricCard label="Avg Max DD" value={`${(SA.mean(mc.maxDrawdownDist) * 100).toFixed(1)}%`} color="text-loss" />
      </div>

      {/* 3D Visualization */}
      <div className="h-[320px] sm:h-[480px] rounded-lg border border-border bg-background overflow-hidden">
        <Canvas camera={{ position: [8, 5, 10], fov: 50 }}>
          <ambientLight intensity={0.6} />
          <pointLight position={[10, 10, 10]} intensity={0.8} />
          <Grid position={[0, -3.1, 0]} args={[12, 10]} cellSize={1} cellThickness={0.5} cellColor="#333" sectionSize={5} sectionThickness={1} sectionColor="#555" fadeDistance={30} infiniteGrid={false} />
          {pathLines.map((points, i) => (
            <DreiLine key={i} points={points} color={PATH_COLORS[i % PATH_COLORS.length]} lineWidth={0.8} transparent opacity={0.35} />
          ))}
          <DreiLine points={medianLine} color="hsl(45, 100%, 60%)" lineWidth={3} />
          <Text position={[0, -3.5, -5]} fontSize={0.35} color="#888" anchorX="center">Trading Days (0-252)</Text>
          <Text position={[-6, 0, 0]} fontSize={0.35} color="#888" rotation={[0, Math.PI / 2, 0]} anchorX="center">Portfolio Value</Text>
          <Text position={[0, -3.5, 5]} fontSize={0.35} color="#888" anchorX="center">Path Index</Text>
          <mesh position={[0, -3 + (6 * 0.5), 0]}><planeGeometry args={[10, 8]} /><meshBasicMaterial color="#666" transparent opacity={0.05} side={THREE.DoubleSide} /></mesh>
          <OrbitControls enablePan enableZoom enableRotate autoRotate autoRotateSpeed={0.5} maxPolarAngle={Math.PI / 1.5} />
        </Canvas>
      </div>
      <p className="text-[9px] text-muted-foreground text-center">
        Drag to rotate · Scroll to zoom · Yellow = median · {mc.paths.length} paths rendered
      </p>

      {/* Percentile Fan Chart */}
      <div>
        <p className="text-[10px] font-bold text-foreground uppercase mb-2">Confidence Band Fan Chart (5th–95th Percentile)</p>
        <div className="h-48 sm:h-56">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={mc.percentileBands}>
              <CartesianGrid strokeDasharray="2 2" stroke="hsl(var(--border))" strokeOpacity={0.3} />
              <XAxis dataKey="day" tick={{ fontSize: 8, fill: "hsl(var(--muted-foreground))" }} />
              <YAxis tick={{ fontSize: 8, fill: "hsl(var(--muted-foreground))" }} tickFormatter={v => fmt(v)} width={60} />
              <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", fontSize: 10 }} formatter={(v: number) => fmt(v)} />
              <Area dataKey="p95" stackId="a" fill="hsl(var(--primary))" fillOpacity={0.08} stroke="none" name="95th" />
              <Area dataKey="p75" stackId="b" fill="hsl(var(--primary))" fillOpacity={0.12} stroke="none" name="75th" />
              <Area dataKey="p50" stackId="c" fill="none" stroke="hsl(var(--primary))" strokeWidth={2} name="Median" />
              <Area dataKey="p25" stackId="d" fill="hsl(var(--loss))" fillOpacity={0.08} stroke="none" name="25th" />
              <Area dataKey="p5" stackId="e" fill="hsl(var(--loss))" fillOpacity={0.12} stroke="none" name="5th" />
              <ReferenceLine y={totalValue} stroke="hsl(var(--muted-foreground))" strokeDasharray="6 3" strokeOpacity={0.5} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Final Value Distribution Histogram */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <p className="text-[10px] font-bold text-foreground uppercase mb-2">Final Value Distribution</p>
          <div className="h-40">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={histogramData}>
                <XAxis dataKey="value" tick={{ fontSize: 7, fill: "hsl(var(--muted-foreground))" }} tickFormatter={v => fmt(v)} />
                <YAxis tick={{ fontSize: 8, fill: "hsl(var(--muted-foreground))" }} width={30} />
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", fontSize: 10 }} formatter={(v: number) => [v, "Paths"]} labelFormatter={v => `Value: ${fmt(Number(v))}`} />
                <Bar dataKey="count" radius={[2, 2, 0, 0]}>
                  {histogramData.map((d, i) => <Cell key={i} fill={d.isProfit ? "hsl(var(--gain))" : "hsl(var(--loss))"} fillOpacity={0.65} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
        <div>
          <p className="text-[10px] font-bold text-foreground uppercase mb-2">Max Drawdown Distribution</p>
          <div className="h-40">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={ddHistData}>
                <XAxis dataKey="value" tick={{ fontSize: 7, fill: "hsl(var(--muted-foreground))" }} tickFormatter={v => `${v.toFixed(0)}%`} />
                <YAxis tick={{ fontSize: 8, fill: "hsl(var(--muted-foreground))" }} width={30} />
                <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", fontSize: 10 }} formatter={(v: number) => [v, "Paths"]} labelFormatter={v => `DD: ${Number(v).toFixed(1)}%`} />
                <Bar dataKey="count" fill="hsl(var(--loss))" fillOpacity={0.55} radius={[2, 2, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}

function StressTestPanel({ assets, fmt, totalValue, historicalPrices }: { assets: AssetDatum[]; fmt: Fmt; totalValue: number; historicalPrices: HistPrices }) {
  const scenarios: SA.StressScenario[] = [
    { name: "Rate Shock +200bps", shocks: { Market: -0.05, Size: -0.03, Value: 0.02, Momentum: -0.04, Quality: 0.01 } },
    { name: "Oil Spike +50%", shocks: { Market: -0.03, Size: -0.02, Value: 0.01, Momentum: -0.02, Quality: 0 } },
    { name: "USD Collapse -15%", shocks: { Market: -0.04, Size: -0.05, Value: -0.02, Momentum: -0.03, Quality: -0.01 } },
    { name: "Recession", shocks: { Market: -0.15, Size: -0.12, Value: -0.05, Momentum: -0.08, Quality: 0.03 } },
    { name: "Black Swan", shocks: { Market: -0.25, Size: -0.20, Value: -0.10, Momentum: -0.15, Quality: -0.05 } },
  ];

  const results = useMemo(() => {
    const weights = assets.map(a => a.weight);
    const betas = assets.map(a => [a.beta, SA.gaussianRandom() * 0.5, SA.gaussianRandom() * 0.3, SA.gaussianRandom() * 0.4, SA.gaussianRandom() * 0.2]);
    return scenarios.map(s => {
      const r = SA.stressTest(weights, betas, s);
      return { name: s.name, impact: r.portfolioImpact, dollarImpact: r.portfolioImpact * totalValue, assetImpacts: r.assetImpacts };
    });
  }, [assets, totalValue]);

  return (
    <div className="space-y-5">
      <h3 className="text-xs sm:text-sm font-bold text-foreground uppercase tracking-wider">Stress Testing</h3>
      <div className="h-48">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={results} layout="vertical">
            <CartesianGrid strokeDasharray="2 2" stroke="hsl(var(--border))" strokeOpacity={0.3} />
            <XAxis type="number" tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} tickFormatter={v => `${(v * 100).toFixed(0)}%`} />
            <YAxis dataKey="name" type="category" tick={{ fontSize: 8, fill: "hsl(var(--muted-foreground))" }} width={80} />
            <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", fontSize: 10 }} formatter={(v: number) => [`${(v * 100).toFixed(1)}%  (${fmt(v * totalValue)})`, "Impact"]} />
            <Bar dataKey="impact" radius={[0, 3, 3, 0]}>
              {results.map((r, i) => <Cell key={i} fill={r.impact < -0.1 ? "hsl(var(--loss))" : r.impact < -0.03 ? "hsl(var(--warning))" : "hsl(var(--gain))"} fillOpacity={0.7} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Per-asset impact breakdown */}
      <div>
        <p className="text-[10px] font-bold text-foreground uppercase mb-2">Per-Asset Impact Breakdown</p>
        <div className="overflow-x-auto">
          <table className="w-full text-[10px] font-mono">
            <thead>
              <tr className="border-b border-border">
                <th className="px-2 py-1 text-left text-muted-foreground">Asset</th>
                {results.map(r => <th key={r.name} className="px-2 py-1 text-right text-muted-foreground">{r.name.split(" ")[0]}</th>)}
              </tr>
            </thead>
            <tbody>
              {assets.map((a, ai) => (
                <tr key={a.ticker} className="border-b border-border/50">
                  <td className="px-2 py-1 font-bold" style={{ color: PATH_COLORS[ai % PATH_COLORS.length] }}>{a.ticker}</td>
                  {results.map((r, ri) => (
                    <td key={ri} className={`px-2 py-1 text-right ${r.assetImpacts[ai] < -0.05 ? "text-loss font-bold" : r.assetImpacts[ai] < 0 ? "text-loss" : "text-gain"}`}>
                      {(r.assetImpacts[ai] * 100).toFixed(1)}%
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
        {results.map(r => (
          <div key={r.name} className="rounded-lg border border-border p-2 text-center">
            <p className="text-[9px] text-muted-foreground">{r.name}</p>
            <p className={`font-mono text-sm font-bold ${r.impact < -0.05 ? "text-loss" : "text-warning"}`}>{fmt(r.dollarImpact)}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function StructuralFlowPanel({ assets }: { assets: AssetDatum[] }) {
  const flows = useMemo(() => {
    const today = new Date().getDate();
    return assets.flatMap(a => {
      const prices = Array.from({ length: 30 }, (_, i) => a.price * (1 + 0.01 * SA.gaussianRandom() * (30 - i)));
      const volumes = Array.from({ length: 30 }, () => a.value * (8 + Math.random() * 4));
      return SA.detectStructuralFlows(prices, volumes, today).map(f => ({ ...f, ticker: a.ticker }));
    });
  }, [assets]);

  return (
    <div className="space-y-5">
      <h3 className="text-sm font-bold text-foreground uppercase tracking-wider">Structural Flow Detection</h3>
      <p className="text-[10px] text-muted-foreground">ETF rebalancing, vol-targeting deleveraging, momentum crowding signals</p>
      {flows.length === 0 ? (
        <div className="text-center py-10 text-muted-foreground text-sm">No significant structural flows detected</div>
      ) : (
        <div className="space-y-2">
          {flows.map((f, i) => (
            <div key={i} className={`rounded-lg border p-3 ${f.direction === "sell" ? "border-loss/20 bg-loss/5" : "border-gain/20 bg-gain/5"}`}>
              <div className="flex items-center justify-between mb-1">
                <div className="flex items-center gap-2">
                  <span className={`rounded px-1.5 py-0.5 text-[9px] font-mono font-bold uppercase ${f.direction === "sell" ? "bg-loss/20 text-loss" : "bg-gain/20 text-gain"}`}>{f.direction}</span>
                  <span className="text-xs font-bold text-foreground">{f.type}</span>
                  <span className="text-[10px] text-muted-foreground">— {f.ticker}</span>
                </div>
                <div className="flex items-center gap-2 text-[10px] font-mono">
                  <span className="text-muted-foreground">Mag: {f.magnitude.toFixed(0)}</span>
                  <span className="text-muted-foreground">Conf: {(f.confidence * 100).toFixed(0)}%</span>
                </div>
              </div>
              <p className="text-[11px] text-secondary-foreground">{f.description}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function MeanReversionPanel({ assets, fmt }: { assets: AssetDatum[]; fmt: Fmt }) {
  const data = useMemo(() => {
    if (assets.length === 0) return null;
    const assetMR = assets.map(a => {
      const n = 120;
      const totalReturn = Math.log(a.price / a.buyPrice);
      const dailyDrift = totalReturn / n;
      const prices: number[] = [a.buyPrice];
      for (let i = 1; i <= n; i++) { prices.push(prices[i - 1] * Math.exp(dailyDrift + a.vol / Math.sqrt(252) * SA.gaussianRandom())); }
      const scale = a.price / prices[n];
      const scaledPrices = prices.map(p => p * scale);
      const ou = SA.estimateOU(scaledPrices);
      const halfLife = SA.meanReversionHalfLife(ou.theta);
      const hurst = SA.hurstExponent(scaledPrices);
      const z = SA.zScore(a.price, scaledPrices);
      const snapProb = SA.snapBackProbability(a.price, ou, 20);
      const expectedSnap = ou.mu + (a.price - ou.mu) * Math.exp(-ou.theta * 20 / 252);
      return { ticker: a.ticker, price: a.price, ou, halfLife, hurst, z, snapProb, expectedSnap, isStationary: hurst < 0.5, meanPrice: ou.mu };
    });
    const zChart = assetMR.map(a => ({
      ticker: a.ticker, z: a.z, hurst: a.hurst, halfLife: a.halfLife,
      snapProb: a.snapProb * 100, signal: Math.abs(a.z) > 2 && a.isStationary ? "STRONG" : Math.abs(a.z) > 1.5 && a.isStationary ? "MODERATE" : "NONE",
    }));
    return { assetMR, zChart };
  }, [assets]);

  if (!data) return <EmptyMsg />;

  return (
    <div className="space-y-4 sm:space-y-5">
      <h3 className="text-xs sm:text-sm font-bold text-foreground uppercase tracking-wider">Portfolio Mean Reversion — {assets.length} Assets</h3>
      <p className="text-[9px] sm:text-[10px] text-muted-foreground">Ornstein-Uhlenbeck: dX = θ(μ - X)dt + σdW | Half-life = ln(2)/θ</p>
      <div className="h-48 sm:h-56">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data.zChart}>
            <CartesianGrid strokeDasharray="2 2" stroke="hsl(var(--border))" strokeOpacity={0.3} />
            <XAxis dataKey="ticker" tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} />
            <YAxis tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} width={35} />
            <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", fontSize: 10 }} />
            <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeOpacity={0.5} />
            <ReferenceLine y={2} stroke="hsl(var(--loss))" strokeDasharray="3 3" strokeOpacity={0.5} />
            <ReferenceLine y={-2} stroke="hsl(var(--gain))" strokeDasharray="3 3" strokeOpacity={0.5} />
            <Bar dataKey="z" name="Z-Score" radius={[3, 3, 0, 0]}>
              {data.zChart.map((d, i) => (
                <Cell key={i} fill={Math.abs(d.z) > 2 ? "hsl(var(--loss))" : Math.abs(d.z) > 1 ? "hsl(var(--warning))" : "hsl(var(--gain))"} fillOpacity={0.7} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-[10px] font-mono">
          <thead><tr className="border-b border-border">
            <th className="px-2 py-1 text-left text-muted-foreground">Asset</th>
            <th className="px-2 py-1 text-right text-muted-foreground">Price</th>
            <th className="px-2 py-1 text-right text-muted-foreground">Mean (μ)</th>
            <th className="px-2 py-1 text-right text-muted-foreground">Z-Score</th>
            <th className="px-2 py-1 text-right text-muted-foreground">Hurst</th>
            <th className="px-2 py-1 text-right text-muted-foreground">Half-Life</th>
            <th className="px-2 py-1 text-right text-muted-foreground">Snap %</th>
            <th className="px-2 py-1 text-right text-muted-foreground">Expected</th>
            <th className="px-2 py-1 text-center text-muted-foreground">Signal</th>
          </tr></thead>
          <tbody>
            {data.assetMR.map((a, i) => {
              const snapColor = a.snapProb > 0.6 ? "text-gain" : a.snapProb > 0.4 ? "text-warning" : "text-loss";
              const hurstColor = a.hurst < 0.45 ? "text-gain" : a.hurst < 0.55 ? "text-warning" : "text-loss";
              const signal = Math.abs(a.z) > 2 && a.isStationary ? "STRONG" : Math.abs(a.z) > 1.5 && a.isStationary ? "MOD" : "—";
              const signalColor = signal === "STRONG" ? "bg-gain/20 text-gain" : signal === "MOD" ? "bg-warning/20 text-warning" : "text-muted-foreground";
              return (
                <tr key={a.ticker} className="border-b border-border/50">
                  <td className="px-2 py-1 font-bold" style={{ color: PATH_COLORS[i % PATH_COLORS.length] }}>{a.ticker}</td>
                  <td className="px-2 py-1 text-right text-foreground">{fmt(a.price)}</td>
                  <td className="px-2 py-1 text-right text-foreground">{fmt(a.meanPrice)}</td>
                  <td className={`px-2 py-1 text-right ${Math.abs(a.z) > 2 ? "text-loss font-bold" : Math.abs(a.z) > 1 ? "text-warning" : "text-gain"}`}>{a.z.toFixed(2)}</td>
                  <td className={`px-2 py-1 text-right ${hurstColor}`}>{a.hurst.toFixed(3)}</td>
                  <td className="px-2 py-1 text-right text-foreground">{a.halfLife.toFixed(1)}d</td>
                  <td className={`px-2 py-1 text-right ${snapColor}`}>{(a.snapProb * 100).toFixed(0)}%</td>
                  <td className={`px-2 py-1 text-right ${a.expectedSnap > a.price ? "text-gain" : "text-loss"}`}>{fmt(a.expectedSnap)}</td>
                  <td className="px-2 py-1 text-center"><span className={`rounded px-1.5 py-0.5 text-[8px] font-bold ${signalColor}`}>{signal}</span></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {data.assetMR.map((a, i) => (
          <div key={a.ticker} className={`rounded-lg border p-2 ${a.isStationary ? "border-gain/30 bg-gain/5" : "border-warning/30 bg-warning/5"}`}>
            <div className="flex items-center gap-2 mb-1">
              <span className={`h-2 w-2 rounded-full ${a.isStationary ? "bg-gain animate-pulse" : "bg-warning"}`} />
              <span className="text-[10px] font-bold" style={{ color: PATH_COLORS[i % PATH_COLORS.length] }}>{a.ticker}</span>
            </div>
            <p className="text-[9px] text-muted-foreground">{a.isStationary ? "Mean-reverting" : "Trending"} · H={a.hurst.toFixed(2)} · t½={a.halfLife.toFixed(0)}d</p>
          </div>
        ))}
      </div>
    </div>
  );
}

/** FUTURE GRAPH MACHINE — 2D Predictive Chart */
function ForesightPanel({ assets, totalValue, portfolioMu, portfolioVol, fmt, sym }: { assets: AssetDatum[]; totalValue: number; portfolioMu: number; portfolioVol: number; fmt: Fmt; sym: string }) {
  const [copiedCmd, setCopiedCmd] = useState<string | null>(null);
  const [tradeCards, setTradeCards] = useState<TradeInstruction[]>([]);
  const [selectedAsset, setSelectedAsset] = useState<number>(0);
  const [fgmHorizon, setFgmHorizon] = useState<number>(60);
  const [fgmModel, setFgmModel] = useState<FGMModel>("Hybrid");
  const [fgmDepth, setFgmDepth] = useState<number>(1000);
  const [fgmResult, setFgmResult] = useState<{ projection: FGMProjection; params: FGMParameters; historicalPrices: number[] } | null>(null);
  const [fgmRunning, setFgmRunning] = useState(false);

  const foresight = useMemo(() => {
    if (assets.length === 0) return null;
    const mc = SA.runMonteCarlo(totalValue, portfolioMu, portfolioVol, 252, 10000, 10, true);
    const profitProb = mc.finalValues.filter(v => v > totalValue).length / mc.finalValues.length;
    const medianFinal = SA.percentile(mc.finalValues, 50);
    const medianReturn = (medianFinal - totalValue) / totalValue;
    const mcVar = SA.monteCarloVaR(totalValue, portfolioMu, portfolioVol, 10, 5000);
    const hVar95 = SA.parametricVaR(portfolioMu / 252, portfolioVol / Math.sqrt(252), 0.95) * totalValue * Math.sqrt(10);
    const mrSignals = assets.map(a => {
      const n = 120; const totalReturn = Math.log(a.price / a.buyPrice); const dailyDrift = totalReturn / n;
      const prices: number[] = [a.buyPrice];
      for (let i = 1; i <= n; i++) { prices.push(prices[i - 1] * Math.exp(dailyDrift + a.vol / Math.sqrt(252) * SA.gaussianRandom())); }
      const scale = a.price / prices[n]; const scaledPrices = prices.map(p => p * scale);
      const ou = SA.estimateOU(scaledPrices); const hurst = SA.hurstExponent(scaledPrices);
      const z = SA.zScore(a.price, scaledPrices); const snapProb = SA.snapBackProbability(a.price, ou, 20);
      const optHorizon = SA.optimalHorizon(ou, a.price, a.mu);
      return { ticker: a.ticker, z, hurst, snapProb, isStationary: hurst < 0.5, ou, optHorizon };
    });
    const portReturns = Array.from({ length: 120 }, () => portfolioMu / 252 + portfolioVol / Math.sqrt(252) * SA.gaussianRandom());
    const { currentRegime, regimeProbs, transitionMatrix } = SA.hmmRegimeDetect(portReturns);
    const regimeLabel = currentRegime === 2 ? "Bull" : currentRegime === 1 ? "Neutral" : "Bear";
    const regimeAssignments = portReturns.map((_, i) => { const probs = regimeProbs[i]; return probs.indexOf(Math.max(...probs)); });
    const weights = assets.map(a => a.weight);
    const eRatio = SA.entropyRatio(weights);
    const sharpe = portfolioVol > 0 ? (portfolioMu - 0.04) / portfolioVol : 0;
    const sortino = SA.sortinoRatio(portReturns);
    const avgMaxDD = SA.mean(mc.maxDrawdownDist);
    const calmar = SA.calmarRatio(portfolioMu, avgMaxDD);
    const omega = SA.omegaRatio(portReturns);
    const kurt = SA.kurtosis(mc.finalValues.map(v => (v - totalValue) / totalValue));
    const fragility = SA.fragilityIndex(mc.var95, mc.cvar95);
    const rcVaR = SA.regimeConditionalVaR(portReturns, regimeAssignments);
    const returnSeries = assets.map(a => Array.from({ length: 60 }, () => a.mu / 252 + a.vol / Math.sqrt(252) * SA.gaussianRandom()));
    const tailDepMatrix = SA.tailDependenceMatrix(returnSeries);
    const cov = SA.covarianceMatrix(returnSeries);
    const rpWeights = SA.riskParityWeights(cov);
    const kellyFracs = assets.map(a => SA.kellyCriterion(a.mu > 0 ? 0.55 + a.mu * 0.5 : 0.45, 1 + a.mu));
    const worstStress = SA.stressTest(weights, assets.map(a => [a.beta, 0.3, 0.2, 0.3, 0.1]), { name: "Black Swan", shocks: { Market: -0.25, Size: -0.20, Value: -0.10, Momentum: -0.15, Quality: -0.05 } });
    const assetForecasts = assets.map((a, i) => {
      const mr = mrSignals[i];
      const forecasts = SA.multiHorizonForecast(a.price, a.mu, a.vol, [30, 60, 90]);
      const dm = SA.directionMagnitude(a.mu, a.vol, 60, { z: mr.z, snapProb: mr.snapProb, isStationary: mr.isStationary });
      const fan = SA.forecastFanPaths(a.price, a.mu, a.vol, 60, 200);
      return { forecasts, dm, fan };
    });
    const profitScore = profitProb * 25;
    const sharpeScore = Math.min(15, Math.max(0, (sharpe + 1) * 7.5));
    const mrScore = mrSignals.filter(s => s.isStationary && Math.abs(s.z) > 1).length * 4;
    const regimeScore = currentRegime === 2 ? 15 : currentRegime === 1 ? 8 : 0;
    const stressScore = Math.max(0, 15 + worstStress.portfolioImpact * 60);
    const diversificationScore = eRatio * 15;
    const fragilityPenalty = fragility > 1.5 ? -5 : fragility > 1.2 ? -2 : 0;
    const compositeScore = Math.min(100, Math.max(0, profitScore + sharpeScore + mrScore + regimeScore + stressScore + diversificationScore + fragilityPenalty));
    const assetVerdicts = assets.map((a, i) => {
      const mr = mrSignals[i]; const fc = assetForecasts[i]; const dm = fc.dm;
      const f60 = fc.forecasts.find(f => f.horizon === 60);
      let verdict: "ACCUMULATE" | "HOLD" | "REDUCE" | "EXIT" = "HOLD"; let reason = "";
      const bullScore = ((f60?.pProfit || 0.5) - 0.5) * 40 + dm.magnitude * 2 + (currentRegime === 2 ? 5 : currentRegime === 0 ? -5 : 0) + (mr.isStationary && mr.z < -1 ? mr.snapProb * 15 : 0);
      const bearScore = (0.5 - (f60?.pProfit || 0.5)) * 40 - dm.magnitude * 2 - (currentRegime === 2 ? 5 : currentRegime === 0 ? -5 : 0) + (mr.isStationary && mr.z > 1.5 ? 10 : 0) + (fragility > 1.4 ? 5 : 0);
      if (bullScore > 12) { verdict = "ACCUMULATE"; reason = `${dm.arrow} ${dm.direction} · P(profit)=${((f60?.pProfit || 0) * 100).toFixed(0)}% · Expected ${dm.magnitude > 0 ? "+" : ""}${dm.magnitude.toFixed(1)}% · ${mr.isStationary ? `MR Z=${mr.z.toFixed(1)}` : `Trend H=${mr.hurst.toFixed(2)}`}`; }
      else if (bearScore > 12) { verdict = a.pnlPct < -15 && bearScore > 18 ? "EXIT" : "REDUCE"; reason = `${dm.arrow} ${dm.direction} · P(loss)=${((1 - (f60?.pProfit || 0.5)) * 100).toFixed(0)}% · Expected ${dm.magnitude.toFixed(1)}% · Fragility=${fragility.toFixed(1)}`; }
      else { reason = `${dm.arrow} Neutral · P(profit)=${((f60?.pProfit || 0.5) * 100).toFixed(0)}% · Vol=${(a.vol * 100).toFixed(0)}% · β=${a.beta.toFixed(2)}`; }
      return { ...a, verdict, reason, rpDelta: rpWeights[i] - a.weight, mr, kellyFrac: kellyFracs[i], optHorizon: mr.optHorizon, dm: fc.dm, forecasts: fc.forecasts };
    });
    return { compositeScore, profitProb, medianReturn, sharpe, sortino, calmar, omega, regimeLabel, currentRegime, eRatio, fragility, kurt, mcVar: mcVar.var, hVar95, worstStress: worstStress.portfolioImpact, avgMaxDD, assetVerdicts, rpWeights, kellyFracs, rcVaR, tailDepMatrix, transitionMatrix, mc, assetForecasts };
  }, [assets, totalValue, portfolioMu, portfolioVol]);

  const runForecast = useCallback(() => {
    if (assets.length === 0) return;
    setFgmRunning(true);
    setTimeout(() => {
      const a = assets[Math.min(selectedAsset, assets.length - 1)];
      const result = FGM.runFGM(a.ticker, a.buyPrice, a.price, a.mu, a.vol, fgmHorizon, fgmModel, fgmDepth);
      setFgmResult(result); setFgmRunning(false);
    }, 50);
  }, [assets, selectedAsset, fgmHorizon, fgmModel, fgmDepth]);

  const [aiLoading, setAiLoading] = useState(false);
  const [aiTrades, setAiTrades] = useState<any>(null);

  const executeAIStrategy = useCallback(async () => {
    if (!foresight) return; setAiLoading(true);
    try {
      const body = { regime: foresight.regimeLabel, vix: (foresight.fragility * 18).toFixed(0), moodScore: Math.round(foresight.compositeScore), sectors: assets.map(a => ({ name: a.sector || a.ticker, changePct: a.pnlPct })), portfolio: assets.map(a => ({ ticker: a.ticker, quantity: Math.round(a.value / (a.price || 1)), currentPrice: a.price, buyPrice: a.buyPrice, pnlPct: a.pnlPct, weightPct: a.weight * 100 })), keyEvents: [`Regime: ${foresight.regimeLabel}`, `Fragility: ${foresight.fragility.toFixed(2)}`, `VaR95: ${fmt(foresight.hVar95)}`], outlook: `Composite Score ${foresight.compositeScore.toFixed(0)}/100`, provider: "google" };
      const { data, error } = await governedInvoke<any>("strategy-generate", { body });
      if (error || !data?.instructions) { toast.error("AI strategy generation failed"); executeRebalance(); }
      else { setAiTrades(data); const trades: TradeInstruction[] = (data.instructions || []).map((inst: any) => ({ ticker: inst.ticker, action: inst.action, shares: inst.quantity || 0, dollarAmount: inst.dollar_amount || 0, reason: inst.rationale || "", urgency: inst.urgency, confidence: inst.confidence, entryPrice: inst.entry_price, stopLoss: inst.stop_loss_price, takeProfit: inst.take_profit_price, timeHorizon: inst.time_horizon, riskReward: inst.risk_reward, category: inst.category, priority: inst.priority })); setTradeCards(trades); toast.success(`AI generated ${trades.length} institutional-grade trades`); }
    } catch (e: any) { toast.error(e.message || "Strategy generation failed"); } finally { setAiLoading(false); }
  }, [foresight, assets, fmt, totalValue]);

  const executeRebalance = useCallback(() => {
    if (!foresight) return;
    const trades: TradeInstruction[] = foresight.assetVerdicts.map((av, i) => { const tw = foresight.rpWeights[i]; const d = tw * totalValue - av.weight * totalValue; return { ticker: av.ticker, action: d > 0 ? "BUY" : "SELL", shares: Math.abs(Math.round(d / (av.price || 1))), dollarAmount: Math.abs(d), reason: `RP: ${(av.weight * 100).toFixed(1)}% → ${(tw * 100).toFixed(1)}%` }; }).filter(t => t.shares > 0);
    setTradeCards(trades); toast.success(`Generated ${trades.length} rebalance trades`);
  }, [foresight, totalValue]);

  if (!foresight || assets.length === 0) return <EmptyMsg msg="Add assets to generate unified foresight" />;

  const scoreBorder = foresight.compositeScore > 65 ? "border-gain/30" : foresight.compositeScore > 40 ? "border-warning/30" : "border-loss/30";
  const sel = Math.min(selectedAsset, assets.length - 1);
  const selAsset = assets[sel]; const selVerdict = foresight.assetVerdicts[sel];

  const chartData = fgmResult ? (() => {
    const { projection, historicalPrices } = fgmResult; const histLen = historicalPrices.length; const data: any[] = [];
    for (let i = 0; i < histLen; i++) data.push({ day: i - histLen + 1, historical: historicalPrices[i] });
    for (let t = 0; t < projection.median_path.length; t++) {
      const entry: any = { day: t, median: projection.median_path[t], bullish: projection.bullish_path[t], bearish: projection.bearish_path[t], upper95: projection.confidence_95_upper[t], lower95: projection.confidence_95_lower[t], upper75: projection.confidence_75_upper[t], lower75: projection.confidence_75_lower[t] };
      projection.monte_carlo_paths.forEach((path, pi) => { entry[`mc${pi}`] = path[t]; });
      if (t === 0) entry.historical = historicalPrices[histLen - 1];
      data.push(entry);
    }
    return data;
  })() : null;

  const fgmStats = fgmResult ? FGM.forecastStats(fgmResult.projection, selAsset.price, [30, 60, 90]) : null;
  const medianEnd = fgmResult ? fgmResult.projection.median_path[fgmResult.projection.median_path.length - 1] : selAsset.price;
  const medianUp = medianEnd >= selAsset.price;

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 border border-primary/20"><Brain className="h-4 w-4 text-primary" /></div>
        <div>
          <h3 className="text-xs sm:text-sm font-bold text-foreground uppercase tracking-wider">Future Graph Machine</h3>
          <p className="text-[9px] text-muted-foreground font-mono">GBM · ORNSTEIN-UHLENBECK · MONTE CARLO · REGIME-CVAR · FRAGILITY</p>
        </div>
      </div>

      {/* Score Gauge (2D SVG) + Metrics */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div className={`rounded-xl border ${scoreBorder} p-4 flex flex-col items-center justify-center`}>
          <FGMScoreGauge score={foresight.compositeScore} />
          <p className="text-[9px] uppercase tracking-wider text-muted-foreground mt-2">Foresight Score</p>
        </div>
        <div className="lg:col-span-2 grid grid-cols-3 sm:grid-cols-4 gap-2">
          <MetricCard label="P(Profit)" value={`${(foresight.profitProb * 100).toFixed(0)}%`} color={foresight.profitProb > 0.5 ? "text-gain" : "text-loss"} />
          <MetricCard label="Median Ret" value={`${(foresight.medianReturn * 100).toFixed(1)}%`} color={foresight.medianReturn > 0 ? "text-gain" : "text-loss"} />
          <MetricCard label="Sharpe" value={foresight.sharpe.toFixed(2)} color={foresight.sharpe > 0.5 ? "text-gain" : "text-warning"} />
          <MetricCard label="Sortino" value={foresight.sortino.toFixed(2)} color={foresight.sortino > 1 ? "text-gain" : "text-warning"} />
          <MetricCard label="Calmar" value={foresight.calmar.toFixed(2)} color={foresight.calmar > 1 ? "text-gain" : "text-warning"} />
          <MetricCard label="Omega" value={foresight.omega > 10 ? "∞" : foresight.omega.toFixed(2)} color={foresight.omega > 1 ? "text-gain" : "text-loss"} />
          <MetricCard label="Regime" value={foresight.regimeLabel} color={foresight.regimeLabel === "Bull" ? "text-gain" : foresight.regimeLabel === "Bear" ? "text-loss" : "text-warning"} />
          <MetricCard label="VaR 95%" value={fmt(foresight.hVar95)} color="text-loss" />
          <MetricCard label="Fragility" value={foresight.fragility.toFixed(2)} color={foresight.fragility > 1.3 ? "text-loss" : "text-gain"} />
          <MetricCard label="Entropy" value={`${(foresight.eRatio * 100).toFixed(0)}%`} color={foresight.eRatio > 0.7 ? "text-gain" : "text-warning"} />
          <MetricCard label="Kurtosis" value={foresight.kurt.toFixed(1)} color={foresight.kurt > 4 ? "text-loss" : "text-gain"} />
          <MetricCard label="Avg Max DD" value={`${(foresight.avgMaxDD * 100).toFixed(1)}%`} color="text-loss" />
        </div>
      </div>

      {/* Asset Selector */}
      <div className="flex items-center gap-3 flex-wrap">
        <p className="text-[10px] font-bold text-foreground uppercase">Forecast Asset:</p>
        {assets.map((a, i) => (
          <button key={a.ticker} onClick={() => { setSelectedAsset(i); setFgmResult(null); }}
            className={`rounded-lg px-3 py-1.5 text-[10px] font-mono font-bold transition-all border ${sel === i ? "bg-primary text-primary-foreground border-primary" : "bg-card text-muted-foreground border-border hover:border-primary/40"}`}>{a.ticker}</button>
        ))}
      </div>

      {/* FGM Controls */}
      <div className="rounded-xl border border-border bg-card p-3">
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-[9px] uppercase tracking-wider text-muted-foreground font-bold">Horizon:</span>
            {[{ label: "30d", value: 30 }, { label: "90d", value: 90 }, { label: "180d", value: 180 }, { label: "1Y", value: 252 }].map(h => (
              <button key={h.value} onClick={() => setFgmHorizon(h.value)} className={`rounded px-2 py-1 text-[9px] font-mono font-bold transition-all ${fgmHorizon === h.value ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"}`}>{h.label}</button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[9px] uppercase tracking-wider text-muted-foreground font-bold">Model:</span>
            {(["GBM", "MeanReversion", "Hybrid"] as FGMModel[]).map(m => (
              <button key={m} onClick={() => setFgmModel(m)} className={`rounded px-2 py-1 text-[9px] font-mono font-bold transition-all ${fgmModel === m ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"}`}>{m === "MeanReversion" ? "Mean Rev" : m}</button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[9px] uppercase tracking-wider text-muted-foreground font-bold">Paths:</span>
            {[500, 1000, 5000].map(d => (
              <button key={d} onClick={() => setFgmDepth(d)} className={`rounded px-2 py-1 text-[9px] font-mono font-bold transition-all ${fgmDepth === d ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"}`}>{d}</button>
            ))}
          </div>
          <button onClick={runForecast} disabled={fgmRunning} className="ml-auto rounded-lg bg-primary px-4 py-2 text-[10px] font-bold text-primary-foreground hover:bg-primary/90 transition-all flex items-center gap-2 disabled:opacity-50">
            {fgmRunning ? <Loader2 className="h-3 w-3 animate-spin" /> : <Zap className="h-3 w-3" />}
            {fgmRunning ? "Simulating..." : "Run Forecast"}
          </button>
        </div>
        {fgmResult?.params && (
          <div className="flex flex-wrap gap-3 mt-2 pt-2 border-t border-border">
            <span className="text-[8px] font-mono text-muted-foreground">μ={((fgmResult.params.drift) * 100).toFixed(1)}%</span>
            <span className="text-[8px] font-mono text-muted-foreground">σ={((fgmResult.params.volatility) * 100).toFixed(1)}%</span>
            <span className="text-[8px] font-mono text-muted-foreground">σ₃₀={((fgmResult.params.rollingVol30) * 100).toFixed(1)}%</span>
            <span className="text-[8px] font-mono text-muted-foreground">σ₆₀={((fgmResult.params.rollingVol60) * 100).toFixed(1)}%</span>
            <span className="text-[8px] font-mono text-muted-foreground">σ₉₀={((fgmResult.params.rollingVol90) * 100).toFixed(1)}%</span>
            <span className="text-[8px] font-mono text-muted-foreground">H={fgmResult.params.hurstExponent.toFixed(2)}</span>
            <span className="text-[8px] font-mono text-muted-foreground">θ={fgmResult.params.ouTheta.toFixed(2)}</span>
            <span className="text-[8px] font-mono text-muted-foreground">OU-μ={fmt(fgmResult.params.ouMu)}</span>
          </div>
        )}
      </div>

      {/* FGM Chart */}
      {chartData ? (
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] font-bold text-foreground uppercase">Future Graph Machine — {selAsset.ticker}</p>
            <div className="flex items-center gap-2">
              <span className={`text-lg ${selVerdict.dm.magnitude > 0 ? "text-gain" : "text-loss"}`}>{selVerdict.dm.arrow}</span>
              <span className={`text-[11px] font-bold ${selVerdict.dm.direction === "Bullish" ? "text-gain" : selVerdict.dm.direction === "Bearish" ? "text-loss" : "text-warning"}`}>
                {selVerdict.dm.direction} · {selVerdict.dm.magnitude > 0 ? "+" : ""}{selVerdict.dm.magnitude.toFixed(1)}%
              </span>
            </div>
          </div>
          <div className="h-[360px] sm:h-[460px] rounded-lg border border-border bg-background p-2">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={chartData} margin={{ top: 10, right: 30, left: 10, bottom: 10 }}>
                <defs>
                  <linearGradient id="fgm95band" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(210, 60%, 50%)" stopOpacity={0.08} />
                    <stop offset="100%" stopColor="hsl(210, 60%, 50%)" stopOpacity={0.03} />
                  </linearGradient>
                  <linearGradient id="fgm75band" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(210, 60%, 50%)" stopOpacity={0.18} />
                    <stop offset="100%" stopColor="hsl(210, 60%, 50%)" stopOpacity={0.08} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(220, 10%, 20%)" strokeOpacity={0.3} />
                <XAxis dataKey="day" tick={{ fontSize: 9, fill: 'hsl(220, 10%, 45%)' }} tickLine={false} axisLine={{ stroke: 'hsl(220, 10%, 25%)' }} tickFormatter={(v) => v === 0 ? "NOW" : v > 0 ? `+${v}d` : `${v}d`} />
                <YAxis domain={['auto', 'auto']} tick={{ fontSize: 9, fill: 'hsl(220, 10%, 45%)' }} tickLine={false} axisLine={{ stroke: 'hsl(220, 10%, 25%)' }} tickFormatter={(v) => `${sym}${Number(v).toFixed(0)}`} />
                <Tooltip contentStyle={{ backgroundColor: 'hsl(220, 13%, 10%)', border: '1px solid hsl(220, 10%, 25%)', borderRadius: '8px', fontSize: 10, fontFamily: 'monospace' }} labelFormatter={(v) => v === 0 ? "TODAY" : Number(v) > 0 ? `Day +${v}` : `Day ${v}`} formatter={(value: number, name: string) => { if (name.startsWith("mc")) return null as any; const labels: Record<string, string> = { historical: "Price", median: "Median", bullish: "P90 Bull", bearish: "P10 Bear", upper95: "P97.5", lower95: "P2.5", upper75: "P75", lower75: "P25" }; return [`${sym}${Number(value).toFixed(2)}`, labels[name] || name]; }} />
                <ReferenceLine x={0} stroke="hsl(220, 10%, 50%)" strokeDasharray="4 4" strokeWidth={1.5} label={{ value: "NOW", position: "top", fill: "hsl(220, 10%, 60%)", fontSize: 9 }} />
                <ReferenceLine y={selAsset.price} stroke="hsl(220, 10%, 40%)" strokeDasharray="6 3" strokeWidth={1} />
                {fgmResult && fgmResult.projection.monte_carlo_paths.slice(0, 25).map((_, pi) => (
                  <Line key={`mc${pi}`} type="monotone" dataKey={`mc${pi}`} stroke="hsl(210, 30%, 45%)" strokeWidth={0.5} dot={false} strokeOpacity={0.12} connectNulls={false} isAnimationActive={false} />
                ))}
                <Area type="monotone" dataKey="upper95" stroke="none" fill="url(#fgm95band)" fillOpacity={1} connectNulls={false} isAnimationActive={false} />
                <Area type="monotone" dataKey="lower95" stroke="none" fill="url(#fgm95band)" fillOpacity={1} connectNulls={false} isAnimationActive={false} />
                <Area type="monotone" dataKey="upper75" stroke="none" fill="url(#fgm75band)" fillOpacity={1} connectNulls={false} isAnimationActive={false} />
                <Area type="monotone" dataKey="lower75" stroke="none" fill="url(#fgm75band)" fillOpacity={1} connectNulls={false} isAnimationActive={false} />
                <Line type="monotone" dataKey="bearish" stroke="hsl(0, 70%, 55%)" strokeWidth={1} dot={false} strokeDasharray="4 2" connectNulls={false} isAnimationActive={false} />
                <Line type="monotone" dataKey="bullish" stroke="hsl(152, 60%, 45%)" strokeWidth={1} dot={false} strokeDasharray="4 2" connectNulls={false} isAnimationActive={false} />
                <Line type="monotone" dataKey="historical" stroke="hsl(30, 90%, 55%)" strokeWidth={2.5} dot={false} connectNulls={false} />
                <Line type="monotone" dataKey="median" stroke={medianUp ? "hsl(152, 70%, 50%)" : "hsl(0, 70%, 55%)"} strokeWidth={2.5} dot={false} connectNulls={false} />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <div className="flex items-center justify-center gap-6 mt-2">
            <span className="flex items-center gap-1.5 text-[8px] font-mono text-muted-foreground"><span className="w-4 h-0.5 bg-[hsl(30,90%,55%)] inline-block rounded" /> Historical</span>
            <span className="flex items-center gap-1.5 text-[8px] font-mono text-muted-foreground"><span className={`w-4 h-0.5 inline-block rounded ${medianUp ? "bg-gain" : "bg-loss"}`} /> Median</span>
            <span className="flex items-center gap-1.5 text-[8px] font-mono text-muted-foreground"><span className="w-4 h-[1px] bg-gain inline-block" /> P90 Bull</span>
            <span className="flex items-center gap-1.5 text-[8px] font-mono text-muted-foreground"><span className="w-4 h-[1px] bg-loss inline-block" /> P10 Bear</span>
            <span className="flex items-center gap-1.5 text-[8px] font-mono text-muted-foreground"><span className="w-4 h-2 bg-[hsl(210,60%,50%)] inline-block opacity-15 rounded-sm" /> 95% CI</span>
          </div>
        </div>
      ) : (
        <div className="h-[300px] rounded-lg border border-border bg-background flex flex-col items-center justify-center gap-3">
          <Zap className="h-8 w-8 text-muted-foreground/30" />
          <p className="text-[11px] text-muted-foreground font-mono">Select an asset and click <span className="text-primary font-bold">Run Forecast</span> to generate predictions</p>
          <p className="text-[9px] text-muted-foreground/60">Monte Carlo · GBM · Mean Reversion · {fgmDepth} paths · {fgmHorizon}d horizon</p>
        </div>
      )}

      {/* Forecast Summary Cards */}
      <div>
        <p className="text-[10px] font-bold text-foreground uppercase mb-2">Forecast Summary — {selAsset.ticker} @ {fmt(selAsset.price)}</p>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2">
          {(fgmStats || selVerdict.forecasts.map(f => ({ horizon: f.horizon, medianPrice: f.medianPrice, pProfit: f.pProfit, pUp10: f.pUp10, pDown10: f.pDown10, expectedDrawdown: 0, upper95: 0, lower95: 0 }))).map(f => (
            <div key={f.horizon} className="rounded-lg border border-border p-2.5 text-center">
              <p className="text-[9px] uppercase tracking-wider text-muted-foreground">{f.horizon}d Target</p>
              <p className={`font-mono text-sm font-bold ${f.medianPrice > selAsset.price ? "text-gain" : "text-loss"}`}>{fmt(f.medianPrice)}</p>
              <p className="text-[8px] text-muted-foreground mt-0.5">P(profit): {(f.pProfit * 100).toFixed(0)}%</p>
            </div>
          ))}
          {(() => { const stats = fgmStats || selVerdict.forecasts.map(f => ({ horizon: f.horizon, pUp10: f.pUp10, pDown10: f.pDown10, medianPrice: f.medianPrice, pProfit: f.pProfit, expectedDrawdown: 0, upper95: 0, lower95: 0 })); const f60 = stats.find(f => f.horizon === 60); if (!f60) return null; return (<><div className="rounded-lg border border-border p-2.5 text-center"><p className="text-[9px] uppercase tracking-wider text-muted-foreground">P(+10%)</p><p className="font-mono text-sm font-bold text-gain">{(f60.pUp10 * 100).toFixed(0)}%</p><p className="text-[8px] text-muted-foreground mt-0.5">60d horizon</p></div><div className="rounded-lg border border-border p-2.5 text-center"><p className="text-[9px] uppercase tracking-wider text-muted-foreground">P(−10%)</p><p className="font-mono text-sm font-bold text-loss">{(f60.pDown10 * 100).toFixed(0)}%</p><p className="text-[8px] text-muted-foreground mt-0.5">60d horizon</p></div><div className="rounded-lg border border-border p-2.5 text-center"><p className="text-[9px] uppercase tracking-wider text-muted-foreground">Optimal Entry</p><p className="font-mono text-sm font-bold text-foreground">{fmt(selVerdict.mr.ou.mu)}</p><p className="text-[8px] text-muted-foreground mt-0.5">OU mean ± 1σ</p></div></>); })()}
        </div>
      </div>

      {/* Regime-Conditional VaR + Transition + Tail Dep */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <p className="text-[10px] font-bold text-foreground uppercase mb-2">Regime-Conditional VaR (95%)</p>
          <div className="space-y-2">
            {foresight.rcVaR.map(rv => (<div key={rv.regime} className="rounded-lg border border-border p-2.5"><div className="flex justify-between items-center mb-1"><span className="text-[10px] font-bold text-foreground">{rv.regime}</span><span className="text-[9px] text-muted-foreground font-mono">n={rv.count}</span></div><div className="flex items-center gap-2"><div className="flex-1 h-2 bg-muted rounded-full overflow-hidden"><div className={`h-full rounded-full ${rv.regime === "Bear" ? "bg-loss" : rv.regime === "Bull" ? "bg-gain" : "bg-warning"}`} style={{ width: `${Math.min(100, rv.var * 10000)}%` }} /></div><span className="text-[10px] font-mono text-loss">{(rv.var * 100).toFixed(2)}%</span></div><p className="text-[9px] text-muted-foreground mt-0.5">CVaR: {(rv.cvar * 100).toFixed(2)}%</p></div>))}
          </div>
        </div>
        <div>
          <p className="text-[10px] font-bold text-foreground uppercase mb-2">Regime Transition Matrix</p>
          <table className="text-[10px] font-mono w-full"><thead><tr><th className="px-2 py-1 text-muted-foreground text-left">From\To</th>{["Bear", "Neutral", "Bull"].map(l => <th key={l} className="px-2 py-1 text-muted-foreground">{l}</th>)}</tr></thead><tbody>{["Bear", "Neutral", "Bull"].map((label, i) => (<tr key={label} className="border-b border-border/50"><td className="px-2 py-1 font-bold text-foreground">{label}</td>{foresight.transitionMatrix[i]?.map((v, j) => (<td key={j} className="px-2 py-1 text-center" style={{ backgroundColor: `hsla(${j === 2 ? 152 : j === 0 ? 0 : 45}, 70%, 50%, ${v * 0.4})` }}>{(v * 100).toFixed(0)}%</td>))}</tr>))}</tbody></table>
          <p className="text-[10px] font-bold text-foreground uppercase mb-2 mt-4">Tail Crash Co-Movement</p>
          <div className="space-y-1">{assets.slice(0, 5).map((a, i) => { const maxTD = Math.max(...foresight.tailDepMatrix[i].filter((_, j) => j !== i)); const maxIdx = foresight.tailDepMatrix[i].findIndex((v, j) => j !== i && v === maxTD); return (<div key={a.ticker} className="flex items-center justify-between text-[10px] font-mono px-1"><span className="text-foreground">{a.ticker}</span><span className={maxTD > 0.4 ? "text-loss font-bold" : "text-muted-foreground"}>↔ {assets[maxIdx]?.ticker || "—"}: {(maxTD * 100).toFixed(0)}%</span></div>); })}</div>
        </div>
      </div>

      {/* Dynamic Verdicts */}
      <div>
        <p className="text-[10px] font-bold text-foreground uppercase mb-3">Dynamic Verdicts — Direction · Magnitude · Confidence</p>
        <div className="space-y-2">{foresight.assetVerdicts.map((av, i) => { const vc: Record<string, string> = { ACCUMULATE: "bg-gain/15 text-gain border-gain/30", HOLD: "bg-warning/10 text-warning border-warning/30", REDUCE: "bg-loss/10 text-loss border-loss/30", EXIT: "bg-loss/20 text-loss border-loss/40" }; return (<div key={av.ticker} className={`rounded-lg border p-3 ${vc[av.verdict] || ""}`}><div className="flex items-center justify-between mb-1"><div className="flex items-center gap-2"><span className="text-lg">{av.dm.arrow}</span><span className="text-xs font-bold" style={{ color: PATH_COLORS[i % PATH_COLORS.length] }}>{av.ticker}</span><span className={`rounded px-2 py-0.5 text-[9px] font-mono font-bold uppercase ${vc[av.verdict]}`}>{av.verdict}</span></div><div className="flex items-center gap-3 text-[9px] font-mono"><span className={av.dm.magnitude > 0 ? "text-gain" : "text-loss"}>{av.dm.magnitude > 0 ? "+" : ""}{av.dm.magnitude.toFixed(1)}%</span><span>Conf: {(av.dm.confidence * 100).toFixed(0)}%</span><span>Kelly: {(av.kellyFrac * 100).toFixed(0)}%</span><span>Horizon: {av.optHorizon.optimalDays}d</span><span className={av.optHorizon.riskRewardRatio > 1 ? "text-gain" : "text-loss"}>R/R: {av.optHorizon.riskRewardRatio.toFixed(1)}</span></div></div><p className="text-[10px] opacity-80">{av.reason}</p></div>); })}</div>
      </div>

      {/* AI Command Console */}
      <div className="rounded-xl border border-primary/20 bg-primary/5 p-4">
        <p className="text-[10px] font-bold text-foreground uppercase mb-3 flex items-center gap-2"><Sparkles className="h-3.5 w-3.5 text-primary" /> AI Strategy Command Console</p>
        {aiTrades?.portfolio_assessment && (<div className="rounded-lg border border-border bg-card p-3 mb-3"><p className="text-[9px] uppercase tracking-wider text-muted-foreground mb-1">AI Portfolio Assessment</p><p className="text-[11px] text-foreground leading-relaxed">{aiTrades.portfolio_assessment}</p></div>)}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          <button onClick={executeAIStrategy} disabled={aiLoading} className="rounded-lg border border-primary/30 bg-primary/10 px-3 py-3 text-left hover:bg-primary/20 transition-all col-span-2 sm:col-span-1">{aiLoading ? <Loader2 className="h-4 w-4 text-primary mb-1 animate-spin" /> : <Sparkles className="h-4 w-4 text-primary mb-1" />}<p className="text-[10px] font-bold text-foreground">{aiLoading ? "Generating..." : "AI Strategy Generate"}</p><p className="text-[8px] text-muted-foreground">Full AI-driven trade instructions</p></button>
          <button onClick={executeRebalance} className="rounded-lg border border-border bg-card px-3 py-2.5 text-left hover:border-primary/40 hover:bg-primary/5 transition-all"><Shield className="h-3.5 w-3.5 text-primary mb-1" /><p className="text-[10px] font-bold text-foreground">Risk Parity</p><p className="text-[8px] text-muted-foreground">Equalize risk contributions</p></button>
          <button onClick={() => { if (!foresight) return; const trades: TradeInstruction[] = foresight.assetVerdicts.map((av, i) => { const kw = foresight.kellyFracs[i] * 0.5; const d = kw * totalValue - av.weight * totalValue; return { ticker: av.ticker, action: d > 0 ? "BUY" : "SELL", shares: Math.abs(Math.round(d / (av.price || 1))), dollarAmount: Math.abs(d), reason: `½-Kelly: ${(av.weight * 100).toFixed(1)}% → ${(kw * 100).toFixed(1)}%` }; }).filter(t => t.shares > 0); setTradeCards(trades); }} className="rounded-lg border border-border bg-card px-3 py-2.5 text-left hover:border-warning/40 hover:bg-warning/5 transition-all"><BarChart3 className="h-3.5 w-3.5 text-warning mb-1" /><p className="text-[10px] font-bold text-foreground">Kelly Optimal</p><p className="text-[8px] text-muted-foreground">Half-Kelly sizing</p></button>
        </div>
        {tradeCards.length > 0 && (<div className="mt-3 space-y-1.5"><p className="text-[9px] font-bold text-foreground uppercase">{aiTrades ? "AI-Generated Trade Instructions" : "Generated Trade Instructions"}{aiTrades && <span className="text-primary ml-2 font-normal">· Powered by institutional AI</span>}</p>{tradeCards.map((t: any, i: number) => (<div key={i} className="rounded-lg border border-border bg-card px-3 py-2.5"><div className="flex items-center justify-between mb-1"><div className="flex items-center gap-2"><span className={`rounded px-1.5 py-0.5 text-[9px] font-mono font-bold ${t.action?.includes("BUY") || t.action === "ADD" || t.action === "ACCUMULATE" ? "bg-gain/15 text-gain" : t.action === "HOLD" ? "bg-warning/15 text-warning" : "bg-loss/15 text-loss"}`}>{t.action}</span><span className="text-[11px] font-bold text-foreground">{t.ticker}</span>{t.shares > 0 && <span className="text-[10px] text-muted-foreground font-mono">{t.shares} shares</span>}{t.dollarAmount > 0 && <span className="text-[10px] text-muted-foreground font-mono">~{fmt(t.dollarAmount)}</span>}{t.urgency && <span className={`text-[8px] font-mono px-1 py-0.5 rounded ${t.urgency === "IMMEDIATE" ? "bg-loss/15 text-loss" : "bg-muted text-muted-foreground"}`}>{t.urgency}</span>}</div><div className="flex items-center gap-2">{t.confidence != null && <span className="text-[9px] font-mono text-muted-foreground">Conf: {t.confidence}%</span>}{t.riskReward && <span className="text-[9px] font-mono text-gain">R/R: {t.riskReward}</span>}<button onClick={() => { navigator.clipboard.writeText(`${t.action} ${t.shares} ${t.ticker} (~${fmt(t.dollarAmount)}) — ${t.reason}`); setCopiedCmd(t.ticker); setTimeout(() => setCopiedCmd(null), 2000); }} className="rounded p-1 hover:bg-muted transition-colors">{copiedCmd === t.ticker ? <Check className="h-3 w-3 text-gain" /> : <Copy className="h-3 w-3 text-muted-foreground" />}</button></div></div><p className="text-[10px] text-muted-foreground leading-relaxed">{t.reason}</p>{(t.entryPrice || t.stopLoss || t.takeProfit) && (<div className="flex gap-3 mt-1 text-[9px] font-mono">{t.entryPrice && <span className="text-foreground">Entry: {fmt(t.entryPrice)}</span>}{t.stopLoss && <span className="text-loss">SL: {fmt(t.stopLoss)}</span>}{t.takeProfit && <span className="text-gain">TP: {fmt(t.takeProfit)}</span>}{t.timeHorizon && <span className="text-muted-foreground">{t.timeHorizon}</span>}</div>)}</div>))}</div>)}
      </div>
    </div>
  );
}

/** 2D SVG Score Gauge */
function FGMScoreGauge({ score }: { score: number }) {
  const clampedScore = Math.max(0, Math.min(100, score));
  const color = clampedScore > 65 ? "hsl(152, 60%, 45%)" : clampedScore > 40 ? "hsl(45, 90%, 55%)" : "hsl(0, 70%, 55%)";
  const circumference = Math.PI * 55;
  const filled = (clampedScore / 100) * circumference;
  return (
    <svg width="140" height="85" viewBox="0 0 140 85">
      <path d="M 15 75 A 55 55 0 0 1 125 75" fill="none" stroke="hsl(220, 10%, 20%)" strokeWidth="10" strokeLinecap="round" />
      <path d="M 15 75 A 55 55 0 0 1 125 75" fill="none" stroke={color} strokeWidth="10" strokeLinecap="round" strokeDasharray={`${filled} ${circumference}`} style={{ transition: 'stroke-dasharray 0.7s ease-in-out' }} />
      <text x="70" y="60" textAnchor="middle" fill={color} fontSize="28" fontWeight="900" fontFamily="monospace">{clampedScore.toFixed(0)}</text>
      <text x="70" y="75" textAnchor="middle" fill="hsl(220, 10%, 45%)" fontSize="9" fontFamily="monospace">/ 100</text>
    </svg>
  );
}

interface TradeInstruction { ticker: string; action: string; shares: number; dollarAmount: number; reason: string; urgency?: string; confidence?: number; entryPrice?: number; stopLoss?: number; takeProfit?: number; timeHorizon?: string; riskReward?: string; category?: string; priority?: number; }

function RealTimePanel({ assets, portfolioVol }: { assets: AssetDatum[]; portfolioVol: number }) {
  return (
    <div className="space-y-5">
      <h3 className="text-sm font-bold text-foreground uppercase tracking-wider">Real-Time Integration Status</h3>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <StatusCard label="Market Data Feed" status="active" detail="Yahoo Finance · 8s polling" />
        <StatusCard label="GARCH Engine" status="active" detail={`σ = ${(portfolioVol * 100).toFixed(1)}% annualized`} />
        <StatusCard label="Regime Detector" status="active" detail="HMM 3-state portfolio-wide" />
        <StatusCard label="Monte Carlo" status="active" detail="10K paths · 60 rendered · 3D" />
        <StatusCard label="Factor Model" status="active" detail={`5-factor OLS · ${assets.length} assets`} />
        <StatusCard label="Mean Reversion" status="active" detail={`OU + Hurst · ${assets.length} assets`} />
        <StatusCard label="Foresight Engine" status="active" detail="Unified composite scoring" />
      </div>
      <div className="rounded-lg border border-border p-4">
        <p className="text-[10px] font-bold text-foreground uppercase mb-2">Computation Architecture</p>
        <div className="space-y-1 text-[11px] text-muted-foreground font-mono">
          <p>• All stochastic models computed portfolio-wide (not single-stock)</p>
          <p>• Real prices from analysis feed → anchored synthetic histories</p>
          <p>• GBM / Jump Diffusion / GARCH use actual vol & drift per asset</p>
          <p>• Cholesky decomposition for correlated multi-asset simulations</p>
          <p>• Kalman filter + ARIMA forecast run on all {assets.length} assets</p>
          <p>• OU/Hurst mean reversion computed per-asset with portfolio Z-scores</p>
          <p>• Foresight synthesizes all engines into composite score (0-100)</p>
        </div>
      </div>
    </div>
  );
}

// ─── Shared Components ──────────────────────────────────────────────

function MetricCard({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="rounded-lg border border-border p-2.5 text-center">
      <p className="text-[9px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`mt-0.5 font-mono text-sm font-bold ${color || "text-foreground"}`}>{value}</p>
    </div>
  );
}

function StatusCard({ label, status, detail }: { label: string; status: "active" | "idle"; detail: string }) {
  return (
    <div className="rounded-lg border border-border p-3">
      <div className="flex items-center gap-2 mb-1">
        <span className={`h-2 w-2 rounded-full ${status === "active" ? "bg-gain animate-pulse" : "bg-muted-foreground"}`} />
        <p className="text-[10px] font-bold text-foreground">{label}</p>
      </div>
      <p className="text-[9px] text-muted-foreground font-mono">{detail}</p>
    </div>
  );
}

function EmptyMsg({ msg }: { msg?: string }) {
  return (
    <div className="text-center py-12 text-muted-foreground text-sm">
      {msg || "Add and analyze assets to power computations"}
    </div>
  );
}

export default StatArbEngine;
