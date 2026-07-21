import { CheckCircle2, CircleDashed, Database, Gauge, Newspaper, Shield, Sigma } from "lucide-react";
import { motion } from "framer-motion";
import { staggerContainer, staggerItem } from "@/lib/motion";

const stages = [
  { label: "Request accepted", detail: "symbol, position size and base-currency context locked", icon: Database, state: "complete" },
  { label: "Market data acquisition", detail: "quote, history and session context are being resolved", icon: Sigma, state: "active" },
  { label: "Risk and evidence pass", detail: "queued until source data is present", icon: Shield, state: "pending" },
  { label: "News and provenance", detail: "recency, source coverage and conflicts checked after fetch", icon: Newspaper, state: "pending" },
  { label: "Decision synthesis", detail: "withheld until quantitative and evidence layers reconcile", icon: Gauge, state: "pending" },
];

const LoadingState = () => {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col py-12">
      <div className="state-panel border border-border bg-card">
        <div className="border-b border-border px-5 py-4">
          <p className="data-label">Analysis pass in progress</p>
          <h2 className="mt-1 text-title-3 text-foreground">Building an evidence-weighted decision record</h2>
          <p className="mt-2 max-w-xl text-footnote text-muted-foreground">
            This state reports the actual dependency order. No synthetic progress percentage is shown because the run completes only when required sources return.
          </p>
        </div>
        <motion.div className="divide-y divide-border/70" variants={staggerContainer} initial="hidden" animate="visible">
          {stages.map(({ label, detail, icon: Icon, state }) => (
            <motion.div key={label} variants={staggerItem} className="grid grid-cols-[28px_1fr_auto] items-center gap-3 px-5 py-3">
              <Icon className="h-3.5 w-3.5 text-muted-foreground" strokeWidth={1.65} />
              <div>
                <div className="text-[12px] font-semibold tracking-tight text-foreground">{label}</div>
                <div className="text-[10.5px] text-muted-foreground">{detail}</div>
              </div>
              {state === "complete" ? (
                <CheckCircle2 className="h-3.5 w-3.5 text-gain" strokeWidth={1.75} />
              ) : state === "active" ? (
                <span className="flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground">
                  <CircleDashed className="h-3 w-3 animate-spin" /> Evaluating
                </span>
              ) : (
                <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-muted-foreground/55">Queued</span>
              )}
            </motion.div>
          ))}
        </motion.div>
      </div>
    </div>
  );
};

export default LoadingState;
