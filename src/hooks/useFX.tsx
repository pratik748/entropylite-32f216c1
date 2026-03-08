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
  convert: (amount: number, fromCurrency: string, toCurrency?: string) => number;
  convertToBase: (amount: number, fromCurrency: string) => number;
  getRate: (from: string, to: string) => number;
  fxImpact: (assetReturn: number, fxReturn: number) => { alpha: number; fxContrib: number; total: number };
  stressTest: (amount: number, fromCurrency: string, shockPct: number) => number;
  isLoading: boolean;
  lastUpdate: number | null;
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
  const [isLoading, setIsLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<number | null>(null);

  const fetchRates = useCallback(async () => {
    try {
      const { data, error } = await supabase.functions.invoke("fx-rates");
      if (error) throw error;
      if (data?.rates) {
        setRates(data.rates);
        setLastUpdate(data.timestamp);
      }
    } catch (e) {
      console.error("FX rates error:", e);
      // Fallback rates
      setRates({ USD: 1, INR: 1 / 83.5, EUR: 1.08, GBP: 1.27, JPY: 1 / 150, CNY: 1 / 7.2 });
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

  const getRate = useCallback((from: string, to: string): number => {
    if (from === to) return 1;
    const fromUsd = rates[from] || 1;
    const toUsd = rates[to] || 1;
    return fromUsd / toUsd;
  }, [rates]);

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
      convert, convertToBase, getRate, fxImpact, stressTest,
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
