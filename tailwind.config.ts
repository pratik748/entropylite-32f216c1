import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./pages/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  prefix: "",
  theme: {
    container: {
      center: true,
      padding: {
        DEFAULT: "1rem",
        sm: "1.25rem",
        lg: "2rem",
      },
      screens: {
        "2xl": "1480px",
      },
    },
    extend: {
      fontFamily: {
        sans: [
          "IBM Plex Sans",
          "-apple-system",
          "BlinkMacSystemFont",
          "system-ui",
          "sans-serif",
        ],
        mono: ["IBM Plex Mono", "ui-monospace", "SF Mono", "monospace"],
        display: ["Source Serif 4", "Georgia", "Times New Roman", "serif"],
      },
      letterSpacing: {
        tightest: "-0.04em",
        tighter: "-0.025em",
        eyebrow: "0.08em",
      },
      boxShadow: {
        soft: "var(--shadow-1)",
        "soft-lg": "var(--shadow-2)",
        "soft-xl": "var(--shadow-3)",
        "ring-soft": "0 0 0 1px hsl(var(--border))",
      },
      transitionTimingFunction: {
        "out-quart": "cubic-bezier(0.25, 1, 0.5, 1)",
        "out-expo": "cubic-bezier(0.16, 1, 0.3, 1)",
        spring: "cubic-bezier(0.34, 1.3, 0.64, 1)",
      },
      colors: {
        /* Public-site foreground. Routed through a CSS var (default pure
           white) so the marketing site can invert to ink under the device's
           light system theme without touching any component. */
        white: "rgb(var(--pub-white) / <alpha-value>)",
        /* Fixed institutional palette for the public site (theme-independent).
           Pure monochrome: ink blacks, paper white — no accent hue. */
        ink: {
          DEFAULT: "#0A0A0B",
          950: "#050506",
          900: "#0A0A0B",
          800: "#131315",
          700: "#1C1C1F",
          600: "#27272B",
          500: "#3A3A40",
        },
        paper: "#FFFFFF",
        capital: {
          DEFAULT: "#3A3A40",
          bright: "#D9D9DE",
          soft: "#A3A3AB",
        },
        /* ── Public-site institutional dark system (fixed, theme-independent) ──
           Elevation is expressed through surface steps, never shadows. */
        carbon: {
          950: "rgb(var(--pub-carbon-950) / <alpha-value>)", // page base
          900: "rgb(var(--pub-carbon-900) / <alpha-value>)", // raised band / global chrome
          850: "rgb(var(--pub-carbon-850) / <alpha-value>)", // panel
          800: "rgb(var(--pub-carbon-800) / <alpha-value>)", // elevated panel
          750: "rgb(var(--pub-carbon-750) / <alpha-value>)", // hover / active surface
        },
        hairline: {
          faint: "rgb(var(--pub-hairline-faint) / <alpha-value>)",
          DEFAULT: "rgb(var(--pub-hairline) / <alpha-value>)",
          strong: "rgb(var(--pub-hairline-strong) / <alpha-value>)",
        },
        /* Functional accents only. signal = live/active market data (amber);
           pos/neg = gains/losses; gilt = premium/strategic, used rarely. */
        signal: {
          DEFAULT: "#E8912D",
          bright: "#F5A83C",
          dim: "#8A5E24",
        },
        pos: "#4E9E72",
        neg: "#C4564F",
        gilt: "#9E7E3C",
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        gain: "hsl(var(--gain))",
        loss: "hsl(var(--loss))",
        warning: "hsl(var(--warning))",
        info: "hsl(var(--info))",
        surface: {
          1: "hsl(var(--surface-1))",
          2: "hsl(var(--surface-2))",
          3: "hsl(var(--surface-3))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar-background))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
      },
      borderRadius: {
        "4xl": "2rem",
        "3xl": "1.75rem",
        "2xl": "1.375rem",
        xl: "calc(var(--radius) + 4px)",
        lg: "var(--radius)",
        md: "calc(var(--radius) - 4px)",
        sm: "calc(var(--radius) - 8px)",
      },
      keyframes: {
        "accordion-down": {
          from: { height: "0" },
          to: { height: "var(--radix-accordion-content-height)" },
        },
        "accordion-up": {
          from: { height: "var(--radix-accordion-content-height)" },
          to: { height: "0" },
        },
        "pulse-glow": {
          "0%, 100%": { opacity: "0.4" },
          "50%": { opacity: "1" },
        },
        "slide-up": {
          from: { opacity: "0", transform: "translateY(10px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        "scale-in": {
          from: { opacity: "0", transform: "scale(0.96)" },
          to: { opacity: "1", transform: "scale(1)" },
        },
      },
      animation: {
        "accordion-down": "accordion-down 0.3s cubic-bezier(0.25, 1, 0.5, 1)",
        "accordion-up": "accordion-up 0.3s cubic-bezier(0.25, 1, 0.5, 1)",
        "pulse-glow": "pulse-glow 2s ease-in-out infinite",
        "slide-up": "slide-up 0.45s cubic-bezier(0.16, 1, 0.3, 1)",
        "fade-in": "fade-in 0.3s cubic-bezier(0.25, 1, 0.5, 1)",
        "scale-in": "scale-in 0.35s cubic-bezier(0.16, 1, 0.3, 1)",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
} satisfies Config;
