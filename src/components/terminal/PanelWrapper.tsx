import { useMemo, useState, type ReactNode } from "react";
import { Maximize2, Minimize2, ChevronRight } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { springGentle, pressableIcon } from "@/lib/motion";
import { useForesightTarget } from "@/foresight/uiBus";

interface PanelWrapperProps {
  title: string;
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
  noPad?: boolean;
  collapsible?: boolean;
  defaultCollapsed?: boolean;
}

/**
 * Terminal panel chassis. Every workspace panel shares this construction:
 * a hairline frame, an uppercase micro-label header with a capital-blue
 * index tick, and full-screen / collapse controls.
 */
const PanelWrapper = ({ title, icon, children, className = "", noPad, collapsible, defaultCollapsed }: PanelWrapperProps) => {
  const [expanded, setExpanded] = useState(false);
  const [collapsed, setCollapsed] = useState(defaultCollapsed ?? false);

  // Every panel is addressable by Foresight's ui.highlight through a stable
  // id derived from its title (e.g. "Monte Carlo" → panel.monte-carlo).
  const targetId = useMemo(
    () => `panel.${title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`,
    [title],
  );
  const targetProps = useForesightTarget(targetId, title);

  const content = (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={springGentle}
      data-density="compact"
      {...targetProps}
      className={`flex flex-col h-full border border-border/70 bg-card rounded-xl overflow-hidden shadow-soft transition-shadow duration-300 hover:shadow-soft-lg ${expanded ? "fixed inset-0 z-50 rounded-none" : ""} ${className}`}
    >
      <div className="flex items-center justify-between pl-3 pr-2 h-9 border-b border-border/60 bg-surface-2/50 shrink-0">
        <div
          className={`flex items-center gap-2 min-w-0 ${collapsible ? "cursor-pointer select-none" : ""}`}
          onClick={collapsible ? () => setCollapsed(!collapsed) : undefined}
        >
          {collapsible && (
            <motion.span
              animate={{ rotate: collapsed ? 0 : 90 }}
              transition={springGentle}
              className="shrink-0"
            >
              <ChevronRight className="h-3 w-3 text-muted-foreground" />
            </motion.span>
          )}
          <span className="h-3 w-[2px] rounded-full bg-foreground/60 shrink-0" aria-hidden="true" />
          {icon && <span className="text-muted-foreground shrink-0">{icon}</span>}
          <span className="data-label !text-foreground/80 truncate">{title}</span>
        </div>
        {!collapsed && (
          <motion.button
            {...pressableIcon}
            onClick={() => setExpanded(!expanded)}
            aria-label={expanded ? "Exit full screen" : "Enter full screen"}
            className="text-muted-foreground/70 hover:text-foreground transition-colors p-1.5 rounded-md hover:bg-accent shrink-0"
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
