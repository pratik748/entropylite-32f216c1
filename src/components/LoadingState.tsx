import { CheckCircle2, CircleDashed, Database, Gauge, Newspaper, Shield, Sigma } from "lucide-react";
import { motion } from "framer-motion";
import { staggerContainer, staggerItem } from "@/lib/motion";

const stages = [
  { label: "Market data acquired", detail: "quote, currency and session context", icon: Database, state: "complete" },
  { label: "Quantitative structure evaluated", detail: "trend, dispersion and simulated outcomes", icon: Sigma, state: "active" },
  { label: "Risk assessed", detail: "drawdown, tail and position risk", icon: Shield, state: "pending" },
  { label: "Evidence assembled", detail: "news, sentiment and provenance checks", icon: Newspaper, state: "pending" },
  { label: "Decision synthesized", detail: "verdict held until confidence is defensible", icon: Gauge, state: "pending" },
];

const LoadingState = () => {
  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col py-12">
      <div className="border border-border bg-card">
        <div className="border-b border-border px-5 py-4">
          <p className="data-label">Analysis pass in progress</p>
          <h2 className="mt-1 text-title-3 text-foreground">Building an evidence-weighted decision record</h2>
          <p className="mt-2 max-w-xl text-footnote text-muted-foreground">
            The system is exposing completed stages and holding provisional conclusions until the underlying data is available.
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
