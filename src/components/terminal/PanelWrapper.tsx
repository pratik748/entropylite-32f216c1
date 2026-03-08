import { useState, type ReactNode } from "react";
import { Maximize2, Minimize2 } from "lucide-react";

interface PanelWrapperProps {
  title: string;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
  noPad?: boolean;
}

const PanelWrapper = ({ title, icon, children, className = "", noPad }: PanelWrapperProps) => {
  const [expanded, setExpanded] = useState(false);

  const content = (
    <div className={`flex flex-col h-full border border-border rounded bg-card overflow-hidden ${expanded ? "fixed inset-0 z-50" : ""} ${className}`}>
      <div className="flex items-center justify-between px-2.5 py-1.5 border-b border-border bg-surface-2 shrink-0">
        <div className="flex items-center gap-1.5">
          {icon && <span className="text-primary">{icon}</span>}
          <span className="font-mono text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{title}</span>
        </div>
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-muted-foreground hover:text-foreground transition-colors"
        >
          {expanded ? <Minimize2 className="h-3 w-3" /> : <Maximize2 className="h-3 w-3" />}
        </button>
      </div>
      <div className={`flex-1 overflow-auto ${noPad ? "" : "p-2"}`}>
        {children}
      </div>
    </div>
  );

  return content;
};

export default PanelWrapper;
