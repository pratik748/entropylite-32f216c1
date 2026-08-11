import { useEffect, useState } from "react";
import { useDemo } from "@/demo/DemoProvider";

/** Quiet chrome marker for the read-only demo workspace, with time remaining. */
export default function DemoIndicator() {
  const { isDemo, expiresAt, exit } = useDemo();
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    if (!isDemo) return;
    const iv = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(iv);
  }, [isDemo]);

  if (!isDemo) return null;

  const minutes = expiresAt ? Math.max(0, Math.round((expiresAt - now) / 60_000)) : null;

  return (
    <div
      className="flex items-center gap-2 rounded-lg border border-border/70 bg-surface-2/60 px-2.5 h-8"
      title="Read-only demo workspace"
    >
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-info shadow-[0_0_6px_hsl(var(--info))]" />
      <span className="text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">Demo</span>
      {minutes !== null && (
        <span className="hidden md:inline text-[10.5px] font-semibold tabular-nums text-muted-foreground/60">
          {minutes}m
        </span>
      )}
      <button
        onClick={exit}
        className="pressable ml-0.5 text-[10.5px] font-semibold tracking-tight text-muted-foreground/70 hover:text-foreground transition-colors"
      >
        Exit
      </button>
    </div>
  );
}