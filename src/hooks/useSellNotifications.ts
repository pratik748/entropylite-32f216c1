import { useEffect, useRef, useCallback } from "react";
import { toast } from "@/hooks/use-toast";
import { type PortfolioStock } from "@/components/PortfolioPanel";

interface PeakTracker {
  peakPrice: number;
  peakPnlPct: number;
  notifiedAt: number;
  lastPnlPct: number;
  peakTimestamp: number; // when peak was recorded
}

const STORAGE_KEY = "entropy_sell_trackers";
const NOTIFY_COOLDOWN = 180_000; // 3 min (was 5 — more responsive)
const DRAWDOWN_THRESHOLD = 0.01; // 1% drawdown from peak triggers (was 1.5%)
const PROFIT_PEAK_THRESHOLD = 0.015; // 1.5% profit peak to start tracking (was 2%)

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
 * Monitors portfolio positions and fires sell notifications when:
 * 1. A stock reached a profit peak (e.g. +1.5%) but has since dropped significantly
 * 2. Analysis suggestion is "Sell" or "Exit"
 * 3. Risk score is critically high
 * 4. Profit erased (was in profit, now in loss)
 * 
 * Persists peak data to localStorage so peaks survive page reloads.
 */
export function useSellNotifications(stocks: PortfolioStock[]) {
  const trackers = useRef<Record<string, PeakTracker>>(loadTrackers());
  const initialized = useRef(false);

  // On mount, merge any stored trackers
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

      // Initialize tracker — but DON'T skip if we have a stored tracker from a previous session
      if (!trackers.current[trackerId]) {
        trackers.current[trackerId] = {
          peakPrice: currentPrice,
          peakPnlPct: pnlPct,
          notifiedAt: 0,
          lastPnlPct: pnlPct,
          peakTimestamp: now,
        };
        dirty = true;
        continue; // Don't notify on first observation
      }

      const tracker = trackers.current[trackerId];
      const cooldownOk = now - tracker.notifiedAt > NOTIFY_COOLDOWN;

      // Update peak — track the highest P&L % seen
      if (pnlPct > tracker.peakPnlPct) {
        tracker.peakPrice = currentPrice;
        tracker.peakPnlPct = pnlPct;
        tracker.peakTimestamp = now;
        dirty = true;
      }

      // Scenario 1: Profit drawdown — stock reached a high but is falling back
      const drawdownFromPeak = tracker.peakPnlPct - pnlPct;
      if (
        cooldownOk &&
        tracker.peakPnlPct >= PROFIT_PEAK_THRESHOLD * 100 && // Had at least 1.5% profit
        drawdownFromPeak >= DRAWDOWN_THRESHOLD * 100 &&       // Dropped 1%+ from peak
        pnlPct >= 0 // Still in profit (or breakeven) but fading
      ) {
        tracker.notifiedAt = now;
        dirty = true;
        toast({
          title: `📉 ${ticker} — Profit Fading`,
          description: `Peak was +${tracker.peakPnlPct.toFixed(1)}%, now +${pnlPct.toFixed(1)}% (gave back ${drawdownFromPeak.toFixed(1)}%). Consider taking profit.`,
          variant: "destructive",
          duration: 15000,
        });
      }

      // Scenario 2: Intelligence says sell/exit
      if (
        cooldownOk &&
        analysis.suggestion &&
        (analysis.suggestion.toLowerCase().includes("sell") || analysis.suggestion.toLowerCase().includes("exit"))
      ) {
        tracker.notifiedAt = now;
        dirty = true;
        toast({
          title: `🔴 ${ticker} — Sell Signal`,
          description: `Intelligence recommends: ${analysis.suggestion}. Current P&L: ${pnlPct >= 0 ? "+" : ""}${pnlPct.toFixed(1)}%`,
          variant: "destructive",
          duration: 15000,
        });
      }

      // Scenario 3: Risk score critically high
      if (
        cooldownOk &&
        analysis.riskScore &&
        analysis.riskScore >= 75 && // lowered from 80
        pnlPct < 0
      ) {
        tracker.notifiedAt = now;
        dirty = true;
        toast({
          title: `⚠️ ${ticker} — High Risk Alert`,
          description: `Risk score ${analysis.riskScore}/100 with ${pnlPct.toFixed(1)}% loss. Review position.`,
          variant: "destructive",
          duration: 15000,
        });
      }

      // Scenario 4: Stock went from profit to loss
      if (
        cooldownOk &&
        tracker.lastPnlPct > 0.3 && // Was in profit (lowered from 0.5)
        pnlPct < 0 // Now in loss
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

      // Scenario 5: Large drawdown even if never notified — peak was significant and now most is gone
      if (
        cooldownOk &&
        tracker.peakPnlPct >= 2.0 && // Had 2%+ profit at some point
        pnlPct < tracker.peakPnlPct * 0.25 && // Lost 75%+ of peak gains
        pnlPct >= 0 &&
        drawdownFromPeak >= 1.5 // At least 1.5% absolute drawdown
      ) {
        tracker.notifiedAt = now;
        dirty = true;
        toast({
          title: `🔻 ${ticker} — Major Drawdown`,
          description: `Peak +${tracker.peakPnlPct.toFixed(1)}% → now +${pnlPct.toFixed(1)}%. ${((drawdownFromPeak / tracker.peakPnlPct) * 100).toFixed(0)}% of gains lost.`,
          variant: "destructive",
          duration: 20000,
        });
      }

      tracker.lastPnlPct = pnlPct;
    }

    // Clean up trackers for removed stocks
    const activeIds = new Set(stocks.map(s => s.id));
    for (const id of Object.keys(trackers.current)) {
      if (!activeIds.has(id)) {
        delete trackers.current[id];
        dirty = true;
      }
    }

    // Persist to localStorage when anything changed
    if (dirty) {
      saveTrackers(trackers.current);
    }
  }, [stocks]);
}
