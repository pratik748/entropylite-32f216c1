/**
 * Regime-state ribbon over the recent N bars + stability sparkline.
 * Colours come from semantic tokens only.
 */
import { useMemo } from "react";
import { forward, decodeRegime, REGIMES, buildObservations, type HMMModel } from "@/lib/statarb/hmm";
import type { RegimeState } from "@/lib/statarb/types";

const COLOR: Record<RegimeState, string> = {
  "mean-reverting": "hsl(var(--gain))",
  trending: "hsl(var(--primary))",
  volatile: "hsl(var(--warning))",
  broken: "hsl(var(--loss))",
};

interface Props {
  spread: number[];
  model: HMMModel;
  /** Tail size to render. */
  tail?: number;
}

export default function RegimeTimeline({ spread, model, tail = 80 }: Props) {
  const { ribbon, stability, current } = useMemo(() => {
    const obs = buildObservations(spread);
    if (obs.length === 0) return { ribbon: [] as { state: RegimeState; w: number }[], stability: 0, current: "mean-reverting" as RegimeState };
    const alpha = forward(model, obs);
    const slice = alpha.slice(-tail);
    const ribbon = slice.map((p) => {
      let bestK = 0;
      for (let k = 1; k < REGIMES.length; k++) if (p[k] > p[bestK]) bestK = k;
      return { state: REGIMES[bestK], w: p[bestK] };
    });
    const post = decodeRegime(model, spread);
    return { ribbon, stability: post.stability, current: post.state };
  }, [spread, model, tail]);

  if (!ribbon.length) {
    return <div className="text-[10px] text-muted-foreground py-4 text-center">Regime timeline unavailable.</div>;
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-[10px] font-mono text-muted-foreground">
        <span>Regime ribbon · last {ribbon.length} bars</span>
        <span className="flex items-center gap-2">
          <span className="text-foreground/80 capitalize">{current}</span>
          <span>· stability {(stability * 100).toFixed(0)}%</span>
        </span>
      </div>
      <div className="flex h-4 w-full overflow-hidden rounded border border-border/60">
        {ribbon.map((r, i) => (
          <div
            key={i}
            className="flex-1"
            title={`${r.state} (${(r.w * 100).toFixed(0)}%)`}
            style={{ backgroundColor: COLOR[r.state], opacity: 0.45 + 0.55 * r.w }}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-2 text-[9px] font-mono">
        {(REGIMES as readonly RegimeState[]).map((s) => (
          <span key={s} className="flex items-center gap-1 text-muted-foreground">
            <span className="inline-block h-2 w-2 rounded-sm" style={{ backgroundColor: COLOR[s] }} />
            <span className="capitalize">{s}</span>
          </span>
        ))}
      </div>
    </div>
  );
}
