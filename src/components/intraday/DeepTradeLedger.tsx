import { BookOpen, BarChart3, Activity } from "lucide-react";
import { useLodgers } from "@/hooks/useLodgers";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import LodgerLedger from "./LodgerLedger";
import EdgeGraph from "./EdgeGraph";

/**
 * Full Lodger Ledger surface — lives inside the Risk tab as a sub-tab.
 * Mode-agnostic: persists the trader's edge graph regardless of intraday toggle.
 */
const DeepTradeLedger = () => {
  const lodgers = useLodgers();

  return (
    <div className="rounded-sm border border-border bg-card">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <Activity className="h-3.5 w-3.5 text-primary" />
        <h3 className="text-[11px] font-mono uppercase tracking-wider text-foreground">
          Deep Trade Ledger
        </h3>
        <Badge variant="outline" className="text-[9px] font-mono ml-auto">
          {lodgers.trades.length} closed lodges
        </Badge>
        <span className="text-[9px] font-mono text-muted-foreground">
          Sharpe<sub>30</sub>{" "}
          <span className="text-foreground">{lodgers.sharpe.toFixed(2)}</span>
        </span>
        <span className="text-[9px] font-mono text-muted-foreground">
          Sortino<sub>30</sub>{" "}
          <span className="text-foreground">{lodgers.sortino.toFixed(2)}</span>
        </span>
        <span className="text-[9px] font-mono text-muted-foreground">
          DD-elasticity{" "}
          <span className="text-foreground">
            {(lodgers.elasticity * 100).toFixed(0)}%
          </span>
        </span>
      </div>

      <Tabs defaultValue="ledger" className="w-full p-3">
        <TabsList className="h-8">
          <TabsTrigger value="ledger" className="text-[10px] font-mono uppercase">
            <BookOpen className="h-3 w-3 mr-1" /> Ledger
          </TabsTrigger>
          <TabsTrigger value="graph" className="text-[10px] font-mono uppercase">
            <BarChart3 className="h-3 w-3 mr-1" /> Edge Graph
          </TabsTrigger>
        </TabsList>
        <TabsContent value="ledger" className="mt-3">
          <LodgerLedger trades={lodgers.trades} />
        </TabsContent>
        <TabsContent value="graph" className="mt-3">
          <EdgeGraph
            histogram={lodgers.histogram}
            decay={lodgers.decay}
            overtrade={lodgers.overtrade}
            equityCurve={lodgers.equityCurve}
            envelopes={lodgers.envelopes}
            trades={lodgers.trades}
          />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default DeepTradeLedger;