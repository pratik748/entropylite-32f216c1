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
      <div className="site-public min-h-screen bg-carbon-950 text-white flex items-center justify-center p-4">
        <p className="text-[14px] text-white/45">Invalid or expired reset link.</p>
      </div>
    );
  }

  return (
    <div className="site-public min-h-screen bg-carbon-950 text-white flex items-center justify-center p-5">
      <div className="w-full max-w-sm border border-hairline bg-carbon-900 p-8">
        <EntropyGlyph light className="h-9 w-auto mb-6" />
        <h1 className="text-[22px] font-semibold tracking-tight mb-2 text-white">Reset credentials</h1>
        <p className="text-[13.5px] text-white/45 leading-relaxed mb-8">
          Choose a new password for your account. You will be signed in immediately.
        </p>
        <form onSubmit={handleReset} className="space-y-4">
          <div>
            <label htmlFor="password" className="mkt-label text-[9px] text-white/40 block mb-2">
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
              className="w-full h-12 border border-hairline-strong bg-carbon-950 px-4 text-[14px] tracking-tight text-white placeholder:text-white/20 focus:outline-none focus:border-white/45 transition-colors duration-150 ease-out"
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="flex w-full h-12 items-center justify-center gap-2 bg-white text-[13.5px] font-semibold tracking-tight text-carbon-950 hover:bg-white/85 transition-colors duration-150 ease-out disabled:opacity-60"
          >
            {loading && <Loader2 className="h-4 w-4 animate-spin" />}
            Update password
          </button>
        </form>
      </div>
    </div>
  );
}
