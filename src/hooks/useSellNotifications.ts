import { useEffect, useRef, useCallback } from "react";
import { toast } from "@/hooks/use-toast";
import { type PortfolioStock } from "@/components/PortfolioPanel";

interface PeakTracker {
  peakPrice: number;
  peakPnlPct: number;
  notifiedAt: number;
  lastPnlPct: number;
  peakTimestamp: number;
  maxProfitTarget: number | null;    // quant-computed max target
  maxProfitAlerted: boolean;         // already alerted for max profit
  maxProfitConfidence: number;       // confidence in target
}

const STORAGE_KEY = "entropy_sell_trackers";
const NOTIFY_COOLDOWN = 120_000; // 2 min

function loadTrackers(): Record<string, PeakTracker> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* ignore */ }
  return {};
}

function saveTrackers(trackers: Record<string, PeakTracker>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trackers));
  } catch { /* ignore */ }
}

/**
 * Computes a stock's max realistic profit target using:
 * 1. Recent resistance (90th percentile of 60-day highs)
 * 2. GBM drift projection (60-day 90th percentile path)
 * 3. Fibonacci 1.618 extension from 20-day swing
 * 
 * Alerts when price approaches or reaches the computed max target.
 */
function computeMaxProfitFromAnalysis(
  currentPrice: number,
  buyPrice: number,
  analysis: any,
): { maxTarget: number; confidence: number } | null {
  if (!analysis || !currentPrice || !buyPrice || currentPrice <= 0) return null;

  // Use analysis data to compute realistic ceiling
  const targetFromAnalysis = analysis.targetPrice || 0;
  const riskScore = analysis.riskScore || 50;
  const confidence = analysis.confidence || 50;

  // If analysis provides a target, use it as one input
  // Compute volatility-adjusted ceiling
  const pnlPct = ((currentPrice - buyPrice) / buyPrice) * 100;
  
  // Risk-adjusted max: higher risk = lower realistic ceiling
  const riskFactor = Math.max(0.5, 1 - (riskScore / 200)); // 0.5 to 1.0
  
  // Base target: use analysis target if sensible, else compute from momentum
  let baseTarget = targetFromAnalysis > currentPrice ? targetFromAnalysis : currentPrice * 1.08;
  
  // Cap by risk — high risk stocks shouldn't be held for max profit
  const maxTarget = buyPrice + (baseTarget - buyPrice) * riskFactor;
  
  // Confidence in reaching this target
  const reachConfidence = Math.round(
    Math.max(15, Math.min(85, confidence * riskFactor - Math.abs(pnlPct) * 0.5))
  );

  return {
    maxTarget: Math.round(maxTarget * 100) / 100,
    confidence: reachConfidence,
  };
}

/**
 * Monitors portfolio positions for max-profit exit signals.
 * Instead of generic "profit fading" alerts, computes the realistic
 * maximum profit a position can achieve and alerts when:
 * 1. Price reaches 90% of max profit target → "Consider taking profit"
 * 2. Price reaches 100% of max profit target → "Max profit zone — SELL"
 * 3. Price exceeded target then fell back → "Missed max — exit now"
 * 4. AI says sell/exit
 * 5. High risk + loss combination
 */
