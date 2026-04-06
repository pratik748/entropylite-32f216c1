import { useState } from "react";
import { lovable } from "@/integrations/lovable/index";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import entropyLogo from "@/assets/entropy-logo-auth.jpeg";
import authBg from "@/assets/auth-bg-horse.jpeg";

export default function AuthPage() {
  const [loading, setLoading] = useState<string | null>(null);

  const handleOAuth = async (provider: "google" | "apple") => {
    setLoading(provider);
    const { error } = await lovable.auth.signInWithOAuth(provider, {
      redirect_uri: window.location.origin,
    });
    if (error) toast.error(error.message || "Sign in failed");
    setLoading(null);
  };

  return (
    <div className="min-h-screen relative flex items-center justify-center overflow-hidden bg-white">
      {/* Load signature font */}
      <link
        href="https://fonts.googleapis.com/css2?family=Pinyon+Script&display=swap"
        rel="stylesheet"
      />

      {/* Background image with subtle blur for glass aesthetic */}
      <img
        src={authBg}
        alt=""
        className="absolute inset-0 w-full h-full object-cover object-center blur-[2px]"
      />
      {/* Light frosted overlay */}
      <div className="absolute inset-0 bg-white/20" />

      {/* Single centered card — everything in one block, no overlaps */}
      <div className="relative z-10 w-full max-w-sm mx-4 flex flex-col items-center gap-8 px-8 py-10 rounded-sm border border-white/40 bg-white/30 backdrop-blur-2xl shadow-lg">
        <img
          src={entropyLogo}
          alt="Entropy"
          className="h-16 object-contain"
        />

        <h1
          className="text-center leading-tight"
          style={{
            fontFamily: "'Pinyon Script', cursive",
            fontSize: "clamp(1.6rem, 4.5vw, 2.6rem)",
            color: "#000000",
            fontWeight: 400,
            letterSpacing: "-0.01em",
          }}
        >
          Operating System of Finance
        </h1>

        <div className="w-full space-y-3">
          <Button
            variant="outline"
            className="w-full h-11 font-mono text-xs tracking-wide border-black/15 hover:bg-white/60 bg-white/50 text-black"
            onClick={() => handleOAuth("google")}
            disabled={!!loading}
          >
            {loading === "google" ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24">
                <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"/>
                <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
                <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
              </svg>
            )}
            Continue with Google
          </Button>

          <Button
            variant="outline"
            className="w-full h-11 font-mono text-xs tracking-wide border-black/15 hover:bg-white/60 bg-white/50 text-black"
            onClick={() => handleOAuth("apple")}
            disabled={!!loading}
          >
            {loading === "apple" ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
                <path d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.06-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"/>
              </svg>
            )}
            Continue with Apple
          </Button>
        </div>

        <p className="text-center font-mono text-[9px] text-black/30 uppercase tracking-[0.2em]">
          Secure authentication required
        </p>
      </div>
    </div>
  );
}
