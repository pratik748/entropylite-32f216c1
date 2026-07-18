import { useState, useEffect, useCallback, createContext, useContext } from "react";
import { governedInvoke } from "@/lib/apiGovernor";

interface FXRates {
  rates: Record<string, number>; // 1 unit of currency = X USD
  timestamp: number;
}

interface FXContextType {
  rates: Record<string, number>;
  baseCurrency: string;
  setBaseCurrency: (c: string) => void;
  indiaMode: boolean;
  setIndiaMode: (v: boolean) => void;
  convert: (amount: number, fromCurrency: string, toCurrency?: string) => number;
  convertToBase: (amount: number, fromCurrency: string) => number;
  getRate: (from: string, to: string) => number;
  /** True when the live feed supplied this currency's rate (vs static fallback). */
  rateIsLive: (currency: string) => boolean;
  fxImpact: (assetReturn: number, fxReturn: number) => { alpha: number; fxContrib: number; total: number };
  stressTest: (amount: number, fromCurrency: string, shockPct: number) => number;
  isLoading: boolean;
  lastUpdate: number | null;
}

/**
 * Static USD-per-unit fallbacks for EVERY supported currency. Used only when
 * the live fx-rates feed lacks a currency. Before this table existed, a
 * missing rate silently became 1.0 — an INR position would be valued at
 * ~83× its true USD worth, which is exactly how two tabs can disagree on
 * what the same book is worth. A stale approximate rate, disclosed via
 * `rateIsLive`, is institutionally acceptable; a silent 83× error is not.
 */
const FALLBACK_USD_RATES: Record<string, number> = {
  USD: 1, INR: 1 / 83.5, EUR: 1.08, GBP: 1.27, JPY: 1 / 150, CNY: 1 / 7.2,
  KRW: 1 / 1350, BRL: 1 / 5.0, RUB: 1 / 90, TRY: 1 / 32, CHF: 1.12, AUD: 0.66,
  CAD: 0.73, SGD: 0.74, HKD: 1 / 7.8, SEK: 1 / 10.5, NOK: 1 / 10.6, DKK: 1 / 6.9,
  NZD: 0.60, ZAR: 1 / 18.5, MXN: 1 / 17, PLN: 1 / 4.0, THB: 1 / 36,
};

/** USD value of one unit, preferring live rates, then fallback, then 1 (USD-like). */
function usdRate(rates: Record<string, number>, currency: string): number {
  return rates[currency] ?? FALLBACK_USD_RATES[currency] ?? 1;
}

const FXContext = createContext<FXContextType | null>(null);

export const SUPPORTED_CURRENCIES = [
  "USD", "INR", "EUR", "GBP", "JPY", "CNY", "KRW", "BRL",
  "RUB", "TRY", "CHF", "AUD", "CAD", "SGD", "HKD", "SEK",
  "NOK", "DKK", "NZD", "ZAR", "MXN", "PLN", "THB",
];

const CURRENCY_LABELS: Record<string, string> = {
  USD: "US Dollar", INR: "Indian Rupee", EUR: "Euro", GBP: "British Pound",
  JPY: "Japanese Yen", CNY: "Chinese Yuan", KRW: "Korean Won", BRL: "Brazilian Real",
  CHF: "Swiss Franc", AUD: "Aus Dollar", CAD: "Can Dollar", SGD: "Singapore Dollar",
};

export const getCurrencyLabel = (c: string) => CURRENCY_LABELS[c] || c;

export function FXProvider({ children }: { children: React.ReactNode }) {
  const [rates, setRates] = useState<Record<string, number>>({ USD: 1 });
  const [baseCurrency, setBaseCurrency] = useState(() => localStorage.getItem("entropy-base-ccy") || "USD");
  const [indiaMode, setIndiaModeState] = useState(() => localStorage.getItem("entropy-india-mode") === "true");
  const [isLoading, setIsLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<number | null>(null);

  const fetchRates = useCallback(async () => {
    try {
      const { data, error } = await governedInvoke("fx-rates");
      if (error) throw error;
      if (data?.rates) {
        setRates(data.rates);
        setLastUpdate(data.timestamp);
      }
    } catch (e) {
      console.error("FX rates error:", e);
      // Full static fallback so no supported currency ever converts at 1:1.
      setRates({ ...FALLBACK_USD_RATES });
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRates();
    const i = setInterval(fetchRates, 60000);
    return () => clearInterval(i);
  }, [fetchRates]);

  useEffect(() => {
    localStorage.setItem("entropy-base-ccy", baseCurrency);
  }, [baseCurrency]);

  const setIndiaMode = useCallback((v: boolean) => {
    setIndiaModeState(v);
    localStorage.setItem("entropy-india-mode", String(v));
    if (v) setBaseCurrency("INR");
  }, []);

  useEffect(() => {
    localStorage.setItem("entropy-india-mode", String(indiaMode));
  }, [indiaMode]);

  const getRate = useCallback((from: string, to: string): number => {
    if (from === to) return 1;
    return usdRate(rates, from) / usdRate(rates, to);
  }, [rates]);

  const rateIsLive = useCallback(
    (currency: string): boolean => currency === "USD" || (lastUpdate != null && rates[currency] != null),
    [rates, lastUpdate],
  );

  const convert = useCallback((amount: number, fromCurrency: string, toCurrency?: string): number => {
    const target = toCurrency || baseCurrency;
    return amount * getRate(fromCurrency, target);
  }, [baseCurrency, getRate]);

  const convertToBase = useCallback((amount: number, fromCurrency: string): number => {
    return convert(amount, fromCurrency, baseCurrency);
  }, [convert, baseCurrency]);

  const fxImpact = useCallback((assetReturn: number, fxReturn: number) => {
    const total = (1 + assetReturn / 100) * (1 + fxReturn / 100) - 1;
    return {
      alpha: assetReturn,
      fxContrib: (total * 100) - assetReturn,
      total: total * 100,
    };
  }, []);

  const stressTest = useCallback((amount: number, fromCurrency: string, shockPct: number): number => {
    const rate = getRate(fromCurrency, baseCurrency);
    const stressedRate = rate * (1 + shockPct / 100);
    return amount * stressedRate;
  }, [getRate, baseCurrency]);

  return (
    <FXContext.Provider value={{
      rates, baseCurrency, setBaseCurrency,
      indiaMode, setIndiaMode,
      convert, convertToBase, getRate, rateIsLive, fxImpact, stressTest,
      isLoading, lastUpdate,
    }}>
      {children}
    </FXContext.Provider>
  );
}

export function useFX() {
  const ctx = useContext(FXContext);
  if (!ctx) throw new Error("useFX must be used within FXProvider");
  return ctx;
}

export default FXContext;
