import { useState, useEffect } from "react";
import { governedInvoke } from "@/lib/apiGovernor";

interface MacroIndicator {
  id: string;
  name: string;
  category: string;
  value: number | string;
  previousValue?: number | string;
  trend: "rising" | "falling" | "stable";
  impact: "high" | "medium" | "low";
  source: string;
  lastUpdated: string;
}

interface MacroRegime {
  regime: "expansion" | "slowdown" | "contraction" | "recovery";
  confidence: number;
  signals: string[];
}

interface MacroData {
  indicators: MacroIndicator[];
  regime: MacroRegime;
  sources: { fred: number; worldBank: number };
  timestamp: number;
}

export function useMacroIntelligence() {
  const [data, setData] = useState<MacroData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    governedInvoke<MacroData>("macro-intelligence")
      .then(({ data: result, error: err }) => {
        if (cancelled) return;
        if (err) { setError(err.message || "Macro fetch failed"); }
        else if (result) { setData(result); }
      })
      .catch(e => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);

  return { data, loading, error };
}
