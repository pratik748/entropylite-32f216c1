import { useEffect, useRef } from "react";
import { toast } from "@/hooks/use-toast";
import { type PortfolioStock } from "@/components/PortfolioPanel";

interface PeakTracker {
  peakPrice: number;
  peakPnlPct: number;
  notifiedAt: number;
  lastPnlPct: number;
}

const NOTIFY_COOLDOWN = 300_000; // 5 min between same-stock notifications
const DRAWDOWN_THRESHOLD = 0.015; // 1.5% drawdown from peak triggers notification
const PROFIT_PEAK_THRESHOLD = 0.02; // 2% profit peak to start tracking

/**
 * Monitors portfolio positions and fires sell notifications when:
 * 1. A stock reached a profit peak (e.g. +2%) but has since dropped significantly (e.g. now +0.5%)
 * 2. Analysis suggestion is "Sell" or "Exit"
 * 3. Risk score is critically high
 */
export function useSellNotifications(stocks: PortfolioStock[]) {
  const trackers = useRef<Record<string, PeakTracker>>({});

  useEffect(() => {
    const analyzed = stocks.filter(s => s.analysis && !s.isLoading);
    if (analyzed.length === 0) return;

    const now = Date.now();

    for (const stock of analyzed) {
      const { analysis, ticker, buyPrice, quantity } = stock;
      if (!analysis?.currentPrice) continue;

      const currentPrice = analysis.currentPrice;
      const pnlPct = ((currentPrice - buyPrice) / buyPrice) * 100;
      const trackerId = stock.id;

      // Initialize tracker
      if (!trackers.current[trackerId]) {
        trackers.current[trackerId] = {
          peakPrice: currentPrice,
          peakPnlPct: pnlPct,
          notifiedAt: 0,
          lastPnlPct: pnlPct,
        };
        continue; // Don't notify on first observation
      }

      const tracker = trackers.current[trackerId];
      const cooldownOk = now - tracker.notifiedAt > NOTIFY_COOLDOWN;

      // Update peak
      if (currentPrice > tracker.peakPrice) {
        tracker.peakPrice = currentPrice;
        tracker.peakPnlPct = pnlPct;
      }

      // Scenario 1: Profit drawdown — stock reached a high but is falling back
      if (
        cooldownOk &&
        tracker.peakPnlPct >= PROFIT_PEAK_THRESHOLD * 100 && // Had at least 2% profit
        pnlPct < tracker.peakPnlPct - DRAWDOWN_THRESHOLD * 100 && // Dropped 1.5%+ from peak
        pnlPct > 0 // Still in profit (but fading)
      ) {
        tracker.notifiedAt = now;
        toast({
          title: `📉 ${ticker} — Profit Fading`,
          description: `Peak was +${tracker.peakPnlPct.toFixed(1)}%, now +${pnlPct.toFixed(1)}%. Consider taking profit or tightening stop.`,
          variant: "destructive",
        });
      }

      // Scenario 2: Intelligence says sell/exit
      if (
        cooldownOk &&
        analysis.suggestion &&
        (analysis.suggestion.toLowerCase().includes("sell") || analysis.suggestion.toLowerCase().includes("exit"))
      ) {
        tracker.notifiedAt = now;
        toast({
          title: `🔴 ${ticker} — Sell Signal`,
          description: `Intelligence recommends: ${analysis.suggestion}. Current P&L: ${pnlPct >= 0 ? "+" : ""}${pnlPct.toFixed(1)}%`,
          variant: "destructive",
        });
      }

      // Scenario 3: Risk score critically high
      if (
        cooldownOk &&
        analysis.riskScore &&
        analysis.riskScore >= 80 &&
        pnlPct < 0
      ) {
        tracker.notifiedAt = now;
        toast({
          title: `⚠️ ${ticker} — High Risk Alert`,
          description: `Risk score ${analysis.riskScore}/100 with ${pnlPct.toFixed(1)}% loss. Review position.`,
          variant: "destructive",
        });
      }

      // Scenario 4: Stock went from profit to loss
      if (
        cooldownOk &&
        tracker.lastPnlPct > 0.5 && // Was in profit
        pnlPct < 0 // Now in loss
      ) {
        tracker.notifiedAt = now;
        toast({
          title: `🚨 ${ticker} — Profit Erased`,
          description: `Was +${tracker.lastPnlPct.toFixed(1)}%, now ${pnlPct.toFixed(1)}%. Previous gains wiped out.`,
          variant: "destructive",
        });
      }

      tracker.lastPnlPct = pnlPct;
    }

    // Clean up trackers for removed stocks
    const activeIds = new Set(stocks.map(s => s.id));
    for (const id of Object.keys(trackers.current)) {
      if (!activeIds.has(id)) delete trackers.current[id];
    }
  }, [stocks]);
}
