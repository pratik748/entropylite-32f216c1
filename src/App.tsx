import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { useEffect, useState, useRef } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { Session } from "@supabase/supabase-js";
import Index from "./pages/Index";
import NotFound from "./pages/NotFound";
import AuthPage from "./pages/AuthPage";
import ResetPasswordPage from "./pages/ResetPasswordPage";
import LandingPage from "./pages/LandingPage";
import PricingPage from "./pages/PricingPage";
import AboutPage from "./pages/AboutPage";
import AccessPage from "./pages/AccessPage";
import DataAggregationPage from "./pages/DataAggregationPage";
import DisclaimerPage from "./pages/DisclaimerPage";
import BackbonePage from "./pages/BackbonePage";
import CadencePage from "./pages/CadencePage";
import CadenceEntryPage from "./pages/CadenceEntryPage";
import CompanyWorkstationPage from "./pages/CompanyWorkstationPage";

const queryClient = new QueryClient();

// Synchronously sniff localStorage for an existing Supabase session so returning
// users skip the loading splash entirely. We only block render when an OAuth
// redirect is in progress (URL has a code/access_token).
function readCachedSession(): boolean {
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith("sb-") && k.endsWith("-auth-token")) {
        const raw = localStorage.getItem(k);
        if (raw && raw.length > 20) return true;
      }
    }
  } catch {}
  return false;
}

function isOAuthReturn(): boolean {
  if (typeof window === "undefined") return false;
  const h = window.location.hash || "";
  const s = window.location.search || "";
  return h.includes("access_token=") || h.includes("error=") || s.includes("code=");
}

function AuthGate({ children }: { children: React.ReactNode }) {
  const cachedHasSession = readCachedSession();
  const oauthReturn = isOAuthReturn();
  const [session, setSession] = useState<Session | null>(cachedHasSession ? ({} as Session) : null);
  // Only show splash while we're processing an OAuth redirect.
  const [loading, setLoading] = useState(oauthReturn);
  const initialized = useRef(false);

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
        setLoading(false);
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-muted-foreground text-sm tracking-tight animate-breathe">Signing you in…</p>
      </div>
    );
  }

  if (!session) return <AuthPage />;

  return <>{children}</>;
}

/**
 * The terminal follows the device colour scheme — no manual toggle. Device
 * dark → the unclassed :root (pure-black terminal); device light → .light.
 * Listens live so a system switch reflows without a reload, and clears any
 * stale preference left by the removed toggle.
 */
function SystemThemeSync() {
  useEffect(() => {
    const root = document.documentElement;
    const mq = window.matchMedia("(prefers-color-scheme: light)");
    const apply = () => {
      root.classList.remove("palantir");
      root.classList.toggle("light", mq.matches);
    };
    apply();
    mq.addEventListener("change", apply);
    try { localStorage.removeItem("entropy-theme"); } catch { /* ignore */ }
    return () => mq.removeEventListener("change", apply);
  }, []);
  return null;
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <SystemThemeSync />
      <Toaster />
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/pricing" element={<PricingPage />} />
          <Route path="/about" element={<AboutPage />} />
          <Route path="/backbone" element={<BackbonePage />} />
          <Route path="/cadence" element={<CadencePage />} />
          <Route path="/cadence/:slug" element={<CadenceEntryPage />} />
          <Route path="/data" element={<DataAggregationPage />} />
          <Route path="/access" element={<AccessPage />} />
          <Route path="/disclaimer" element={<DisclaimerPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route
            path="/dashboard"
            element={
              <AuthGate>
                <Index />
              </AuthGate>
            }
          />
          <Route
            path="/company/:ticker/:workspaceId?/:sectionId?"
            element={
              <AuthGate>
                <CompanyWorkstationPage />
              </AuthGate>
            }
          />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
