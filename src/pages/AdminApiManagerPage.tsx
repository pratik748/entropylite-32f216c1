import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useIsAdmin } from "@/hooks/useIsAdmin";
import { toast } from "sonner";
import {
  Activity,
  AlertCircle,
  CheckCircle2,
  Cpu,
  HelpCircle,
  KeyRound,
  Layers,
  Loader2,
  Play,
  Plus,
  RotateCw,
  Search,
  Server,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Terminal,
  Trash2,
  TrendingUp,
  Zap,
} from "lucide-react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { invalidateAllCache } from "@/lib/apiGovernor";

type Credential = {
  id: string;
  name: string;
  label: string | null;
  is_active: boolean;
  updated_at: string;
  value?: string;
  provider: string | null;
};

type KeyHealth = {
  credential_name: string;
  provider: string;
  source: string;
  last_status: "ok" | "error" | null;
  last_latency_ms: number | null;
  last_error: string | null;
  last_used_at: string | null;
  success_count: number;
  failure_count: number;
};

type FunctionTestResult = {
  functionName: string;
  type: "ai" | "feed" | "integration";
  success: boolean;
  status: number;
  latencyMs: number;
  error?: string | null;
  diagnostic?: string;
};

const KNOWN = [
  "MISTRAL_API_KEY",
  "MISTRAL_API_KEY_2",
  "MISTRAL_API_KEY_3",
  "GOOGLE_GEMINI_KEY",
  "GEMINI_API_KEY",
  "OPENROUTER_API_KEY",
  "GROQ_API_KEY",
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
  "NVIDIA_API_KEY",
  "ALPHAVANTAGE_API_KEY",
  "NEWSDATA_API_KEY",
  "ALPACA_API_KEY",
  "ALPACA_SECRET_KEY",
];

const KNOWN_FUNCTIONS = [
  { name: "causal-effects", category: "AI & Quantitative Engine", description: "Macro transmission channels & scenario trees", type: "ai" },
  { name: "strategy-generate", category: "AI & Quantitative Engine", description: "Blotter trade tickets & regime positioning", type: "ai" },
  { name: "reflexivity-engine", category: "AI & Quantitative Engine", description: "Soros contradiction mapping & feedback loops", type: "ai" },
  { name: "deep-intelligence", category: "AI & Quantitative Engine", description: "Deep company thesis & fundamental synthesis", type: "ai" },
  { name: "analyze-stock", category: "AI & Quantitative Engine", description: "Stock quant health & historical momentum", type: "ai" },
  { name: "direct-profit", category: "AI & Quantitative Engine", description: "Alpha scanner & stat-arb signals", type: "ai" },
  { name: "sentiment-intel", category: "AI & Quantitative Engine", description: "Institutional tone & news sentiment breakdown", type: "ai" },
  { name: "opportunity-engine", category: "AI & Quantitative Engine", description: "Alpha opportunity ranker across universes", type: "ai" },
  { name: "continuous-simulation", category: "AI & Quantitative Engine", description: "Monte Carlo stochastic agent loops", type: "ai" },
  { name: "clank-detection", category: "AI & Quantitative Engine", description: "Market fragility & liquidation anomaly alert", type: "ai" },
  { name: "strategy-evolution", category: "AI & Quantitative Engine", description: "Genetic strategy breeding & backtest optimizer", type: "ai" },
  { name: "cadence-generate", category: "AI & Quantitative Engine", description: "Multi-horizon execution timeline scheduler", type: "ai" },
  { name: "entropy-brief", category: "AI & Quantitative Engine", description: "Executive macro risk brief generation", type: "ai" },
  { name: "geo-events", category: "AI & Quantitative Engine", description: "Geopolitical conflict & shock impact mapper", type: "ai" },
  { name: "crown-intelligence", category: "AI & Quantitative Engine", description: "Multi-factor portfolio optimization matrix", type: "ai" },
  { name: "flow-intelligence", category: "AI & Quantitative Engine", description: "Dark pool & institutional flow tracker", type: "ai" },
  { name: "risk-intelligence", category: "AI & Quantitative Engine", description: "VaR, CVaR, stress testing & tail risk", type: "ai" },
  { name: "monte-carlo-intelligence", category: "AI & Quantitative Engine", description: "Path-dependent terminal wealth distributions", type: "ai" },
  { name: "portfolio-intelligence", category: "AI & Quantitative Engine", description: "Sector concentration & factor attribution", type: "ai" },
  { name: "price-feed", category: "Market Feeds & Data", description: "Real-time ticker quotes & market batching", type: "feed" },
  { name: "market-data", category: "Market Feeds & Data", description: "Global indices, benchmarks & market overview", type: "feed" },
  { name: "fetch-news", category: "Market Feeds & Data", description: "Global financial RSS & news aggregation", type: "feed" },
  { name: "historical-prices", category: "Market Feeds & Data", description: "Historical daily bars, volumes & OHLCV", type: "feed" },
  { name: "fx-rates", category: "Market Feeds & Data", description: "Cross-currency FX rates & USD basis", type: "feed" },
  { name: "derivatives-intelligence", category: "Market Feeds & Data", description: "Options volatility surface & Greeks engine", type: "feed" },
  { name: "symbol-search", category: "Market Feeds & Data", description: "Asset ticker search & company lookup", type: "feed" },
  { name: "macro-intelligence", category: "Market Feeds & Data", description: "Sovereign yield curves & macro indicators", type: "feed" },
  { name: "data-pipeline-status", category: "Market Feeds & Data", description: "Pipeline health & provider status telemetry", type: "feed" },
];

