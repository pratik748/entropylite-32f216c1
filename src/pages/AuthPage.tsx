import { useEffect, useState } from "react";
import { lovable } from "@/integrations/lovable/index";
import { toast } from "sonner";
import { Loader2, Lock } from "lucide-react";
import Wordmark from "@/components/marketing/Wordmark";

const CAPABILITY_ROWS = [
  { k: "Monte Carlo engine", v: "10,000 paths / asset" },
  { k: "Risk surface", v: "VaR · CVaR · 95 / 99" },
  { k: "Constraint detection", v: "CLANK · continuous" },
  { k: "Intelligence layers", v: "12 in parallel" },
];

export default function AuthPage() {
  const [loading, setLoading] = useState<string | null>(null);
  const [utc, setUtc] = useState("");

  useEffect(() => {
    document.title = "Authenticate | Entropy";
    const tick = () => setUtc(new Date().toISOString().slice(11, 19));
    tick();
    const iv = setInterval(tick, 1000);
    return () => clearInterval(iv);
  }, []);

  const handleOAuth = async (provider: "google" | "apple") => {
    setLoading(provider);
    try {
      const result = await lovable.auth.signInWithOAuth(provider, {
        redirect_uri: window.location.origin + "/dashboard",
      });
      // If the browser is about to redirect, keep the spinner — don't clear loading.
      if ((result as any)?.redirected) return;
      if ((result as any)?.error) {
        toast.error((result as any).error.message || "Sign in failed");
      }
    } catch (e: any) {
      toast.error(e?.message || "Sign in failed");
    }
    setLoading(null);
  };

  return (
    <div className="site-public min-h-screen bg-carbon-950 text-white grid grid-cols-1 lg:grid-cols-2">
      {/* ── Left · the institution ── */}
      <div className="bg-carbon-950 lg:border-r border-hairline flex flex-col">
        <div className="flex items-center justify-between px-7 sm:px-10 h-14 sm:h-16 border-b border-hairline">
          <Wordmark light compact />
          <span className="mkt-num text-[10px] text-white/35 hidden sm:inline">{utc} UTC</span>
        </div>

        <div className="flex-1 flex flex-col justify-center px-7 sm:px-10 py-10 lg:py-0">
          <div className="flex items-center gap-3 mb-7">
            <span className="h-px w-8 bg-hairline-strong" />
            <span className="mkt-label text-[10px] text-white/55">Secure gateway</span>
          </div>
          <h1 className="mkt-display-2 max-w-md text-white">
            Probabilistic market
            <br />
            <span className="text-white/40">infrastructure.</span>
          </h1>

          <div className="mt-10 max-w-sm border-t border-hairline hidden sm:block">
            {CAPABILITY_ROWS.map((r) => (
              <div key={r.k} className="flex items-baseline justify-between border-b border-hairline py-3.5">
                <span className="text-[12.5px] tracking-tight text-white/50">{r.k}</span>
                <span className="mkt-num text-[11px] text-white/80">{r.v}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Right · authentication ── */}
      <div className="flex items-center justify-center px-5 py-14 lg:py-0 max-lg:border-t border-hairline">
        <div className="w-full max-w-sm">
          <div className="mb-10">
            <h2 className="text-[22px] font-semibold tracking-tight mb-2 text-white">Authenticate</h2>
            <p className="text-[13.5px] text-white/45 leading-relaxed">
              Sign in to open your terminal. Sessions are encrypted end-to-end
              and your portfolio never trains shared models.
            </p>
          </div>

          <div className="space-y-3">
            <button
              onClick={() => handleOAuth("google")}
              disabled={!!loading}
              className="flex w-full h-12 items-center justify-center gap-3 bg-white text-[13.5px] font-semibold tracking-tight text-carbon-950 hover:bg-white/85 transition-colors duration-150 ease-out disabled:opacity-60"
            >
              {loading === "google" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <svg className="h-4 w-4" viewBox="0 0 24 24">
                  <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
                  <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                  <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                  <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
                </svg>
              )}
              Continue with Google
            </button>

            <button
              onClick={() => handleOAuth("apple")}
              disabled={!!loading}
              className="flex w-full h-12 items-center justify-center gap-3 border border-hairline-strong text-[13.5px] font-medium tracking-tight text-white/85 hover:border-white/40 hover:text-white transition-colors duration-150 ease-out disabled:opacity-60"
            >
              {loading === "apple" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
                </svg>
              )}
              Continue with Apple
            </button>
          </div>

          <div className="mt-10 flex items-center gap-2.5 border-t border-hairline pt-6">
            <Lock className="h-3 w-3 text-white/30" />
            <p className="mkt-label text-[8px] text-white/30">
              Encrypted session · No card required · Founding access
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
