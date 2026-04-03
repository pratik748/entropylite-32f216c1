import { useState, useEffect, useMemo } from "react";
import { Skull, Plus, Trash2, ShieldAlert, TrendingDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLocalStorage } from "@/hooks/useLocalStorage";
import { type PortfolioStock } from "@/components/PortfolioPanel";

interface Scar {
  id: string;
  date: string;
  ticker: string;
  lesson: string;
  lossAmount: string;
  category: "timing" | "sizing" | "conviction" | "risk" | "other";
  auto?: boolean;
  sector?: string;
  lossPct?: number;
}

export interface ScarBias {
  ticker: string;
  sector: string;
  penalty: number; // 0-1, soft penalty weight
  reason: string;
}

const SEVERE_LOSS_THRESHOLD = -15; // % loss triggers auto-scar
const MAX_PENALTY = 0.35; // cap so we never fully block

const categories = [
  { id: "timing", label: "Timing", color: "bg-loss/15 text-loss" },
  { id: "sizing", label: "Position Sizing", color: "bg-warning/15 text-warning" },
  { id: "conviction", label: "Conviction Error", color: "bg-info/15 text-info" },
  { id: "risk", label: "Risk Ignored", color: "bg-loss/15 text-loss" },
  { id: "other", label: "Other", color: "bg-surface-3 text-muted-foreground" },
] as const;

interface Props {
  stocks?: PortfolioStock[];
}

/** Compute soft bias penalties from scar history */
export function computeScarBiases(scars: Scar[]): ScarBias[] {
  const tickerScars: Record<string, Scar[]> = {};
  scars.forEach(s => {
    const key = s.ticker.toUpperCase();
    if (!tickerScars[key]) tickerScars[key] = [];
    tickerScars[key].push(s);
  });

  const biases: ScarBias[] = [];
  for (const [ticker, entries] of Object.entries(tickerScars)) {
    const count = entries.length;
    const avgLoss = entries.reduce((s, e) => s + (e.lossPct || 0), 0) / count;
    // Soft penalty: scales with frequency and severity, capped at MAX_PENALTY
    const rawPenalty = Math.min(MAX_PENALTY, (count * 0.08) + (Math.abs(avgLoss) / 200));
    const sector = entries[0]?.sector || "Unknown";
    biases.push({
      ticker,
      sector,
      penalty: Math.round(rawPenalty * 100) / 100,
      reason: `${count} scar${count > 1 ? "s" : ""}, avg loss ${avgLoss.toFixed(1)}%`,
    });
  }

  // Sector-level soft bias (lighter — half the worst ticker penalty in that sector)
  const sectorPenalties: Record<string, number> = {};
  biases.forEach(b => {
    if (!sectorPenalties[b.sector]) sectorPenalties[b.sector] = 0;
    sectorPenalties[b.sector] = Math.max(sectorPenalties[b.sector], b.penalty);
  });

  return biases;
}

