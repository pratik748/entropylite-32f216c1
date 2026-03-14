import { useState, useEffect, useCallback, useRef, useMemo } from "react";
import {
  Brain, Zap, AlertTriangle, Clock, Target, XCircle, CheckCircle, RefreshCw,
  Trash2, History, TrendingUp, TrendingDown, Shield, Activity, ArrowUpRight,
  ArrowDownRight, DollarSign, ShieldAlert, Layers, BarChart3,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { type PortfolioStock } from "@/components/PortfolioPanel";
import { useNormalizedPortfolio } from "@/hooks/useNormalizedPortfolio";
import { useMarketRegime, type RegimeType } from "@/hooks/useMarketRegime";
import { usePaperTrading, type PaperTrade } from "@/hooks/usePaperTrading";
import { useStrategyMemory, type GeneratedStrategy, type StrategyMemoryEntry } from "@/hooks/useStrategyMemory";
import { governedInvoke } from "@/lib/apiGovernor";
import { toast } from "sonner";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell,
  ComposedChart, ReferenceLine, Scatter, Legend, CartesianGrid, Area,
} from "recharts";

interface Props { stocks: PortfolioStock[]; }

interface TradeInstruction {
  action: "BUY" | "SELL" | "TRIM" | "ADD" | "HEDGE" | "HOLD" | "CLOSE";
  ticker: string;
  is_existing_position: boolean;
  urgency: "IMMEDIATE" | "TODAY" | "THIS_WEEK" | "WHEN_TRIGGERED";
  quantity?: number;
  dollar_amount?: number;
  entry_price?: number;
  entry_zone_low?: number;
  entry_zone_high?: number;
  stop_loss_price?: number;
  take_profit_price?: number;
  time_horizon: string;
  rationale: string;
  risk_reward: string;
  category: "POSITION_MGMT" | "HEDGE" | "NEW_ENTRY" | "REBALANCE" | "RISK_REDUCTION";
  priority: number;
  confidence: number;
}

const regimeColors: Record<RegimeType, string> = {
  "Trending Bull": "text-gain",
  "Trending Bear": "text-loss",
  "High Volatility": "text-warning",
  "Range-Bound": "text-muted-foreground",
  "Crisis": "text-loss",
  "Rotation": "text-info",
};

const regimeIcons: Record<RegimeType, typeof TrendingUp> = {
  "Trending Bull": TrendingUp,
  "Trending Bear": TrendingDown,
  "High Volatility": Activity,
  "Range-Bound": Shield,
  "Crisis": AlertTriangle,
  "Rotation": RefreshCw,
};

const actionConfig: Record<string, { icon: typeof ArrowUpRight; color: string; bg: string }> = {
  BUY:   { icon: ArrowUpRight, color: "text-gain", bg: "bg-gain/10 border-gain/20" },
  ADD:   { icon: ArrowUpRight, color: "text-gain", bg: "bg-gain/10 border-gain/20" },
  SELL:  { icon: ArrowDownRight, color: "text-loss", bg: "bg-loss/10 border-loss/20" },
  TRIM:  { icon: ArrowDownRight, color: "text-warning", bg: "bg-warning/10 border-warning/20" },
  CLOSE: { icon: XCircle, color: "text-loss", bg: "bg-loss/10 border-loss/20" },
  HEDGE: { icon: ShieldAlert, color: "text-info", bg: "bg-info/10 border-info/20" },
  HOLD:  { icon: Shield, color: "text-muted-foreground", bg: "bg-surface-2 border-border" },
};

const urgencyConfig: Record<string, { label: string; color: string }> = {
  IMMEDIATE:     { label: "⚡ IMMEDIATE", color: "text-loss" },
  TODAY:         { label: "🕐 TODAY", color: "text-warning" },
  THIS_WEEK:     { label: "📅 THIS WEEK", color: "text-foreground" },
  WHEN_TRIGGERED: { label: "🎯 ON TRIGGER", color: "text-muted-foreground" },
};

