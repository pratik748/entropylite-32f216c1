import { useMemo } from "react";
import { type PortfolioStock } from "@/components/PortfolioPanel";

interface Props { stocks: PortfolioStock[]; }

const ClientReportingModule = ({ stocks }: Props) => {
  const analyzed = stocks.filter(s => s.analysis);

  const { summary, totalValue, totalPnl, avgReturn } = useMemo(() => {
    if (analyzed.length === 0) return { summary: [], totalValue: 0, totalPnl: 0, avgReturn: 0 };

    const total = analyzed.reduce((s, st) => s + (st.analysis.currentPrice || st.buyPrice) * st.quantity, 0);
    const invested = analyzed.reduce((s, st) => s + st.buyPrice * st.quantity, 0);
    const pnl = total - invested;
    const ret = invested > 0 ? (pnl / invested) * 100 : 0;

    const holdings = analyzed.map(s => {
      const val = (s.analysis.currentPrice || s.buyPrice) * s.quantity;
      const stockPnl = ((s.analysis.currentPrice || s.buyPrice) - s.buyPrice) * s.quantity;
      const stockRet = ((s.analysis.currentPrice || s.buyPrice) - s.buyPrice) / s.buyPrice * 100;
      return {
        ticker: s.ticker.replace(".NS", "").replace(".BO", ""),
        value: `₹${(val / 100000).toFixed(1)} L`,
        weight: `${(val / total * 100).toFixed(1)}%`,
        pnl: `${stockPnl >= 0 ? "+" : ""}₹${(stockPnl / 100000).toFixed(1)} L`,
        ret: `${stockRet >= 0 ? "+" : ""}${stockRet.toFixed(1)}%`,
        suggestion: s.analysis.suggestion || "Hold",
        pnlSign: stockPnl >= 0,
      };
    });

    return { summary: holdings, totalValue: total, totalPnl: pnl, avgReturn: ret };
  }, [analyzed]);

  if (analyzed.length === 0) {
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
          <p className="mt-1 font-mono text-2xl font-bold text-foreground">₹{(totalValue / 100000).toFixed(1)} L</p>
        </div>
        <div className="rounded-xl border border-border bg-card p-5">
          <p className="text-[10px] uppercase tracking-wider text-muted-foreground">Total P&L</p>
          <p className={`mt-1 font-mono text-2xl font-bold ${totalPnl >= 0 ? "text-gain" : "text-loss"}`}>
            {totalPnl >= 0 ? "+" : ""}₹{(totalPnl / 100000).toFixed(1)} L
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
          <p className="mt-1 font-mono text-2xl font-bold text-foreground">{analyzed.length}</p>
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
