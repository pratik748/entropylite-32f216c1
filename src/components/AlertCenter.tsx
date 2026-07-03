import { useEffect, useState } from "react";
import { Bell, X, ShieldAlert, TrendingDown, Split, Target as TargetIcon, RefreshCcw, AlertTriangle, Mail, WifiOff } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { fetchAlerts, fetchPrefs, upsertPrefs, dismissAlert, scanNow, type RiskAlert, type AlertPrefs } from "@/lib/sentinel";

const icons: Record<string, any> = {
  drawdown_entry: TrendingDown,
  drawdown_peak: TrendingDown,
  split: Split,
  max_profit: TargetIcon,
  verdict_flip: ShieldAlert,
  stale: RefreshCcw,
  analysis_failing: WifiOff,
};

export default function AlertCenter() {
  const [alerts, setAlerts] = useState<RiskAlert[]>([]);
  const [prefs, setPrefs] = useState<AlertPrefs | null>(null);
  const [open, setOpen] = useState(false);
  const [scanning, setScanning] = useState(false);

  const refresh = async () => {
    const [a, p] = await Promise.all([fetchAlerts(30), fetchPrefs()]);
    setAlerts(a);
    setPrefs(p ?? { email_enabled: true, default_drawdown_pct: 8, default_peak_drawdown_pct: 12, cooldown_minutes: 240, refresh_hours: 4 });
  };

  useEffect(() => { refresh(); }, []);

  // realtime subscription — new alerts appear instantly
  useEffect(() => {
    const ch = (supabase as any).channel("risk_alerts_live")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "risk_alerts" }, () => refresh())
      .subscribe();
    return () => { (supabase as any).removeChannel(ch); };
  }, []);

  const unread = alerts.filter(a => !a.dismissed).length;
  const critical = alerts.some(a => !a.dismissed && a.severity === "critical");

  const savePrefs = async (partial: Partial<AlertPrefs>) => {
    const next = { ...(prefs || {} as AlertPrefs), ...partial };
    setPrefs(next);
    await upsertPrefs(partial);
  };

  const doScan = async () => { setScanning(true); await scanNow(); await refresh(); setScanning(false); };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className="relative p-1.5 rounded-md hover:bg-accent text-muted-foreground hover:text-foreground transition-colors"
          title="Portfolio Sentinel — Risk Alerts"
          aria-label="Alerts"
        >
          <Bell className={`h-3.5 w-3.5 sm:h-4 sm:w-4 ${critical ? "text-loss" : ""}`} />
          {unread > 0 && (
            <span className={`absolute -top-0.5 -right-0.5 min-w-[14px] h-[14px] rounded-full text-[9px] font-mono font-bold flex items-center justify-center px-1 ${critical ? "bg-loss text-white animate-pulse" : "bg-warning text-black"}`}>
              {unread > 99 ? "99+" : unread}
            </span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[360px] p-0 max-h-[70vh] overflow-hidden flex flex-col">
        <div className="p-3 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-4 w-4 text-primary" />
            <span className="font-mono text-xs font-semibold uppercase tracking-wider">Portfolio Sentinel</span>
          </div>
          <Button size="sm" variant="ghost" className="h-6 text-[10px] font-mono" onClick={doScan} disabled={scanning}>
            <RefreshCcw className={`h-3 w-3 mr-1 ${scanning ? "animate-spin" : ""}`} />
            {scanning ? "Scanning" : "Scan now"}
          </Button>
        </div>

        <div className="flex-1 overflow-y-auto">
          {alerts.length === 0 ? (
            <div className="p-6 text-center text-xs text-muted-foreground">
              <AlertTriangle className="h-6 w-6 mx-auto mb-2 opacity-40" />
              <div>No alerts yet.</div>
              <div className="mt-1 opacity-70">Add positions and the Sentinel will watch them every 30 min.</div>
            </div>
          ) : alerts.map(a => {
            const Icon = icons[a.alert_type] || AlertTriangle;
            const color = a.severity === "critical" ? "text-loss" : a.severity === "warning" ? "text-warning" : "text-muted-foreground";
            return (
              <div key={a.id} className={`p-3 border-b border-border/60 flex gap-2 ${a.dismissed ? "opacity-40" : ""}`}>
                <Icon className={`h-4 w-4 mt-0.5 shrink-0 ${color}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <div className="font-mono text-[11px] font-semibold truncate">{a.title}</div>
                    {!a.dismissed && (
                      <button onClick={() => dismissAlert(a.id).then(refresh)} className="text-muted-foreground hover:text-foreground">
                        <X className="h-3 w-3" />
                      </button>
                    )}
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">{a.message}</div>
                  <div className="flex items-center gap-2 mt-1 text-[9px] text-muted-foreground/70 font-mono">
                    <span>{new Date(a.created_at).toLocaleString()}</span>
                    {a.email_status === "sent" && <span className="flex items-center gap-0.5 text-primary"><Mail className="h-2.5 w-2.5" />sent</span>}
                    {a.email_status === "pending" && <span className="opacity-60">email pending</span>}
                    {a.email_status === "failed" && <span className="text-loss">email failed</span>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {prefs && (
          <div className="p-3 border-t border-border bg-surface-1/50 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground">Email alerts</span>
              <Switch checked={prefs.email_enabled} onCheckedChange={(v) => savePrefs({ email_enabled: v })} />
            </div>
            <div>
              <div className="flex items-center justify-between text-[10px] font-mono">
                <span className="text-muted-foreground">Entry drawdown</span>
                <span className="text-loss">-{prefs.default_drawdown_pct}%</span>
              </div>
              <Slider value={[prefs.default_drawdown_pct]} min={3} max={25} step={1} onValueChange={([v]) => savePrefs({ default_drawdown_pct: v })} />
            </div>
            <div>
              <div className="flex items-center justify-between text-[10px] font-mono">
                <span className="text-muted-foreground">Trailing from peak</span>
                <span className="text-warning">-{prefs.default_peak_drawdown_pct}%</span>
              </div>
              <Slider value={[prefs.default_peak_drawdown_pct]} min={5} max={40} step={1} onValueChange={([v]) => savePrefs({ default_peak_drawdown_pct: v })} />
            </div>
            <div>
              <div className="flex items-center justify-between text-[10px] font-mono">
                <span className="text-muted-foreground">Re-analyze every</span>
                <span>{prefs.refresh_hours}h</span>
              </div>
              <Slider value={[prefs.refresh_hours]} min={1} max={24} step={1} onValueChange={([v]) => savePrefs({ refresh_hours: v })} />
            </div>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
