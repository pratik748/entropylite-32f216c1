const symbolMap: Record<string, string> = {
  USD: "$", INR: "₹", EUR: "€", GBP: "£", JPY: "¥", CNY: "¥",
  KRW: "₩", BRL: "R$", RUB: "₽", TRY: "₺", CHF: "Fr", AUD: "A$",
  CAD: "C$", SGD: "S$", HKD: "HK$", SEK: "kr", NOK: "kr", DKK: "kr",
  NZD: "NZ$", ZAR: "R", MXN: "MX$", PLN: "zł", THB: "฿",
};

export const getCurrencySymbol = (currency?: string): string =>
  symbolMap[currency || "USD"] || "$";

export const formatCurrency = (value: number, currency?: string): string => {
  const sym = getCurrencySymbol(currency);
  if (currency === "INR") return `${sym}${value.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
  if (currency === "JPY") return `${sym}${Math.round(value).toLocaleString()}`;
  return `${sym}${value.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
};

export const formatCompact = (value: number, currency?: string): string => {
  const sym = getCurrencySymbol(currency);
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1e9) return `${sign}${sym}${(abs / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `${sign}${sym}${(abs / 1e6).toFixed(1)}M`;
  if (abs >= 1e5 && currency === "INR") return `${sign}${sym}${(abs / 1e5).toFixed(1)}L`;
  if (abs >= 1e3) return `${sign}${sym}${(abs / 1e3).toFixed(1)}K`;
  return `${sign}${sym}${abs.toFixed(2)}`;
};

/** Format in a specific base currency with proper symbol */
export const formatInBase = (value: number, baseCurrency: string): string => {
  return formatCurrency(value, baseCurrency);
};

export const getPortfolioCurrency = (stocks: { analysis?: { currency?: string } }[]): string => {
  const currencies = stocks.filter(s => s.analysis?.currency).map(s => s.analysis!.currency!);
  if (currencies.length === 0) return "USD";
  const freq: Record<string, number> = {};
  currencies.forEach(c => { freq[c] = (freq[c] || 0) + 1; });
  return Object.entries(freq).sort((a, b) => b[1] - a[1])[0][0];
};

export const isMultiCurrency = (stocks: { analysis?: { currency?: string } }[]): boolean => {
  const currencies = new Set(stocks.filter(s => s.analysis?.currency).map(s => s.analysis!.currency));
  return currencies.size > 1;
};
