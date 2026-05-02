import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, Twitter, MessageCircle, Download, Copy, Loader2, TrendingUp, Sparkles } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import { exportNodeToPng } from "@/lib/exportImage";
import type { PortfolioStock } from "@/components/PortfolioPanel";

interface Props {
  open: boolean;
  onClose: () => void;
  stock: PortfolioStock;
}

const SHARE_URL = "https://entropylite.in";

/**
 * Map an analysis suggestion + verdict into a short, share-worthy
 * "what EntropyLite called" line. Always confident, never marketing-y.
 */
function deriveSignalLine(stock: PortfolioStock): string {
  const a = stock.analysis;
  if (!a) return "EntropyLite flagged the setup before the move.";
  const sug = (a.suggestion || "").toUpperCase();
  const conf = Math.round(a.confidence || 0);
  const risk = (a.riskLevel || "").toUpperCase();

  if (sug === "ADD" || sug === "BUY") {
    return `Signal: ADD · ${conf}% conviction · ${risk || "MEDIUM"} risk regime`;
  }
  if (sug === "EXIT" || sug === "SELL") {
    return `Signal: REDUCE · ${conf}% conviction · saved downside`;
  }
  return `Signal: OBSERVE → confirmed · ${conf}% conviction held`;
}

function deriveDaysHeld(stock: PortfolioStock): number | null {
  if (!stock.createdAt) return null;
  const start = new Date(stock.createdAt).getTime();
  if (!start || isNaN(start)) return null;
  const days = Math.max(1, Math.round((Date.now() - start) / (1000 * 60 * 60 * 24)));
  return days;
}

