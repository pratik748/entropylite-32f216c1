import { useMemo } from "react";
import { type PortfolioStock } from "@/components/PortfolioPanel";
import { useNormalizedPortfolio } from "@/hooks/useNormalizedPortfolio";

interface Props { stocks: PortfolioStock[]; }

const ClientReportingModule = ({ stocks }: Props) => {
  const { totalValue, totalInvested, totalPnl, holdings, fmt } = useNormalizedPortfolio(stocks);

  const { summary, avgReturn } = useMemo(() => {
    if (holdings.length === 0) return { summary: [], avgReturn: 0 };
    const ret = totalInvested > 0 ? (totalPnl / totalInvested) * 100 : 0;
    const h = holdings.map(h => ({
      ticker: h.ticker,
      value: fmt(h.value),
      weight: `${(h.value / totalValue * 100).toFixed(1)}%`,
      pnl: `${h.pnl >= 0 ? "+" : ""}${fmt(h.pnl)}`,
      ret: `${h.pnlPct >= 0 ? "+" : ""}${h.pnlPct.toFixed(1)}%`,
      suggestion: h.suggestion,
      pnlSign: h.pnl >= 0,
    }));
    return { summary: h, avgReturn: ret };
  }, [holdings, totalValue, totalInvested, totalPnl, fmt]);

  if (holdings.length === 0) {
    return (
      <div className="rounded-xl border border-border bg-card p-12 text-center">
        <p className="text-muted-foreground">Analyze stocks to generate client reports.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-3 md:grid-cols-4">
        <div className="rounded-xl border border-border bg-card p-5">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Portfolio NAV</p>
          <p className="mt-1 font-mono text-2xl font-bold text-foreground">{fmt(totalValue)}</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Total P&L</p>
          <p className={`mt-1 font-mono text-2xl font-bold ${totalPnl >= 0 ? "text-gain" : "text-loss"}`}>
            {totalPnl >= 0 ? "+" : ""}{fmt(totalPnl)}
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Return</p>
          <p className={`mt-1 font-mono text-2xl font-bold ${avgReturn >= 0 ? "text-gain" : "text-loss"}`}>
            {avgReturn >= 0 ? "+" : ""}{avgReturn.toFixed(1)}%
          </p>
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Holdings</p>
          <p className="mt-1 font-mono text-2xl font-bold text-foreground">{holdings.length}</p>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card p-5">
        <h3 className="text-sm font-semibold text-foreground uppercase tracking-wider mb-4">Holdings Report</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border">
                {["Ticker", "Value", "Weight", "P&L", "Return", "Recommendation"].map(h => (
                  <th key={h} className="px-2 py-2 text-left text-xs font-medium text-muted-foreground">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {summary.map(s => (
                <tr key={s.ticker} className="border-b border-border/50">
                  <td className="px-2 py-2 font-mono font-medium text-foreground">{s.ticker}</td>
                  <td className="px-2 py-2 font-mono text-foreground">{s.value}</td>
                  <td className="px-2 py-2 font-mono text-muted-foreground">{s.weight}</td>
                  <td className={`px-2 py-2 font-mono ${s.pnlSign ? "text-gain" : "text-loss"}`}>{s.pnl}</td>
                  <td className={`px-2 py-2 font-mono ${s.pnlSign ? "text-gain" : "text-loss"}`}>{s.ret}</td>
                  <td className="px-2 py-2">
                    <span className={`font-mono text-xs font-bold ${s.suggestion === "Add" ? "text-gain" : s.suggestion === "Exit" ? "text-loss" : "text-foreground"}`}>
                      {s.suggestion}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default ClientReportingModule;
