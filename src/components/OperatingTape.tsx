import { AlertTriangle, Briefcase, Clock, Compass, Crown, Database, Shield } from "lucide-react";
import { motion } from "framer-motion";
import type { PortfolioStock } from "@/components/PortfolioPanel";
import type { PriceStatusMap } from "@/pages/Index";
import { formatCurrency } from "@/lib/currency";

type RiskReadableAnalysis = NonNullable<PortfolioStock["analysis"]> & { riskLevel?: string; riskScore?: number };

interface OperatingTapeProps {
  stocks: PortfolioStock[];
  portfolioValueBase: number;
  baseCurrency: string;
  priceStatus: PriceStatusMap;
  analyzedCount: number;
}

const pct = (n: number) => `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;

const OperatingTape = ({ stocks, portfolioValueBase, baseCurrency, priceStatus, analyzedCount }: OperatingTapeProps) => {
  const analyzed = stocks.filter((s) => s.analysis && !s.isLoading);
  const totalPnL = analyzed.reduce((sum, s) => {
    const current = s.analysis?.currentPrice ?? s.buyPrice;
    return sum + (current - s.buyPrice) * s.quantity;
  }, 0);
  const totalCost = analyzed.reduce((sum, s) => sum + s.buyPrice * s.quantity, 0);
  const pnlPct = totalCost > 0 ? (totalPnL / totalCost) * 100 : 0;
  const liveFeeds = Object.values(priceStatus).filter((p) => p.status === "LIVE").length;
  const impairedFeeds = Object.values(priceStatus).filter((p) => p.status !== "LIVE").length;
  const loading = stocks.filter((s) => s.isLoading).length;
  const riskNames = analyzed
    .filter((s) => {
      const a = s.analysis as RiskReadableAnalysis | undefined;
      return (a?.riskLevel || "").toString().toLowerCase().includes("high") || (a?.riskScore ?? 0) >= 70;
    })
    .map((s) => s.ticker)
    .slice(0, 3);
  const concentration = analyzed.length > 0 && portfolioValueBase > 0
    ? Math.max(...analyzed.map((s) => ((s.analysis?.currentPrice ?? s.buyPrice) * s.quantity) / portfolioValueBase)) * 100
    : 0;
  const systemState = loading > 0
    ? "ANALYSIS ASSEMBLING"
    : impairedFeeds > 0
      ? "DATA IMPAIRED"
      : riskNames.length || concentration > 40
        ? "RISK WATCH"
        : analyzed.length > 0
          ? "BOOK SYNCHRONIZED"
          : "CROWN STANDBY";

  const cells = [
    { label: "Book value", value: portfolioValueBase > 0 ? formatCurrency(portfolioValueBase, baseCurrency) : "No capital allocated", icon: Briefcase },
    { label: "Open P/L", value: totalCost > 0 ? `${formatCurrency(totalPnL, baseCurrency)} · ${pct(pnlPct)}` : "Awaiting marks", icon: Compass, tone: totalPnL >= 0 ? "gain" : "loss" },
    { label: "Evidence coverage", value: `${analyzedCount}/${stocks.length || 0} analyzed`, icon: Database },
    { label: "Feed state", value: impairedFeeds ? `${liveFeeds} live · ${impairedFeeds} impaired` : liveFeeds ? `${liveFeeds} live` : "No active feeds", icon: Clock, tone: impairedFeeds ? "warning" : undefined },
    { label: "Risk focus", value: riskNames.length ? riskNames.join(" / ") : concentration > 40 ? `Top weight ${concentration.toFixed(0)}%` : "No dominant breach", icon: Shield, tone: riskNames.length || concentration > 40 ? "warning" : undefined },
  ];

  return (
    <section className="crown-plane" aria-label="Capital operating context">
      <div className="grid grid-cols-1 border-b border-border/70 lg:grid-cols-[220px_1fr]">
        <div className="flex items-center gap-2 px-3 py-2.5">
          <motion.div
            initial={{ rotate: -8, opacity: 0 }}
            animate={{ rotate: 0, opacity: 1 }}
            transition={{ type: "spring", stiffness: 360, damping: 30 }}
            className="flex h-7 w-7 items-center justify-center border border-border bg-surface-2"
          >
            <Crown className="h-3.5 w-3.5 text-foreground" strokeWidth={1.55} />
          </motion.div>
          <div className="min-w-0">
            <div className="data-label text-[9px]">Crown layer</div>
            <div className="truncate font-mono text-[11px] font-semibold uppercase tracking-[0.1em] text-foreground">{systemState}</div>
          </div>
        </div>
        <div className="grid grid-cols-2 divide-x divide-y divide-border/70 md:grid-cols-5 md:divide-y-0 lg:border-l lg:border-border/70">
        {cells.map(({ label, value, icon: Icon, tone }, i) => (
          <motion.div
            key={label}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: "spring", stiffness: 380, damping: 34, delay: i * 0.035 }}
            className="crown-node flex min-w-0 items-center gap-2 px-3 py-2.5"
          >
            <Icon className={`h-3.5 w-3.5 shrink-0 ${tone === "gain" ? "text-gain" : tone === "loss" ? "text-loss" : tone === "warning" ? "text-warning" : "text-muted-foreground"}`} strokeWidth={1.65} />
            <div className="min-w-0">
              <div className="data-label text-[9px]">{label}</div>
              <div className={`truncate font-mono text-[11px] font-semibold tabular-nums ${tone === "gain" ? "text-gain" : tone === "loss" ? "text-loss" : tone === "warning" ? "text-warning" : "text-foreground"}`}>{value}</div>
            </div>
          </motion.div>
        ))}
        </div>
      </div>
      {loading > 0 && (
        <div className="flex items-center gap-2 border-t border-border/70 px-3 py-1.5 text-[10px] text-muted-foreground">
          <AlertTriangle className="h-3 w-3 text-warning" /> {loading} analysis pass assembling; conclusions remain provisional until evidence coverage updates.
        </div>
      )}
    </section>
  );
};

export default OperatingTape;