export default function ProofCard({ open, onClose, stock }: Props) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState(false);
  const [displayName, setDisplayName] = useState<string>("");

  useEffect(() => {
    if (!open) return;
    supabase.auth.getUser().then(({ data }) => {
      const u = data.user;
      if (!u) return;
      const meta = (u.user_metadata || {}) as Record<string, any>;
      const name =
        meta.full_name ||
        meta.name ||
        meta.preferred_username ||
        (u.email ? u.email.split("@")[0] : "");
      setDisplayName(typeof name === "string" ? name : "");
    });
  }, [open]);

  if (!open) return null;

  const cur = stock.analysis?.currentPrice ?? stock.buyPrice;
  const pnlPct = ((cur - stock.buyPrice) / stock.buyPrice) * 100;
  const days = deriveDaysHeld(stock);
  const signalLine = deriveSignalLine(stock);
  const isWin = pnlPct >= 0;

  const exportPng = async (): Promise<string | null> => {
    if (!cardRef.current) return null;
    setExporting(true);
    try {
      return await exportNodeToPng(cardRef.current, { backgroundColor: "#0a0a0a", pixelRatio: 2 });
    } catch (e: any) {
      toast({ title: "Export failed", description: e?.message || "Try again", variant: "destructive" });
      return null;
    } finally {
      setExporting(false);
    }
  };

  const downloadPng = async () => {
    const url = await exportPng();
    if (!url) return;
    const a = document.createElement("a");
    a.href = url;
    a.download = `entropy-proof-${stock.ticker}-${new Date().toISOString().slice(0, 10)}.png`;
    a.click();
    toast({ title: "Proof downloaded", description: "Ready to share anywhere." });
  };

  const buildShareText = () => {
    const sign = pnlPct >= 0 ? "+" : "";
    const window = days ? ` in ${days} day${days === 1 ? "" : "s"}` : "";
    return `EntropyLite signaled ${stock.ticker} ${stock.analysis?.suggestion?.toLowerCase() || "setup"}. I acted. ${sign}${pnlPct.toFixed(1)}%${window}.\n\n${SHARE_URL}`;
  };

  const shareTwitter = () => {
    window.open(
      `https://twitter.com/intent/tweet?text=${encodeURIComponent(buildShareText())}`,
      "_blank",
      "noopener,noreferrer",
    );
  };

  const shareWhatsApp = () => {
    window.open(
      `https://wa.me/?text=${encodeURIComponent(buildShareText())}`,
      "_blank",
      "noopener,noreferrer",
    );
  };

  const copyText = async () => {
    try {
      await navigator.clipboard.writeText(buildShareText());
      toast({ title: "Copied", description: "Proof text in your clipboard." });
    } catch {
      toast({ title: "Copy failed", variant: "destructive" });
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-3 sm:p-6 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-[520px] max-h-[92vh] overflow-y-auto bg-background border border-border rounded-lg shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border sticky top-0 bg-background/95 backdrop-blur-md z-10">
          <div className="flex items-center gap-2">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            <span className="font-mono text-[11px] uppercase tracking-widest text-foreground">
              Proof of Signal
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Card preview (this is what gets exported) */}
        <div className="p-3 sm:p-5 bg-muted/30">
          <div
            ref={cardRef}
            className="relative w-full aspect-[4/5] rounded-md overflow-hidden text-white"
            style={{
              background: isWin
                ? "radial-gradient(ellipse at top right, #052e1a 0%, #0a0a0a 55%, #000 100%)"
                : "radial-gradient(ellipse at top right, #2e0505 0%, #0a0a0a 55%, #000 100%)",
              fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
            }}
          >
            {/* Subtle grid */}
            <div
              className="absolute inset-0 opacity-[0.05]"
              style={{
                backgroundImage:
                  "linear-gradient(white 1px, transparent 1px), linear-gradient(90deg, white 1px, transparent 1px)",
                backgroundSize: "44px 44px",
              }}
            />

            {/* Glow accent */}
            <div
              className="absolute -top-20 -right-20 w-72 h-72 rounded-full blur-3xl opacity-30"
              style={{ background: isWin ? "#10b981" : "#ef4444" }}
            />

            <div className="relative h-full flex flex-col p-6 sm:p-8">
              {/* Top bar */}
              <div className="flex items-center justify-between text-[10px] sm:text-[11px] font-mono tracking-[0.2em] uppercase text-white/45">
                <span>Entropy Lite · Proof</span>
                <span>
                  {new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                </span>
              </div>

              {/* Hero line */}
              <div className="mt-6 sm:mt-8 flex-1 flex flex-col justify-center">
                <div className="font-mono text-[10px] sm:text-[11px] tracking-[0.25em] uppercase text-white/40 mb-2">
                  EntropyLite signaled
                </div>
                <div className="text-[28px] sm:text-[36px] font-bold leading-[1.05] text-white">
                  {stock.ticker}
                  <span className="text-white/40"> divergence.</span>
                </div>
                <div className="mt-2 text-[16px] sm:text-[20px] text-white/70 font-medium">
                  I acted.
                </div>

                {/* Massive PnL */}
                <div className="mt-6 sm:mt-8 flex items-baseline gap-3">
                  <TrendingUp
                    className={`h-7 w-7 sm:h-9 sm:w-9 ${isWin ? "text-emerald-400" : "text-rose-400 rotate-180"}`}
                    strokeWidth={2.5}
                  />
                  <div
                    className={`text-[56px] sm:text-[72px] font-bold leading-none tabular-nums ${
                      isWin ? "text-emerald-400" : "text-rose-400"
                    }`}
                    style={{
                      textShadow: isWin
                        ? "0 0 40px rgba(16,185,129,0.35)"
                        : "0 0 40px rgba(239,68,68,0.35)",
                    }}
                  >
                    {pnlPct >= 0 ? "+" : ""}
                    {pnlPct.toFixed(1)}%
                  </div>
                  {days && (
                    <div className="text-[13px] sm:text-[15px] text-white/55 font-medium pb-2">
                      in {days} day{days === 1 ? "" : "s"}
                    </div>
                  )}
                </div>

                {/* Signal line */}
                <div className="mt-6 pt-4 border-t border-white/10">
                  <div className="font-mono text-[9px] sm:text-[10px] tracking-[0.25em] uppercase text-white/35 mb-1.5">
                    The Call
                  </div>
                  <div className="text-[13px] sm:text-[15px] text-white/85 leading-snug font-medium">
                    {signalLine}
                  </div>
                  {stock.analysis?.verdict && (
                    <div className="mt-2 text-[11px] sm:text-[12px] text-white/50 leading-snug line-clamp-2">
                      "{stock.analysis.verdict}"
                    </div>
                  )}
                </div>
              </div>

              {/* Footer */}
              <div className="mt-5 pt-4 border-t border-white/10 flex items-end justify-between">
                <div>
                  {displayName && (
                    <div className="text-[12px] sm:text-[13px] text-white/85 font-semibold leading-tight">
                      {displayName}
                    </div>
                  )}
                  <div className="font-mono text-[9px] sm:text-[10px] tracking-[0.3em] uppercase text-white/35 mt-0.5">
                    Entropy Lite
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[10px] sm:text-[11px] text-white/45">
                    The Operating System of Finance
                  </div>
                  <div className="font-mono text-[9px] sm:text-[10px] tracking-widest text-white/35 mt-0.5">
                    entropylite.in
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Actions */}
        <div className="px-4 pb-4 pt-1 space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={shareTwitter}
              className="flex items-center justify-center gap-1.5 h-10 rounded-md bg-foreground text-background hover:opacity-90 transition-opacity text-xs font-medium"
            >
              <Twitter className="h-3.5 w-3.5" />
              Share to X
            </button>
            <button
              onClick={shareWhatsApp}
              className="flex items-center justify-center gap-1.5 h-10 rounded-md bg-emerald-600 text-white hover:bg-emerald-700 transition-colors text-xs font-medium"
            >
              <MessageCircle className="h-3.5 w-3.5" />
              WhatsApp
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={downloadPng}
              disabled={exporting}
              className="flex items-center justify-center gap-1.5 h-9 rounded-md border border-border bg-surface-1 text-foreground hover:bg-muted transition-colors text-[11px] font-medium disabled:opacity-40"
            >
              {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
              Download PNG
            </button>
            <button
              onClick={copyText}
              className="flex items-center justify-center gap-1.5 h-9 rounded-md border border-border bg-surface-1 text-foreground hover:bg-muted transition-colors text-[11px] font-medium"
            >
              <Copy className="h-3.5 w-3.5" />
              Copy text
            </button>
          </div>
          <p className="text-center text-[10px] text-muted-foreground/70 font-mono tracking-wider pt-1">
            Real position · Real signal · Your name on it
          </p>
        </div>
      </div>
    </div>,
    document.body,
  );
}
