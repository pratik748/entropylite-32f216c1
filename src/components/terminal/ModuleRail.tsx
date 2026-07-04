import type { ReactNode } from "react";
import { motion } from "framer-motion";
import { springLayout } from "@/lib/motion";

export interface ModuleDef {
  id: string;
  label: string;
  icon: ReactNode;
}

interface ModuleRailProps {
  modules: ModuleDef[];
  activeId: string;
  onSelect: (id: string) => void;
}

/**
 * Workspace module rail — the terminal's primary navigation.
 * A quiet vertical column of monochrome instruments; the active module
 * carries a sliding highlight and a capital-blue index line.
 */
const ModuleRail = ({ modules, activeId, onSelect }: ModuleRailProps) => {
  return (
    <nav
      data-density="compact"
      data-tour="tab-bar"
      aria-label="Terminal modules"
      className="hidden md:flex w-[76px] shrink-0 flex-col items-center gap-1 border-r border-border/70 bg-surface-1/60 py-2.5 overflow-y-auto scrollbar-hide"
    >
      {modules.map((m) => {
        const active = m.id === activeId;
        return (
          <button
            key={m.id}
            onClick={() => onSelect(m.id)}
            data-tour-tab={m.id}
            aria-current={active ? "page" : undefined}
            title={m.label}
            className={`relative flex w-[60px] flex-col items-center gap-1 rounded-xl px-1 py-2 transition-colors duration-200 ${
              active ? "text-foreground" : "text-muted-foreground/75 hover:text-foreground"
            }`}
          >
            {active && (
              <motion.span
                layoutId="rail-active"
                transition={springLayout}
                className="absolute inset-0 rounded-xl border border-border/80 bg-surface-3/80 shadow-soft"
              />
            )}
            {active && (
              <motion.span
                layoutId="rail-index"
                transition={springLayout}
                className="absolute -left-2 top-1/2 h-5 w-[2.5px] -translate-y-1/2 rounded-full bg-info"
              />
            )}
            <span className="relative z-10 flex h-6 w-6 items-center justify-center">
              {m.icon}
            </span>
            <span className="relative z-10 text-[8.5px] font-semibold uppercase tracking-[0.08em] leading-none">
              {m.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
};

/** Horizontal module strip for compact widths — same grammar, one row. */
export const ModuleStrip = ({ modules, activeId, onSelect }: ModuleRailProps) => {
  return (
    <nav
      data-density="compact"
      data-tour="tab-bar"
      aria-label="Terminal modules"
      className="md:hidden flex items-center gap-0.5 overflow-x-auto scrollbar-hide mask-fade-x border-b border-border/70 bg-surface-1/60 px-2 py-1.5 shrink-0"
      style={{ scrollSnapType: "x mandatory" }}
    >
      {modules.map((m) => {
        const active = m.id === activeId;
        return (
          <button
            key={m.id}
            onClick={() => onSelect(m.id)}
            data-tour-tab={m.id}
            style={{ scrollSnapAlign: "start" }}
            aria-current={active ? "page" : undefined}
            className={`relative flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-1.5 text-[12px] font-semibold tracking-tight flex-shrink-0 transition-colors duration-200 ${
              active ? "text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {active && (
              <motion.span
                layoutId="strip-active"
                transition={springLayout}
                className="absolute inset-0 rounded-lg border border-border/80 bg-surface-3/80"
              />
            )}
            <span className="relative z-10 flex h-4 w-4 items-center justify-center">{m.icon}</span>
            <span className="relative z-10">{m.label}</span>
          </button>
        );
      })}
    </nav>
  );
};

export default ModuleRail;
