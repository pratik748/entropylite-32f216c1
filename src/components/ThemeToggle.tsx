import { useState, useEffect } from "react";
import { Sun, Moon, Shield } from "lucide-react";

const THEMES = ["dark", "palantir", "light"] as const;
type Theme = (typeof THEMES)[number];

const ThemeToggle = () => {
  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("entropy-theme");
      if (stored === "light" || stored === "palantir") return stored;
    }
    return "dark";
  });

  useEffect(() => {
    const root = document.documentElement;
    root.classList.remove("light", "palantir");
    if (theme !== "dark") root.classList.add(theme);
    localStorage.setItem("entropy-theme", theme);
  }, [theme]);

  const cycle = () =>
    setTheme((t) => THEMES[(THEMES.indexOf(t) + 1) % THEMES.length]);

  const icon =
    theme === "light" ? (
      <Moon className="h-3 w-3" />
    ) : theme === "palantir" ? (
      <Shield className="h-3 w-3" />
    ) : (
      <Sun className="h-3 w-3" />
    );

  const label = theme === "dark" ? "Dark" : theme === "palantir" ? "Palantir" : "Light";

  return (
    <button
      onClick={cycle}
      className="fixed bottom-4 right-3 z-50 flex items-center gap-1.5 px-2 py-1 rounded bg-surface-2 border border-border hover:border-primary/40 transition-colors text-[10px] font-mono uppercase tracking-wider text-muted-foreground hover:text-foreground"
      title={`Theme: ${label}`}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
};

export default ThemeToggle;
