import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const ALPACA_BASE = "https://paper-api.alpaca.markets";

async function alpacaFetch(path: string, method: string, body?: unknown) {
  const key = Deno.env.get("ALPACA_API_KEY");
  const secret = Deno.env.get("ALPACA_SECRET_KEY");
  if (!key || !secret) throw new Error("Alpaca API keys not configured. Add ALPACA_API_KEY and ALPACA_SECRET_KEY in your backend secrets.");

  const headers: Record<string, string> = {
    "APCA-API-KEY-ID": key,
    "APCA-API-SECRET-KEY": secret,
    "Content-Type": "application/json",
    "Accept": "application/json",
  };

  const opts: RequestInit = { method, headers };
  if (body && (method === "POST" || method === "PUT" || method === "PATCH")) {
    opts.body = JSON.stringify(body);
  }

  console.log(`Alpaca ${method} ${path}`);
  const res = await fetch(`${ALPACA_BASE}${path}`, opts);
  
  // DELETE returns 204 No Content on success
  if (res.status === 204) return { success: true };
  
  const text = await res.text();
  let data;
  try { data = JSON.parse(text); } catch { data = { raw: text }; }
  
  if (!res.ok) {
    console.error(`Alpaca error ${res.status}: ${text}`);
    throw new Error(data?.message || data?.error || `Alpaca returned ${res.status}: ${text.slice(0, 200)}`);
  }
  return data;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { action, ...params } = await req.json();

    let result: unknown;

    switch (action) {
      case "submit_order": {
        const { symbol, qty, side, type = "market", time_in_force = "day", limit_price, stop_price } = params;
        if (!symbol || !qty || !side) throw new Error("Missing required fields: symbol, qty, side");
        const orderBody: Record<string, unknown> = { symbol: symbol.toUpperCase(), qty: String(qty), side, type, time_in_force };
        if (limit_price) orderBody.limit_price = String(limit_price);
        if (stop_price) orderBody.stop_price = String(stop_price);
        result = await alpacaFetch("/v2/orders", "POST", orderBody);
        break;
      }

      case "list_orders": {
        const status = params.status || "open";
        result = await alpacaFetch(`/v2/orders?status=${status}&limit=50`, "GET");
        break;
      }

      case "cancel_order": {
        result = await alpacaFetch(`/v2/orders/${params.order_id}`, "DELETE");
        break;
      }

      case "list_positions": {
        result = await alpacaFetch("/v2/positions", "GET");
        break;
      }

      case "close_position": {
        result = await alpacaFetch(`/v2/positions/${params.symbol}`, "DELETE");
        break;
      }

      case "close_all": {
        result = await alpacaFetch("/v2/positions?cancel_orders=true", "DELETE");
        break;
      }

      case "account": {
        result = await alpacaFetch("/v2/account", "GET");
        break;
      }

      case "portfolio_history": {
        const period = params.period || "1D";
        const timeframe = params.timeframe || "5Min";
        result = await alpacaFetch(`/v2/account/portfolio/history?period=${period}&timeframe=${timeframe}`, "GET");
        break;
      }

      default:
        throw new Error(`Unknown action: ${action}`);
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: any) {
    console.error("alpaca-trading error:", err);
    return new Response(JSON.stringify({ error: err.message || "Alpaca trading failed" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
