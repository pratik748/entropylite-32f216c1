import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const ALPACA_BASE = "https://paper-api.alpaca.markets";

async function alpacaFetch(path: string, method: string, body?: unknown) {
  const key = Deno.env.get("ALPACA_API_KEY");
  const secret = Deno.env.get("ALPACA_SECRET_KEY");
  if (!key || !secret) throw new Error("Alpaca credentials not configured");

  const opts: RequestInit = {
    method,
    headers: {
      "APCA-API-KEY-ID": key,
      "APCA-API-SECRET-KEY": secret,
      "Content-Type": "application/json",
    },
  };
  if (body) opts.body = JSON.stringify(body);

  const res = await fetch(`${ALPACA_BASE}${path}`, opts);
  const data = await res.json();
  if (!res.ok) throw new Error(`Alpaca ${res.status}: ${JSON.stringify(data)}`);
  return data;
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { action, ...params } = await req.json();

    let result: unknown;

    switch (action) {
      // Submit a new order
      case "submit_order": {
        const { symbol, qty, side, type = "market", time_in_force = "day", limit_price, stop_price } = params;
        const orderBody: Record<string, unknown> = { symbol, qty: String(qty), side, type, time_in_force };
        if (limit_price) orderBody.limit_price = String(limit_price);
        if (stop_price) orderBody.stop_price = String(stop_price);
        result = await alpacaFetch("/v2/orders", "POST", orderBody);
        break;
      }

      // List open orders
      case "list_orders": {
        const status = params.status || "open";
        result = await alpacaFetch(`/v2/orders?status=${status}&limit=50`, "GET");
        break;
      }

      // Cancel an order
      case "cancel_order": {
        result = await alpacaFetch(`/v2/orders/${params.order_id}`, "DELETE");
        break;
      }

      // Get all positions
      case "list_positions": {
        result = await alpacaFetch("/v2/positions", "GET");
        break;
      }

      // Close a position
      case "close_position": {
        result = await alpacaFetch(`/v2/positions/${params.symbol}`, "DELETE");
        break;
      }

      // Close all positions
      case "close_all": {
        result = await alpacaFetch("/v2/positions?cancel_orders=true", "DELETE");
        break;
      }

      // Get account info (buying power, equity, etc.)
      case "account": {
        result = await alpacaFetch("/v2/account", "GET");
        break;
      }

      // Get portfolio history
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
  } catch (err) {
    console.error("alpaca-trading error:", err);
    return new Response(JSON.stringify({ error: err.message || "Alpaca trading failed" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
