import { Info } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

interface Method {
  label: string;
  formula?: string;
  source: string;
  lookback?: string;
  notes?: string;
}

interface Props {
  title?: string;
  methods: Method[];
  align?: "start" | "center" | "end";
}

/**
 * Institutional methodology disclosure.
 * Hover/tap any metric → see exact formula, data source, lookback, sample size.
 */
export const MethodologyTooltip = ({ title = "Methodology", methods, align = "end" }: Props) => (
  <Popover>
    <PopoverTrigger asChild>
      <button
        type="button"
        className="inline-flex items-center justify-center rounded-md p-1 text-muted-foreground hover:text-foreground transition-colors"
        aria-label="Methodology"
      >
        <Info className="h-3.5 w-3.5" />
      </button>
    </PopoverTrigger>
    <PopoverContent align={align} className="w-[320px] p-0 border-border bg-card">
      <div className="border-b border-border px-3 py-2">
        <p className="text-[10px] font-bold uppercase tracking-wider text-foreground">{title}</p>
      </div>
      <div className="max-h-[360px] overflow-y-auto">
        {methods.map((m, i) => (
          <div key={i} className="border-b border-border/40 px-3 py-2 last:border-b-0">
            <p className="text-[11px] font-semibold text-foreground">{m.label}</p>
            {m.formula && (
              <p className="mt-1 font-mono text-[10px] text-primary leading-relaxed">{m.formula}</p>
            )}
            <div className="mt-1 grid grid-cols-2 gap-1">
              <div>
                <p className="text-[8px] uppercase text-muted-foreground tracking-wider">Source</p>
                <p className="text-[10px] text-secondary-foreground">{m.source}</p>
              </div>
              {m.lookback && (
                <div>
                  <p className="text-[8px] uppercase text-muted-foreground tracking-wider">Lookback</p>
                  <p className="text-[10px] text-secondary-foreground">{m.lookback}</p>
                </div>
              )}
            </div>
            {m.notes && <p className="mt-1 text-[10px] text-muted-foreground italic leading-relaxed">{m.notes}</p>}
          </div>
        ))}
      </div>
    </PopoverContent>
  </Popover>
);
