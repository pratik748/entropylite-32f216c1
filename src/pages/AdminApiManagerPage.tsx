import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { toast } from "sonner";
import { Loader2, KeyRound, Plus, Trash2, RotateCw, ShieldCheck, Zap } from "lucide-react";
import { Link } from "react-router-dom";

type Credential = {
  id: string;
  name: string;
  label: string | null;
  is_active: boolean;
  updated_at: string;
  value?: string;
  provider?: string | null;
};

type Lane = { order: number; name: string; provider: string; source: "manager" | "environment" };
type Health = {
  credential_name: string; provider: string; last_status: string | null; last_latency_ms: number | null;
  last_error: string | null; last_error_at: string | null; last_used_at: string | null;
  success_count: number; failure_count: number;
};
const PROVIDERS = ["auto", "mistral", "gemini", "openai", "anthropic", "openrouter", "groq", "nvidia", "cloudflare"];

function ago(iso?: string | null) {
  if (!iso) return "never";
  const s = Math.max(0, (Date.now() - Date.parse(iso)) / 1000);
  if (s < 60) return `${Math.round(s)}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

const KNOWN = [
  "MISTRAL_API_KEY",
  "MISTRAL_API_KEY_2",
  "MISTRAL_API_KEY_3",
  "GOOGLE_GEMINI_KEY",
  "GOOGLE_GEMINI_KEY_2",
  "OPENROUTER_API_KEY",
  "GROQ_API_KEY",
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
  "ALPHAVANTAGE_API_KEY",
  "NEWSDATA_API_KEY",
];

function mask(v?: string) {
  if (!v) return "";
  if (v.length <= 8) return "*".repeat(v.length);
  return `${v.slice(0, 4)}${"*".repeat(Math.max(4, v.length - 8))}${v.slice(-4)}`;
}

export default function AdminApiManagerPage() {
  const { isAdmin, loading } = useIsAdmin();
  const [rows, setRows] = useState<Credential[]>([]);
  const [busy, setBusy] = useState(false);
  const [name, setName] = useState("");
  const [value, setValue] = useState("");
  const [label, setLabel] = useState("");
  const [provider, setProvider] = useState("auto");
  const [lanes, setLanes] = useState<Lane[]>([]);
  const [health, setHealth] = useState<Record<string, Health>>({});
  const [testing, setTesting] = useState<string | null>(null);

  const loadStatus = useCallback(async () => {
    const { data, error } = await supabase.functions.invoke("api-key-admin", { body: { action: "status" } });
    if (error || !data) return;
    setLanes(data.lanes || []);
    const h: Record<string, Health> = {};
    for (const r of data.health || []) h[r.credential_name] = r;
    setHealth(h);
  }, []);

  const test = async (keyName: string) => {
    setTesting(keyName);
    const { data, error } = await supabase.functions.invoke("api-key-admin", { body: { action: "test", name: keyName } });
    setTesting(null);
    if (error) { toast.error(error.message); return; }
    if (data?.ok) toast.success(`${keyName} works · ${data.provider} · ${data.latencyMs} ms`);
    else toast.error(`${keyName} failed: ${data?.error || "unknown"}`);
    void loadStatus();
  };

  const testAll = async () => {
    setTesting("*");
    await supabase.functions.invoke("api-key-admin", { body: { action: "test_all" } });
    setTesting(null);
    void loadStatus();
  };

  const load = useCallback(async () => {
    setBusy(true);
    const { data, error } = await (supabase as any)
      .from("api_credentials")
      .select("id, name, label, is_active, updated_at, value")
      .order("name", { ascending: true });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    setRows((data || []) as Credential[]);
  }, []);

  useEffect(() => {
    document.title = "API Manager | Entropy";
    if (isAdmin) { void load(); void loadStatus(); }
  }, [isAdmin, load, loadStatus]);

  const missing = useMemo(
    () => KNOWN.filter((k) => !rows.some((r) => r.name === k)),
    [rows],
  );

  const save = async () => {
    const n = name.trim().toUpperCase().replace(/[^A-Z0-9_]/g, "_");
    if (!n || !value.trim()) { toast.error("Name and key value are required"); return; }
    const { data: userRes } = await supabase.auth.getUser();
    setBusy(true);
    const { error } = await (supabase as any)
      .from("api_credentials")
      .upsert(
        { name: n, value: value.trim(), label: label.trim() || null, provider: provider === "auto" ? null : provider, is_active: true, created_by: userRes?.user?.id ?? null },
        { onConflict: "name" },
      );
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`${n} saved. Testing now.`);
    setName(""); setValue(""); setLabel(""); setProvider("auto");
    await load();
    void test(n);
  };

  const toggle = async (row: Credential) => {
    const { error } = await (supabase as any)
      .from("api_credentials")
      .update({ is_active: !row.is_active })
      .eq("id", row.id);
    if (error) { toast.error(error.message); return; }
    void load();
  };

  const remove = async (row: Credential) => {
    const { error } = await (supabase as any).from("api_credentials").delete().eq("id", row.id);
    if (error) { toast.error(error.message); return; }
    toast.success(`${row.name} removed`);
    void load();
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!isAdmin) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center gap-3 px-6 text-center">
        <ShieldCheck className="h-5 w-5 text-muted-foreground" />
        <p className="text-sm text-muted-foreground">This area is restricted to platform administrators.</p>
        <Link to="/dashboard" className="text-[13px] font-medium text-primary hover:underline">Return to terminal</Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border/60 px-6 h-14 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <KeyRound className="h-4 w-4 text-primary" />
          <h1 className="text-[14px] font-semibold tracking-tight">API Manager</h1>
        </div>
        <div className="flex items-center gap-4">
          <button onClick={() => { void load(); void loadStatus(); }} className="text-muted-foreground hover:text-foreground transition-colors" aria-label="Refresh">
            <RotateCw className={`h-3.5 w-3.5 ${busy ? "animate-spin" : ""}`} />
          </button>
          <Link to="/dashboard" className="text-[12.5px] text-muted-foreground hover:text-foreground">Terminal</Link>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-10 space-y-10">
        <section>
          <p className="text-[13px] text-muted-foreground leading-relaxed">
            Keys stored here are used globally by every backend engine and take
            precedence over deployment environment values. Changes propagate
            within 60 seconds without a redeploy.
          </p>
        </section>

        <section className="space-y-4">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Add or rotate a key</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="KEY_NAME"
              list="known-key-names"
              className="h-11 rounded-xl border border-border bg-card px-3.5 text-[13px] font-mono tracking-tight outline-none focus:border-primary/60"
            />
            <datalist id="known-key-names">
              {missing.map((k) => <option key={k} value={k} />)}
            </datalist>
            <input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Label (optional)"
              className="h-11 rounded-xl border border-border bg-card px-3.5 text-[13px] outline-none focus:border-primary/60"
            />
            <select
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
              className="h-11 rounded-xl border border-border bg-card px-3 text-[13px] outline-none focus:border-primary/60 sm:col-span-2"
            >
              {PROVIDERS.map((p) => <option key={p} value={p}>{p === "auto" ? "Provider: detect from key" : p}</option>)}
            </select>
          </div>
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="Key value"
            type="password"
            autoComplete="off"
            className="w-full h-11 rounded-xl border border-border bg-card px-3.5 text-[13px] font-mono outline-none focus:border-primary/60"
          />
          <button
            onClick={() => void save()}
            disabled={busy}
            className="inline-flex h-11 items-center gap-2 rounded-xl bg-primary px-5 text-[13px] font-semibold text-primary-foreground disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
            Save key
          </button>
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
              AI key chain ({lanes.length}), in the order engines try them
            </h2>
            <button onClick={() => void testAll()} disabled={!!testing} className="inline-flex items-center gap-1.5 text-[12px] font-semibold text-primary disabled:opacity-50">
              {testing === "*" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Zap className="h-3 w-3" />} Test all
            </button>
          </div>
          <div className="overflow-x-auto rounded-xl border border-border/60">
            <table className="w-full text-[12px]">
              <thead className="text-[10.5px] uppercase tracking-[0.08em] text-muted-foreground">
                <tr className="border-b border-border/60">
                  <th className="px-3 py-2 text-left font-medium">#</th>
                  <th className="px-3 py-2 text-left font-medium">Key</th>
                  <th className="px-3 py-2 text-left font-medium">Status</th>
                  <th className="px-3 py-2 text-right font-medium">Latency</th>
                  <th className="px-3 py-2 text-right font-medium">OK / Fail</th>
                  <th className="px-3 py-2 text-left font-medium">Last used</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {lanes.length === 0 && (
                  <tr><td colSpan={7} className="px-3 py-5 text-muted-foreground">No AI keys found. Add one above.</td></tr>
                )}
                {lanes.map((l) => {
                  const h = health[l.name];
                  const ok = h?.last_status === "ok";
                  const bad = h?.last_status === "error";
                  return (
                    <tr key={l.name} className="border-b border-border/40 align-top last:border-0">
                      <td className="px-3 py-2.5 font-mono text-muted-foreground">{l.order}</td>
                      <td className="px-3 py-2.5">
                        <p className="font-mono font-medium">{l.name}</p>
                        <p className="text-[11px] text-muted-foreground">{l.provider} · {l.source === "manager" ? "API Manager" : "server setting"}</p>
                      </td>
                      <td className="px-3 py-2.5 max-w-[260px]">
                        <span className={`inline-flex items-center gap-1.5 font-semibold ${ok ? "text-gain" : bad ? "text-loss" : "text-muted-foreground"}`}>
                          <span className={`h-1.5 w-1.5 rounded-full ${ok ? "bg-gain" : bad ? "bg-loss" : "bg-muted-foreground"}`} />
                          {ok ? "Working" : bad ? "Failing" : "Untested"}
                        </span>
                        {bad && h?.last_error && <p className="mt-0.5 text-[11px] text-muted-foreground break-words">{h.last_error.slice(0, 140)}</p>}
                      </td>
                      <td className="px-3 py-2.5 text-right font-mono">{h?.last_latency_ms != null ? `${h.last_latency_ms} ms` : "--"}</td>
                      <td className="px-3 py-2.5 text-right font-mono">{h ? `${h.success_count} / ${h.failure_count}` : "--"}</td>
                      <td className="px-3 py-2.5 text-muted-foreground">{ago(h?.last_used_at)}</td>
                      <td className="px-3 py-2.5 text-right">
                        <button onClick={() => void test(l.name)} disabled={!!testing} className="text-[12px] font-semibold text-primary disabled:opacity-50">
                          {testing === l.name ? <Loader2 className="h-3 w-3 animate-spin" /> : "Test"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="text-[11.5px] text-muted-foreground">Failing keys rest automatically (dead keys 30 min, rate-limited 90 s) so engines skip straight to a working one.</p>
        </section>

        <section className="space-y-3">
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            Active credentials ({rows.length})
          </h2>
          <div className="border-t border-border/60">
            {rows.length === 0 && (
              <p className="py-6 text-[13px] text-muted-foreground">No keys stored yet.</p>
            )}
            {rows.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-4 border-b border-border/60 py-3.5">
                <div className="min-w-0">
                  <p className="text-[13px] font-mono font-medium truncate">{r.name}</p>
                  <p className="text-[11.5px] text-muted-foreground font-mono truncate">{mask(r.value)}</p>
                </div>
                <div className="flex items-center gap-4 shrink-0">
                  <button
                    onClick={() => void toggle(r)}
                    className={`text-[11px] font-semibold uppercase tracking-[0.1em] ${r.is_active ? "text-gain" : "text-muted-foreground"}`}
                  >
                    {r.is_active ? "Active" : "Paused"}
                  </button>
                  <button onClick={() => void remove(r)} className="text-muted-foreground hover:text-loss transition-colors" aria-label={`Delete ${r.name}`}>
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
