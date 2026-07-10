import { useEffect, useState, type ReactNode } from "react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command";
import { supabase } from "@/integrations/supabase/client";
import { emitUIEvent } from "@/foresight/uiBus";
import { Command, LogOut, Zap } from "lucide-react";

export interface PaletteTab {
  id: string;
  label: string;
  icon: ReactNode;
}

interface CommandPaletteProps {
  tabs: PaletteTab[];
  onSelectTab: (id: string) => void;
  onOpenBrief?: () => void;
  onToggleDirectProfit: () => void;
}

/**
 * ⌘K command palette — Spotlight for the terminal. Every screen and key
 * action, one keystroke away. Also opens with Ctrl+K.
 */
const CommandPalette = ({ tabs, onSelectTab, onOpenBrief, onToggleDirectProfit }: CommandPaletteProps) => {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === "k" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const run = (fn: () => void) => {
    setOpen(false);
    fn();
  };

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Search screens and actions…" />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>
        <CommandGroup heading="Go to">
          {tabs.map((tab) => (
            <CommandItem key={tab.id} value={tab.label} onSelect={() => run(() => onSelectTab(tab.id))}>
              <span className="mr-2 flex h-4 w-4 items-center justify-center text-muted-foreground">{tab.icon}</span>
              {tab.label}
            </CommandItem>
          ))}
        </CommandGroup>
        <CommandSeparator />
        <CommandGroup heading="Actions">
          <CommandItem value="Ask Foresight" onSelect={() => run(() => emitUIEvent("open_surface", {}))}>
            <Command className="mr-2 h-4 w-4 text-muted-foreground" />
            Ask Foresight
            <CommandShortcut>⌘J</CommandShortcut>
          </CommandItem>
          <CommandItem value="Direct Profit Mode" onSelect={() => run(onToggleDirectProfit)}>
            <Zap className="mr-2 h-4 w-4 text-muted-foreground" />
            Toggle Direct Profit mode
          </CommandItem>
          <CommandItem value="Sign out" onSelect={() => run(() => supabase.auth.signOut())}>
            <LogOut className="mr-2 h-4 w-4 text-muted-foreground" />
            Sign out
            <CommandShortcut>⇧⌘Q</CommandShortcut>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  );
};

export default CommandPalette;
