/**
 * Evidence spotlight — when Foresight highlights an interface region, a
 * hairline focus frame draws around the target with an optional caption.
 * Restrained by design: one frame at a time, auto-dismissing, no dimming
 * theatrics — attention direction, not decoration.
 */

import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { springGentle } from "@/lib/motion";
import { onUIEvent, resolveTargetElement } from "../uiBus";

interface ActiveHighlight {
  key: number;
  rect: { top: number; left: number; width: number; height: number };
  note?: string;
}

export default function Spotlight() {
  const [active, setActive] = useState<ActiveHighlight | null>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const off = onUIEvent("highlight", ({ targetId, note, durationMs }) => {
      const el = resolveTargetElement(targetId);
      if (!el) return;
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      // Let the scroll settle before measuring.
      setTimeout(() => {
        const r = el.getBoundingClientRect();
        setActive({
          key: Date.now(),
          rect: { top: r.top - 4, left: r.left - 4, width: r.width + 8, height: r.height + 8 },
          note,
        });
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => setActive(null), durationMs ?? 3800);
      }, 350);
    });
    return () => {
      off();
      if (timer) clearTimeout(timer);
    };
  }, []);

  return (
    <AnimatePresence>
      {active && (
        <motion.div
          key={active.key}
          initial={{ opacity: 0, scale: 1.015 }}
          animate={{ opacity: 1, scale: 1 }}
          exit={{ opacity: 0 }}
          transition={springGentle}
          className="pointer-events-none fixed z-[90] rounded-md border border-info/80 shadow-[0_0_0_1px_hsl(var(--info)/0.25),0_0_24px_hsl(var(--info)/0.12)]"
          style={{
            top: active.rect.top,
            left: active.rect.left,
            width: active.rect.width,
            height: active.rect.height,
          }}
        >
          {active.note && (
            <div className="absolute -top-6 left-0 whitespace-nowrap rounded border border-border bg-background px-2 py-0.5 text-[9.5px] font-medium tracking-tight text-foreground shadow-sm">
              {active.note}
            </div>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
