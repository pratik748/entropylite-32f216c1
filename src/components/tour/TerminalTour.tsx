import { useEffect, useRef, useState, useCallback, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import { TOUR_STEPS, TOUR_FLAG_KEY, type TourStep } from "./tourSteps";
import { useIsMobile } from "@/hooks/use-mobile";

interface Props {
  open: boolean;
  onClose: () => void;
  setActiveTab?: (t: string) => void;
}

type Rect = { top: number; left: number; width: number; height: number };

const PAD = 6;

const TerminalTour = ({ open, onClose, setActiveTab }: Props) => {
  const isMobile = useIsMobile();
  const steps: TourStep[] = TOUR_STEPS.filter((s) => (isMobile ? !!s.mobile : true));
  const [idx, setIdx] = useState(0);
  const [rect, setRect] = useState<Rect | null>(null);
  const [tick, setTick] = useState(0);
  const targetRef = useRef<HTMLElement | null>(null);

  const step = steps[idx];

  const finish = useCallback(() => {
    try { localStorage.setItem(TOUR_FLAG_KEY, "1"); } catch {}
    onClose();
  }, [onClose]);

  // Find target after possible tab switch
  useEffect(() => {
    if (!open || !step) return;
    let cancelled = false;
    if (step.requiresTab && setActiveTab) setActiveTab(step.requiresTab);
    const start = Date.now();
    const find = () => {
      if (cancelled) return;
      const el = document.querySelector(step.selector) as HTMLElement | null;
      if (el) {
        targetRef.current = el;
        try { el.scrollIntoView({ block: "center", behavior: "smooth" }); } catch {}
        setTick((t) => t + 1);
        return;
      }
      if (Date.now() - start < 1500) requestAnimationFrame(find);
      else {
        // skip silently if missing
        targetRef.current = null;
        setRect(null);
      }
    };
    requestAnimationFrame(find);
    return () => { cancelled = true; };
  }, [open, idx, step, setActiveTab]);

  // Recompute rect on tick / resize / scroll
  useLayoutEffect(() => {
    if (!open) return;
    const update = () => {
      const el = targetRef.current;
      if (!el) { setRect(null); return; }
      const r = el.getBoundingClientRect();
      setRect({ top: r.top, left: r.left, width: r.width, height: r.height });
    };
    update();
    const id = window.setInterval(update, 250);
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.clearInterval(id);
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [open, tick, idx]);

  // Keyboard
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") finish();
      else if (e.key === "ArrowRight" || e.key === "Enter") setIdx((i) => Math.min(steps.length - 1, i + 1));
      else if (e.key === "ArrowLeft") setIdx((i) => Math.max(0, i - 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, steps.length, finish]);

  if (!open || !step) return null;

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const cardW = Math.min(300, vw - 24);
  const cardH = 150;

  // Position card on side with most space
  let cardTop = 24;
  let cardLeft = 24;
  let arrowFrom = { x: 0, y: 0 };
  let arrowTo = { x: 0, y: 0 };

  if (rect) {
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const spaceBottom = vh - (rect.top + rect.height);
    const spaceTop = rect.top;
    const spaceRight = vw - (rect.left + rect.width);
    const spaceLeft = rect.left;

    let side: "top" | "bottom" | "left" | "right" = "bottom";
    if (step.side && step.side !== "auto") side = step.side;
    else {
      const m = Math.max(spaceBottom, spaceTop, spaceRight, spaceLeft);
      side = m === spaceBottom ? "bottom" : m === spaceTop ? "top" : m === spaceRight ? "right" : "left";
    }

    if (side === "bottom" && spaceBottom < cardH + 40) side = spaceTop > spaceBottom ? "top" : "bottom";
    if (side === "top" && spaceTop < cardH + 40) side = "bottom";

    if (side === "bottom") {
      cardTop = Math.min(vh - cardH - 12, rect.top + rect.height + 32);
      cardLeft = Math.max(12, Math.min(vw - cardW - 12, cx - cardW / 2));
      arrowFrom = { x: cardLeft + cardW / 2, y: cardTop };
      arrowTo = { x: cx, y: rect.top + rect.height + 4 };
    } else if (side === "top") {
      cardTop = Math.max(12, rect.top - cardH - 32);
      cardLeft = Math.max(12, Math.min(vw - cardW - 12, cx - cardW / 2));
      arrowFrom = { x: cardLeft + cardW / 2, y: cardTop + cardH };
      arrowTo = { x: cx, y: rect.top - 4 };
    } else if (side === "right") {
      cardLeft = Math.min(vw - cardW - 12, rect.left + rect.width + 32);
      cardTop = Math.max(12, Math.min(vh - cardH - 12, cy - cardH / 2));
      arrowFrom = { x: cardLeft, y: cardTop + cardH / 2 };
      arrowTo = { x: rect.left + rect.width + 4, y: cy };
    } else {
      cardLeft = Math.max(12, rect.left - cardW - 32);
      cardTop = Math.max(12, Math.min(vh - cardH - 12, cy - cardH / 2));
      arrowFrom = { x: cardLeft + cardW, y: cardTop + cardH / 2 };
      arrowTo = { x: rect.left - 4, y: cy };
    }
  } else {
    // Center the card if no target
    cardTop = vh / 2 - cardH / 2;
    cardLeft = vw / 2 - cardW / 2;
  }

  const isLast = idx === steps.length - 1;

  // SVG path: cubic curve
  const midX = (arrowFrom.x + arrowTo.x) / 2;
  const midY = (arrowFrom.y + arrowTo.y) / 2;
  const dx = arrowTo.x - arrowFrom.x;
  const dy = arrowTo.y - arrowFrom.y;
  const ctrl1 = { x: arrowFrom.x + dx * 0.1, y: arrowFrom.y + dy * 0.5 };
  const ctrl2 = { x: arrowFrom.x + dx * 0.9, y: arrowFrom.y + dy * 0.5 };
  const path = `M ${arrowFrom.x} ${arrowFrom.y} C ${ctrl1.x} ${ctrl1.y}, ${ctrl2.x} ${ctrl2.y}, ${arrowTo.x} ${arrowTo.y}`;

  return createPortal(
    <div className="fixed inset-0 z-[100] animate-fade-in" aria-modal>
      {/* Dim overlay with spotlight cutout via SVG mask */}
      <svg className="absolute inset-0 w-full h-full pointer-events-auto" onClick={finish}>
        <defs>
          <mask id="tour-mask">
            <rect width="100%" height="100%" fill="white" />
            {rect && (
              <rect
                x={rect.left - PAD}
                y={rect.top - PAD}
                width={rect.width + PAD * 2}
                height={rect.height + PAD * 2}
                rx="6"
                fill="black"
              />
            )}
          </mask>
        </defs>
        <rect width="100%" height="100%" fill="hsl(var(--background))" fillOpacity="0.78" mask="url(#tour-mask)" />
        {rect && (
          <rect
            x={rect.left - PAD}
            y={rect.top - PAD}
            width={rect.width + PAD * 2}
            height={rect.height + PAD * 2}
            rx="6"
            fill="none"
            stroke="hsl(var(--primary))"
            strokeWidth="1.25"
            style={{ filter: "drop-shadow(0 0 8px hsl(var(--primary) / 0.5))" }}
          />
        )}
        {rect && (
          <g style={{ pointerEvents: "none" }}>
            <path
              d={path}
              fill="none"
              stroke="hsl(var(--primary))"
              strokeWidth="1.5"
              strokeDasharray="4 4"
              opacity="0.9"
            />
            {/* arrowhead */}
            <circle cx={arrowTo.x} cy={arrowTo.y} r="3" fill="hsl(var(--primary))" />
          </g>
        )}
      </svg>

      {/* Card */}
      <div
        className="absolute glass-panel rounded-lg border border-border/80 shadow-2xl p-4 pointer-events-auto animate-scale-in"
        style={{ top: cardTop, left: cardLeft, width: cardW }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-2">
          <span className="font-mono text-[9px] uppercase tracking-[0.2em] text-muted-foreground">
            {String(idx + 1).padStart(2, "0")} / {String(steps.length).padStart(2, "0")}
          </span>
          <button
            onClick={finish}
            className="font-mono text-[9px] uppercase tracking-[0.15em] text-muted-foreground hover:text-foreground"
          >
            Skip
          </button>
        </div>
        <h3 className="text-sm font-semibold text-foreground mb-1">{step.title}</h3>
        <p className="text-xs text-muted-foreground leading-relaxed mb-3">{step.body}</p>
        <div className="flex items-center justify-between gap-2">
          <button
            onClick={() => setIdx((i) => Math.max(0, i - 1))}
            disabled={idx === 0}
            className="font-mono text-[10px] uppercase tracking-wider px-2 py-1 rounded border border-border/70 text-muted-foreground hover:text-foreground hover:border-foreground/40 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            Back
          </button>
          <button
            onClick={() => (isLast ? finish() : setIdx((i) => i + 1))}
            className="font-mono text-[10px] uppercase tracking-wider px-3 py-1 rounded bg-foreground text-background hover:opacity-90"
          >
            {isLast ? "Enter" : "Next →"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

export default TerminalTour;