import { useState } from "react";
import {
  Briefcase, BarChart3, Shield, Zap, FileCheck, Database,
  Scale, Layers, DollarSign, Umbrella, LayoutDashboard, Users,
  Leaf, GitBranch, TrendingUp,
} from "lucide-react";
import { type PortfolioStock } from "@/components/PortfolioPanel";
import PortfolioConstructionModule from "./PortfolioConstructionModule";
import BenchmarkModule from "./BenchmarkModule";
import RiskModelingModule from "./RiskModelingModule";
import StressTestModule from "./StressTestModule";
import OrderManagementModule from "./OrderManagementModule";
import TradeLifecycleModule from "./TradeLifecycleModule";
import DataAggregationModule from "./DataAggregationModule";
import ComplianceModule from "./ComplianceModule";
import MultiAssetModule from "./MultiAssetModule";
import ValuationModule from "./ValuationModule";
import HedgingModule from "./HedgingModule";
import ExposureDashboardModule from "./ExposureDashboardModule";
import ClientReportingModule from "./ClientReportingModule";
import ESGModule from "./ESGModule";
import WorkflowModule from "./WorkflowModule";

interface AugmentDashboardProps {
  stocks: PortfolioStock[];
}

const modules = [
  { id: "portfolio", label: "Portfolio Construction", icon: Briefcase },
  { id: "benchmark", label: "Benchmark & Attribution", icon: BarChart3 },
  { id: "riskmodel", label: "Risk Modeling", icon: Shield },
  { id: "stress", label: "Stress Testing", icon: Zap },
  { id: "oms", label: "Order Management", icon: TrendingUp },
  { id: "trade", label: "Trade Lifecycle", icon: FileCheck },
  { id: "data", label: "Data Aggregation", icon: Database },
  { id: "compliance", label: "Compliance", icon: Scale },
  { id: "multiasset", label: "Multi-Asset", icon: Layers },
  { id: "valuation", label: "Valuation & Pricing", icon: DollarSign },
  { id: "hedging", label: "Hedging Strategy", icon: Umbrella },
  { id: "exposure", label: "Exposure Dashboard", icon: LayoutDashboard },
  { id: "client", label: "Client Reporting", icon: Users },
  { id: "esg", label: "ESG Integration", icon: Leaf },
  { id: "workflow", label: "Investment Workflow", icon: GitBranch },
] as const;

type ModuleId = typeof modules[number]["id"];

const AugmentDashboard = ({ stocks }: AugmentDashboardProps) => {
  const [activeModule, setActiveModule] = useState<ModuleId>("portfolio");

  const renderModule = () => {
    switch (activeModule) {
      case "portfolio": return <PortfolioConstructionModule stocks={stocks} />;
      case "benchmark": return <BenchmarkModule stocks={stocks} />;
      case "riskmodel": return <RiskModelingModule stocks={stocks} />;
      case "stress": return <StressTestModule stocks={stocks} />;
      case "oms": return <OrderManagementModule stocks={stocks} />;
      case "trade": return <TradeLifecycleModule />;
      case "data": return <DataAggregationModule />;
      case "compliance": return <ComplianceModule stocks={stocks} />;
      case "multiasset": return <MultiAssetModule stocks={stocks} />;
      case "valuation": return <ValuationModule stocks={stocks} />;
      case "hedging": return <HedgingModule stocks={stocks} />;
      case "exposure": return <ExposureDashboardModule stocks={stocks} />;
      case "client": return <ClientReportingModule stocks={stocks} />;
      case "esg": return <ESGModule stocks={stocks} />;
      case "workflow": return <WorkflowModule stocks={stocks} />;
    }
  };

  return (
    <div className="space-y-4">
      {/* Module selector */}
      <div className="rounded-xl border border-border bg-card p-4">
        <div className="flex flex-wrap gap-1.5">
          {modules.map((m) => {
            const Icon = m.icon;
            const active = activeModule === m.id;
            return (
              <button
                key={m.id}
                onClick={() => setActiveModule(m.id)}
                className={`flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-medium transition-all ${
                  active
                    ? "bg-foreground text-background"
                    : "bg-surface-2 text-muted-foreground hover:bg-surface-3 hover:text-foreground"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                {m.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Active module content */}
      <div className="animate-fade-in">{renderModule()}</div>
    </div>
  );
};

export default AugmentDashboard;
