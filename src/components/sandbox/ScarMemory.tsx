import { useState } from "react";
import { Skull, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useLocalStorage } from "@/hooks/useLocalStorage";

interface Scar {
  id: string;
  date: string;
  ticker: string;
  lesson: string;
  lossAmount: string;
  category: "timing" | "sizing" | "conviction" | "risk" | "other";
}

const categories = [
  { id: "timing", label: "Timing", color: "bg-loss/15 text-loss" },
  { id: "sizing", label: "Position Sizing", color: "bg-warning/15 text-warning" },
  { id: "conviction", label: "Conviction Error", color: "bg-info/15 text-info" },
  { id: "risk", label: "Risk Ignored", color: "bg-loss/15 text-loss" },
  { id: "other", label: "Other", color: "bg-surface-3 text-muted-foreground" },
] as const;

const ScarMemory = () => {
  const [scars, setScars] = useLocalStorage<Scar[]>("entropy-scars", []);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ ticker: "", lesson: "", lossAmount: "", category: "timing" as Scar["category"] });

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

  return (
    <div className="space-y-5">
      <div className="rounded-xl border border-border bg-card p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Skull className="h-5 w-5 text-foreground" />
            <h3 className="text-sm font-bold text-foreground uppercase tracking-wider">Scar Memory Graph</h3>
            <span className="rounded bg-surface-3 px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
              {scars.length} lessons
            </span>
          </div>
          <Button size="sm" variant="outline" onClick={() => setShowForm(!showForm)} className="h-7 gap-1 text-xs">
            <Plus className="h-3 w-3" /> Log Mistake
          </Button>
        </div>

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

        {/* Scars List */}
        {scars.length === 0 ? (
          <div className="py-12 text-center">
            <Skull className="h-8 w-8 mx-auto text-muted-foreground/20 mb-2" />
            <p className="text-sm text-muted-foreground">No scars recorded yet.</p>
            <p className="text-[11px] text-muted-foreground/60 mt-1">Log your mistakes — Entropy never forgets, so you never repeat.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {scars.map(scar => {
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
