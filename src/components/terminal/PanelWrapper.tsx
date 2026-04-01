import { useState, type ReactNode } from "react";
import { Maximize2, Minimize2, ChevronDown, ChevronRight } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface PanelWrapperProps {
  title: string;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
  noPad?: boolean;
  collapsible?: boolean;
  defaultCollapsed?: boolean;
}

const PanelWrapper = ({ title, icon, children, className = "", noPad, collapsible, defaultCollapsed }: PanelWrapperProps) => {
  const [expanded, setExpanded] = useState(false);
  const [collapsed, setCollapsed] = useState(defaultCollapsed ?? false);

  const content = (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
      className={`flex flex-col h-full border border-border bg-card ${expanded ? "fixed inset-0 z-50" : ""} ${className}`}
    >
      <div className="flex items-center justify-between px-2 py-1 border-b border-border bg-surface-2 shrink-0">
        <div
          className={`flex items-center gap-1.5 ${collapsible ? "cursor-pointer select-none" : ""}`}
          onClick={collapsible ? () => setCollapsed(!collapsed) : undefined}
        >
          {collapsible && (
            <motion.span
              animate={{ rotate: collapsed ? 0 : 90 }}
              transition={{ duration: 0.2 }}
            >
              <ChevronRight className="h-3 w-3 text-muted-foreground" />
            </motion.span>
          )}
          {icon && <span className="text-primary">{icon}</span>}
          <span className="font-mono text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">{title}</span>
        </div>
        {!collapsed && (
          <motion.button
            whileTap={{ scale: 0.85 }}
            onClick={() => setExpanded(!expanded)}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            {expanded ? <Minimize2 className="h-3 w-3" /> : <Maximize2 className="h-3 w-3" />}
          </motion.button>
        )}
      </div>
      <AnimatePresence>
        {!collapsed && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className={`flex-1 overflow-auto ${noPad ? "" : "p-2"}`}
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );

  return content;
};

export default PanelWrapper;
