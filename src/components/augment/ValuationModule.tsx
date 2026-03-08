import { useMemo } from "react";
import { type PortfolioStock } from "@/components/PortfolioPanel";
import { useNormalizedPortfolio } from "@/hooks/useNormalizedPortfolio";

interface Props { stocks: PortfolioStock[]; }

const ValuationModule = ({ stocks }: Props) => {
  const { totalValue, holdings, fmt, sym } = useNormalizedPortfolio(stocks);

  const { valuations, cashflows, collateral } = useMemo(() => {
    if (holdings.length === 0) return { valuations: [], cashflows: [], collateral: [] };

    const h = holdings.map(h => {
      const current = h.value / h.quantity;
      const fair = current * (1 + (h.analysis?.overallSentiment || 0) / 200);
      const upside = ((fair - current) / current) * 100;
      return {
        ticker: h.ticker,
        model: h.analysis?.pe ? "DCF + Relative" : "DCF",
        fairValue: fmt(fair),
        current: fmt(current),
        upside: `${upside >= 0 ? "+" : ""}${upside.toFixed(1)}%`,
        pe: h.analysis?.pe || 0,
        pbv: h.analysis?.pbv || 0,
        divYield: h.analysis?.dividendYield || 0,
      };
    });

    const months = ["Mar 2026", "Apr 2026", "May 2026", "Jun 2026"];
    const cf = months.map((m, i) => {
      const inflow = holdings.reduce((s, h) => {
        const dy = (h.analysis?.dividendYield || 1.5) / 100;
        return s + h.value * dy / 4;
      }, 0) * (i === 0 || i === 3 ? 1.5 : 0.5);

      return {
        month: m,
        inflow: fmt(inflow),
        outflow: fmt(inflow * 0.3),
        net: `${inflow > 0 ? "+" : ""}${fmt(inflow * 0.7)}`,
        type: i === 0 || i === 3 ? "Dividend Period" : "Coupon / Interest",
      };
    });

    const coll = [
      { type: "Cash Equivalent", value: fmt(totalValue * 0.03), haircut: "0%", usable: fmt(totalValue * 0.03) },
      { type: "Large Cap Equity", value: fmt(totalValue * 0.6), haircut: "25%", usable: fmt(totalValue * 0.45) },
      { type: "Mid/Small Cap", value: fmt(totalValue * 0.37), haircut: "40%", usable: fmt(totalValue * 0.222) },
    ];

    return { valuations: h, cashflows: cf, collateral: coll };
  }, [holdings, totalValue, fmt]);

  if (holdings.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-12 text-center">
        <p className="text-muted-foreground">Analyze stocks to see real valuation data.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider mb-4">Valuation & Pricing Matrix</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                {["Ticker", "Model", "Fair Value", "Current", "Upside", "P/E", "P/BV", "Div Yield"].map(h => (
                  <th key={h} className="px-2 py-2 text-left text-xs font-medium text-muted-foreground">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {valuations.map(h => (
                <tr key={h.ticker} className="border-b border-border/50">
                  <td className="px-2 py-2 font-mono font-medium text-foreground">{h.ticker}</td>
                  <td className="px-2 py-2 text-xs text-muted-foreground">{h.model}</td>
                  <td className="px-2 py-2 font-mono text-foreground">{h.fairValue}</td>
                  <td className="px-2 py-2 font-mono text-muted-foreground">{h.current}</td>
                  <td className={`px-2 py-2 font-mono ${h.upside.startsWith("+") ? "text-gain" : "text-loss"}`}>{h.upside}</td>
                  <td className="px-2 py-2 font-mono text-muted-foreground">{h.pe > 0 ? `${h.pe.toFixed(1)}x` : "—"}</td>
                  <td className="px-2 py-2 font-mono text-muted-foreground">{h.pbv > 0 ? `${h.pbv.toFixed(1)}x` : "—"}</td>
                  <td className="px-2 py-2 font-mono text-muted-foreground">{h.divYield > 0 ? `${h.divYield.toFixed(1)}%` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider mb-4">Cash Flow Forecast</h3>
          <div className="space-y-2">
            {cashflows.map(c => (
              <div key={c.month} className="flex items-center justify-between rounded-lg bg-surface-2 p-3">
                <div>
                  <p className="text-sm font-medium text-foreground">{c.month}</p>
                  <p className="text-[10px] text-muted-foreground">{c.type}</p>
                </div>
                <div className="text-right">
                  <p className="font-mono text-sm font-bold text-gain">{c.net}</p>
                  <p className="text-[10px] text-muted-foreground">In: {c.inflow} | Out: {c.outflow}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-5">
          <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider mb-4">Collateral Management</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  {["Type", "Value", "Haircut", "Usable"].map(h => (
                    <th key={h} className="px-3 py-2 text-left text-xs font-medium text-muted-foreground">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {collateral.map(c => (
                  <tr key={c.type} className="border-b border-border/50">
                    <td className="px-3 py-2 text-foreground">{c.type}</td>
                    <td className="px-3 py-2 font-mono text-foreground">{c.value}</td>
                    <td className="px-3 py-2 font-mono text-muted-foreground">{c.haircut}</td>
                    <td className="px-3 py-2 font-mono text-gain">{c.usable}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ValuationModule;
