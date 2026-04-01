import { useState, useEffect } from "react";
import { Sun, Moon } from "lucide-react";

const ThemeToggle = () => {
  const [light, setLight] = useState(() => {
    if (typeof window !== "undefined") {
      return localStorage.getItem("entropy-theme") === "light";
    }
    return false;
  });

  useEffect(() => {
    const root = document.documentElement;
    if (light) {
      root.classList.add("light");
      localStorage.setItem("entropy-theme", "light");
    } else {
      root.classList.remove("light");
      localStorage.setItem("entropy-theme", "dark");
    }
  }, [light]);

  return (
    <button
      onClick={() => setLight((v) => !v)}
      className="fixed bottom-8 left-3 z-50 p-1.5 rounded bg-surface-2 border border-border hover:border-primary/40 transition-colors"
      title={light ? "Switch to dark" : "Switch to light"}
    >
      {light ? (
        <Moon className="h-3.5 w-3.5 text-foreground" />
      ) : (
        <Sun className="h-3.5 w-3.5 text-muted-foreground" />
      )}
    </button>
  );
};

export default ThemeToggle;
