import { formatCurrency } from "@/lib/currency";
import type { EvidenceMetric } from "./types";

/** Format a metric's value for display, honoring its declared format. */
export function formatMetricValue(m: EvidenceMetric, currency: string): string {
  if (m.value == null || !Number.isFinite(m.value)) return "—";
  switch (m.format) {
    case "percent":
      return `${m.value.toLocaleString(undefined, { maximumFractionDigits: 1 })}%`;
    case "signed":
      return `${m.value >= 0 ? "+" : ""}${m.value.toLocaleString(undefined, { maximumFractionDigits: 1 })}%`;
    case "ratio":
      return `${m.value.toLocaleString(undefined, { maximumFractionDigits: 2 })}×`;
    case "score":
      return `${Math.round(m.value)}`;
    case "price":
      return formatCurrency(m.value, currency);
    case "number":
    default:
      if (Math.abs(m.value) >= 1e12) return `${(m.value / 1e12).toFixed(1)}T`;
      if (Math.abs(m.value) >= 1e9) return `${(m.value / 1e9).toFixed(1)}B`;
      if (Math.abs(m.value) >= 1e6) return `${(m.value / 1e6).toFixed(1)}M`;
      return m.value.toLocaleString(undefined, { maximumFractionDigits: 2 });
  }
}

export const PROVENANCE_LABELS: Record<EvidenceMetric["provenance"], string> = {
  reported: "reported",
  computed: "computed",
  estimated: "estimated",
  model: "model",
};

export const SCOPE_LABELS: Record<string, string> = {
  history: "vs own history",
  sector: "vs sector",
  industry: "vs industry",
  direct: "vs direct peers",
  global: "vs global leaders",
  market: "vs market",
};
