import type { SectionDef, WorkspaceDef } from "../registry";
import GenericSectionView from "./GenericSectionView";
import OverviewView from "./OverviewView";
import ThesisView from "./ThesisView";
import TechnicalView from "./TechnicalView";
import MonteCarloView from "./MonteCarloView";
import DossierView from "./DossierView";
import StatementsView from "./StatementsView";
import {
  CapitalStructureView,
  CashGenerationView,
  HealthView,
  ProfitabilityView,
  RiskAnalysisView,
} from "./AnalyticsViews";

const STATEMENT_SECTIONS = new Set([
  "financials/income-statement",
  "financials/cash-flow",
]);

/** Purpose-built analytical views — each section its own institutional module. */
const ANALYTICS_VIEWS: Record<string, typeof ProfitabilityView> = {
  "financials/balance-sheet": CapitalStructureView,
  "financials/health": HealthView,
  "financials/cash-generation": CashGenerationView,
  "valuation/profitability": ProfitabilityView,
  "risk/risk-analysis": RiskAnalysisView,
};

const DOSSIER_SECTIONS = new Set([
  "competition/landscape",
  "competition/network",
  "competition/peer-matrix",
  "ecosystem/supply-chain",
  "ecosystem/suppliers",
  "ecosystem/customers",
  "ecosystem/products-segments",
  "ecosystem/geographic",
  "intelligence/management",
  "intelligence/earnings-calls",
  "intelligence/filings",
  "intelligence/news",
  "structure/ownership",
  "structure/insider",
]);

/** Routes a section to its view. Every section renders something real. */
const SectionContent = ({ workspace, section }: { workspace: WorkspaceDef; section: SectionDef }) => {
  const key = `${workspace.id}/${section.id}`;

  if (key === "overview/summary") return <OverviewView workspace={workspace} section={section} />;
  if (workspace.id === "thesis") return <ThesisView workspace={workspace} section={section} />;
  const Analytics = ANALYTICS_VIEWS[key];
  if (Analytics) return <Analytics workspace={workspace} section={section} />;
  if (STATEMENT_SECTIONS.has(key)) return <StatementsView workspace={workspace} section={section} />;
  if (key === "structure/technical") return <TechnicalView workspace={workspace} section={section} />;
  if (key === "risk/monte-carlo") return <MonteCarloView workspace={workspace} section={section} />;
  if (DOSSIER_SECTIONS.has(key)) return <DossierView workspace={workspace} section={section} />;

  return <GenericSectionView workspace={workspace} section={section} />;
};

export default SectionContent;
