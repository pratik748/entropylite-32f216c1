import { useState, useMemo } from "react";
import { Activity, ArrowRight, CheckCircle2, MinusCircle, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useIntradayValidator, type ValidatorResult } from "@/hooks/useIntradayValidator";
import { computeScarBiases } from "@/components/sandbox/ScarMemory";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { useMarketRegime } from "@/hooks/useMarketRegime";
import { LineChart, Line, ResponsiveContainer, XAxis, YAxis, Tooltip, Area, AreaChart } from "recharts";
import { normalizeUserTicker } from "@/lib/ticker";

interface Props {
  capital: number;
  residualBudgetPct: number;
  blocked: boolean;
  blockReasons: string[];
  onValidated?: (r: ValidatorResult) => void;
  onAccept?: (r: ValidatorResult, sizeShares: number) => void;
  intradayMode?: boolean;
  tickerSuggestions?: string[];
}

const PreTradeValidator = ({ capital, residualBudgetPct, blocked, blockReasons, onValidated, onAccept, intradayMode = false, tickerSuggestions = [] }: Props) => {
  const [ticker, setTicker] = useState(tickerSuggestions[0] || "AAPL");
  const [target, setTarget] = useState(intradayMode ? 1.0 : 1.5);
  const [stop, setStop] = useState(intradayMode ? 0.5 : 0.8);
  const [horizon, setHorizon] = useState(intradayMode ? 15 : 30);
  const { validate, validating, result, error, reset } = useIntradayValidator();
  const regime = useMarketRegime(60_000);
  const [scars] = useLocalStorage<any[]>("entropy-scars", []);
  const biases = useMemo(() => computeScarBiases(scars), [scars]);

  const verdictMeta = result ? {
    GO:     { color: "text-gain border-gain/40 bg-gain/10", icon: <CheckCircle2 className="h-3.5 w-3.5" /> },
    SHRINK: { color: "text-warning border-warning/40 bg-warning/10", icon: <MinusCircle className="h-3.5 w-3.5" /> },
    SKIP:   { color: "text-loss border-loss/40 bg-loss/10", icon: <XCircle className="h-3.5 w-3.5" /> },
  }[result.verdict] : null;

  const handleRun = async () => {
    const norm = normalizeUserTicker(ticker);
    if (!norm) return;
    const r = await validate({
      ticker: norm,
      capital,
      targetPct: target,
      horizonMin: horizon,
      stopPct: stop,
      regime: (regime?.regime as any) || "unknown",
      scarBiases: biases,
      dailyBudgetPct: Math.max(0.1, residualBudgetPct),
    });
    if (r) onValidated?.(r);
  };

  return (
    <div className="rounded-sm border border-border bg-card p-3">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <Activity className="h-3.5 w-3.5 text-primary" />
          <h3 className="text-[11px] font-mono uppercase tracking-wider text-foreground">Pre-Trade Validator</h3>
        </div>
        <Badge variant="outline" className="text-[9px] font-mono">
          {intradayMode ? "Intraday · 2,000-path GBM" : "2,000-path GBM · regime-aware"}
        </Badge>
      </div>

      {intradayMode && tickerSuggestions.length > 0 && (
        <div className="mb-2 flex items-center gap-1.5 flex-wrap">
          <span className="text-[9px] font-mono uppercase text-muted-foreground">From portfolio:</span>
          {tickerSuggestions.slice(0, 8).map(t => (
            <button
              key={t}
              onClick={() => setTicker(t)}
              className={`px-1.5 py-0.5 rounded-sm border text-[9px] font-mono transition-colors ${
                ticker === t
                  ? "border-primary bg-primary/10 text-primary"
                  : "border-border bg-surface-1 text-muted-foreground hover:text-foreground hover:border-primary/40"
              }`}
            >{t}</button>
          ))}
        </div>
      )}

      {blocked && (
        <div className="mb-2 rounded-sm border border-loss/40 bg-loss/5 px-2 py-1.5 text-[10px] font-mono text-loss">
          Discipline Governor active — entries paused.
          <ul className="mt-1 ml-3 list-disc text-loss/80">
            {blockReasons.map((r, i) => <li key={i}>{r}</li>)}
          </ul>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-2">
        <div>
          <Label className="text-[9px] font-mono uppercase text-muted-foreground">Ticker</Label>
          <Input value={ticker} onChange={e => setTicker(e.target.value.toUpperCase())} className="h-7 text-xs font-mono" />
        </div>
        <div>
          <Label className="text-[9px] font-mono uppercase text-muted-foreground">Target %</Label>
          <Input type="number" step="0.1" value={target} onChange={e => setTarget(parseFloat(e.target.value) || 0)} className="h-7 text-xs font-mono" />
        </div>
        <div>
          <Label className="text-[9px] font-mono uppercase text-muted-foreground">Stop %</Label>
          <Input type="number" step="0.1" value={stop} onChange={e => setStop(parseFloat(e.target.value) || 0)} className="h-7 text-xs font-mono" />
        </div>
        <div>
          <Label className="text-[9px] font-mono uppercase text-muted-foreground">Horizon (min)</Label>
          <Input type="number" step="5" value={horizon} onChange={e => setHorizon(parseInt(e.target.value) || 5)} className="h-7 text-xs font-mono" />
        </div>
      </div>

      <div className="flex items-center gap-2 mb-3">
        <Button onClick={handleRun} disabled={validating || blocked} size="sm" className="h-7 text-[10px] font-mono uppercase tracking-wider">
          {validating ? "Simulating…" : "Run Micro-Sim"}
          <ArrowRight className="ml-1 h-3 w-3" />
        </Button>
        {result && <Button variant="ghost" size="sm" className="h-7 text-[10px]" onClick={reset}>Reset</Button>}
        <span className="ml-auto text-[10px] font-mono text-muted-foreground">
          Regime: <span className="text-foreground">{regime?.regime || "—"}</span> · Budget left:{" "}
          <span className="text-foreground">{residualBudgetPct.toFixed(2)}%</span>
        </span>
      </div>

      {error && (
        <div className="rounded-sm border border-loss/40 bg-loss/5 px-2 py-1.5 text-[10px] font-mono text-loss mb-2">{error}</div>
      )}

      {validating && (
        <div className="space-y-2">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-32 w-full" />
        </div>
      )}

      {result && verdictMeta && (
        <div className="space-y-2">
          <div className={`rounded-sm border px-3 py-2 flex items-center justify-between ${verdictMeta.color}`}>
            <div className="flex items-center gap-2">
              {verdictMeta.icon}
              <span className="text-[14px] font-mono font-bold tracking-widest">{result.verdict}</span>
              <span className="text-[10px] font-mono opacity-80">Edge {result.edgeScore.toFixed(0)}/100</span>
            </div>
            <div className="text-[10px] font-mono">
              Size <span className="font-bold">{(result.sizePct * 100).toFixed(2)}%</span> · ≈ {result.capitalAtRisk.toFixed(0)} at risk
            </div>
          </div>
          <p className="text-[10px] font-mono text-muted-foreground italic px-1">{result.reasoning}</p>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            <Stat label="P(hit target)" value={`${(result.pHitTarget * 100).toFixed(1)}%`} />
            <Stat label="E[return]" value={`${result.expectedReturnPct >= 0 ? "+" : ""}${result.expectedReturnPct.toFixed(2)}%`} accent={result.expectedReturnPct >= 0 ? "gain" : "loss"} />
            <Stat label="E[hold]" value={`${result.expectedHoldMin.toFixed(0)}m`} />
            <Stat label="CVaR 5%" value={`${result.cvar5Pct.toFixed(2)}%`} accent="loss" />
          </div>

          <div className="rounded-sm border border-border/60 bg-surface-1 p-2">
            <div className="text-[9px] font-mono uppercase text-muted-foreground mb-1">Path Distribution (10/50/90 percentile)</div>
            <div className="h-32">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={result.paths} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="band" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0.05} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="tMin" tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} />
                  <YAxis tick={{ fontSize: 9, fill: "hsl(var(--muted-foreground))" }} />
                  <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", fontSize: 10 }} />
                  <Area type="monotone" dataKey="p90" stroke="hsl(var(--primary))" fill="url(#band)" strokeWidth={1} />
                  <Area type="monotone" dataKey="p10" stroke="hsl(var(--primary))" fill="hsl(var(--background))" strokeWidth={1} />
                  <Line type="monotone" dataKey="p50" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {result.verdict !== "SKIP" && onAccept && (
            <Button
              onClick={() => {
                const shares = Math.max(1, Math.floor(result.capitalAtRisk / Math.max(1, result.expectedReturnPct === 0 ? 100 : 100)));
                onAccept(result, shares);
              }}
              size="sm"
              className="h-7 text-[10px] font-mono uppercase tracking-wider w-full"
            >
              Open Lodge ({result.verdict})
            </Button>
          )}
        </div>
      )}
    </div>
  );
};

const Stat = ({ label, value, accent }: { label: string; value: string; accent?: "gain" | "loss" }) => (
  <div className="rounded-sm border border-border/60 bg-surface-1 px-2 py-1.5">
    <div className="text-[9px] font-mono uppercase text-muted-foreground">{label}</div>
    <div className={`text-[12px] font-mono font-bold ${accent === "gain" ? "text-gain" : accent === "loss" ? "text-loss" : "text-foreground"}`}>{value}</div>
  </div>
);

export default PreTradeValidator;