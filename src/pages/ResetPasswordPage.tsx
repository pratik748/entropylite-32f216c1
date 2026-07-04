import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { EntropyGlyph } from "@/components/marketing/Wordmark";

export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // Check for recovery token in URL hash
    const hash = window.location.hash;
    if (hash.includes("type=recovery")) {
      setReady(true);
    }
  }, []);

  const handleReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    if (error) toast.error(error.message);
    else {
      toast.success("Password updated successfully");
      window.location.href = "/";
    }
    setLoading(false);
  };

  if (!ready) {
    return (
      <div className="min-h-screen bg-white text-ink flex items-center justify-center p-4">
        <p className="text-[14px] text-ink/50">Invalid or expired reset link.</p>
      </div>
    );
  }

  return (
    <div className="relative min-h-screen bg-white text-ink flex items-center justify-center p-5">
      <div className="absolute inset-0 paper-grid grid-vignette" aria-hidden="true" />
      <div className="relative w-full max-w-sm">
        <EntropyGlyph className="h-9 w-9 mb-6" />
        <h1 className="text-[24px] font-bold tracking-tight mb-2">Reset credentials</h1>
        <p className="text-[13.5px] text-ink/50 leading-relaxed mb-8">
          Choose a new password for your account. You will be signed in immediately.
        </p>
        <form onSubmit={handleReset} className="space-y-4">
          <div>
            <label htmlFor="password" className="mkt-label text-[9px] text-ink/45 block mb-2">
              New password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              placeholder="••••••••"
              className="w-full h-12 rounded-lg border border-ink/12 bg-white px-4 text-[14px] tracking-tight text-ink placeholder:text-ink/25 focus:outline-none focus:border-ink/45 transition-colors"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="flex w-full h-12 items-center justify-center gap-2 rounded-lg bg-ink text-[13.5px] font-semibold tracking-tight text-white hover:bg-ink-700 transition-colors disabled:opacity-60"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            Update password
          </button>
        </form>
      </div>
    </div>
  );
}
