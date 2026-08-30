import React, { useState, useEffect } from "react";
import { Shield, Sparkles, CheckCircle2, XCircle, Loader2, Save, Trash2, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  fetchAdminAIConfig,
  saveAdminAIConfig,
  testAdminAIConnection,
  deleteAdminAIConfig,
} from "@/lib/adminAIConfig";
import type { AdminAIConfig, AIProvider } from "@/types/adminAIConfig";
import { toast } from "@/hooks/use-toast";

const PROVIDERS: { value: AIProvider; label: string; defaultModel: string; defaultUrl?: string }[] = [
  { value: "mistral", label: "Mistral AI", defaultModel: "mistral-large-latest", defaultUrl: "https://api.mistral.ai/v1/chat/completions" },
  { value: "openai", label: "OpenAI", defaultModel: "gpt-4o", defaultUrl: "https://api.openai.com/v1/chat/completions" },
  { value: "gemini", label: "Google Gemini", defaultModel: "gemini-2.0-flash", defaultUrl: "" },
  { value: "anthropic", label: "Anthropic Claude", defaultModel: "claude-3-7-sonnet-20250219", defaultUrl: "https://api.anthropic.com/v1/messages" },
  { value: "openrouter", label: "OpenRouter", defaultModel: "anthropic/claude-3.7-sonnet", defaultUrl: "https://openrouter.ai/api/v1/chat/completions" },
  { value: "custom", label: "Custom / Self-Hosted", defaultModel: "default", defaultUrl: "" },
];

