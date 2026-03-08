import { useMemo, useState } from "react";
import { Shield, AlertTriangle, Zap, BarChart3, RefreshCw } from "lucide-react";
import { type PortfolioStock } from "@/components/PortfolioPanel";
import { useNormalizedPortfolio } from "@/hooks/useNormalizedPortfolio";

interface Props { stocks: PortfolioStock[]; }

type HedgeMode = "defensive" | "balanced" | "aggressive";

interface ActiveHedge {
  instrument: string;
  type: string;
  notional: number;
  notionalFmt: string;
  delta: number;
  gamma: number;
  theta: number;
  purpose: string;
  urgency: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  trigger: string;
  targetTicker?: string;
  hedgeRatio: number;
  costBps: number;
}

const HedgingModule = ({ stocks }: Props) => {
  const { totalValue, holdings, fmt, baseCurrency, sym, convertToBase } = useNormalizedPortfolio(stocks);
  const [mode, setMode] = useState<HedgeMode>("balanced");

  const { hedges, metrics, portfolioGreeks, riskBudget } = useMemo(() => {
    if (holdings.length === 0) return { hedges: [], metrics: [], portfolioGreeks: null, riskBudget: null };

    // Compute portfolio-level Greeks
    const weightedBeta = holdings.reduce((s, h) => s + h.beta * (h.value / totalValue), 0);
    const weightedRisk = holdings.reduce((s, h) => s + h.risk * (h.value / totalValue), 0);
    const portfolioVol = (weightedRisk / 100) * 0.25; // annualized vol estimate
    const portfolioDelta = weightedBeta * totalValue / 100; // dollar delta per 1% move
    const portfolioGamma = portfolioDelta * 0.05; // estimated gamma
    const portfolioVega = totalValue * portfolioVol * 0.01; // vega exposure

    // Mode multipliers
    const modeConfig = {
      defensive: { hedgeRatio: 0.8, costTolerance: 1.5, minUrgency: 30 },
      balanced: { hedgeRatio: 0.5, costTolerance: 1.0, minUrgency: 45 },
      aggressive: { hedgeRatio: 0.3, costTolerance: 0.6, minUrgency: 60 },
    };
    const cfg = modeConfig[mode];

    const hedgeList: ActiveHedge[] = [];

    // --- DYNAMIC HEDGE 1: Portfolio Beta Neutralization ---
    if (weightedBeta > 1.05) {
      const excessBeta = weightedBeta - 1;
      const hedgeNotional = totalValue * excessBeta * cfg.hedgeRatio;
      const hasIndian = holdings.some(h => h.rawTicker?.includes(".NS") || h.rawTicker?.includes(".BO"));
      const instrument = hasIndian ? "NIFTY Futures Short" : "ES Mini Futures Short";
      hedgeList.push({
        instrument, type: "Index Futures", notional: hedgeNotional, notionalFmt: fmt(hedgeNotional),
        delta: -excessBeta * cfg.hedgeRatio, gamma: 0, theta: 0,
        purpose: `Neutralize excess β (${weightedBeta.toFixed(2)} → ${(weightedBeta - excessBeta * cfg.hedgeRatio).toFixed(2)})`,
        urgency: weightedBeta > 1.4 ? "CRITICAL" : weightedBeta > 1.2 ? "HIGH" : "MEDIUM",
        trigger: `β > ${(1 + (1 - cfg.hedgeRatio) * 0.1).toFixed(2)}`, hedgeRatio: cfg.hedgeRatio,
        costBps: 0.5,
      });
    }

    // --- DYNAMIC HEDGE 2: Per-position tail risk (risk-weighted) ---
    const sortedByRisk = [...holdings].sort((a, b) => b.risk * b.value - a.risk * a.value);
    const topRiskPositions = sortedByRisk.filter(h => h.risk >= cfg.minUrgency).slice(0, 5);

    topRiskPositions.forEach(h => {
      const posVol = (h.risk / 100) * 0.018 * Math.sqrt(252);
      const otmStrike = 0.95; // 5% OTM
      const putDelta = -0.30 * (h.risk / 50); // dynamic delta based on risk
      const notional = h.value * posVol * cfg.hedgeRatio;
      const impliedTheta = -notional * 0.0015; // daily theta decay estimate
      const impliedGamma = Math.abs(putDelta) * 0.08;

      hedgeList.push({
        instrument: `${h.ticker} PUT ${Math.round(otmStrike * 100)}% Strike`,
        type: "Equity Put Option", notional, notionalFmt: fmt(notional),
        delta: putDelta, gamma: impliedGamma, theta: impliedTheta,
        purpose: `Vol-weighted protection (σ=${(posVol * 100).toFixed(0)}%, risk=${h.risk})`,
        urgency: h.risk >= 70 ? "CRITICAL" : h.risk >= 55 ? "HIGH" : "MEDIUM",
        trigger: `${h.ticker} drops >${(posVol * 100 * 1.5).toFixed(0)}% in 5d`,
        targetTicker: h.ticker, hedgeRatio: cfg.hedgeRatio,
        costBps: posVol * 100 * 2,
      });
    });

    // --- DYNAMIC HEDGE 3: Correlation-based portfolio put ---
    if (holdings.length >= 3) {
      const concentration = holdings.reduce((max, h) => Math.max(max, h.value / totalValue), 0);
      const diversificationBenefit = 1 - concentration;
      const portfolioPutNotional = totalValue * 0.03 * (1 + weightedRisk / 100) * cfg.hedgeRatio;

      hedgeList.push({
        instrument: holdings.some(h => h.rawTicker?.includes(".NS")) ? "NIFTY PUT OTM 7%" : "SPY PUT OTM 5%",
        type: "Index Put Option", notional: portfolioPutNotional, notionalFmt: fmt(portfolioPutNotional),
        delta: -0.20, gamma: 0.03, theta: -portfolioPutNotional * 0.001,
        purpose: `Portfolio tail hedge (diversification: ${(diversificationBenefit * 100).toFixed(0)}%)`,
        urgency: weightedRisk > 55 ? "HIGH" : "MEDIUM",
        trigger: `Index drops >5% from current level`, hedgeRatio: cfg.hedgeRatio,
        costBps: 3.5,
      });
    }

    // --- DYNAMIC HEDGE 4: Crypto volatility hedge ---
    const cryptoHoldings = holdings.filter(h => h.rawTicker?.includes("-USD"));
    if (cryptoHoldings.length > 0) {
      const cryptoValue = cryptoHoldings.reduce((s, h) => s + h.value, 0);
      const cryptoWeight = cryptoValue / totalValue;
      const cryptoVol = 0.65; // ~65% annualized vol for crypto
      const hedgeNotional = cryptoValue * 0.15 * cfg.hedgeRatio;

      hedgeList.push({
        instrument: "BTC Perpetual Short / BITO PUT", type: "Crypto Derivative",
        notional: hedgeNotional, notionalFmt: fmt(hedgeNotional),
        delta: -0.5 * cryptoWeight, gamma: 0.02, theta: -hedgeNotional * 0.002,
        purpose: `Crypto vol hedge (${(cryptoWeight * 100).toFixed(0)}% portfolio, σ=${(cryptoVol * 100).toFixed(0)}%)`,
        urgency: cryptoWeight > 0.2 ? "CRITICAL" : "HIGH",
        trigger: `BTC vol >80% or drawdown >15%`, hedgeRatio: cfg.hedgeRatio,
        costBps: cryptoVol * 10,
      });
    }

    // --- DYNAMIC HEDGE 5: FX hedge for multi-currency exposure ---
    const currencyExposure: Record<string, number> = {};
    holdings.forEach(h => {
      const ccy = h.currency || "USD";
      if (ccy !== baseCurrency) {
        currencyExposure[ccy] = (currencyExposure[ccy] || 0) + h.value;
      }
    });

    Object.entries(currencyExposure).forEach(([ccy, exposure]) => {
      const fxWeight = exposure / totalValue;
      if (fxWeight > 0.1) { // Only hedge if >10% exposure
        const hedgeNotional = exposure * 0.5 * cfg.hedgeRatio;
        hedgeList.push({
          instrument: `${ccy}/${baseCurrency} Forward 3M`, type: "FX Forward",
          notional: hedgeNotional, notionalFmt: fmt(hedgeNotional),
          delta: -fxWeight * cfg.hedgeRatio, gamma: 0, theta: 0,
          purpose: `Hedge ${(fxWeight * 100).toFixed(0)}% ${ccy} exposure (${fmt(exposure)})`,
          urgency: fxWeight > 0.3 ? "HIGH" : "MEDIUM",
          trigger: `${ccy}/${baseCurrency} moves >2% in 5d`, hedgeRatio: cfg.hedgeRatio,
          costBps: 1.2,
        });
      }
    });

    // --- DYNAMIC HEDGE 6: Volatility expansion hedge ---
    if (weightedRisk > 50 && totalValue > 0) {
      const vixHedgeNotional = totalValue * 0.02 * (weightedRisk / 50) * cfg.hedgeRatio;
      hedgeList.push({
        instrument: "VIX Call Spread 20/30", type: "Volatility Derivative",
        notional: vixHedgeNotional, notionalFmt: fmt(vixHedgeNotional),
        delta: 0, gamma: 0.15, theta: -vixHedgeNotional * 0.003,
        purpose: `Vol expansion protection (portfolio σ=${(portfolioVol * 100).toFixed(1)}%)`,
        urgency: weightedRisk > 65 ? "HIGH" : "MEDIUM",
        trigger: `VIX spikes >25 or realized vol >30%`, hedgeRatio: cfg.hedgeRatio,
        costBps: 2.0,
      });
    }

    // Sort by urgency then notional
    const urgencyOrder = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
    hedgeList.sort((a, b) => urgencyOrder[a.urgency] - urgencyOrder[b.urgency] || b.notional - a.notional);

    // Aggregate metrics
    const totalHedgeCost = hedgeList.reduce((s, h) => s + h.notional * h.costBps / 10000, 0);
    const totalNotional = hedgeList.reduce((s, h) => s + h.notional, 0);
    const netDelta = weightedBeta + hedgeList.reduce((s, h) => s + h.delta, 0);
    const netGamma = hedgeList.reduce((s, h) => s + h.gamma, 0);
    const netTheta = hedgeList.reduce((s, h) => s + h.theta, 0);

    const metricsData = [
      { metric: "Gross Exposure", value: fmt(totalValue) },
      { metric: "Total Hedge Notional", value: fmt(totalNotional) },
      { metric: "Hedge Ratio", value: `${((totalNotional / totalValue) * 100).toFixed(1)}%` },
      { metric: "Net Portfolio β", value: netDelta.toFixed(3) },
      { metric: "Est. Hedge Cost (ann.)", value: `${fmt(totalHedgeCost)} (${((totalHedgeCost / totalValue) * 100).toFixed(2)}%)` },
      { metric: "Active Hedges", value: `${hedgeList.length}` },
    ];

    return {
      hedges: hedgeList,
      metrics: metricsData,
      portfolioGreeks: { delta: portfolioDelta, gamma: portfolioGamma, vega: portfolioVega, beta: weightedBeta, vol: portfolioVol, netDelta, netGamma, netTheta },
      riskBudget: { weightedRisk, totalHedgeCost, costPct: (totalHedgeCost / totalValue) * 100 },
    };
  }, [holdings, totalValue, fmt, mode, baseCurrency, convertToBase]);

  if (holdings.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-12 text-center">
        <Shield className="h-10 w-10 mx-auto text-muted-foreground/30 mb-3" />
        <p className="text-muted-foreground">Analyze assets to generate dynamic hedging strategies.</p>
      </div>
    );
  }

  const urgencyColor = (u: string) => {
    switch (u) {
      case "CRITICAL": return "bg-loss/20 text-loss";
      case "HIGH": return "bg-warning/20 text-warning";
      case "MEDIUM": return "bg-primary/15 text-primary";
      default: return "bg-muted text-muted-foreground";
    }
  };

  return (
    <div className="space-y-6">
      {/* Mode selector */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Shield className="h-5 w-5 text-foreground" />
          <span className="text-sm font-bold text-foreground uppercase tracking-wider">Active Hedging Engine</span>
        </div>
        <div className="flex gap-1.5">
          {(["defensive", "balanced", "aggressive"] as HedgeMode[]).map(m => (
            <button key={m} onClick={() => setMode(m)}
              className={`rounded-lg px-3 py-1.5 text-[11px] font-medium transition-all capitalize ${mode === m ? "bg-foreground text-background" : "bg-surface-2 text-muted-foreground hover:text-foreground"}`}>
              {m}
            </button>
          ))}
        </div>
      </div>

      {/* Top stats */}
      <div className="grid gap-3 md:grid-cols-4">
        <div className="rounded-xl border border-border bg-card p-5">
          <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Portfolio Value</p>
          <p className="mt-1 font-mono text-2xl font-bold text-foreground">{fmt(totalValue)}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Portfolio β</p>
          <p className={`mt-1 font-mono text-2xl font-bold ${portfolioGreeks && portfolioGreeks.beta > 1.2 ? "text-warning" : "text-foreground"}`}>
            {portfolioGreeks?.beta.toFixed(3) || "—"}
          </p>
          {portfolioGreeks && <p className="text-[10px] text-muted-foreground mt-0.5">Net: {portfolioGreeks.netDelta.toFixed(3)}</p>}
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Portfolio σ (ann.)</p>
          <p className={`mt-1 font-mono text-2xl font-bold ${portfolioGreeks && portfolioGreeks.vol > 0.25 ? "text-loss" : "text-foreground"}`}>
            {portfolioGreeks ? `${(portfolioGreeks.vol * 100).toFixed(1)}%` : "—"}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          <p className="text-[9px] uppercase tracking-wider text-muted-foreground">Active Hedges</p>
          <p className="mt-1 font-mono text-2xl font-bold text-primary">{hedges.length}</p>
          {riskBudget && <p className="text-[10px] text-muted-foreground mt-0.5">Cost: {riskBudget.costPct.toFixed(2)}% ann.</p>}
        </div>
      </div>

      {/* Portfolio Greeks */}
      {portfolioGreeks && (
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider mb-4 flex items-center gap-2">
            <BarChart3 className="h-4 w-4" /> Portfolio Greeks (Pre → Post Hedge)
          </h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { label: "Delta (β)", pre: portfolioGreeks.beta.toFixed(3), post: portfolioGreeks.netDelta.toFixed(3), good: Math.abs(portfolioGreeks.netDelta) < Math.abs(portfolioGreeks.beta) },
              { label: "Γ Gamma", pre: portfolioGreeks.gamma.toFixed(2), post: (portfolioGreeks.gamma + portfolioGreeks.netGamma).toFixed(2), good: true },
              { label: "Vega", pre: fmt(portfolioGreeks.vega), post: fmt(portfolioGreeks.vega * 0.7), good: true },
              { label: "Θ Theta", pre: "0", post: fmt(portfolioGreeks.netTheta), good: false },
            ].map(g => (
              <div key={g.label} className="rounded-lg bg-surface-2 p-3">
                <p className="text-[9px] uppercase tracking-wider text-muted-foreground">{g.label}</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="font-mono text-sm text-muted-foreground line-through">{g.pre}</span>
                  <span className="text-muted-foreground">→</span>
                  <span className={`font-mono text-sm font-bold ${g.good ? "text-gain" : "text-loss"}`}>{g.post}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Active hedge recommendations */}
      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider mb-4 flex items-center gap-2">
          <Zap className="h-4 w-4 text-primary" /> Dynamic Hedge Recommendations
        </h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border">
                {["Urgency", "Instrument", "Type", "Notional", "Δ", "Γ", "Θ/day", "Trigger", "Cost (bps)"].map(h => (
                  <th key={h} className="px-2 py-2 text-left font-medium text-muted-foreground whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {hedges.map((h, i) => (
                <tr key={i} className="border-b border-border/50 hover:bg-surface-2 transition-colors">
                  <td className="px-2 py-2.5">
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${urgencyColor(h.urgency)}`}>{h.urgency}</span>
                  </td>
                  <td className="px-2 py-2.5 font-mono text-xs text-foreground font-medium">{h.instrument}</td>
                  <td className="px-2 py-2.5 text-xs text-muted-foreground">{h.type}</td>
                  <td className="px-2 py-2.5 font-mono text-foreground">{h.notionalFmt}</td>
                  <td className="px-2 py-2.5 font-mono text-foreground">{h.delta.toFixed(2)}</td>
                  <td className="px-2 py-2.5 font-mono text-foreground">{h.gamma.toFixed(2)}</td>
                  <td className="px-2 py-2.5 font-mono text-loss">{h.theta < 0 ? fmt(Math.abs(h.theta)) : "—"}</td>
                  <td className="px-2 py-2.5 text-[10px] text-muted-foreground max-w-[180px]">{h.trigger}</td>
                  <td className="px-2 py-2.5 font-mono text-muted-foreground">{h.costBps.toFixed(1)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Per-hedge purpose detail */}
      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider mb-4">Hedge Rationale</h3>
        <div className="space-y-2">
          {hedges.map((h, i) => (
            <div key={i} className={`rounded-lg border p-3 ${h.urgency === "CRITICAL" ? "border-loss/30 bg-loss/5" : h.urgency === "HIGH" ? "border-warning/20 bg-warning/5" : "border-border bg-surface-2"}`}>
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs font-semibold text-foreground">{h.instrument}</span>
                <span className="font-mono text-xs text-muted-foreground">{h.notionalFmt}</span>
              </div>
              <p className="text-[11px] text-secondary-foreground mt-1">{h.purpose}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Capital Efficiency */}
      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider mb-4">Capital Efficiency</h3>
        <div className="space-y-2">
          {metrics.map(c => (
            <div key={c.metric} className="flex items-center justify-between rounded-lg bg-surface-2 p-3">
              <span className="text-sm text-muted-foreground">{c.metric}</span>
              <span className="font-mono text-sm font-bold text-foreground">{c.value}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default HedgingModule;
