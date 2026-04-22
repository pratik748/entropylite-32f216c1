import { useEffect, useState, useCallback } from "react";

/**
 * Global Intraday Mode — system-wide toggle (mirrors the IndiaMode pattern).
 * When ON:
 *   • Dashboard initial tab → Compounding
 *   • Validator presets switch to intraday-friendly defaults (15-min horizon, tighter stops)
 *   • Portfolio panels stay in their normal mode (long-term P&L is preserved)
 *   • A subtle "INTRADAY MODE" banner is shown
 *
 * Implementation: localStorage-backed with a custom-event broadcaster so every
 * subscribed component re-renders simultaneously across the app.
 */
const KEY = "entropy-intraday-mode";
const EVT = "entropy-intraday-mode-change";

function readMode(): boolean {
  try { return localStorage.getItem(KEY) === "true"; } catch { return false; }
}

export function useIntradayMode() {
  const [intradayMode, setMode] = useState<boolean>(readMode);

  useEffect(() => {
    const sync = () => setMode(readMode());
    window.addEventListener(EVT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const setIntradayMode = useCallback((v: boolean) => {
    try { localStorage.setItem(KEY, String(v)); } catch { /* ignore */ }
    setMode(v);
    window.dispatchEvent(new CustomEvent(EVT));
  }, []);

  return { intradayMode, setIntradayMode };
}

export const isIntradayModeActive = readMode;