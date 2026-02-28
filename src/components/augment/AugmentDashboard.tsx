import { useState } from "react";
import {
  Briefcase, BarChart3, Shield, Zap, FileCheck, Database,
  Scale, Layers, DollarSign, Umbrella, LayoutDashboard, Users,
  Leaf, GitBranch, TrendingUp, ArrowRight,
} from "lucide-react";
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

const modules = [
  { id: "portfolio", label: "Portfolio Construction", icon: Briefcase, color: "text-foreground" },
  { id: "benchmark", label: "Benchmark & Attribution", icon: BarChart3, color: "text-foreground" },
  { id: "riskmodel", label: "Risk Modeling", icon: Shield, color: "text-foreground" },
  { id: "stress", label: "Stress Testing", icon: Zap, color: "text-foreground" },
  { id: "oms", label: "Order Management", icon: TrendingUp, color: "text-foreground" },
  { id: "trade", label: "Trade Lifecycle", icon: FileCheck, color: "text-foreground" },
  { id: "data", label: "Data Aggregation", icon: Database, color: "text-foreground" },
  { id: "compliance", label: "Compliance", icon: Scale, color: "text-foreground" },
  { id: "multiasset", label: "Multi-Asset", icon: Layers, color: "text-foreground" },
  { id: "valuation", label: "Valuation & Pricing", icon: DollarSign, color: "text-foreground" },
  { id: "hedging", label: "Hedging Strategy", icon: Umbrella, color: "text-foreground" },
  { id: "exposure", label: "Exposure Dashboard", icon: LayoutDashboard, color: "text-foreground" },
  { id: "client", label: "Client Reporting", icon: Users, color: "text-foreground" },
  { id: "esg", label: "ESG Integration", icon: Leaf, color: "text-foreground" },
  { id: "workflow", label: "Investment Workflow", icon: GitBranch, color: "text-foreground" },
] as const;

type ModuleId = typeof modules[number]["id"];

const AugmentDashboard = () => {
  const [activeModule, setActiveModule] = useState<ModuleId>("portfolio");

  const renderModule = () => {
    switch (activeModule) {
      case "portfolio": return <PortfolioConstructionModule />;
      case "benchmark": return <BenchmarkModule />;
      case "riskmodel": return <RiskModelingModule />;
      case "stress": return <StressTestModule />;
      case "oms": return <OrderManagementModule />;
      case "trade": return <TradeLifecycleModule />;
      case "data": return <DataAggregationModule />;
      case "compliance": return <ComplianceModule />;
      case "multiasset": return <MultiAssetModule />;
      case "valuation": return <ValuationModule />;
      case "hedging": return <HedgingModule />;
      case "exposure": return <ExposureDashboardModule />;
      case "client": return <ClientReportingModule />;
      case "esg": return <ESGModule />;
      case "workflow": return <WorkflowModule />;
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
