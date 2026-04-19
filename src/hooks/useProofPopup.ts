import { useEffect, useState } from "react";
import type { PortfolioStock } from "@/components/PortfolioPanel";

const STORAGE_KEY = "proof_card_shown_v1";
const THRESHOLD_PCT = 5;

function loadShown(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
  } catch {
    return {};
  }
}

function saveShown(map: Record<string, number>) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(map));
  } catch {}
}

/**
 * Auto-pops the Proof Card the first time a position crosses +5% PnL.
 * Tracks per-position state in localStorage so we don't nag users.
 * Returns the stock to display (or null) and a dismiss callback.
 */
export function useProofPopup(stocks: PortfolioStock[]) {
  const [proofStock, setProofStock] = useState<PortfolioStock | null>(null);

  useEffect(() => {
    if (proofStock) return; // already showing one
    const shown = loadShown();
    for (const s of stocks) {
      if (!s.analysis?.currentPrice || !s.buyPrice) continue;
      const pnlPct = ((s.analysis.currentPrice - s.buyPrice) / s.buyPrice) * 100;
      if (pnlPct >= THRESHOLD_PCT && !shown[s.id]) {
        shown[s.id] = Date.now();
        saveShown(shown);
        setProofStock(s);
        break;
      }
    }
  }, [stocks, proofStock]);

  return {
    proofStock,
    dismiss: () => setProofStock(null),
  };
}