const categoryLabels: Record<string, string> = {
  POSITION_MGMT: "Position Mgmt",
  HEDGE: "Hedging",
  NEW_ENTRY: "New Entry",
  REBALANCE: "Rebalance",
  RISK_REDUCTION: "Risk Reduction",
};

// ─── Chart Colors ───
const GAIN_COLOR = "hsl(152 90% 45%)";
const LOSS_COLOR = "hsl(0 90% 55%)";
const WARNING_COLOR = "hsl(38 92% 55%)";
const INFO_COLOR = "hsl(210 60% 55%)";
const MUTED_COLOR = "hsl(0 0% 42%)";

const StrategyLab = ({ stocks }: Props) => {
  const { holdings, fmt } = useNormalizedPortfolio(stocks);
  const regime = useMarketRegime(30000);

  const [instructions, setInstructions] = useState<TradeInstruction[]>([]);
  const [assessment, setAssessment] = useState("");
  const [loading, setLoading] = useState(false);
  const [lastGenerated, setLastGenerated] = useState<number>(0);
  const [showMemory, setShowMemory] = useState(false);
  const generatingRef = useRef(false);
  const { memory, logStrategy, getRelevantMemories, getWinRate, clearMemory } = useStrategyMemory();

  const generateInstructions = useCallback(async () => {
    if (!regime || generatingRef.current) return;
    generatingRef.current = true;
    setLoading(true);

    try {
      const portfolio = stocks
        .filter(s => s.analysis)
        .map(s => {
          const totalVal = stocks.reduce((sum, st) => sum + (st.analysis?.currentPrice || st.buyPrice) * st.quantity, 0);
          const posVal = (s.analysis?.currentPrice || s.buyPrice) * s.quantity;
          return {
            ticker: s.ticker,
            quantity: s.quantity,
            buyPrice: s.buyPrice,
            currentPrice: s.analysis?.currentPrice || s.buyPrice,
            pnlPct: s.analysis?.currentPrice ? ((s.analysis.currentPrice - s.buyPrice) / s.buyPrice) * 100 : 0,
            weightPct: totalVal > 0 ? (posVal / totalVal) * 100 : 0,
          };
        });

      const { data, error } = await governedInvoke("strategy-generate", {
        body: {
          regime: regime.regime,
          vix: regime.vix,
          moodScore: regime.moodScore,
          sectors: regime.sectors,
          portfolio,
          keyEvents: regime.keyEvents,
          outlook: regime.outlook,
        },
        force: true,
      });

      if (error) throw error;
      if (!data?.instructions) throw new Error("No instructions returned");

      setInstructions(data.instructions);
      setAssessment(data.portfolio_assessment || "");
      setLastGenerated(Date.now());

      // Log to strategy memory
      data.instructions.forEach((inst: TradeInstruction) => {
        logStrategy({
          id: crypto.randomUUID(),
          strategy: {
            id: crypto.randomUUID(),
            name: `${inst.action} ${inst.ticker}`,
            type: inst.category,
            regime_fit: regime.regime,
            rationale: inst.rationale,
            entry_rule: inst.entry_price ? `Enter at ${fmt(inst.entry_price)}` : "Market order",
            exit_rule: inst.take_profit_price ? `TP at ${fmt(inst.take_profit_price)}` : "Trailing",
            stop_loss_pct: inst.stop_loss_price && inst.entry_price ? -Math.abs(((inst.stop_loss_price - inst.entry_price) / inst.entry_price) * 100) : -3,
            take_profit_pct: inst.take_profit_price && inst.entry_price ? ((inst.take_profit_price - inst.entry_price) / inst.entry_price) * 100 : 8,
            position_size_pct: 10,
            instruments: [inst.ticker],
            confidence: inst.confidence,
          },
          regime: regime.regime,
          entryTime: Date.now(),
          exitTime: Date.now(),
          pnlPct: 0,
          outcome: "neutral",
          conditions: { vix: regime.vix, moodScore: regime.moodScore, topSector: regime.sectors[0]?.name || "" },
        });
      });

      toast.success(`${data.instructions.length} trade instructions generated`);
    } catch (err: any) {
      console.error("Strategy generation error:", err);
      toast.error(err.message || "Failed to generate instructions");
    } finally {
      setLoading(false);
      generatingRef.current = false;
    }
  }, [regime, stocks, holdings, logStrategy]);

  const RegimeIcon = regime ? regimeIcons[regime.regime] : Activity;

  const positionMgmt = instructions.filter(i => i.category === "POSITION_MGMT" || i.category === "RISK_REDUCTION" || i.category === "REBALANCE");
  const hedges = instructions.filter(i => i.category === "HEDGE");
  const newEntries = instructions.filter(i => i.category === "NEW_ENTRY");

  return (
    <div className="space-y-4">
      {/* Market Context Bar */}
      <div className="rounded border border-border bg-card p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-foreground" />
            <h3 className="text-sm font-bold text-foreground uppercase tracking-wider">Strategy Intelligence</h3>
            {regime && (
              <span className="rounded bg-surface-3 px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
                LIVE · {new Date(regime.timestamp).toLocaleTimeString()}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => setShowMemory(!showMemory)} className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors">
              <History className="h-3 w-3" />
              History ({memory.length})
            </button>
            <Button size="sm" variant="outline" onClick={generateInstructions} disabled={loading || !regime} className="h-7 gap-1 text-xs">
              <RefreshCw className={`h-3 w-3 ${loading ? "animate-spin" : ""}`} />
              {loading ? "Analyzing…" : stocks.filter(s => s.analysis).length > 0 ? "Generate Trade Plan" : "Build Portfolio"}
            </Button>
          </div>
        </div>

        {regime && (
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
            <div className="rounded bg-surface-2 p-2.5">
              <p className="text-[9px] uppercase tracking-wider text-muted-foreground mb-0.5">Regime</p>
              <div className="flex items-center gap-1">
                <RegimeIcon className={`h-3.5 w-3.5 ${regimeColors[regime.regime]}`} />
                <span className={`font-mono text-xs font-bold ${regimeColors[regime.regime]}`}>{regime.regime}</span>
              </div>
            </div>
            <div className="rounded bg-surface-2 p-2.5">
              <p className="text-[9px] uppercase tracking-wider text-muted-foreground mb-0.5">VIX</p>
              <span className={`font-mono text-xs font-bold ${regime.vix > 25 ? "text-loss" : regime.vix < 18 ? "text-gain" : "text-foreground"}`}>{regime.vix.toFixed(1)}</span>
            </div>
            <div className="rounded bg-surface-2 p-2.5">
              <p className="text-[9px] uppercase tracking-wider text-muted-foreground mb-0.5">Mood</p>
              <span className={`font-mono text-xs font-bold ${regime.moodScore > 0 ? "text-gain" : "text-loss"}`}>{regime.moodScore > 0 ? "+" : ""}{regime.moodScore}</span>
            </div>
            <div className="rounded bg-surface-2 p-2.5">
              <p className="text-[9px] uppercase tracking-wider text-muted-foreground mb-0.5">Positions</p>
              <span className="font-mono text-xs font-bold text-foreground">{stocks.filter(s => s.analysis).length}</span>
            </div>
            <div className="rounded bg-surface-2 p-2.5">
              <p className="text-[9px] uppercase tracking-wider text-muted-foreground mb-0.5">Conditions</p>
              <div className="flex flex-wrap gap-0.5">
                {regime.conditions.length === 0 ? (
                  <span className="text-[9px] text-muted-foreground">Normal</span>
                ) : regime.conditions.slice(0, 2).map(c => (
                  <span key={c.id} className={`rounded px-1 py-0.5 text-[8px] font-mono ${
                    c.severity === "high" ? "bg-loss/15 text-loss" : "bg-warning/15 text-warning"
                  }`}>{c.label}</span>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Portfolio Assessment */}
      {assessment && (
        <div className="rounded border border-border bg-card p-4">
          <div className="flex items-center gap-2 mb-2">
            <BarChart3 className="h-4 w-4 text-foreground" />
            <h4 className="text-xs font-bold text-foreground uppercase tracking-wider">Portfolio Assessment</h4>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed">{assessment}</p>
        </div>
      )}

      {/* ─── Summary Charts ─── */}
      {instructions.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {/* Risk/Reward Overview Chart */}
          <div className="rounded border border-border bg-card p-4">
            <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-3">Risk / Reward Map</h4>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart
                data={instructions
                  .filter(i => i.entry_price && i.entry_price > 0)
                  .map(i => {
                    const riskPct = i.stop_loss_price && i.entry_price
                      ? ((i.stop_loss_price - i.entry_price) / i.entry_price) * 100
                      : 0;
                    const rewardPct = i.take_profit_price && i.entry_price
                      ? ((i.take_profit_price - i.entry_price) / i.entry_price) * 100
                      : 0;
                    return { ticker: i.ticker, risk: +riskPct.toFixed(1), reward: +rewardPct.toFixed(1), confidence: i.confidence };
                  })}
                layout="vertical"
                margin={{ top: 0, right: 8, left: 8, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(0 0% 12%)" horizontal={false} />
                <XAxis type="number" tick={{ fontSize: 9, fill: MUTED_COLOR }} domain={["auto", "auto"]} tickFormatter={v => `${v}%`} />
                <YAxis dataKey="ticker" type="category" tick={{ fontSize: 10, fill: "hsl(0 0% 96%)", fontFamily: "JetBrains Mono" }} width={55} />
                <Tooltip
                  contentStyle={{ background: "hsl(0 0% 5%)", border: "1px solid hsl(0 0% 12%)", borderRadius: 4, fontSize: 11 }}
                  formatter={(val: number, name: string) => [`${val}%`, name === "risk" ? "Downside Risk" : "Upside Target"]}
                />
                <ReferenceLine x={0} stroke="hsl(0 0% 20%)" />
                <Bar dataKey="risk" name="Risk" radius={[4, 0, 0, 4]}>
                  {instructions.filter(i => i.entry_price && i.entry_price > 0).map((_, idx) => (
                    <Cell key={idx} fill={LOSS_COLOR} fillOpacity={0.7} />
                  ))}
                </Bar>
                <Bar dataKey="reward" name="Reward" radius={[0, 4, 4, 0]}>
                  {instructions.filter(i => i.entry_price && i.entry_price > 0).map((_, idx) => (
                    <Cell key={idx} fill={GAIN_COLOR} fillOpacity={0.7} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Confidence Distribution */}
          <div className="rounded border border-border bg-card p-4">
            <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider mb-3">Confidence & Urgency</h4>
            <ResponsiveContainer width="100%" height={180}>
              <BarChart
                data={instructions.map(i => ({
                  ticker: i.ticker,
                  confidence: i.confidence,
                  action: i.action,
                  urgency: i.urgency,
                }))}
                margin={{ top: 0, right: 8, left: 8, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(0 0% 12%)" />
                <XAxis dataKey="ticker" tick={{ fontSize: 9, fill: "hsl(0 0% 96%)", fontFamily: "JetBrains Mono" }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 9, fill: MUTED_COLOR }} tickFormatter={v => `${v}%`} />
                <Tooltip
                  contentStyle={{ background: "hsl(0 0% 5%)", border: "1px solid hsl(0 0% 12%)", borderRadius: 4, fontSize: 11 }}
                  formatter={(val: number, _: string, props: any) => [`${val}%`, `Confidence (${props.payload.action})`]}
                />
                <ReferenceLine y={70} stroke={WARNING_COLOR} strokeDasharray="3 3" label={{ value: "High", fill: WARNING_COLOR, fontSize: 8, position: "right" }} />
                <Bar dataKey="confidence" radius={[4, 4, 0, 0]}>
                  {instructions.map((inst, idx) => (
                    <Cell
                      key={idx}
                      fill={
                        inst.urgency === "IMMEDIATE" ? LOSS_COLOR :
                        inst.urgency === "TODAY" ? WARNING_COLOR :
                        inst.confidence >= 70 ? GAIN_COLOR : INFO_COLOR
                      }
                      fillOpacity={0.8}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {/* Trade Instructions */}
      {instructions.length === 0 && !loading ? (
        <div className="rounded border border-border bg-card p-8 text-center">
          <Target className="h-8 w-8 mx-auto text-muted-foreground/20 mb-3" />
          <p className="text-sm font-medium text-muted-foreground">No active trade plan.</p>
          <p className="text-[11px] text-muted-foreground/60 mt-1">
            {stocks.filter(s => s.analysis).length > 0
              ? `Click "Generate Trade Plan" to get exact instructions for your ${stocks.filter(s => s.analysis).length} positions in the current ${regime?.regime || "market"} regime.`
              : 'Add stocks to your portfolio first, then click "Build Portfolio" for initial position recommendations.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {positionMgmt.length > 0 && (
            <InstructionGroup title="Your Positions" icon={<Layers className="h-4 w-4" />} instructions={positionMgmt} />
          )}
          {hedges.length > 0 && (
            <InstructionGroup title="Hedging" icon={<ShieldAlert className="h-4 w-4" />} instructions={hedges} />
          )}
          {newEntries.length > 0 && (
            <InstructionGroup title="New Opportunities" icon={<ArrowUpRight className="h-4 w-4" />} instructions={newEntries} />
          )}
        </div>
      )}

      {lastGenerated > 0 && (
        <p className="text-[9px] text-muted-foreground/40 font-mono text-center">
          Generated {new Date(lastGenerated).toLocaleTimeString()} · Regime: {regime?.regime}
        </p>
      )}

      {/* Strategy Memory */}
      {showMemory && (
        <div className="rounded border border-border bg-card p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <History className="h-4 w-4 text-foreground" />
              <h4 className="text-xs font-bold text-foreground uppercase tracking-wider">Trade History</h4>
              <span className="rounded bg-surface-3 px-1.5 py-0.5 font-mono text-[9px] text-muted-foreground">{memory.length} entries</span>
            </div>
            {memory.length > 0 && (
              <Button size="sm" variant="ghost" onClick={clearMemory} className="h-6 gap-1 text-[10px] text-muted-foreground">
                <Trash2 className="h-3 w-3" /> Clear
              </Button>
            )}
          </div>
          {memory.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No trade history yet.</p>
          ) : (
            <div className="space-y-1.5">
              {memory.slice(0, 15).map(entry => (
                <div key={entry.id} className="flex items-center justify-between rounded bg-surface-2 p-2">
                  <div className="flex items-center gap-2">
                    {entry.outcome === "win" ? <CheckCircle className="h-3 w-3 text-gain" /> :
                     entry.outcome === "loss" ? <XCircle className="h-3 w-3 text-loss" /> :
                     <Clock className="h-3 w-3 text-muted-foreground" />}
                    <span className="text-[11px] font-semibold text-foreground">{entry.strategy.name}</span>
                    <span className="rounded bg-surface-3 px-1 py-0.5 text-[8px] font-mono text-muted-foreground">{entry.regime}</span>
                  </div>
                  <span className="text-[9px] text-muted-foreground font-mono">
                    {new Date(entry.entryTime).toLocaleDateString()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};

// ─── Sub-components ───

const InstructionGroup = ({ title, icon, instructions }: { title: string; icon: React.ReactNode; instructions: TradeInstruction[] }) => (
  <div className="rounded border border-border bg-card p-4">
    <div className="flex items-center gap-2 mb-3">
      {icon}
      <h4 className="text-xs font-bold text-foreground uppercase tracking-wider">{title}</h4>
      <span className="rounded bg-surface-3 px-1.5 py-0.5 font-mono text-[9px] text-muted-foreground">{instructions.length}</span>
    </div>
    <div className="space-y-2.5">
      {instructions.map((inst, i) => (
        <TradeCard key={i} instruction={inst} />
      ))}
    </div>
  </div>
);

const TradeCard = ({ instruction: inst }: { instruction: TradeInstruction }) => {
  const { baseCurrency } = useFX();
  const sym = getCurrencySymbol(baseCurrency);
  const fmt = useCallback((v: number) => `${sym}${v.toLocaleString(undefined, { maximumFractionDigits: 2 })}`, [sym]);
  const config = actionConfig[inst.action] || actionConfig.HOLD;
  const ActionIcon = config.icon;
  const urgency = urgencyConfig[inst.urgency] || urgencyConfig.THIS_WEEK;

  // Build price level chart data
  const hasLevels = (inst.entry_price && inst.entry_price > 0) &&
    ((inst.stop_loss_price && inst.stop_loss_price > 0) || (inst.take_profit_price && inst.take_profit_price > 0));

  const priceLevels = hasLevels ? (() => {
    const entry = inst.entry_price!;
    const sl = inst.stop_loss_price && inst.stop_loss_price > 0 ? inst.stop_loss_price : null;
    const tp = inst.take_profit_price && inst.take_profit_price > 0 ? inst.take_profit_price : null;
    const ezLow = inst.entry_zone_low && inst.entry_zone_low > 0 ? inst.entry_zone_low : null;
    const ezHigh = inst.entry_zone_high && inst.entry_zone_high > 0 ? inst.entry_zone_high : null;

    const all = [sl, ezLow, entry, ezHigh, tp].filter(Boolean) as number[];
    const min = Math.min(...all) * 0.995;
    const max = Math.max(...all) * 1.005;

    return { entry, sl, tp, ezLow, ezHigh, min, max };
  })() : null;

  return (
    <div className={`rounded border p-3 ${config.bg}`}>
      {/* Header row */}
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`flex items-center gap-1 rounded px-2 py-0.5 text-[10px] font-mono font-bold ${config.color} bg-background/50`}>
            <ActionIcon className="h-3 w-3" />
            {inst.action}
          </span>
          <span className="text-sm font-bold text-foreground">{inst.ticker}</span>
          {inst.is_existing_position && (
            <span className="rounded bg-surface-3 px-1.5 py-0.5 text-[8px] font-mono text-muted-foreground">IN PORTFOLIO</span>
          )}
          <span className={`text-[9px] font-mono font-bold ${urgency.color}`}>{urgency.label}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[9px] font-mono text-muted-foreground">{inst.confidence}% conf</span>
          <span className="rounded bg-surface-3 px-1.5 py-0.5 text-[8px] font-mono text-muted-foreground">
            {categoryLabels[inst.category] || inst.category}
          </span>
        </div>
      </div>

      {/* Rationale */}
      <p className="text-[11px] text-muted-foreground leading-relaxed mb-2">{inst.rationale}</p>

      {/* Price Levels Visual */}
      {priceLevels && (
        <div className="mb-3 rounded bg-background/40 p-2.5">
          <p className="text-[8px] uppercase tracking-wider text-muted-foreground mb-1.5">Price Levels</p>
          <PriceLevelChart levels={priceLevels} ticker={inst.ticker} />
        </div>
      )}

      {/* Trade Details Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-2">
        {inst.quantity != null && inst.quantity > 0 && (
          <DetailCell label="Quantity" value={`${inst.quantity} shares`} />
        )}
        {inst.dollar_amount != null && inst.dollar_amount > 0 && (
          <DetailCell label="Amount" value={fmt(inst.dollar_amount)} />
        )}
        {inst.entry_price != null && inst.entry_price > 0 && (
          <DetailCell label="Entry" value={fmt(inst.entry_price)} />
        )}
        {inst.entry_zone_low != null && inst.entry_zone_high != null && inst.entry_zone_low > 0 && (
          <DetailCell label="Entry Zone" value={`${fmt(inst.entry_zone_low)} – ${fmt(inst.entry_zone_high)}`} />
        )}
        {inst.stop_loss_price != null && inst.stop_loss_price > 0 && (
          <DetailCell label="Stop Loss" value={fmt(inst.stop_loss_price)} highlight="loss" />
        )}
        {inst.take_profit_price != null && inst.take_profit_price > 0 && (
          <DetailCell label="Take Profit" value={fmt(inst.take_profit_price)} highlight="gain" />
        )}
        <DetailCell label="R:R" value={inst.risk_reward} />
        <DetailCell label="Horizon" value={inst.time_horizon} />
      </div>
    </div>
  );
};

// ─── Price Level Visualization ───
const PriceLevelChart = ({ levels, ticker }: { levels: { entry: number; sl: number | null; tp: number | null; ezLow: number | null; ezHigh: number | null; min: number; max: number }; ticker: string }) => {
  const range = levels.max - levels.min;
  const toPercent = (val: number) => ((val - levels.min) / range) * 100;

  const entryPct = toPercent(levels.entry);
  const slPct = levels.sl ? toPercent(levels.sl) : null;
  const tpPct = levels.tp ? toPercent(levels.tp) : null;
  const ezLowPct = levels.ezLow ? toPercent(levels.ezLow) : null;
  const ezHighPct = levels.ezHigh ? toPercent(levels.ezHigh) : null;

  return (
    <div className="relative h-10">
      {/* Base track */}
      <div className="absolute top-4 left-0 right-0 h-[2px] bg-border rounded-full" />

      {/* Entry zone fill */}
      {ezLowPct != null && ezHighPct != null && (
        <div
          className="absolute top-2.5 h-3 rounded-sm"
          style={{
            left: `${ezLowPct}%`,
            width: `${ezHighPct - ezLowPct}%`,
            background: `${INFO_COLOR}22`,
            border: `1px solid ${INFO_COLOR}44`,
          }}
        />
      )}

      {/* Stop Loss marker */}
      {slPct != null && (
        <div className="absolute top-0" style={{ left: `${slPct}%`, transform: "translateX(-50%)" }}>
          <div className="w-[2px] h-9 mx-auto" style={{ background: LOSS_COLOR }} />
          <p className="text-[8px] font-mono text-center whitespace-nowrap" style={{ color: LOSS_COLOR }}>
            SL {levels.sl!.toFixed(0)}
          </p>
        </div>
      )}

      {/* Entry marker */}
      <div className="absolute top-0" style={{ left: `${entryPct}%`, transform: "translateX(-50%)" }}>
        <div className="w-2 h-2 rounded-full mx-auto border-2" style={{ borderColor: "hsl(0 0% 96%)", background: "hsl(0 0% 5%)" }} />
        <div className="w-[2px] h-6 mx-auto" style={{ background: "hsl(0 0% 60%)" }} />
        <p className="text-[8px] font-mono text-center whitespace-nowrap text-foreground font-bold">
          {levels.entry.toFixed(0)}
        </p>
      </div>

      {/* Take Profit marker */}
      {tpPct != null && (
        <div className="absolute top-0" style={{ left: `${tpPct}%`, transform: "translateX(-50%)" }}>
          <div className="w-[2px] h-9 mx-auto" style={{ background: GAIN_COLOR }} />
          <p className="text-[8px] font-mono text-center whitespace-nowrap" style={{ color: GAIN_COLOR }}>
            TP {levels.tp!.toFixed(0)}
          </p>
        </div>
      )}
    </div>
  );
};

const DetailCell = ({ label, value, highlight }: { label: string; value: string; highlight?: "gain" | "loss" }) => (
  <div>
    <p className="text-[8px] uppercase tracking-wider text-muted-foreground">{label}</p>
    <p className={`font-mono text-[11px] font-semibold ${
      highlight === "gain" ? "text-gain" : highlight === "loss" ? "text-loss" : "text-foreground"
    }`}>{value}</p>
  </div>
);

export default StrategyLab;