export const AdminAIConfigPanel: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [deleting, setDeleting] = useState(false);

  // Form State
  const [provider, setProvider] = useState<AIProvider>("mistral");
  const [model, setModel] = useState("mistral-large-latest");
  const [apiKey, setApiKey] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [apiVersion, setApiVersion] = useState("");
  const [enabled, setEnabled] = useState(true);

  // Status & Metadata
  const [savedConfig, setSavedConfig] = useState<AdminAIConfig | null>(null);
  const [connectionStatus, setConnectionStatus] = useState<{
    connected?: boolean;
    latencyMs?: number;
    message?: string;
  } | null>(null);

  useEffect(() => {
    loadConfig();
  }, []);

  async function loadConfig() {
    setLoading(true);
    try {
      const config = await fetchAdminAIConfig();
      if (config) {
        setSavedConfig(config);
        setProvider(config.provider);
        setModel(config.model);
        setBaseUrl(config.baseUrl || "");
        setApiVersion(config.apiVersion || "");
        setEnabled(config.enabled);
      }
    } catch (err: any) {
      console.error("Error loading admin AI config:", err);
      toast({
        title: "Configuration Error",
        description: "Failed to load admin AI configuration.",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  }

  const handleProviderChange = (newProvider: AIProvider) => {
    setProvider(newProvider);
    const meta = PROVIDERS.find((p) => p.value === newProvider);
    if (meta) {
      setModel(meta.defaultModel);
      if (meta.defaultUrl) {
        setBaseUrl(meta.defaultUrl);
      } else if (newProvider !== "custom") {
        setBaseUrl("");
      }
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!provider || !model) {
      toast({
        title: "Validation Error",
        description: "Please specify both provider and model name.",
        variant: "destructive",
      });
      return;
    }

    if (!savedConfig && !apiKey) {
      toast({
        title: "API Key Required",
        description: "Please enter an API key for initial configuration.",
        variant: "destructive",
      });
      return;
    }

    setSaving(true);
    try {
      await saveAdminAIConfig({
        provider,
        model,
        apiKey: apiKey || "UNCHANGED", // backend can handle or requires key on new
        baseUrl: baseUrl || undefined,
        apiVersion: apiVersion || undefined,
        enabled,
      });

      toast({
        title: "Configuration Saved",
        description: "Global AI provider settings have been saved.",
      });

      setApiKey(""); // Clear sensitive key from local memory immediately
      await loadConfig();
    } catch (err: any) {
      toast({
        title: "Save Failed",
        description: err?.message || "Failed to save configuration.",
        variant: "destructive",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleTestConnection = async () => {
    setTesting(true);
    setConnectionStatus(null);

    try {
      const res = await testAdminAIConnection({
        provider,
        model,
        apiKey: apiKey || undefined,
        baseUrl: baseUrl || undefined,
      });

      setConnectionStatus({
        connected: res.success,
        latencyMs: res.latencyMs,
        message: res.message,
      });

      if (res.success) {
        toast({
          title: "Connection Successful",
          description: `Connected to ${provider} in ${res.latencyMs || 0}ms.`,
        });
      } else {
        toast({
          title: "Connection Failed",
          description: res.message || "Failed to reach AI endpoint.",
          variant: "destructive",
        });
      }
    } catch (err: any) {
      setConnectionStatus({
        connected: false,
        message: err?.message || "Network error",
      });
      toast({
        title: "Test Error",
        description: err?.message || "Could not execute connection test.",
        variant: "destructive",
      });
    } finally {
      setTesting(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm("Are you sure you want to remove the global AI configuration? The system will revert to standard fallback routing.")) {
      return;
    }

    setDeleting(true);
    try {
      await deleteAdminAIConfig();
      setSavedConfig(null);
      setApiKey("");
      setConnectionStatus(null);
      toast({
        title: "Configuration Removed",
        description: "Global AI configuration deleted. System returned to default fallbacks.",
      });
    } catch (err: any) {
      toast({
        title: "Delete Failed",
        description: err?.message || "Failed to delete configuration.",
        variant: "destructive",
      });
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="rounded-xl border border-border/80 bg-card p-6 flex items-center justify-center space-x-2">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        <span className="text-xs font-mono text-muted-foreground uppercase tracking-wider">
          Loading Admin Control…
        </span>
      </div>
    );
  }

  return (
    <div className="w-full rounded-xl border border-border/80 bg-card shadow-soft p-5 space-y-5">
      {/* Header */}
      <div className="flex items-start justify-between border-b border-border/60 pb-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border/80 bg-surface-2 text-foreground">
            <Shield className="h-4 w-4 text-foreground" strokeWidth={2} />
          </span>
          <div>
            <div className="text-[11px] font-mono uppercase tracking-widest text-primary font-bold">
              Admin Control
            </div>
            <h3 className="text-sm font-semibold text-foreground tracking-tight">
              Global AI API Configuration
            </h3>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {savedConfig && (
            <span className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider text-muted-foreground bg-surface-2 px-2 py-0.5 rounded border border-border/60">
              <span className={`h-1.5 w-1.5 rounded-full ${savedConfig.enabled ? "bg-gain animate-pulse" : "bg-muted-foreground/50"}`} />
              {savedConfig.enabled ? "Global AI: Active" : "Global AI: Disabled"}
            </span>
          )}
        </div>
      </div>

      <p className="text-[11.5px] text-muted-foreground leading-relaxed">
        Global AI configuration is used by EntropyLite for users who have not configured their own AI provider.
        Credential keys are encrypted at rest and never transmitted back to the client.
      </p>

      {/* Form */}
      <form onSubmit={handleSave} className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Provider */}
          <div className="space-y-1.5">
            <Label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
              Global AI Provider
            </Label>
            <Select value={provider} onValueChange={(v) => handleProviderChange(v as AIProvider)}>
              <SelectTrigger className="h-9 text-xs">
                <SelectValue placeholder="Select Provider" />
              </SelectTrigger>
              <SelectContent>
                {PROVIDERS.map((p) => (
                  <SelectItem key={p.value} value={p.value} className="text-xs">
                    {p.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Model */}
          <div className="space-y-1.5">
            <Label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
              Model Name
            </Label>
            <Input
              type="text"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder="e.g. mistral-large-latest"
              className="h-9 text-xs font-mono"
              required
            />
          </div>

          {/* API Key */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                API Key
              </Label>
              {savedConfig && (
                <span className="text-[9px] font-mono text-muted-foreground/70">
                  •••••••••••••••• (Encrypted on Server)
                </span>
              )}
            </div>
            <div className="relative">
              <Input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={savedConfig ? "Enter new key to replace existing" : "Paste secret API key"}
                className="h-9 text-xs font-mono pr-8"
              />
              <KeyRound className="h-3.5 w-3.5 absolute right-2.5 top-2.5 text-muted-foreground/50 pointer-events-none" />
            </div>
          </div>

          {/* Base URL */}
          <div className="space-y-1.5">
            <Label className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
              API Endpoint / Base URL (Optional)
            </Label>
            <Input
              type="text"
              value={baseUrl}
              onChange={(e) => setBaseUrl(e.target.value)}
              placeholder="https://..."
              className="h-9 text-xs font-mono"
            />
          </div>
        </div>

        {/* Global AI Active Toggle & Status */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between pt-2 border-t border-border/40 gap-3">
          <div className="flex items-center space-x-2">
            <Switch
              id="global-ai-toggle"
              checked={enabled}
              onCheckedChange={setEnabled}
            />
            <Label htmlFor="global-ai-toggle" className="text-xs font-medium cursor-pointer">
              Enable Global AI Routing
            </Label>
          </div>

          {/* Connection status badge */}
          {connectionStatus && (
            <div className="flex items-center gap-1.5 text-xs font-mono">
              {connectionStatus.connected ? (
                <>
                  <CheckCircle2 className="h-3.5 w-3.5 text-gain" />
                  <span className="text-gain">Connected ({connectionStatus.latencyMs}ms)</span>
                </>
              ) : (
                <>
                  <XCircle className="h-3.5 w-3.5 text-destructive" />
                  <span className="text-destructive truncate max-w-[200px]" title={connectionStatus.message}>
                    {connectionStatus.message || "Failed"}
                  </span>
                </>
              )}
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-between pt-2">
          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleTestConnection}
              disabled={testing || (!apiKey && !savedConfig)}
              className="h-8 text-xs font-mono"
            >
              {testing ? (
                <>
                  <Loader2 className="h-3 w-3 animate-spin mr-1.5" />
                  Testing…
                </>
              ) : (
                <>
                  <Sparkles className="h-3 w-3 mr-1.5" />
                  Test Connection
                </>
              )}
            </Button>

            {savedConfig && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleDelete}
                disabled={deleting}
                className="h-8 text-xs text-destructive hover:text-destructive hover:bg-destructive/10 font-mono"
              >
                {deleting ? (
                  <Loader2 className="h-3 w-3 animate-spin mr-1.5" />
                ) : (
                  <Trash2 className="h-3 w-3 mr-1.5" />
                )}
                Remove
              </Button>
            )}
          </div>

          <Button
            type="submit"
            size="sm"
            disabled={saving}
            className="h-8 text-xs font-mono"
          >
            {saving ? (
              <>
                <Loader2 className="h-3 w-3 animate-spin mr-1.5" />
                Saving…
              </>
            ) : (
              <>
                <Save className="h-3 w-3 mr-1.5" />
                Save Configuration
              </>
            )}
          </Button>
        </div>
      </form>
    </div>
  );
};

export default AdminAIConfigPanel;
