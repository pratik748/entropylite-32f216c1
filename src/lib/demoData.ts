import { NewsItem } from "@/components/NewsImpactTable";

// Demo data for showcasing the UI before backend is connected

export const demoNews: NewsItem[] = [
  {
    headline: "Reliance Industries posts 12% YoY profit growth in Q3",
    category: "Company",
    sentiment: 72,
    shortTermImpact: 2.5,
    longTermImpact: 4.1,
    confidence: 85,
    explanation: "Strong earnings beat market expectations, driven by Jio and retail segments.",
  },
  {
    headline: "RBI holds repo rate steady at 6.5%, signals easing cycle ahead",
    category: "Macro",
    sentiment: 45,
    shortTermImpact: 1.2,
    longTermImpact: 2.8,
    confidence: 78,
    explanation: "Rate stability supports equity valuations; future cuts may boost capex-heavy sectors.",
  },
  {
    headline: "Crude oil prices drop 8% on OPEC+ output increase",
    category: "Sector",
    sentiment: 55,
    shortTermImpact: 1.8,
    longTermImpact: 3.2,
    confidence: 72,
    explanation: "Lower oil prices reduce input costs for Reliance's refining and petrochemical business.",
  },
  {
    headline: "TCS wins $2B deal, signals strong IT sector demand",
    category: "Competitor",
    sentiment: -15,
    shortTermImpact: -0.5,
    longTermImpact: -0.2,
    confidence: 60,
    explanation: "Competitor wins may redirect institutional flows temporarily away from RIL.",
  },
  {
    headline: "India's GDP growth revised up to 7.2% for FY25",
    category: "Macro",
    sentiment: 62,
    shortTermImpact: 1.0,
    longTermImpact: 3.5,
    confidence: 80,
    explanation: "Strong domestic consumption supports Reliance's retail and telecom segments.",
  },
  {
    headline: "SEBI tightens regulations on related-party transactions",
    category: "Company",
    sentiment: -25,
    shortTermImpact: -1.5,
    longTermImpact: -0.8,
    confidence: 65,
    explanation: "New compliance requirements may impact conglomerate structure flexibility.",
  },
];

export const demoAnalysis = {
  ticker: "RELIANCE.NS",
  currentPrice: 2847.5,
  buyPrice: 2650,
  quantity: 50,
  riskLevel: "Medium" as const,
  keyRisks: [
    "Global crude oil price volatility",
    "SEBI regulatory tightening on group companies",
    "Telecom ARPU growth slower than expected",
    "Rupee depreciation impacting import costs",
  ],
  bullRange: [3100, 3350] as [number, number],
  neutralRange: [2750, 3050] as [number, number],
  bearRange: [2400, 2650] as [number, number],
  suggestion: "Hold" as const,
  confidence: 74,
  summary:
    "Reliance Industries shows resilient fundamentals with strong Jio subscriber growth and improving retail margins. However, petrochemical margins face pressure from global oversupply. The macro environment in India remains supportive with stable rates and strong GDP growth. SEBI's regulatory scrutiny on related-party transactions warrants monitoring. Overall, current valuations are fairly priced — hold with a watchful eye on Q4 earnings and crude oil trends.",
  macroFactors: [
    "RBI Rates",
    "Crude Oil",
    "INR/USD",
    "GDP Growth",
    "Inflation",
    "Election Cycle",
    "Sector Rotation",
  ],
  overallSentiment: 38,
  totalPressure: 2.8,
};
