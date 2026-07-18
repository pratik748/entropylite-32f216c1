import { useEffect, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import { X, Twitter, MessageCircle, Download, Copy, Loader2, Sparkles, RefreshCw } from "lucide-react";
import { exportNodeToPng } from "@/lib/exportImage";
import { governedInvoke } from "@/lib/apiGovernor";
import { toast } from "@/hooks/use-toast";
import type { PortfolioStock } from "@/components/PortfolioPanel";
import { useMarketRegime } from "@/hooks/useMarketRegime";

interface Insight {
  headline: string;
  body: string;
  ticker?: string;
  metric?: string;
  tone: "bullish" | "bearish" | "neutral" | "warning";
}

interface Brief {
  generatedAt: number;
  regime: string;
  marketLine: string;
  insights: Insight[];
}

interface Props {
  open: boolean;
  onClose: () => void;
  stocks: PortfolioStock[];
}

const TONE_BAR: Record<Insight["tone"], string> = {
  bullish: "bg-gain",
  bearish: "bg-loss",
  warning: "bg-warning",
  neutral: "bg-muted-foreground",
};

const SHARE_URL = "https://entropylite.in";

export default function EntropyBrief({ open, onClose, stocks }: Props) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [brief, setBrief] = useState<Brief | null>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const regime = useMarketRegime(60000);

  const fetchBrief = useCallback(async () => {
    setLoading(true);
    try {
      const portfolio = stocks
        .filter((s) => s.analysis)
        .map((s) => {
          const a = s.analysis!;
          const cur = a.currentPrice ?? s.buyPrice;
          const pnlPct = ((cur - s.buyPrice) / s.buyPrice) * 100;
          return {
            ticker: s.ticker,
            currentPrice: cur,
            buyPrice: s.buyPrice,
            pnlPct,
            suggestion: a.suggestion,
            confidence: a.confidence,
            riskLevel: a.riskLevel,
            verdict: a.verdict,
            sector: (a as any).sector,
          };
        });

      const { data, error } = await governedInvoke<Brief>("entropy-brief", {
        body: {
          portfolio,
          regime: regime?.regime || "Neutral",
          vix: regime?.vix || 0,
        },
      });
      if (error) throw error;
      setBrief(data);
    } catch (e: any) {
      toast({
        title: "Could not generate brief",
        description: e.message || "Try again in a moment.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }, [stocks, regime]);

  useEffect(() => {
    if (open && !brief && !loading) fetchBrief();
  }, [open, brief, loading, fetchBrief]);

  const exportPng = useCallback(async (): Promise<string | null> => {
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
  }, []);

  const downloadPng = async () => {
    const url = await exportPng();
    if (!url) return;
    const a = document.createElement("a");
    a.href = url;
    a.download = `entropy-brief-${new Date().toISOString().slice(0, 10)}.png`;
    a.click();
    toast({ title: "Brief downloaded", description: "Ready to share anywhere." });
  };

  const buildShareText = () => {
    if (!brief) return "";
    const lines = brief.insights.map((i, idx) => `${idx + 1}. ${i.headline}`).join("\n");
    return `Today's Entropy Brief\n\n${lines}\n\nGenerated from my live market session, ${SHARE_URL}`;
  };

  const shareTwitter = async () => {
    const text = buildShareText();
    const url = `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const shareWhatsApp = async () => {
    const text = buildShareText();
    const url = `https://wa.me/?text=${encodeURIComponent(text)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const copyText = async () => {
    try {
      await navigator.clipboard.writeText(buildShareText());
      toast({ title: "Copied", description: "Brief text in your clipboard." });
    } catch {
      toast({ title: "Copy failed", variant: "destructive" });
    }
  };

  if (!open) return null;

  const dateStr = new Date(brief?.generatedAt || Date.now()).toLocaleDateString("en-US", {
    weekday: "long",
    month: "short",
    day: "numeric",
  });

  return createPortal(
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 backdrop-blur-sm p-3 sm:p-6 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="relative w-full max-w-[560px] max-h-[92vh] overflow-y-auto bg-background border border-border rounded-lg shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border sticky top-0 bg-background/95 backdrop-blur-md z-10">
          <div className="flex items-center gap-2">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            <span className="font-mono text-[11px] uppercase tracking-widest text-foreground">
              Entropy Brief
            </span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => { setBrief(null); fetchBrief(); }}
              disabled={loading}
              className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
              title="Regenerate"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Card preview (this is what gets exported) */}
        <div className="p-3 sm:p-5 bg-muted/30">
          <div
            ref={cardRef}
            className="relative w-full aspect-[4/5] sm:aspect-[5/6] rounded-md overflow-hidden text-white"
            style={{
              background:
                "radial-gradient(ellipse at top left, #1a1a1a 0%, #0a0a0a 60%, #000 100%)",
              fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
            }}
          >
            {/* Subtle grid texture */}
            <div
              className="absolute inset-0 opacity-[0.05]"
              style={{
                backgroundImage:
                  "linear-gradient(white 1px, transparent 1px), linear-gradient(90deg, white 1px, transparent 1px)",
                backgroundSize: "40px 40px",
              }}
            />

            {/* Content */}
            <div className="relative h-full flex flex-col p-5 sm:p-7">
              {/* Top bar */}
              <div className="flex items-center justify-between text-[10px] sm:text-[11px] font-mono tracking-[0.2em] uppercase text-white/45">
                <span>Entropy Brief</span>
                <span>{dateStr}</span>
              </div>

              {/* Market line */}
              <div className="mt-4 sm:mt-5">
                <div className="font-mono text-[9px] sm:text-[10px] tracking-[0.25em] uppercase text-white/35 mb-1.5">
                  Market State
                </div>
                <div className="text-[13px] sm:text-[15px] text-white/85 font-medium leading-snug">
                  {brief?.marketLine || (loading ? "Composing today's read…" : ",")}
                </div>
              </div>

              {/* Divider */}
              <div className="my-4 sm:my-5 h-px bg-white/10" />

              {/* Insights */}
              <div className="flex-1 flex flex-col gap-3 sm:gap-4">
                {(brief?.insights || Array.from({ length: 3 })).slice(0, 3).map((ins: any, idx: number) => (
                  <div key={idx} className="flex gap-3">
                    {/* Numeral + tone bar */}
                    <div className="flex flex-col items-center pt-0.5 flex-shrink-0">
                      <span className="font-mono text-[10px] sm:text-[11px] text-white/30 tabular-nums">
                        0{idx + 1}
                      </span>
                      <div
                        className={`mt-1.5 w-[2px] flex-1 rounded-full ${
                          ins?.tone ? TONE_BAR[ins.tone as Insight["tone"]] : "bg-white/10"
                        }`}
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      {ins?.headline ? (
                        <>
                          <div className="text-[14px] sm:text-[17px] font-semibold leading-tight text-white">
                            {ins.headline}
                          </div>
                          <div className="mt-1.5 text-[11px] sm:text-[13px] text-white/55 leading-snug">
                            {ins.body}
                          </div>
                          {ins.ticker && (
                            <div className="mt-1.5 inline-block font-mono text-[9px] sm:text-[10px] tracking-widest uppercase text-white/40">
                              {ins.ticker}{ins.metric ? ` · ${ins.metric}` : ""}
                            </div>
                          )}
                        </>
                      ) : (
                        <>
                          <div className="h-4 sm:h-5 w-3/4 bg-white/10 rounded animate-pulse" />
                          <div className="mt-2 h-3 sm:h-3.5 w-full bg-white/5 rounded animate-pulse" />
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Footer */}
              <div className="mt-4 sm:mt-6 pt-3 border-t border-white/10 flex items-center justify-between">
                <div>
                  <div className="font-mono text-[9px] sm:text-[10px] tracking-[0.3em] uppercase text-white/35">
                    Entropy Lite
                  </div>
                  <div className="text-[10px] sm:text-[11px] text-white/45 mt-0.5">
                    The Operating System of Finance
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-mono text-[9px] sm:text-[10px] tracking-widest text-white/35">
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
              disabled={!brief || loading}
              className="flex items-center justify-center gap-1.5 h-10 rounded-md bg-foreground text-background hover:opacity-90 transition-opacity text-xs font-medium disabled:opacity-40"
            >
              <Twitter className="h-3.5 w-3.5" />
              Share to X
            </button>
            <button
              onClick={shareWhatsApp}
              disabled={!brief || loading}
              className="flex items-center justify-center gap-1.5 h-10 rounded-md bg-emerald-600 text-white hover:bg-emerald-700 transition-colors text-xs font-medium disabled:opacity-40"
            >
              <MessageCircle className="h-3.5 w-3.5" />
              WhatsApp
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={downloadPng}
              disabled={!brief || loading || exporting}
              className="flex items-center justify-center gap-1.5 h-9 rounded-md border border-border bg-surface-1 text-foreground hover:bg-muted transition-colors text-[11px] font-medium disabled:opacity-40"
            >
              {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
              Download PNG
            </button>
            <button
              onClick={copyText}
              disabled={!brief || loading}
              className="flex items-center justify-center gap-1.5 h-9 rounded-md border border-border bg-surface-1 text-foreground hover:bg-muted transition-colors text-[11px] font-medium disabled:opacity-40"
            >
              <Copy className="h-3.5 w-3.5" />
              Copy text
            </button>
          </div>
          <p className="text-center text-[10px] text-muted-foreground/70 font-mono tracking-wider pt-1">
            Generated from your live session · {stocks.filter(s => s.analysis).length} positions analyzed
          </p>
        </div>
      </div>
    </div>,
    document.body,
  );
}
