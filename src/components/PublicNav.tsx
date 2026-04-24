import { useNavigate, useLocation } from "react-router-dom";
import { useState } from "react";
import { Menu, X, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import entropyLogoFull from "@/assets/entropy-logo-full.jpeg";

const NAV_LINKS = [
  { label: "About", path: "/about" },
  { label: "Backbone", path: "/backbone" },
  { label: "Cadence", path: "/cadence" },
  { label: "Pricing", path: "/pricing" },
  { label: "Access", path: "/access" },
];

export default function PublicNav() {
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);

  return (
    <nav className="sticky top-0 z-50 bg-white/85 backdrop-blur-xl border-b border-black/[0.06]">
      <div className="max-w-6xl mx-auto flex items-center justify-between px-4 sm:px-6 h-16">
        <button onClick={() => navigate("/")} className="flex items-center">
          <img src={entropyLogoFull} alt="Entropy Lite" className="h-9 object-contain" />
        </button>

        {/* Desktop nav */}
        <div className="hidden sm:flex items-center gap-7">
          {NAV_LINKS.filter((l) => l.path !== location.pathname).map((l) => (
            <button
              key={l.path}
              onClick={() => navigate(l.path)}
              className="font-mono text-[11px] tracking-wide text-black/55 hover:text-black transition-colors"
            >
              {l.label}
            </button>
          ))}
          <span className="font-mono text-[9px] text-black/30 tracking-[0.15em] hidden md:inline">by Pratik Sehwag</span>
          <Button
            size="sm"
            className="bg-black text-white hover:bg-black/85 font-mono text-xs tracking-wide rounded-full px-4 h-9"
            onClick={() => navigate("/dashboard")}
          >
            Sign In <ArrowRight className="ml-1 h-3 w-3" />
          </Button>
        </div>

        {/* Mobile: Sign In + Hamburger */}
        <div className="flex sm:hidden items-center gap-2">
          <Button
            size="sm"
            className="bg-black text-white hover:bg-black/85 font-mono text-[11px] tracking-wide h-9 px-4 rounded-full"
            onClick={() => navigate("/dashboard")}
          >
            Sign In
          </Button>
          <button
            onClick={() => setOpen((p) => !p)}
            className="p-2 -mr-2 text-black/70 rounded-md hover:bg-black/[0.04] transition-colors"
            aria-label="Menu"
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Mobile drawer */}
      {open && (
        <div className="sm:hidden border-t border-black/[0.06] bg-white px-4 pb-5 pt-3 space-y-1 animate-in slide-in-from-top-2 duration-200">
          {NAV_LINKS.map((l) => (
            <button
              key={l.path}
              onClick={() => { navigate(l.path); setOpen(false); }}
              className={`block w-full text-left font-mono text-[13px] tracking-wide py-3.5 px-3 rounded-xl transition-colors ${
                location.pathname === l.path
                  ? "bg-black/5 text-black font-semibold"
                  : "text-black/65 hover:bg-black/[0.03] active:bg-black/5"
              }`}
            >
              {l.label}
            </button>
          ))}
          <div className="pt-3 border-t border-black/[0.06] mt-3">
            <p className="font-mono text-[9px] text-black/30 tracking-[0.15em] px-3 uppercase">by Pratik Sehwag</p>
          </div>
        </div>
      )}
    </nav>
  );
}