function mask(v?: string) {
  if (!v) return "";
  if (v.length <= 8) return "*".repeat(v.length);
  return `${v.slice(0, 4)}${"*".repeat(Math.max(4, v.length - 8))}${v.slice(-4)}`;
}

export default function AdminApiManagerPage() {
  const { isAdmin, loading } = useIsAdmin();
  const [activeTab, setActiveTab] = useState<"keys" | "functions" | "health">("keys");
  const [rows, setRows] = useState<Credential[]>([]);
  const [busy, setBusy] = useState(false);
  const [testingKey, setTestingKey] = useState<string | null>(null);
  const [testingFunction, setTestingFunction] = useState<string | null>(null);
  const [testingAllFunctions, setTestingAllFunctions] = useState(false);
  const [functionResults, setFunctionResults] = useState<Record<string, FunctionTestResult>>({});
  const [keyDiagnostics, setKeyDiagnostics] = useState<Record<string, { status: "ok" | "error"; latencyMs: number; message: string; diagnostic?: string }>>({});
  const [searchQuery, setSearchQuery] = useState("");
  const [filterType, setFilterType] = useState<"all" | "ai" | "feed" | "error">("all");

  const [name, setName] = useState("");
  const [value, setValue] = useState("");
  const [label, setLabel] = useState("");
  const [provider, setProvider] = useState("mistral");
  const [health, setHealth] = useState<KeyHealth[]>([]);

  const load = useCallback(async () => {
    setBusy(true);
    const [credentials, keyHealth] = await Promise.all([
      (supabase as any).from("api_credentials").select("id, name, label, is_active, updated_at, value, provider").order("name", { ascending: true }),
      (supabase as any).from("api_key_health").select("credential_name, provider, source, last_status, last_latency_ms, last_error, last_used_at, success_count, failure_count").order("credential_name", { ascending: true }),
    ]);
    setBusy(false);
    if (credentials.error) { toast.error(credentials.error.message); return; }
    if (keyHealth.error) { toast.error(keyHealth.error.message); return; }
    setRows((credentials.data || []) as Credential[]);
    setHealth((keyHealth.data || []) as KeyHealth[]);
  }, []);

  useEffect(() => {
    document.title = "API Manager & Function Diagnostics | Entropy";
    if (isAdmin) void load();
  }, [isAdmin, load]);

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
        { name: n, value: value.trim(), label: label.trim() || null, provider, is_active: true, created_by: userRes?.user?.id ?? null },
        { onConflict: "name" },
      );
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    invalidateAllCache();
    toast.success(`${n} saved & caches invalidated. Propagated to all engines.`);
    setName(""); setValue(""); setLabel(""); setProvider("mistral");
    void load();
  };

  const toggle = async (row: Credential) => {
    const { error } = await (supabase as any)
      .from("api_credentials")
      .update({ is_active: !row.is_active })
      .eq("id", row.id);
    if (error) { toast.error(error.message); return; }
    invalidateAllCache();
    void load();
  };

  const remove = async (row: Credential) => {
    const { error } = await (supabase as any).from("api_credentials").delete().eq("id", row.id);
    if (error) { toast.error(error.message); return; }
    invalidateAllCache();
    toast.success(`${row.name} removed`);
    void load();
  };

  const testProvider = async (targetProvider?: string, keyName?: string) => {
    const keyId = keyName || targetProvider || "all";
    setTestingKey(keyId);
    try {
      const { data, error } = await supabase.functions.invoke("test-ai-key", {
        body: { provider: targetProvider, forceRefresh: true },
      });
      if (error) {
        toast.error(`Test failed: ${error.message || "Edge function unreachable"}`);
        setKeyDiagnostics((prev) => ({
          ...prev,
          [keyId]: {
            status: "error",
            latencyMs: 0,
            message: error.message || "Edge function unreachable",
            diagnostic: "Network or gateway failure. Check Supabase connection.",
          },
        }));
      } else if (data?.success) {
        toast.success(`Active (${data.provider}): responded in ${data.latencyMs}ms`);
        setKeyDiagnostics((prev) => ({
          ...prev,
          [keyId]: {
            status: "ok",
            latencyMs: data.latencyMs,
            message: `OK: ${data.response || "Responsive"}`,
            diagnostic: data.diagnostic,
          },
        }));
      } else {
        toast.error(`Provider error (${data?.status || 500}): ${data?.error || "Unknown error"}`);
        setKeyDiagnostics((prev) => ({
          ...prev,
          [keyId]: {
            status: "error",
            latencyMs: data?.latencyMs || 0,
            message: data?.error || "Provider error",
            diagnostic: data?.diagnostic || "Check provider credentials.",
          },
        }));
      }
    } catch (e: any) {
      toast.error(`Test invocation error: ${e.message || e}`);
      setKeyDiagnostics((prev) => ({
        ...prev,
        [keyId]: {
          status: "error",
          latencyMs: 0,
          message: e.message || String(e),
          diagnostic: "Invocation exception occurred.",
        },
      }));
    } finally {
      setTestingKey(null);
      void load();
    }
  };

  const testAllKeys = async () => {
    setTestingKey("all");
    try {
      const { data, error } = await supabase.functions.invoke("test-ai-key", {
        body: { action: "test-all-keys", forceRefresh: true },
      });
      if (error) {
        toast.error(`Test all keys failed: ${error.message}`);
      } else if (data?.keys) {
        const diagMap: Record<string, any> = {};
        let okCount = 0;
        data.keys.forEach((k: any) => {
          if (k.configured) {
            if (k.success) okCount++;
            diagMap[k.name] = {
              status: k.success ? "ok" : "error",
              latencyMs: k.latencyMs,
              message: k.success ? "Active" : k.error,
              diagnostic: k.diagnostic,
            };
          }
        });
        setKeyDiagnostics((prev) => ({ ...prev, ...diagMap }));
        toast.success(`Tested keys: ${okCount} operational.`);
      }
    } catch (e: any) {
      toast.error(`Batch test error: ${e.message || e}`);
    } finally {
      setTestingKey(null);
      void load();
    }
  };

  const testSingleFunction = async (fnName: string) => {
    setTestingFunction(fnName);
    try {
      const { data, error } = await supabase.functions.invoke("test-ai-key", {
        body: { action: "test-function", functionName: fnName },
      });
      if (error) {
        setFunctionResults((prev) => ({
          ...prev,
          [fnName]: {
            functionName: fnName,
            type: "feed",
            success: false,
            status: 500,
            latencyMs: 0,
            error: error.message,
            diagnostic: "Edge function failed to invoke via Supabase gateway.",
          },
        }));
        toast.error(`${fnName}: ${error.message}`);
      } else {
        setFunctionResults((prev) => ({
          ...prev,
          [fnName]: data,
        }));
        if (data.success) {
          toast.success(`${fnName}: 200 OK (${data.latencyMs}ms)`);
        } else {
          toast.error(`${fnName} failed: ${data.error || "Execution issue"}`);
        }
      }
    } catch (e: any) {
      setFunctionResults((prev) => ({
        ...prev,
        [fnName]: {
          functionName: fnName,
          type: "feed",
          success: false,
          status: 500,
          latencyMs: 0,
          error: e.message || String(e),
          diagnostic: "Local request exception.",
        },
      }));
    } finally {
      setTestingFunction(null);
    }
  };

  const testAllFunctions = async () => {
    setTestingAllFunctions(true);
    toast.info("Running system diagnostics across all edge functions...");
    try {
      const { data, error } = await supabase.functions.invoke("test-ai-key", {
        body: { action: "test-all-functions" },
      });
      if (error) {
        toast.error(`Full system test failed: ${error.message}`);
      } else if (data?.results) {
        const resMap: Record<string, FunctionTestResult> = {};
        data.results.forEach((r: FunctionTestResult) => {
          resMap[r.functionName] = r;
        });
        setFunctionResults(resMap);
        toast.success(`Diagnostics complete: ${data.passed}/${data.total} functions passed (${data.avgLatencyMs}ms avg).`);
      }
    } catch (e: any) {
      toast.error(`Diagnostic sweep error: ${e.message || e}`);
    } finally {
      setTestingAllFunctions(false);
    }
  };

  const filteredFunctions = useMemo(() => {
    return KNOWN_FUNCTIONS.filter((fn) => {
      const matchesSearch = fn.name.toLowerCase().includes(searchQuery.toLowerCase()) || fn.description.toLowerCase().includes(searchQuery.toLowerCase());
      if (!matchesSearch) return false;
      if (filterType === "ai") return fn.type === "ai";
      if (filterType === "feed") return fn.type === "feed";
      if (filterType === "error") {
        const res = functionResults[fn.name];
        return res && !res.success;
      }
      return true;
    });
  }, [searchQuery, filterType, functionResults]);

  const testedCount = Object.keys(functionResults).length;
  const passedFunctionsCount = Object.values(functionResults).filter((r) => r.success).length;
  const failedFunctionsCount = Object.values(functionResults).filter((r) => !r.success).length;

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
      <header className="border-b border-border/60 px-6 h-14 flex items-center justify-between sticky top-0 bg-background/95 backdrop-blur z-20">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
            <KeyRound className="h-4 w-4" />
          </div>
          <div>
            <h1 className="text-[14px] font-semibold tracking-tight">API & Engine Diagnostics</h1>
            <p className="text-[10px] text-muted-foreground hidden sm:block">Real-time provider routing & system health</p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            onClick={() => {
              invalidateAllCache();
              toast.success("Client & localStorage cache purged");
              void load();
            }}
            variant="outline"
            size="sm"
            className="text-[12px] h-8 gap-1.5"
          >
            <Sparkles className="h-3.5 w-3.5" /> Flush Cache
          </Button>

          <Button
            onClick={() => void testAllKeys()}
            disabled={!!testingKey}
            variant="secondary"
            size="sm"
            className="text-[12px] h-8 gap-1.5"
          >
            {testingKey === "all" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Zap className="h-3.5 w-3.5 text-amber-500" />}
            Test All Keys
          </Button>

          <Button
            onClick={() => void testAllFunctions()}
            disabled={testingAllFunctions}
            variant="default"
            size="sm"
            className="text-[12px] h-8 gap-1.5 bg-primary text-primary-foreground"
          >
            {testingAllFunctions ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Server className="h-3.5 w-3.5" />}
            Test All Functions
          </Button>

          <Button onClick={() => void load()} variant="ghost" size="icon" aria-label="Refresh">
            <RotateCw className={`h-3.5 w-3.5 ${busy ? "animate-spin" : ""}`} />
          </Button>
          <Link to="/dashboard" className="text-[12px] text-muted-foreground hover:text-foreground pl-2 border-l border-border/60">Terminal</Link>
        </div>
      </header>

      <div className="border-b border-border/60 bg-muted/20 px-6">
        <div className="max-w-4xl mx-auto flex gap-6 text-[13px] font-medium">
          <button
            onClick={() => setActiveTab("keys")}
            className={`py-3 flex items-center gap-2 border-b-2 transition-colors ${
              activeTab === "keys"
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <KeyRound className="h-4 w-4" />
            API Keys & Providers ({rows.length})
          </button>
          <button
            onClick={() => setActiveTab("functions")}
            className={`py-3 flex items-center gap-2 border-b-2 transition-colors ${
              activeTab === "functions"
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <Cpu className="h-4 w-4" />
            Edge Functions Diagnostic Suite ({KNOWN_FUNCTIONS.length})
            {failedFunctionsCount > 0 && (
              <span className="px-1.5 py-0.2 rounded-full bg-destructive/20 text-destructive text-[10px] font-mono">
                {failedFunctionsCount} issues
              </span>
            )}
          </button>
          <button
            onClick={() => setActiveTab("health")}
            className={`py-3 flex items-center gap-2 border-b-2 transition-colors ${
              activeTab === "health"
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <Activity className="h-4 w-4" />
            Telemetry & Health Logs
          </button>
        </div>
      </div>

      <main className="max-w-4xl mx-auto px-6 py-8 space-y-8">
        {/* =========================================================================
            TAB 1: KEYS & PROVIDERS
        ========================================================================= */}
        {activeTab === "keys" && (
          <div className="space-y-8">
            <section className="p-4 rounded-xl bg-card border border-border/70 space-y-2">
              <div className="flex items-center gap-2 text-primary text-[13px] font-semibold">
                <Zap className="h-4 w-4" />
                <span>Multi-Provider Resilient Failover</span>
              </div>
              <p className="text-[12.5px] text-muted-foreground leading-relaxed">
                Credentials saved here are decrypted server-side and take instant precedence over environment variables.
                The system automatically routes requests across your active keys, automatically steps down models on rate limits (429) or 404s, and cascades across fallback providers if any lane fails.
              </p>
            </section>

            <section className="space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Add or rotate a key</h2>
                <span className="text-[11px] text-muted-foreground">Encrypted in public.api_credentials</span>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <input
                  value={name}
                  onChange={(e) => {
                    const val = e.target.value;
                    setName(val);
                    if (/GEMINI/i.test(val)) setProvider("gemini");
                    else if (/OPENROUTER/i.test(val)) setProvider("openrouter");
                    else if (/GROQ/i.test(val)) setProvider("groq");
                    else if (/OPENAI/i.test(val)) setProvider("openai");
                    else if (/ANTHROPIC|CLAUDE/i.test(val)) setProvider("anthropic");
                    else if (/NVIDIA/i.test(val)) setProvider("nvidia");
                    else if (/MISTRAL/i.test(val)) setProvider("mistral");
                  }}
                  placeholder="KEY_NAME (e.g. GEMINI_API_KEY)"
                  list="known-key-names"
                  className="h-11 rounded-xl border border-border bg-card px-3.5 text-[13px] font-mono tracking-tight outline-none focus:border-primary/60"
                />
                <datalist id="known-key-names">
                  {missing.map((k) => <option key={k} value={k} />)}
                </datalist>
                <input
                  value={label}
                  onChange={(e) => setLabel(e.target.value)}
                  placeholder="Label / Workspace (optional)"
                  className="h-11 rounded-xl border border-border bg-card px-3.5 text-[13px] outline-none focus:border-primary/60"
                />
                <select value={provider} onChange={(e) => setProvider(e.target.value)} className="h-11 rounded-xl border border-border bg-card px-3.5 text-[13px] outline-none focus:border-primary/60">
                  <option value="mistral">Mistral AI</option>
                  <option value="gemini">Google Gemini</option>
                  <option value="openrouter">OpenRouter</option>
                  <option value="groq">Groq (Ultra-fast)</option>
                  <option value="openai">OpenAI</option>
                  <option value="anthropic">Anthropic (Claude)</option>
                  <option value="nvidia">NVIDIA NIM</option>
                </select>
              </div>
              <input
                value={value}
                onChange={(e) => setValue(e.target.value)}
                placeholder="Paste raw API key value"
                type="password"
                autoComplete="off"
                className="w-full h-11 rounded-xl border border-border bg-card px-3.5 text-[13px] font-mono outline-none focus:border-primary/60"
              />
              <Button onClick={() => void save()} disabled={busy} size="default" className="gap-2">
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
                Save & Activate Key
              </Button>
            </section>

            <section className="space-y-3">
              <h2 className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                Configured Credentials ({rows.length})
              </h2>
              <div className="border border-border/70 rounded-xl divide-y divide-border/60 overflow-hidden bg-card">
                {rows.length === 0 && (
                  <p className="p-6 text-[13px] text-muted-foreground text-center">No keys stored yet. Add one above to enable AI engines.</p>
                )}
                {rows.map((r) => {
                  const diag = keyDiagnostics[r.name] || keyDiagnostics[r.provider || ""] || null;
                  return (
                    <div key={r.id} className="p-4 space-y-2.5">
                      <div className="flex items-center justify-between gap-4">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <p className="text-[13px] font-mono font-medium truncate">{r.name}</p>
                            {r.provider && (
                              <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded bg-muted text-muted-foreground border border-border/40">
                                {r.provider}
                              </span>
                            )}
                            {r.label && (
                              <span className="text-[11px] text-muted-foreground truncate">({r.label})</span>
                            )}
                          </div>
                          <p className="text-[11.5px] text-muted-foreground font-mono truncate">{mask(r.value)}</p>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          <Button
                            onClick={() => void testProvider(r.provider || undefined, r.name)}
                            disabled={testingKey === r.name}
                            variant="secondary"
                            size="sm"
                            className="h-8 text-[11px] px-2.5 gap-1.5"
                          >
                            {testingKey === r.name ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3 text-primary" />}
                            Test
                          </Button>
                          <button
                            onClick={() => void toggle(r)}
                            className={`text-[11px] font-semibold uppercase tracking-[0.1em] px-2 py-1 rounded transition-colors ${
                              r.is_active ? "text-emerald-500 bg-emerald-500/10" : "text-muted-foreground bg-muted"
                            }`}
                          >
                            {r.is_active ? "Active" : "Paused"}
                          </button>
                          <button onClick={() => void remove(r)} className="text-muted-foreground hover:text-red-500 p-1.5 transition-colors" aria-label={`Delete ${r.name}`}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>

                      {diag && (
                        <div className={`p-2.5 rounded-lg text-[12px] flex items-start gap-2 border ${
                          diag.status === "ok" ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-600" : "bg-destructive/10 border-destructive/30 text-destructive"
                        }`}>
                          {diag.status === "ok" ? <CheckCircle2 className="h-4 w-4 shrink-0 mt-0.5" /> : <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />}
                          <div className="space-y-0.5">
                            <p className="font-medium">{diag.message} ({diag.latencyMs}ms)</p>
                            {diag.diagnostic && <p className="text-[11px] opacity-90">{diag.diagnostic}</p>}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          </div>
        )}

        {/* =========================================================================
            TAB 2: EDGE FUNCTIONS DIAGNOSTIC SUITE
        ========================================================================= */}
        {activeTab === "functions" && (
          <div className="space-y-6">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="p-3.5 rounded-xl border border-border/70 bg-card">
                <p className="text-[11px] text-muted-foreground uppercase tracking-wider">Total Functions</p>
                <p className="text-xl font-mono font-bold mt-1">{KNOWN_FUNCTIONS.length}</p>
              </div>
              <div className="p-3.5 rounded-xl border border-border/70 bg-card">
                <p className="text-[11px] text-muted-foreground uppercase tracking-wider">Tested</p>
                <p className="text-xl font-mono font-bold mt-1 text-primary">{testedCount}</p>
              </div>
              <div className="p-3.5 rounded-xl border border-border/70 bg-card">
                <p className="text-[11px] text-muted-foreground uppercase tracking-wider">Passed (200 OK)</p>
                <p className="text-xl font-mono font-bold mt-1 text-emerald-500">{passedFunctionsCount}</p>
              </div>
              <div className="p-3.5 rounded-xl border border-border/70 bg-card">
                <p className="text-[11px] text-muted-foreground uppercase tracking-wider">Issues Detected</p>
                <p className={`text-xl font-mono font-bold mt-1 ${failedFunctionsCount > 0 ? "text-destructive" : "text-muted-foreground"}`}>
                  {failedFunctionsCount}
                </p>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="relative w-full sm:w-72">
                <Search className="h-3.5 w-3.5 absolute left-3 top-3.5 text-muted-foreground" />
                <input
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search edge functions..."
                  className="w-full h-10 pl-9 pr-3 rounded-xl border border-border bg-card text-[12.5px] outline-none focus:border-primary/60"
                />
              </div>

              <div className="flex items-center gap-1.5 w-full sm:w-auto overflow-x-auto">
                <button
                  onClick={() => setFilterType("all")}
                  className={`px-3 py-1.5 rounded-lg text-[12px] font-medium transition-colors ${
                    filterType === "all" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"
                  }`}
                >
                  All ({KNOWN_FUNCTIONS.length})
                </button>
                <button
                  onClick={() => setFilterType("ai")}
                  className={`px-3 py-1.5 rounded-lg text-[12px] font-medium transition-colors ${
                    filterType === "ai" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"
                  }`}
                >
                  AI Engines
                </button>
                <button
                  onClick={() => setFilterType("feed")}
                  className={`px-3 py-1.5 rounded-lg text-[12px] font-medium transition-colors ${
                    filterType === "feed" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Data Feeds
                </button>
                <button
                  onClick={() => setFilterType("error")}
                  className={`px-3 py-1.5 rounded-lg text-[12px] font-medium transition-colors ${
                    filterType === "error" ? "bg-destructive text-destructive-foreground" : "bg-muted text-muted-foreground hover:text-foreground"
                  }`}
                >
                  Issues Only
                </button>
              </div>
            </div>

            <div className="border border-border/70 rounded-xl divide-y divide-border/60 overflow-hidden bg-card">
              {filteredFunctions.map((fn) => {
                const res = functionResults[fn.name];
                const isTesting = testingFunction === fn.name || testingAllFunctions;
                return (
                  <div key={fn.name} className="p-4 space-y-2.5 hover:bg-muted/10 transition-colors">
                    <div className="flex items-center justify-between gap-4">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-[13.5px] font-mono font-semibold">{fn.name}</p>
                          <span className={`text-[10px] uppercase font-mono px-1.5 py-0.5 rounded border ${
                            fn.type === "ai" ? "bg-primary/10 text-primary border-primary/20" : "bg-muted text-muted-foreground border-border/40"
                          }`}>
                            {fn.type === "ai" ? "AI Engine" : "Market Feed"}
                          </span>
                        </div>
                        <p className="text-[12px] text-muted-foreground mt-0.5">{fn.description}</p>
                      </div>

                      <div className="flex items-center gap-3 shrink-0">
                        {res && (
                          <span className={`text-[11px] font-mono px-2 py-0.5 rounded-full flex items-center gap-1 ${
                            res.success ? "bg-emerald-500/10 text-emerald-500" : "bg-destructive/10 text-destructive"
                          }`}>
                            {res.success ? <CheckCircle2 className="h-3 w-3" /> : <AlertCircle className="h-3 w-3" />}
                            {res.status} ({res.latencyMs}ms)
                          </span>
                        )}
                        <Button
                          onClick={() => void testSingleFunction(fn.name)}
                          disabled={isTesting}
                          variant="outline"
                          size="sm"
                          className="h-8 text-[11px] px-2.5 gap-1"
                        >
                          {testingFunction === fn.name ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
                          Test
                        </Button>
                      </div>
                    </div>

                    {res && !res.success && (
                      <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 text-destructive text-[12px] space-y-1">
                        <div className="flex items-center gap-1.5 font-semibold">
                          <ShieldAlert className="h-4 w-4" />
                          <span>Issue Diagnosed ({res.status})</span>
                        </div>
                        <p className="font-mono text-[11px] opacity-90">{res.error}</p>
                        {res.diagnostic && (
                          <p className="text-[11.5px] text-foreground font-medium bg-background/50 p-2 rounded border border-destructive/20 mt-1">
                            💡 <strong>Action Required:</strong> {res.diagnostic}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* =========================================================================
            TAB 3: TELEMETRY & HEALTH LOGS
        ========================================================================= */}
        {activeTab === "health" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-[13px] font-semibold tracking-tight">Provider Telemetry & Latency Logs</h2>
                <p className="text-[11.5px] text-muted-foreground">Recorded dynamically per API request into public.api_key_health</p>
              </div>
              <Button onClick={() => void load()} variant="outline" size="sm" className="h-8 text-[11px] gap-1">
                <RotateCw className="h-3 w-3" /> Refresh Logs
              </Button>
            </div>

            <div className="border border-border/70 rounded-xl divide-y divide-border/60 overflow-hidden bg-card">
              {health.length === 0 && (
                <p className="py-8 text-[13px] text-muted-foreground text-center">
                  No telemetry recorded yet. Tap "Test All Keys" or "Test All Functions" above to generate connectivity diagnostics.
                </p>
              )}
              {health.map((item) => (
                <div key={item.credential_name} className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      {item.last_status === "ok" ? (
                        <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0" />
                      ) : (
                        <AlertCircle className="h-4 w-4 text-destructive shrink-0" />
                      )}
                      <p className="truncate text-[13px] font-mono font-semibold">{item.credential_name}</p>
                      <span className="text-[10px] uppercase font-mono px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
                        {item.provider} · {item.source}
                      </span>
                    </div>
                    {item.last_error && (
                      <p className="mt-1 text-[11.5px] text-destructive font-mono truncate pl-6" title={item.last_error}>
                        {item.last_error}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-4 text-[12px] font-mono tabular-nums text-muted-foreground pl-6 sm:pl-0 shrink-0">
                    <span>{item.last_latency_ms ?? 0} ms</span>
                    <span className="text-emerald-500 font-semibold">{item.success_count} ok</span>
                    <span className="text-destructive font-semibold">{item.failure_count} err</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
