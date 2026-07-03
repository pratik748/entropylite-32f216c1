import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const FROM_EMAIL = Deno.env.get("ALERT_FROM_EMAIL") || "EntropyLite Sentinel <onboarding@resend.dev>";

function escapeHtml(s: unknown): string {
  return String(s ?? "").replace(/[&<>"']/g, (c) => (
    { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string
  ));
}

const SEVERITY_COLOR: Record<string, string> = {
  critical: "#dc2626",
  warning: "#d97706",
  info: "#2563eb",
};

type AlertPayload = { type: string; severity: string; title: string; message: string };

function renderPortfolioRiskAlert(data: { ticker: string; subject: string; alerts: AlertPayload[] }) {
  const rows = data.alerts.map((a) => `
    <tr>
      <td style="padding:16px;border-bottom:1px solid #e5e7eb;">
        <div style="font-size:11px;font-weight:700;letter-spacing:.05em;text-transform:uppercase;color:${SEVERITY_COLOR[a.severity] || "#6b7280"};margin-bottom:6px;">${escapeHtml(a.severity)}</div>
        <div style="font-size:16px;font-weight:600;color:#111827;margin-bottom:4px;">${escapeHtml(a.title)}</div>
        <div style="font-size:13px;color:#4b5563;line-height:1.5;">${escapeHtml(a.message)}</div>
      </td>
    </tr>`).join("");

  const html = `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f3f4f6;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:24px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:8px;overflow:hidden;border:1px solid #e5e7eb;">
            <tr>
              <td style="background:#111827;padding:20px 24px;">
                <div style="color:#f9fafb;font-size:13px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;">Portfolio Sentinel</div>
                <div style="color:#9ca3af;font-size:12px;margin-top:2px;">${escapeHtml(data.ticker)} — risk alert</div>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 24px 0 24px;">
                <div style="font-size:15px;color:#111827;font-weight:600;">${escapeHtml(data.subject)}</div>
              </td>
            </tr>
            <tr>
              <td style="padding:8px 24px 0 24px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                  ${rows}
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 24px;color:#9ca3af;font-size:11px;">
                Automated risk monitoring — not investment advice. Review your position and act on your own judgement.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const text = `${data.subject}\n\n` + data.alerts.map((a) =>
    `[${a.severity.toUpperCase()}] ${a.title}\n${a.message}`
  ).join("\n\n");

  return { subject: data.subject, html, text };
}

type TemplateName = "portfolio-risk-alert";

const TEMPLATES: Record<TemplateName, (data: any) => { subject: string; html: string; text: string }> = {
  "portfolio-risk-alert": renderPortfolioRiskAlert,
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  // Internal-only: this function sends real email through a paid provider and
  // must not be reachable by the public anon key embedded in the client bundle.
  const authHeader = req.headers.get("Authorization") || "";
  if (authHeader !== `Bearer ${SERVICE_KEY}`) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  try {
    const body = await req.json().catch(() => ({}));
    const { templateName, recipientEmail, idempotencyKey, templateData } = body as {
      templateName: TemplateName;
      recipientEmail: string;
      idempotencyKey: string;
      templateData: any;
    };

    if (!recipientEmail || !templateName || !idempotencyKey) {
      return new Response(JSON.stringify({ error: "recipientEmail, templateName, idempotencyKey required" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const render = TEMPLATES[templateName];
    if (!render) {
      return new Response(JSON.stringify({ error: `unknown template ${templateName}` }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Idempotency guard: insert first. The unique constraint on idempotency_key
    // makes concurrent/retried sends collapse into a single delivered email.
    const { error: dupError } = await admin.from("email_log").insert({
      idempotency_key: idempotencyKey,
      recipient_email: recipientEmail,
      template_name: templateName,
      status: "sending",
    });
    if (dupError) {
      if (dupError.code === "23505") {
        return new Response(JSON.stringify({ status: "duplicate", skipped: true }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      throw dupError;
    }

    if (!RESEND_API_KEY) {
      await admin.from("email_log").update({ status: "failed", error: "RESEND_API_KEY not configured" }).eq("idempotency_key", idempotencyKey);
      return new Response(JSON.stringify({ error: "email provider not configured (RESEND_API_KEY missing)" }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const rendered = render(templateData);
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: FROM_EMAIL,
        to: [recipientEmail],
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
      }),
    });

    const resJson = await res.json().catch(() => ({}));
    if (!res.ok) {
      await admin.from("email_log").update({ status: "failed", error: JSON.stringify(resJson).slice(0, 500) }).eq("idempotency_key", idempotencyKey);
      console.error("resend send failed", res.status, resJson);
      return new Response(JSON.stringify({ error: "send failed", detail: resJson }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await admin.from("email_log").update({ status: "sent", provider_message_id: resJson?.id || null }).eq("idempotency_key", idempotencyKey);
    return new Response(JSON.stringify({ status: "sent", id: resJson?.id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("send-transactional-email error:", err);
    return new Response(JSON.stringify({ error: err.message || String(err) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
