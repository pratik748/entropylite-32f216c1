import { useState, type ReactNode } from "react";
import { Maximize2, Minimize2, ChevronRight } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { springGentle, pressableIcon } from "@/lib/motion";

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
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={springGentle}
      data-density="compact"
      className={`flex flex-col h-full border border-border/70 bg-card rounded-2xl overflow-hidden shadow-soft transition-shadow duration-300 hover:shadow-soft-lg ${expanded ? "fixed inset-0 z-50 rounded-none" : ""} ${className}`}
    >
      <div className="flex items-center justify-between px-3.5 py-2 border-b border-border/50 bg-surface-2/40 shrink-0">
        <div
          className={`flex items-center gap-1.5 ${collapsible ? "cursor-pointer select-none" : ""}`}
          onClick={collapsible ? () => setCollapsed(!collapsed) : undefined}
        >
          {collapsible && (
            <motion.span
              animate={{ rotate: collapsed ? 0 : 90 }}
              transition={springGentle}
            >
              <ChevronRight className="h-3 w-3 text-muted-foreground" />
            </motion.span>
          )}
          {icon && <span className="text-muted-foreground">{icon}</span>}
          <span className="text-[12px] font-semibold tracking-tight text-foreground/85">{title}</span>
        </div>
        {!collapsed && (
          <motion.button
            {...pressableIcon}
            onClick={() => setExpanded(!expanded)}
            aria-label={expanded ? "Exit full screen" : "Enter full screen"}
            className="text-muted-foreground/70 hover:text-foreground transition-colors p-1.5 -m-1 rounded-full hover:bg-accent"
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
            transition={{ duration: 0.32, ease: [0.25, 1, 0.5, 1] }}
            className={`flex-1 overflow-auto ${noPad ? "" : "p-3"}`}
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
