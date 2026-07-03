import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/131.0.0.0 Safari/537.36";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

// ------- Yahoo quote with corporate-event detection -------
async function fetchQuote(symbol: string) {
  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1mo&events=div,split&_t=${Date.now()}`;
    const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/json" } });
    if (!res.ok) return null;
    const data = await res.json();
    const r = data?.chart?.result?.[0];
    const meta = r?.meta;
    if (!meta?.regularMarketPrice) return null;
    const price = meta.regularMarketPrice;
    const prev = meta.chartPreviousClose || meta.previousClose || price;
    // detect a split within the last 3 sessions
    const splits = r?.events?.splits ?? {};
    const now = Math.floor(Date.now() / 1000);
    let recentSplit: { ratio: string; date: number } | null = null;
    for (const key of Object.keys(splits)) {
      const s = splits[key];
      if (s?.date && now - s.date < 4 * 86400) {
        recentSplit = { ratio: s.splitRatio || `${s.numerator}:${s.denominator}`, date: s.date };
      }
    }
    return {
      price,
      prevClose: prev,
      changePct: prev > 0 ? ((price - prev) / prev) * 100 : 0,
      currency: meta.currency || "USD",
      recentSplit,
    };
  } catch { return null; }
}

// ------- alert delivery via transactional email -------
async function enqueueEmail(supabase: any, recipient: string, subject: string, ticker: string, alerts: any[]) {
  try {
    // functions.invoke resolves (does not throw) on non-2xx responses — the
    // real outcome lives in `error`/`data`, so it must be checked explicitly.
    const { data, error } = await supabase.functions.invoke("send-transactional-email", {
      body: {
        templateName: "portfolio-risk-alert",
        recipientEmail: recipient,
        idempotencyKey: `alert-${ticker}-${Date.now()}`,
        templateData: { ticker, subject, alerts },
      },
    });
    if (error) {
      console.error("email send failed", error);
      return "failed";
    }
    return data?.status === "duplicate" ? "duplicate" : "sent";
  } catch (e) {
    console.error("email send failed", e);
    return "failed";
  }
}

type Watch = {
  id: string;
  user_id: string;
  ticker: string;
  entry_price: number;
  quantity: number;
  peak_price: number | null;
  last_price: number | null;
  last_analysis_at: string | null;
  last_verdict: string | null;
  last_conviction: number | null;
  last_max_profit_target: number | null;
  drawdown_pct: number;
  peak_drawdown_pct: number;
  muted: boolean;
  alert_state: Record<string, string>; // trigger -> ISO ts of last fire
  consecutive_analysis_failures: number;
};

function withinCooldown(state: Record<string, string>, key: string, minutes: number): boolean {
  const last = state?.[key];
  if (!last) return false;
  return Date.now() - new Date(last).getTime() < minutes * 60_000;
}

async function scanWatch(supabase: any, w: Watch, prefs: any, userEmail: string | null) {
  if (w.muted) return { ticker: w.ticker, skipped: "muted" };
  const q = await fetchQuote(w.ticker);
  if (!q) return { ticker: w.ticker, skipped: "no-quote" };
  const price = q.price;
  const cooldown = prefs?.cooldown_minutes ?? 240;
  const state = { ...(w.alert_state || {}) };
  const alerts: any[] = [];
  const pnlPct = ((price - w.entry_price) / w.entry_price) * 100;
  const peak = Math.max(w.peak_price || w.entry_price, price);
  const drawFromPeak = ((price - peak) / peak) * 100;

  // 1) Corporate action (split)
  if (q.recentSplit && !withinCooldown(state, "split", 60 * 24)) {
    alerts.push({
      type: "split",
      severity: "info",
      title: `${w.ticker} — Corporate action detected`,
      message: `Yahoo reports a ${q.recentSplit.ratio} split. Price drop is mechanical, not a loss — verify quantity & basis.`,
    });
    state.split = new Date().toISOString();
  }

  // 2) Drawdown vs entry
  if (pnlPct <= -w.drawdown_pct && !withinCooldown(state, "drawdown_entry", cooldown)) {
    alerts.push({
      type: "drawdown_entry",
      severity: "critical",
      title: `${w.ticker} — Drawdown breach`,
      message: `Down ${pnlPct.toFixed(1)}% from your entry ($${w.entry_price.toFixed(2)} → $${price.toFixed(2)}). Threshold: -${w.drawdown_pct}%.`,
    });
    state.drawdown_entry = new Date().toISOString();
  }

  // 3) Drawdown vs peak (trailing)
  if (drawFromPeak <= -w.peak_drawdown_pct && peak > w.entry_price && !withinCooldown(state, "drawdown_peak", cooldown)) {
    alerts.push({
      type: "drawdown_peak",
      severity: "critical",
      title: `${w.ticker} — Trailing stop breached`,
      message: `Down ${drawFromPeak.toFixed(1)}% from peak $${peak.toFixed(2)} → $${price.toFixed(2)}. Consider taking remaining profit.`,
    });
    state.drawdown_peak = new Date().toISOString();
  }

  // 4) Max-profit ceiling
  if (w.last_max_profit_target && price >= w.last_max_profit_target && !withinCooldown(state, "max_profit", cooldown)) {
    alerts.push({
      type: "max_profit",
      severity: "warning",
      title: `${w.ticker} — Max profit zone`,
      message: `Price $${price.toFixed(2)} reached computed ceiling $${w.last_max_profit_target.toFixed(2)} (+${pnlPct.toFixed(1)}%). Beyond this, risk/reward deteriorates.`,
    });
    state.max_profit = new Date().toISOString();
  }

  // 5) Re-analysis (every refresh_hours OR after >3% single-session move)
  const refreshMs = (prefs?.refresh_hours ?? 4) * 3600_000;
  const lastAnalysis = w.last_analysis_at ? new Date(w.last_analysis_at).getTime() : 0;
  const stale = Date.now() - lastAnalysis > refreshMs;
  const bigMove = Math.abs(q.changePct) >= 3;
  let newVerdict = w.last_verdict;
  let newTarget = w.last_max_profit_target;
  let analysisRefreshed = false;
  let failureCount = w.consecutive_analysis_failures || 0;
  if (stale || bigMove) {
    try {
      const dp = await supabase.functions.invoke("direct-profit", { body: { ticker: w.ticker } });
      if (dp?.error) throw new Error(dp.error.message || "direct-profit invoke failed");
      const v = dp?.data?.action || null;
      // direct-profit returns confidence as a 0-100 number; `consensus` is a
      // plain string ("UNANIMOUS"/"MAJORITY"/"SPLIT"), not an object — there is
      // no `.conviction` field. Reading confidence directly fixes an alert that
      // otherwise silently never fires (always null >= 0.5 === false).
      const conf = typeof dp?.data?.confidence === "number" ? dp.data.confidence : null;
      newVerdict = v;
      newTarget = dp?.data?.targetPrice || w.last_max_profit_target;
      analysisRefreshed = true;
      failureCount = 0;
      // 6) Verdict flip
      if (w.last_verdict && w.last_verdict !== v && v === "SELL" && conf !== null && conf >= 50 && !withinCooldown(state, "verdict_flip", cooldown)) {
        alerts.push({
          type: "verdict_flip",
          severity: "critical",
          title: `${w.ticker} — Consensus flipped to ${v}`,
          message: `Previous verdict: ${w.last_verdict}. New verdict: ${v} (confidence ${conf.toFixed(0)}%). Re-evaluate the position.`,
        });
        state.verdict_flip = new Date().toISOString();
      }
    } catch (e) {
      // Do NOT stamp last_analysis_at here — a failed refresh must not look
      // "fresh". Track consecutive failures so a broken upstream call surfaces
      // as an alert instead of silently masquerading as an up-to-date position.
      failureCount += 1;
      console.warn("direct-profit refresh failed", w.ticker, (e as Error).message);
    }
  }

  // 7) Staleness (only if no re-analysis happened and >24h old)
  const stalenessCutoff = Date.now() - 24 * 3600_000;
  if (lastAnalysis && lastAnalysis < stalenessCutoff && !analysisRefreshed && !withinCooldown(state, "stale", 24 * 60)) {
    alerts.push({
      type: "stale",
      severity: "info",
      title: `${w.ticker} — Analysis is stale`,
      message: `Last refreshed ${Math.round((Date.now() - lastAnalysis) / 3600_000)}h ago. Auto-refresh queued.`,
    });
    state.stale = new Date().toISOString();
  }

  // 8) Repeated analysis failures — surfaced so a broken upstream call is
  // never mistaken for "nothing wrong". Fires after 3 consecutive misses
  // (~90 min at the default 30-min scan cadence).
  if (failureCount >= 3 && !withinCooldown(state, "analysis_failing", 6 * 60)) {
    alerts.push({
      type: "analysis_failing",
      severity: "warning",
      title: `${w.ticker} — Re-analysis failing`,
      message: `${failureCount} consecutive analysis attempts have failed. Verdict and profit-ceiling data may be out of date — check the position manually.`,
    });
    state.analysis_failing = new Date().toISOString();
  }

  // persist watch state
  await supabase.from("portfolio_watch").update({
    last_price: price,
    peak_price: peak,
    last_analysis_at: analysisRefreshed ? new Date().toISOString() : w.last_analysis_at,
    last_verdict: newVerdict,
    last_max_profit_target: newTarget,
    consecutive_analysis_failures: failureCount,
    alert_state: state,
  }).eq("id", w.id);

  // insert alerts + email
  if (alerts.length > 0) {
    for (const a of alerts) {
      await supabase.from("risk_alerts").insert({
        user_id: w.user_id,
        ticker: w.ticker,
        alert_type: a.type,
        severity: a.severity,
        title: a.title,
        message: a.message,
        payload: { price, entry: w.entry_price, pnlPct, peak, drawFromPeak },
        email_status: "pending",
      });
    }
    if (prefs?.email_enabled !== false && userEmail) {
      const status = await enqueueEmail(supabase, userEmail, `${w.ticker} — ${alerts.length} risk alert${alerts.length > 1 ? "s" : ""}`, w.ticker, alerts);
      await supabase.from("risk_alerts")
        .update({ email_status: status })
        .eq("user_id", w.user_id)
        .eq("ticker", w.ticker)
        .eq("email_status", "pending");
    }
  }

  return { ticker: w.ticker, price, alerts: alerts.length };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  try {
    const body = req.method === "POST" ? await req.json().catch(() => ({})) : {};
    const action = body.action || "scan";

    // --- user-scoped actions ---
    if (action === "register" || action === "unregister" || action === "list") {
      const authHeader = req.headers.get("Authorization") || "";
      const userClient = createClient(SUPABASE_URL, ANON_KEY, {
        global: { headers: { Authorization: authHeader } },
      });
      const { data: u } = await userClient.auth.getUser();
      if (!u?.user) return new Response(JSON.stringify({ error: "unauthorized" }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });

      if (action === "register") {
        const { ticker, entry_price, quantity, drawdown_pct, peak_drawdown_pct } = body;
        if (!ticker || !entry_price) return new Response(JSON.stringify({ error: "ticker + entry_price required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
        const { error } = await admin.from("portfolio_watch").upsert({
          user_id: u.user.id,
          ticker: String(ticker).toUpperCase(),
          entry_price: Number(entry_price),
          quantity: Number(quantity || 0),
          drawdown_pct: Number(drawdown_pct || 8),
          peak_drawdown_pct: Number(peak_drawdown_pct || 12),
          peak_price: Number(entry_price),
        }, { onConflict: "user_id,ticker" });
        if (error) throw error;
        // ensure prefs row
        await admin.from("alert_preferences").upsert({ user_id: u.user.id }, { onConflict: "user_id" });
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      if (action === "unregister") {
        await admin.from("portfolio_watch").delete().eq("user_id", u.user.id).eq("ticker", String(body.ticker).toUpperCase());
        return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      if (action === "list") {
        const { data } = await admin.from("portfolio_watch").select("*").eq("user_id", u.user.id);
        return new Response(JSON.stringify({ watches: data || [] }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
    }

    // --- scan (cron or manual) ---
    const targetUserId: string | null = body.user_id || null;
    let watchQuery = admin.from("portfolio_watch").select("*").eq("muted", false);
    if (targetUserId) watchQuery = watchQuery.eq("user_id", targetUserId);
    const { data: watches } = await watchQuery.limit(500);
    if (!watches || watches.length === 0) {
      return new Response(JSON.stringify({ scanned: 0 }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    // group by user for email + prefs fetch
    const userIds = Array.from(new Set(watches.map((w: any) => w.user_id)));
    const { data: prefsRows } = await admin.from("alert_preferences").select("*").in("user_id", userIds);
    const prefsByUser = new Map((prefsRows || []).map((p: any) => [p.user_id, p]));
    // fetch emails
    const emailByUser = new Map<string, string>();
    for (const uid of userIds) {
      try {
        const { data: ures } = await admin.auth.admin.getUserById(uid);
        if (ures?.user?.email) emailByUser.set(uid, ures.user.email);
      } catch { /* ignore */ }
    }

    const results: any[] = [];
    for (const w of watches as Watch[]) {
      const r = await scanWatch(admin, w, prefsByUser.get(w.user_id), emailByUser.get(w.user_id) || null);
      results.push(r);
    }

    return new Response(JSON.stringify({ scanned: results.length, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("portfolio-sentinel error:", err);
    return new Response(JSON.stringify({ error: err.message || String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