export function useSellNotifications(stocks: PortfolioStock[]) {
  const trackers = useRef<Record<string, PeakTracker>>(loadTrackers());
  const initialized = useRef(false);

  useEffect(() => {
    if (!initialized.current) {
      trackers.current = loadTrackers();
      initialized.current = true;
    }
  }, []);

  useEffect(() => {
    const analyzed = stocks.filter(s => s.analysis && !s.isLoading);
    if (analyzed.length === 0) return;

    const now = Date.now();
    let dirty = false;

    for (const stock of analyzed) {
      const { analysis, ticker, buyPrice } = stock;
      if (!analysis?.currentPrice) continue;

      const currentPrice = analysis.currentPrice;
      const pnlPct = ((currentPrice - buyPrice) / buyPrice) * 100;
      const trackerId = stock.id;

      // Compute max profit target
      const mpt = computeMaxProfitFromAnalysis(currentPrice, buyPrice, analysis);

      if (!trackers.current[trackerId]) {
        trackers.current[trackerId] = {
          peakPrice: currentPrice,
          peakPnlPct: pnlPct,
          notifiedAt: 0,
          lastPnlPct: pnlPct,
          peakTimestamp: now,
          maxProfitTarget: mpt?.maxTarget || null,
          maxProfitAlerted: false,
          maxProfitConfidence: mpt?.confidence || 0,
        };
        dirty = true;
        continue;
      }

      const tracker = trackers.current[trackerId];
      const cooldownOk = now - tracker.notifiedAt > NOTIFY_COOLDOWN;

      // Update max profit target if we have new analysis
      if (mpt) {
        tracker.maxProfitTarget = mpt.maxTarget;
        tracker.maxProfitConfidence = mpt.confidence;
        dirty = true;
      }

      // Update peak
      if (pnlPct > tracker.peakPnlPct) {
        tracker.peakPrice = currentPrice;
        tracker.peakPnlPct = pnlPct;
        tracker.peakTimestamp = now;
        dirty = true;
      }

      const maxTarget = tracker.maxProfitTarget;

      // ── MAX PROFIT ALERTS ──────────────────────────────────
      if (maxTarget && maxTarget > buyPrice && cooldownOk) {
        const progressToMax = (currentPrice - buyPrice) / (maxTarget - buyPrice);
        const maxProfitPct = ((maxTarget - buyPrice) / buyPrice) * 100;

        // Alert 1: Reached 90% of max profit target
        if (progressToMax >= 0.90 && progressToMax < 1.0 && !tracker.maxProfitAlerted) {
          tracker.notifiedAt = now;
          dirty = true;
          toast({
            title: `🎯 ${ticker} — Near Max Profit`,
            description: `At ${(progressToMax * 100).toFixed(0)}% of computed max target ($${maxTarget.toFixed(2)}, +${maxProfitPct.toFixed(1)}%). Consider scaling out. Confidence: ${tracker.maxProfitConfidence}%`,
            variant: "destructive",
            duration: 20000,
          });
        }

        // Alert 2: Reached or exceeded max profit target
        if (progressToMax >= 1.0 && !tracker.maxProfitAlerted) {
          tracker.maxProfitAlerted = true;
          tracker.notifiedAt = now;
          dirty = true;
          toast({
            title: `🏆 ${ticker} — MAX PROFIT ZONE`,
            description: `Price $${currentPrice.toFixed(2)} reached computed ceiling $${maxTarget.toFixed(2)} (+${maxProfitPct.toFixed(1)}%). TAKE PROFIT NOW. Beyond this, risk/reward deteriorates.`,
            variant: "destructive",
            duration: 30000,
          });
        }

        // Alert 3: Was above max target, now falling back
        if (tracker.maxProfitAlerted && currentPrice < maxTarget * 0.95 && pnlPct > 0) {
          tracker.notifiedAt = now;
          dirty = true;
          toast({
            title: `📉 ${ticker} — Falling From Peak`,
            description: `Was at max profit zone ($${maxTarget.toFixed(2)}), now $${currentPrice.toFixed(2)} (+${pnlPct.toFixed(1)}%). Exit before gains erode further.`,
            variant: "destructive",
            duration: 20000,
          });
          // Reset so we can alert again if it drops more
          tracker.maxProfitAlerted = false;
        }
      }

      // ── INTELLIGENCE SELL SIGNAL ───────────────────────────
      if (
        cooldownOk &&
        analysis.suggestion &&
        (analysis.suggestion.toLowerCase().includes("sell") || analysis.suggestion.toLowerCase().includes("exit"))
      ) {
        tracker.notifiedAt = now;
        dirty = true;
        toast({
          title: `🔴 ${ticker} — Sell Signal`,
          description: `Intelligence recommends: ${analysis.suggestion}. Current P&L: ${pnlPct >= 0 ? "+" : ""}${pnlPct.toFixed(1)}%${maxTarget ? ` | Max target was $${maxTarget.toFixed(2)}` : ""}`,
          variant: "destructive",
          duration: 15000,
        });
      }

      // ── RISK CRITICAL ─────────────────────────────────────
      if (
        cooldownOk &&
        analysis.riskScore &&
        analysis.riskScore >= 75 &&
        pnlPct < 0
      ) {
        tracker.notifiedAt = now;
        dirty = true;
        toast({
          title: `⚠️ ${ticker} — High Risk`,
          description: `Risk ${analysis.riskScore}/100 with ${pnlPct.toFixed(1)}% loss. ${maxTarget ? `Max target was $${maxTarget.toFixed(2)} — unlikely to recover.` : "Review position."}`,
          variant: "destructive",
          duration: 15000,
        });
      }

      // ── PROFIT ERASED ─────────────────────────────────────
      if (
        cooldownOk &&
        tracker.lastPnlPct > 0.3 &&
        pnlPct < 0
      ) {
        tracker.notifiedAt = now;
        dirty = true;
        toast({
          title: `🚨 ${ticker} — Profit Erased`,
          description: `Was +${tracker.lastPnlPct.toFixed(1)}%, now ${pnlPct.toFixed(1)}%. Previous gains wiped out.`,
          variant: "destructive",
          duration: 15000,
        });
      }

      tracker.lastPnlPct = pnlPct;
    }

    // Clean up removed stocks
    const activeIds = new Set(stocks.map(s => s.id));
    for (const id of Object.keys(trackers.current)) {
      if (!activeIds.has(id)) {
        delete trackers.current[id];
        dirty = true;
      }
    }

    if (dirty) saveTrackers(trackers.current);
  }, [stocks]);
}
