import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { DEMO_PREFIX } from "../_shared/demoAuth.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const TTL_MINUTES = 45;
const DEMO_SCOPE = [
  "portfolio:read",
  "risk:read",
  "intelligence:read",
  "news:read",
  "analytics:read",
];

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

/* ── token: base64url(payload).hex(hmac-sha256) ── */

const enc = new TextEncoder();

function b64url(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function b64urlDecode(s: string) {
  const pad = s.replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(pad + "=".repeat((4 - (pad.length % 4)) % 4));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

async function key() {
  const secret = Deno.env.get("DEMO_SESSION_SECRET");
  if (!secret) throw new Error("demo session not configured");
  return await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
    "verify",
  ]);
}

async function sign(payload: Record<string, unknown>) {
  const body = b64url(enc.encode(JSON.stringify(payload)));
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", await key(), enc.encode(body)));
  const hex = [...mac].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${DEMO_PREFIX}${body}.${hex}`;
}

async function verify(token: string): Promise<Record<string, any> | null> {
  if (!token.startsWith(DEMO_PREFIX)) return null;
  const parts = token.slice(DEMO_PREFIX.length).split(".");
  if (parts.length !== 2) return null;
  const [body, hex] = parts;
  if (!/^[0-9a-f]{64}$/.test(hex)) return null;
  const mac = Uint8Array.from(hex.match(/.{2}/g)!.map((h) => parseInt(h, 16)));
  const ok = await crypto.subtle.verify("HMAC", await key(), mac, enc.encode(body));
  if (!ok) return null;
  try {
    const payload = JSON.parse(new TextDecoder().decode(b64urlDecode(body)));
    if (typeof payload?.exp !== "number" || payload.exp <= Date.now()) return null;
    if (payload?.demo !== true) return null;
    return payload;
  } catch {
    return null;
  }
}

/* ── constant-time compare ── */
function equals(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function admin() {
  return createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false },
  });
}

/** Resolves the demo portfolio owner id from the configured email. Never returned to the client. */
async function resolveDemoOwner(): Promise<string | null> {
  const email = (Deno.env.get("DEMO_PORTFOLIO_EMAIL") || "").trim().toLowerCase();
  if (!email) return null;
  const sb = admin();
  for (let page = 1; page <= 10; page++) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage: 200 });
    if (error || !data?.users?.length) return null;
    const hit = data.users.find((u: any) => (u.email || "").toLowerCase() === email);
    if (hit) return hit.id;
    if (data.users.length < 200) return null;
  }
  return null;
}

/** Read-only snapshot of the demo portfolio context. */
async function snapshot(ownerId: string) {
  const sb = admin();
  const [portfolio, history] = await Promise.all([
    sb.from("user_portfolios").select("id, ticker, buy_price, quantity, analysis, created_at").eq("user_id", ownerId).order("created_at"),
    sb
      .from("user_analysis_history")
      .select("id, ticker, timestamp, suggestion, current_price, buy_price, confidence")
      .eq("user_id", ownerId)
      .order("timestamp", { ascending: false })
      .limit(50),
  ]);
  return {
    portfolio: (portfolio.data ?? []).map((r: any) => ({
      id: r.id,
      ticker: r.ticker,
      buyPrice: Number(r.buy_price),
      quantity: Number(r.quantity),
      analysis: r.analysis ?? undefined,
      createdAt: r.created_at,
    })),
    history: (history.data ?? []).map((r: any) => ({
      id: r.id,
      ticker: r.ticker,
      timestamp: Number(r.timestamp),
      suggestion: r.suggestion,
      currentPrice: Number(r.current_price),
      buyPrice: Number(r.buy_price),
      confidence: Number(r.confidence),
    })),
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  let body: any = {};
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid request" }, 400);
  }

  const action = body?.action === "resume" ? "resume" : "create";

  try {
    if (action === "resume") {
      const token = typeof body?.token === "string" ? body.token : "";
      const payload = await verify(token);
      if (!payload) return json({ error: "Demo session expired" }, 401);
      const data = await snapshot(payload.sub);
      return json({ demo: true, expiresAt: payload.exp, scope: payload.scope, label: payload.label, ...data });
    }

    // ── create ──
    const expected = Deno.env.get("DEMO_ACCESS_CODE") || "";
    const code = typeof body?.code === "string" ? body.code.trim() : "";
    if (!/^\d{4}$/.test(code)) return json({ error: "That access code isn't valid." }, 401);
    if (!expected || !equals(code, expected)) return json({ error: "That access code isn't valid." }, 401);

    const ownerId = await resolveDemoOwner();
    if (!ownerId) return json({ error: "Demo workspace is unavailable right now." }, 503);

    const exp = Date.now() + TTL_MINUTES * 60_000;
    const token = await sign({ demo: true, sub: ownerId, exp, scope: DEMO_SCOPE, label: "Demo Workspace" });
    const data = await snapshot(ownerId);

    return json({
      demo: true,
      token,
      expiresAt: exp,
      scope: DEMO_SCOPE,
      label: "Demo Workspace",
      ...data,
    });
  } catch (e) {
    console.error("demo-session error", e instanceof Error ? e.message : e);
    return json({ error: "Demo workspace is unavailable right now." }, 500);
  }
});