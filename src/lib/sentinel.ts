/**
 * Portfolio Sentinel — client bridge.
 * Registers positions for background monitoring, fetches alerts,
 * and updates user preferences (email toggle, drawdown thresholds).
 */
import { supabase } from "@/integrations/supabase/client";

export type RiskAlert = {
  id: string;
  ticker: string;
  alert_type: string;
  severity: "info" | "warning" | "critical";
  title: string;
  message: string;
  payload: any;
  email_status: string;
  dismissed: boolean;
  created_at: string;
};

export type AlertPrefs = {
  email_enabled: boolean;
  default_drawdown_pct: number;
  default_peak_drawdown_pct: number;
  cooldown_minutes: number;
  refresh_hours: number;
};

export async function registerWatch(ticker: string, entryPrice: number, quantity: number) {
  try {
    await supabase.functions.invoke("portfolio-sentinel", {
      body: { action: "register", ticker, entry_price: entryPrice, quantity },
    });
  } catch (e) { console.warn("[sentinel] register failed", e); }
}

export async function unregisterWatch(ticker: string) {
  try {
    await supabase.functions.invoke("portfolio-sentinel", {
      body: { action: "unregister", ticker },
    });
  } catch (e) { console.warn("[sentinel] unregister failed", e); }
}

export async function fetchAlerts(limit = 50): Promise<RiskAlert[]> {
  const { data } = await (supabase as any)
    .from("risk_alerts")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data as RiskAlert[]) || [];
}

export async function dismissAlert(id: string) {
  await (supabase as any).from("risk_alerts").update({ dismissed: true }).eq("id", id);
}

export async function fetchPrefs(): Promise<AlertPrefs | null> {
  const { data } = await (supabase as any).from("alert_preferences").select("*").maybeSingle();
  return (data as AlertPrefs) || null;
}

export async function upsertPrefs(prefs: Partial<AlertPrefs>) {
  const { data: u } = await supabase.auth.getUser();
  if (!u?.user) return;
  await (supabase as any).from("alert_preferences").upsert({ user_id: u.user.id, ...prefs }, { onConflict: "user_id" });
}

export async function scanNow() {
  try {
    await supabase.functions.invoke("portfolio-sentinel", { body: { action: "scan" } });
  } catch (e) { console.warn("[sentinel] scan failed", e); }
}
