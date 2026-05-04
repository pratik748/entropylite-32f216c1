export type TourStep = {
  id: string;
  selector: string;
  title: string;
  body: string;
  requiresTab?: string;
  side?: "top" | "bottom" | "left" | "right" | "auto";
  mobile?: boolean; // include on mobile
};

export const TOUR_STEPS: TourStep[] = [
  {
    id: "input",
    selector: '[data-tour="stock-input"]',
    title: "Start here",
    body: "Drop any ticker — equity, FX, crypto, commodity. Every analysis begins from this line.",
    side: "bottom",
    mobile: true,
  },
  {
    id: "tabs",
    selector: '[data-tour="tab-bar"]',
    title: "Nine modes",
    body: "Dashboard is your cockpit. The rest are specialist lenses on the same portfolio.",
    side: "bottom",
    mobile: true,
  },
  {
    id: "geo",
    selector: '[data-tour-tab="geopolitical"]',
    title: "Geopolitics",
    body: "Live world risk overlay. Already running in the background, ready when you click.",
    side: "bottom",
  },
  {
    id: "sandbox",
    selector: '[data-tour-tab="sandbox"]',
    title: "Sandbox",
    body: "Twelve engines. Run scenarios, stress, Monte Carlo, stat-arb — before the market does.",
    side: "bottom",
  },
  {
    id: "risk",
    selector: '[data-tour-tab="risk"]',
    title: "Risk + Fortress",
    body: "Defensive layer. VaR, hedges, Fortress Mode for capital preservation.",
    side: "bottom",
  },
  {
    id: "direct-profit",
    selector: '[data-tour="direct-profit-btn"]',
    title: "Direct Profit",
    body: "One-button verdict. Arbitrated across all engines into a single BUY / SELL / WAIT.",
    side: "bottom",
    mobile: true,
  },
  {
    id: "brief",
    selector: '[data-tour="brief-btn"]',
    title: "The Brief",
    body: "Three insights, generated daily. Shareable PNG to X or WhatsApp.",
    side: "bottom",
    mobile: true,
  },
  {
    id: "status",
    selector: '[data-tour="status-bar"]',
    title: "System status",
    body: "Live data health and engine pulse. Always visible at the foot of the terminal.",
    side: "top",
    mobile: true,
  },
];

export const TOUR_FLAG_KEY = "entropy_tour_done_v1";