const ScarMemory = ({ stocks = [] }: Props) => {
  const [scars, setScars] = useLocalStorage<Scar[]>("entropy-scars", []);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ ticker: "", lesson: "", lossAmount: "", category: "timing" as Scar["category"] });

  // ─── Auto-detect severe losses from portfolio ───
  useEffect(() => {
    if (stocks.length === 0) return;

    const analyzed = stocks.filter(s => s.analysis && s.analysis.currentPrice > 0);
    const existing = new Set(scars.filter(s => s.auto).map(s => s.ticker.toUpperCase()));

    const newScars: Scar[] = [];
    for (const st of analyzed) {
      const ticker = st.ticker.toUpperCase();
      const pnlPct = ((st.analysis.currentPrice - st.buyPrice) / st.buyPrice) * 100;

      if (pnlPct <= SEVERE_LOSS_THRESHOLD && !existing.has(ticker)) {
        const lossAmt = Math.abs((st.analysis.currentPrice - st.buyPrice) * st.quantity);
        newScars.push({
          id: crypto.randomUUID(),
          date: new Date().toISOString().split("T")[0],
          ticker: st.ticker,
          lesson: `Auto-detected: ${pnlPct.toFixed(1)}% drawdown. Position entered at ${st.buyPrice}, now at ${st.analysis.currentPrice}. ${
            st.analysis.riskScore > 60 ? "High risk score confirmed the weakness." : "Risk metrics didn't flag this early enough."
          }`,
          lossAmount: lossAmt.toFixed(0),
          category: st.analysis.riskScore > 60 ? "risk" : "timing",
          auto: true,
          sector: st.analysis.sector || "Unknown",
          lossPct: pnlPct,
        });
      }
    }

    if (newScars.length > 0) {
      setScars(prev => [...newScars, ...prev]);
    }
  }, [stocks.map(s => `${s.ticker}-${s.analysis?.currentPrice}`).join(",")]);

  // ─── Compute biases ───
  const biases = useMemo(() => computeScarBiases(scars), [scars]);

  const addScar = () => {
    if (!form.ticker || !form.lesson) return;
    setScars(prev => [{
      id: crypto.randomUUID(),
      date: new Date().toISOString().split("T")[0],
      ...form,
    }, ...prev]);
    setForm({ ticker: "", lesson: "", lossAmount: "", category: "timing" });
    setShowForm(false);
  };

  const removeScar = (id: string) => setScars(prev => prev.filter(s => s.id !== id));

  // Aggregate patterns
  const categoryCount: Record<string, number> = {};
  scars.forEach(s => { categoryCount[s.category] = (categoryCount[s.category] || 0) + 1; });
  const topCategory = Object.entries(categoryCount).sort((a, b) => b[1] - a[1])[0];

  const autoScars = scars.filter(s => s.auto);
  const manualScars = scars.filter(s => !s.auto);

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Skull className="h-5 w-5 text-foreground" />
            <h3 className="text-sm font-bold text-foreground uppercase tracking-wider">Scar Memory</h3>
            <span className="rounded bg-surface-3 px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
              {scars.length} lessons
            </span>
            {autoScars.length > 0 && (
              <span className="rounded bg-loss/10 px-2 py-0.5 font-mono text-[10px] text-loss">
                {autoScars.length} auto
              </span>
            )}
          </div>
          <Button size="sm" variant="outline" onClick={() => setShowForm(!showForm)} className="h-7 gap-1 text-xs">
            <Plus className="h-3 w-3" /> Log Mistake
          </Button>
        </div>

        {/* Active Biases */}
        {biases.length > 0 && (
          <div className="rounded-lg border border-warning/20 bg-warning/5 p-3 mb-4">
            <div className="flex items-center gap-2 mb-2">
              <ShieldAlert className="h-4 w-4 text-warning" />
              <p className="text-[10px] uppercase tracking-wider text-warning font-bold">Active Reverse Biases</p>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {biases.map(b => (
                <div key={b.ticker} className="rounded bg-surface-2 px-2.5 py-1.5">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs font-bold text-foreground">{b.ticker}</span>
                    <span className="font-mono text-[10px] text-loss">-{(b.penalty * 100).toFixed(0)}%</span>
                  </div>
                  <p className="text-[9px] text-muted-foreground mt-0.5">{b.reason}</p>
                </div>
              ))}
            </div>
            <p className="text-[9px] text-muted-foreground/60 mt-2 italic">
              Soft penalties reduce confidence in similar bets — they never fully block opportunities.
            </p>
          </div>
        )}

        {/* Pattern Detection */}
        {scars.length > 0 && (
          <div className="rounded-lg bg-surface-2 p-3 mb-4">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Pattern Detected</p>
            <p className="text-sm text-foreground">
              {topCategory ? (
                <>Your most common mistake: <span className="font-bold text-loss">{topCategory[0]}</span> ({topCategory[1]} occurrences).
                  {topCategory[0] === "timing" && " Consider using VWAP execution and patience rules."}
                  {topCategory[0] === "sizing" && " Implement Kelly criterion or 2% risk rule."}
                  {topCategory[0] === "conviction" && " Wait for confirmation signals before entry."}
                  {topCategory[0] === "risk" && " Never trade without a stop-loss."}
                </>
              ) : "Not enough data to detect patterns."}
            </p>
          </div>
        )}

        {/* Add Form */}
        {showForm && (
          <div className="rounded-lg border border-border bg-surface-2 p-4 mb-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Input placeholder="Ticker" value={form.ticker} onChange={e => setForm(p => ({ ...p, ticker: e.target.value }))} className="bg-surface-3 border-border font-mono text-sm" />
              <Input placeholder="Loss amount (optional)" value={form.lossAmount} onChange={e => setForm(p => ({ ...p, lossAmount: e.target.value }))} className="bg-surface-3 border-border font-mono text-sm" />
            </div>
            <Input placeholder="What went wrong? What's the lesson?" value={form.lesson} onChange={e => setForm(p => ({ ...p, lesson: e.target.value }))} className="bg-surface-3 border-border text-sm" />
            <div className="flex gap-1.5">
              {categories.map(c => (
                <button key={c.id} onClick={() => setForm(p => ({ ...p, category: c.id as Scar["category"] }))}
                  className={`rounded px-2 py-1 text-[10px] font-medium transition-colors ${
                    form.category === c.id ? "bg-foreground text-background" : c.color
                  }`}>{c.label}</button>
              ))}
            </div>
            <Button size="sm" onClick={addScar} className="h-7 text-xs">Save Lesson</Button>
          </div>
        )}

        {/* Auto-detected Scars */}
        {autoScars.length > 0 && (
          <div className="mb-3">
            <p className="text-[10px] uppercase tracking-wider text-loss/70 mb-2 flex items-center gap-1">
              <TrendingDown className="h-3 w-3" /> Auto-Detected Losses
            </p>
            <div className="space-y-2">
              {autoScars.map(scar => {
                const cat = categories.find(c => c.id === scar.category);
                return (
                  <div key={scar.id} className="group flex items-start justify-between rounded-lg border border-loss/10 bg-loss/5 p-3 hover:bg-loss/10 transition-colors">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="font-mono text-xs font-semibold text-foreground">{scar.ticker}</span>
                        <span className={`rounded px-1.5 py-0.5 text-[9px] font-medium ${cat?.color}`}>{cat?.label}</span>
                        <span className="text-[10px] text-muted-foreground font-mono">{scar.date}</span>
                        {scar.lossPct && <span className="text-[10px] font-mono text-loss font-bold">{scar.lossPct.toFixed(1)}%</span>}
                        {scar.lossAmount && <span className="text-[10px] font-mono text-loss/70">-{scar.lossAmount}</span>}
                      </div>
                      <p className="text-xs text-muted-foreground">{scar.lesson}</p>
                    </div>
                    <button onClick={() => removeScar(scar.id)} className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:text-loss">
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Manual Scars List */}
        {manualScars.length === 0 && autoScars.length === 0 ? (
          <div className="py-12 text-center">
            <Skull className="h-8 w-8 mx-auto text-muted-foreground/20 mb-2" />
            <p className="text-sm text-muted-foreground">No scars recorded yet.</p>
            <p className="text-[11px] text-muted-foreground/60 mt-1">Severe losses ({SEVERE_LOSS_THRESHOLD}%+) are logged automatically. Manual entries welcome.</p>
          </div>
        ) : manualScars.length > 0 && (
          <div className="space-y-2">
            {manualScars.length > 0 && autoScars.length > 0 && (
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground/70 mb-1">Manual Entries</p>
            )}
            {manualScars.map(scar => {
              const cat = categories.find(c => c.id === scar.category);
              return (
                <div key={scar.id} className="group flex items-start justify-between rounded-lg bg-surface-2 p-3 hover:bg-surface-3 transition-colors">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-mono text-xs font-semibold text-foreground">{scar.ticker}</span>
                      <span className={`rounded px-1.5 py-0.5 text-[9px] font-medium ${cat?.color}`}>{cat?.label}</span>
                      <span className="text-[10px] text-muted-foreground font-mono">{scar.date}</span>
                      {scar.lossAmount && <span className="text-[10px] font-mono text-loss">-{scar.lossAmount}</span>}
                    </div>
                    <p className="text-xs text-muted-foreground">{scar.lesson}</p>
                  </div>
                  <button onClick={() => removeScar(scar.id)} className="opacity-0 group-hover:opacity-100 transition-opacity p-1 hover:text-loss">
                    <Trash2 className="h-3 w-3" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default ScarMemory;
