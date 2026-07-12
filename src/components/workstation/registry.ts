/**
 * Equity Workstation registry — the single source of truth for the
 * workstation's information architecture: 9 workspaces in 4 semantic
 * groups, each holding one-screen sections. Every section is URL-addressable
 * as /company/:ticker/:workspaceId/:sectionId.
 *
 * Sections declare which build phase populates them so scaffolds can state
 * honestly what will land there instead of rendering empty chrome.
 */

export interface SectionDef {
  id: string;
  label: string;
  /** The analyst question this section answers. */
  summary: string;
  /** Planned evidence and views, shown on the scaffold until populated. */
  contents: string[];
  /** Implementation phase that populates this section with live evidence. */
  phase: 3 | 4 | 5;
}

export interface WorkspaceDef {
  id: string;
  label: string;
  group: "Company" | "Fundamentals" | "Market" | "Judgment";
  sections: SectionDef[];
}

export const WORKSPACES: WorkspaceDef[] = [
  {
    id: "overview",
    label: "Overview",
    group: "Company",
    sections: [
      {
        id: "summary",
        label: "Executive Summary",
        summary: "The call and why, on one screen: verdict, pillar scores, the strongest evidence on each side, and what changed since the last session.",
        contents: [
          "Institutional thesis paragraph with inline evidence citations",
          "Six pillar scores — valuation, quality, growth, health, momentum, risk",
          "Strongest evidence for and against, ranked by thesis weight",
          "Change feed since last synthesis run",
        ],
        phase: 3,
      },
    ],
  },
  {
    id: "financials",
    label: "Financials",
    group: "Fundamentals",
    sections: [
      {
        id: "income-statement",
        label: "Income Statement",
        summary: "Revenue through EPS with per-line deltas, peer percentiles, and a one-line institutional read on every item.",
        contents: ["Multi-period statement table (FY / quarterly / TTM)", "Δ YoY and peer percentile per line", "Interpretation column on every line", "Margin bridge"],
        phase: 3,
      },
      {
        id: "balance-sheet",
        label: "Balance Sheet",
        summary: "Asset, liability and equity structure — what the company owns, owes, and how that mix is trending.",
        contents: ["Statement table with deltas and reads", "Working-capital decomposition", "Debt maturity and structure"],
        phase: 3,
      },
      {
        id: "cash-flow",
        label: "Cash Flow",
        summary: "Where cash actually comes from and goes — operations, investment, financing — versus reported earnings.",
        contents: ["Statement table with deltas and reads", "FCF derivation with operands", "Capex and SBC trends"],
        phase: 3,
      },
      {
        id: "ratios",
        label: "Financial Ratios",
        summary: "The full ratio sheet — liquidity, leverage, efficiency, returns — each ratio an evidence node with history and peer context.",
        contents: ["Ratio matrix grouped by family", "Historical trend per ratio", "Five-rung peer percentile ladder"],
        phase: 3,
      },
      {
        id: "health",
        label: "Financial Health",
        summary: "Can the balance sheet survive stress — solvency, liquidity, refinancing risk, and distress scoring.",
        contents: ["Solvency and liquidity evidence", "Interest coverage and maturity wall", "Distress scores (Altman / Piotroski class)"],
        phase: 3,
      },
      {
        id: "cash-generation",
        label: "Cash Generation",
        summary: "Quality and durability of cash conversion — FCF yield, conversion of earnings to cash, reinvestment needs.",
        contents: ["FCF conversion vs net income", "Cash conversion cycle", "FCF yield vs peers"],
        phase: 3,
      },
      {
        id: "earnings-quality",
        label: "Quality of Earnings",
        summary: "How much of reported profit is real — accruals, one-offs, revenue recognition, and red-flag screens.",
        contents: ["Accruals ratio and trend", "One-off / adjusted-line ledger", "Red-flag screen results"],
        phase: 3,
      },
    ],
  },
  {
    id: "valuation",
    label: "Valuation & Returns",
    group: "Fundamentals",
    sections: [
      {
        id: "valuation",
        label: "Valuation",
        summary: "What the market is paying versus what the business earns — multiples against own history and every peer scope.",
        contents: ["Multiple set (P/E, EV/EBITDA, EV/FCF, P/B…) with operands", "10-year own-history bands", "Peer percentile ladders", "Implied expectations read"],
        phase: 3,
      },
      {
        id: "growth",
        label: "Growth",
        summary: "How fast the business compounds — revenue, earnings and FCF growth, durability, and what is driving it.",
        contents: ["Multi-horizon CAGRs", "Growth decomposition (volume / price / mix)", "Peer-relative growth ranking"],
        phase: 3,
      },
      {
        id: "profitability",
        label: "Profitability",
        summary: "Margin structure and returns on capital — level, trend, and how they compare to everyone who matters.",
        contents: ["Margin waterfall (gross → operating → net)", "ROIC / ROE / ROA with DuPont decomposition", "Peer percentile ladders"],
        phase: 3,
      },
      {
        id: "capital-allocation",
        label: "Capital Allocation",
        summary: "What management does with the cash — buybacks, dividends, capex, M&A — and whether it creates value.",
        contents: ["Capital deployment mix over time", "Buyback yield and timing quality", "Dividend record and coverage", "ROIC on incremental capital"],
        phase: 3,
      },
      {
        id: "historical-performance",
        label: "Historical Performance",
        summary: "Total shareholder return across horizons versus sector, index and peers — and what drove it.",
        contents: ["TSR across 1y/3y/5y/10y", "Return decomposition (earnings vs multiple)", "Drawdown history"],
        phase: 3,
      },
    ],
  },
  {
    id: "structure",
    label: "Market Structure",
    group: "Market",
    sections: [
      {
        id: "technical",
        label: "Technical Structure",
        summary: "Where price sits in its structure — trend, support/resistance, volatility regime, and positioning.",
        contents: ["Trend and moving-average structure", "Support / resistance with volume", "Volatility regime read"],
        phase: 3,
      },
      {
        id: "ownership",
        label: "Institutional Ownership",
        summary: "Who owns the stock, in what size, and whether they are accumulating or distributing.",
        contents: ["Holder ledger with position changes", "Ownership concentration evidence", "Flow trend by holder class"],
        phase: 3,
      },
      {
        id: "insider",
        label: "Insider Activity",
        summary: "What the people with the most information are doing with their own money.",
        contents: ["Form 4 / exchange-disclosure trade ledger", "Net insider flow trend", "Signal read per cluster of trades"],
        phase: 3,
      },
      {
        id: "options",
        label: "Options & Derivatives",
        summary: "What the derivatives market is pricing — implied vol, skew, notable positioning and dealer exposure.",
        contents: ["IV level and term structure vs realized", "Skew and put/call positioning", "Notable open-interest concentrations"],
        phase: 4,
      },
      {
        id: "microstructure",
        label: "Market Microstructure",
        summary: "How the stock actually trades — liquidity, spreads, volume profile, and short interest.",
        contents: ["Liquidity and average spread evidence", "Volume profile and abnormal prints", "Short interest and borrow trend"],
        phase: 4,
      },
    ],
  },
  {
    id: "competition",
    label: "Competition",
    group: "Market",
    sections: [
      {
        id: "landscape",
        label: "Competitive Landscape",
        summary: "The shape of the market the company fights in — share, moat sources, and threat vectors.",
        contents: ["Market share map", "Moat evidence (switching costs, IP, scale)", "Threat register with severity"],
        phase: 4,
      },
      {
        id: "peer-matrix",
        label: "Peer Matrix",
        summary: "One comparison matrix, four scopes — sector, industry, direct peers, global leaders — with an interpretation on every row.",
        contents: ["Metric × peer matrix with percentile shading", "Scope switcher (sector / industry / direct / global)", "Row-level institutional reads"],
        phase: 4,
      },
      {
        id: "network",
        label: "Competitor Network",
        summary: "Who competes with whom, where the overlaps are, and how competitive pressure propagates.",
        contents: ["Competitor relationship graph", "Overlap analysis by segment", "Emerging-entrant watch list"],
        phase: 4,
      },
    ],
  },
  {
    id: "ecosystem",
    label: "Ecosystem",
    group: "Market",
    sections: [
      {
        id: "supply-chain",
        label: "Supply Chain",
        summary: "The physical and contractual chain the business depends on, and where it is fragile.",
        contents: ["Supplier / manufacturer / distributor map", "Concentration and geography risk evidence", "Disruption sensitivity"],
        phase: 4,
      },
      {
        id: "suppliers",
        label: "Suppliers",
        summary: "Key suppliers, dependence on each, and substitution difficulty.",
        contents: ["Supplier ledger with dependence scores", "Single-source exposure evidence", "Input-cost pass-through read"],
        phase: 4,
      },
      {
        id: "customers",
        label: "Customers",
        summary: "Who the revenue comes from and how concentrated it is.",
        contents: ["Customer concentration evidence", "End-market demand drivers", "Churn / retention signals where disclosed"],
        phase: 4,
      },
      {
        id: "products-segments",
        label: "Products & Segments",
        summary: "What the company sells, how each line is doing, and where the mix is heading.",
        contents: ["Segment revenue and margin table with reads", "Product lifecycle positions", "Mix-shift evidence and thesis links"],
        phase: 4,
      },
      {
        id: "geographic",
        label: "Geographic Exposure",
        summary: "Where revenue and assets sit on the map, and what that exposes the business to.",
        contents: ["Revenue and asset split by region", "Country risk overlay", "FX exposure evidence"],
        phase: 4,
      },
      {
        id: "macro",
        label: "Macro Exposure",
        summary: "Which macro variables move this business — rates, FX, commodities, cycles — and by how much.",
        contents: ["Macro factor sensitivities", "Regime dependence evidence", "Upcoming macro-calendar exposure"],
        phase: 4,
      },
      {
        id: "causal",
        label: "Causal Relationships",
        summary: "The cause-and-effect chains that connect events in the ecosystem to this company's results.",
        contents: ["Causal graph (event → channel → line item)", "Strength and lag per edge", "Historical validations of each link"],
        phase: 4,
      },
      {
        id: "second-order",
        label: "Second-Order Effects",
        summary: "What happens after what happens — knock-on effects the first-order view misses.",
        contents: ["Second-order effect register", "Ecosystem propagation paths", "Positioning implications"],
        phase: 4,
      },
    ],
  },
  {
    id: "intelligence",
    label: "Intelligence",
    group: "Market",
    sections: [
      {
        id: "management",
        label: "Management & Governance",
        summary: "Who runs the company, their record, incentives, and governance quality.",
        contents: ["Executive ledger with tenure and record", "Incentive alignment evidence", "Board and governance flags"],
        phase: 4,
      },
      {
        id: "earnings-calls",
        label: "Earnings Calls",
        summary: "What management said, how they said it, and what changed versus previous calls.",
        contents: ["Call summaries with tone scoring", "Guidance change ledger", "Q&A evasiveness signals"],
        phase: 4,
      },
      {
        id: "filings",
        label: "SEC / Exchange Filings",
        summary: "The primary documents — what was filed, what changed, and what matters in it.",
        contents: ["Filing feed (10-K/Q, 8-K, Form 4, exchange disclosures)", "Material-change highlights", "Links into evidence nodes they support"],
        phase: 4,
      },
      {
        id: "news",
        label: "News Intelligence",
        summary: "The headline flow, scored for real impact on this name — not just sentiment.",
        contents: ["Impact-scored news ledger", "Narrative shift detection", "Source reliability weighting"],
        phase: 4,
      },
      {
        id: "alternative-data",
        label: "Alternative Data",
        summary: "Signals outside the filings — hiring, web traffic, app data, prediction markets — where available.",
        contents: ["Alternative signal panel with provenance", "Divergence vs reported trends", "Signal reliability grading"],
        phase: 4,
      },
    ],
  },
  {
    id: "risk",
    label: "Risk Lab",
    group: "Judgment",
    sections: [
      {
        id: "risk-analysis",
        label: "Risk Analysis",
        summary: "The full risk picture — market, business, financial, and idiosyncratic — quantified where possible.",
        contents: ["Risk decomposition with evidence", "Volatility and beta structure", "Tail risk measures"],
        phase: 4,
      },
      {
        id: "investment-risks",
        label: "Investment Risks",
        summary: "The specific ways this investment loses money, ranked by probability × severity.",
        contents: ["Risk register ranked by expected impact", "Early-warning indicator per risk", "Links to thesis breakers"],
        phase: 4,
      },
      {
        id: "scenarios",
        label: "Scenario Analysis",
        summary: "Named scenarios with explicit assumptions, probabilities, and price outcomes.",
        contents: ["Scenario table with assumption sets", "Probability-weighted outcome distribution", "Evidence links per assumption"],
        phase: 4,
      },
      {
        id: "monte-carlo",
        label: "Monte Carlo",
        summary: "The simulated distribution of outcomes — paths, percentiles, and what drives the spread.",
        contents: ["Path simulation with percentile cone", "Terminal distribution and key quantiles", "Driver sensitivity of the spread"],
        phase: 4,
      },
      {
        id: "stress",
        label: "Stress Testing",
        summary: "What this position does in named historical and hypothetical shocks.",
        contents: ["Historical episode replay", "Hypothetical shock grid", "Balance-sheet stress pass-through"],
        phase: 4,
      },
      {
        id: "sensitivity",
        label: "Sensitivity Analysis",
        summary: "Which inputs move the valuation most — one-way and two-way sensitivity on the drivers.",
        contents: ["Tornado chart of value drivers", "Two-way sensitivity grids", "Break-even input levels"],
        phase: 4,
      },
      {
        id: "portfolio-impact",
        label: "Portfolio Impact",
        summary: "What this position does to the book — correlation, concentration, marginal risk contribution.",
        contents: ["Marginal VaR / risk contribution", "Correlation with existing holdings", "Sizing guidance under risk budget"],
        phase: 4,
      },
    ],
  },
  {
    id: "thesis",
    label: "Thesis",
    group: "Judgment",
    sections: [
      {
        id: "investment-thesis",
        label: "Investment Thesis",
        summary: "The complete argument — what you must believe, supported by cited evidence, to own or avoid this name.",
        contents: ["Thesis statement with evidence citations", "Key beliefs and their support strength", "Time horizon and catalysts"],
        phase: 5,
      },
      {
        id: "key-drivers",
        label: "Key Drivers",
        summary: "The handful of variables that actually decide the outcome, and their current state.",
        contents: ["Driver ledger ranked by thesis weight", "Current state and trend per driver", "Links into supporting sections"],
        phase: 5,
      },
      {
        id: "cases",
        label: "Bull / Base / Bear",
        summary: "Three probability-weighted cases, each anchored to named evidence nodes with explicit price outcomes.",
        contents: ["Case cards with probability, target and reasoning", "Evidence anchors per case", "Expected value across cases"],
        phase: 5,
      },
      {
        id: "validation",
        label: "Thesis Validation",
        summary: "Is the thesis tracking — each key belief scored against what the data has done since.",
        contents: ["Belief-vs-actual scorecard", "Validation trend over time", "Divergences requiring attention"],
        phase: 5,
      },
      {
        id: "breakers",
        label: "Thesis Breakers",
        summary: "Standing conditions that invalidate the thesis, monitored live against incoming data.",
        contents: ["Breaker predicates with live state", "Trip history and near-misses", "Action protocol per breaker"],
        phase: 5,
      },
      {
        id: "confidence",
        label: "Confidence & Evidence",
        summary: "The auditable ledger behind the recommendation — every node, its weight, and the confidence math.",
        contents: ["Full evidence ledger (supporting / opposing / estimated)", "Confidence derivation", "Largest positive and negative movers"],
        phase: 5,
      },
      {
        id: "recommendation",
        label: "Final Recommendation",
        summary: "The institutional call — action, sizing, horizon, entry discipline — with its full evidence trail.",
        contents: ["Recommendation with confidence and horizon", "Sizing and entry guidance", "Review triggers and next catalysts"],
        phase: 5,
      },
    ],
  },
];

export const WORKSPACE_GROUPS: WorkspaceDef["group"][] = [
  "Company",
  "Fundamentals",
  "Market",
  "Judgment",
];

export function findWorkspace(workspaceId: string | undefined): WorkspaceDef | null {
  if (!workspaceId) return null;
  return WORKSPACES.find((w) => w.id === workspaceId) ?? null;
}

export function findSection(
  workspace: WorkspaceDef | null,
  sectionId: string | undefined,
): SectionDef | null {
  if (!workspace || !sectionId) return null;
  return workspace.sections.find((s) => s.id === sectionId) ?? null;
}

/** Ordered flat list of every section for [ / ] keyboard navigation. */
export function flattenSections(): { workspace: WorkspaceDef; section: SectionDef }[] {
  return WORKSPACES.flatMap((workspace) =>
    workspace.sections.map((section) => ({ workspace, section })),
  );
}

export function sectionPath(ticker: string, workspaceId: string, sectionId: string): string {
  return `/company/${encodeURIComponent(ticker)}/${workspaceId}/${sectionId}`;
}

export function workstationPath(ticker: string): string {
  return `/company/${encodeURIComponent(ticker)}`;
}
