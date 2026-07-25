import { useState, useEffect } from "react";
import { Sun, Moon, Hexagon } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const THEMES = ["light", "dark", "palantir"] as const;
type Theme = (typeof THEMES)[number];

const icons: Record<Theme, React.ReactNode> = {
  dark: <Moon className="h-3 w-3" />,
  palantir: <Hexagon className="h-3 w-3" />,
  light: <Sun className="h-3 w-3" />,
};

const labels: Record<Theme, string> = {
  dark: "Dark",
  palantir: "Paper",
  light: "Light",
};

const ThemeToggle = () => {
  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("entropy-theme");
      if (stored === "light" || stored === "dark" || stored === "palantir") return stored;
    }
    return "light";
  });

  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove("light", "palantir");
    if (theme !== "dark") root.classList.add(theme);
    localStorage.setItem("entropy-theme", theme);
  }, [theme]);

  const cycle = () =>
    setTheme((t) => THEMES[(THEMES.indexOf(t) + 1) % THEMES.length]);

  return (
    <motion.button
      onClick={cycle}
      whileTap={{ scale: 0.92 }}
      whileHover={{ scale: 1.05 }}
      className="hidden sm:flex fixed bottom-3 right-3 z-50 items-center gap-1.5 rounded-full glass-thick px-3 py-1.5 shadow-soft-lg text-[11px] font-medium tracking-tight text-muted-foreground hover:text-foreground transition-colors"
      title={`Theme: ${labels[theme]}`}
    >
      <AnimatePresence mode="wait">
        <motion.span
          key={theme}
          initial={{ rotateY: 90, opacity: 0 }}
          animate={{ rotateY: 0, opacity: 1 }}
          exit={{ rotateY: -90, opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="flex items-center gap-1.5"
        >
          {icons[theme]}
          <span>{labels[theme]}</span>
        </motion.span>
      </AnimatePresence>
    </motion.button>
  );
};

export default ThemeToggle;
