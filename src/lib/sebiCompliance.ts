/**
 * SEBI Compliance Layer
 * Maps internal suggestion values to non-advisory, probabilistic display labels.
 * EntropyLite is a market intelligence platform, NOT an investment advisor.
 */

export const SCENARIO_LABELS: Record<string, { label: string; fullLabel: string; color: string; bg: string; border: string }> = {
  Hold: { label: "OBSERVE", fullLabel: "Neutral Scenario", color: "text-warning", bg: "bg-warning/10", border: "border-warning/20" },
  Add: { label: "UPSIDE", fullLabel: "High-Probability Upside", color: "text-gain", bg: "bg-gain/10", border: "border-gain/20" },
  Exit: { label: "DOWNSIDE", fullLabel: "High-Probability Downside", color: "text-loss", bg: "bg-loss/10", border: "border-loss/20" },
};

export function getScenarioConfig(suggestion: string) {
  return SCENARIO_LABELS[suggestion] || SCENARIO_LABELS.Hold;
}

export const MICRO_DISCLAIMER = "EntropyLite provides probabilistic market intelligence, not investment advice. All decisions are yours.";

export const FOOTER_DISCLAIMER = "EntropyLite is a market intelligence and probabilistic scenario engine. It does not provide investment advice, trading recommendations, or portfolio management services. All outputs are research-based observations and scenario projections. Users make independent investment decisions at their own risk. Past performance and model outputs do not guarantee future results.";

export const TERMINOLOGY: Record<string, string> = {
  "Signal": "Scenario",
  "Trade": "Positioning Insight",
  "Accuracy": "Confidence Score",
  "Entry": "Key Level",
  "Exit": "Reaction Zone",
  "Target": "Projected Range",
  "Stop Loss": "Invalidation Zone",
  "Buy": "Accumulate",
  "Sell": "Reduce Exposure",
  "Recommendation": "Scenario Assessment",
  "Suggest": "Indicate",
};
