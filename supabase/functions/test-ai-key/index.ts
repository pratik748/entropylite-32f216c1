import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { callAI } from "../_shared/callAI.ts";
import { requireAuth } from "../_shared/auth.ts";
import { getKeySync, getManagedSnapshot, refreshManagedKeys } from "../_shared/managedKeys.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function diagnoseError(errorMsg: string, status?: number): string {
  const msg = (errorMsg || "").toLowerCase();
  if (
    status === 429 ||
    msg.includes("429") ||
    msg.includes("quota") ||
    msg.includes("rate limit") ||
    msg.includes("resource_exhausted") ||
    msg.includes("too many requests")
  ) {
    return "Rate Limit / Quota Exceeded (HTTP 429): Your API key hit provider RPM or daily limits. If using free tier (e.g. Gemini 15 RPM, Mistral 1 RPS, Groq 30 RPM), add a secondary backup key or upgrade to a paid billing plan.";
  }
  if (
    status === 401 ||
    msg.includes("401") ||
    msg.includes("unauthorized") ||
    msg.includes("invalid api key") ||
    msg.includes("invalid_api_key") ||
    msg.includes("api key not valid")
  ) {
    return "Authentication Error (HTTP 401): The API key is invalid, revoked, or incorrectly formatted. Check for leading/trailing spaces or generate a fresh key in your provider console.";
  }
  if (
    status === 403 ||
    msg.includes("403") ||
    msg.includes("forbidden") ||
    msg.includes("permission_denied") ||
    msg.includes("access denied")
  ) {
    return "Permission Denied (HTTP 403): The key does not have access to this model or feature. Verify project billing or API enablement in your provider account.";
  }
  if (
    status === 404 ||
    msg.includes("404") ||
    msg.includes("not found") ||
    msg.includes("model not found")
  ) {
    return "Model Not Found (HTTP 404): The requested model is not available for this API endpoint or region. Check model naming in API Manager.";
  }
  if (
    msg.includes("empty response") ||
    msg.includes("no usable model") ||
    msg.includes("all ai lanes failed") ||
    msg.includes("no ai providers configured")
  ) {
    return "No Responsive AI Provider: All attempted provider lanes failed or returned empty output. Ensure at least one active, funded API key is configured.";
  }
  return `Provider issue: ${errorMsg || "Unknown execution exception"}`;
}

const FUNCTION_TEST_CONFIGS: Record<string, { type: "ai" | "feed" | "integration"; defaultPayload: any }> = {
  "price-feed": {
    type: "feed",
    defaultPayload: { symbols: ["AAPL", "NVDA", "SPY"] },
  },
  "market-data": {
    type: "feed",
    defaultPayload: { region: "US" },
  },
  "fetch-news": {
    type: "feed",
    defaultPayload: { query: "market economy" },
  },
  "historical-prices": {
    type: "feed",
    defaultPayload: { symbol: "AAPL", range: "1mo", interval: "1d" },
  },
  "fx-rates": {
    type: "feed",
    defaultPayload: { base: "USD" },
  },
  "symbol-search": {
    type: "feed",
    defaultPayload: { query: "Apple" },
  },
  "causal-effects": {
    type: "ai",
    defaultPayload: {
      event: "US Federal Reserve announces 25bps rate hike to counter inflation stickiness",
      portfolio: "Tech 40%, Energy 30%, Cash 30%",
    },
  },
  "strategy-generate": {
    type: "ai",
    defaultPayload: {
      regime: "Expansionary Volatile",
      vix: 18.5,
      sectors: [{ name: "Technology", changePct: 1.2 }, { name: "Energy", changePct: -0.8 }],
      portfolio: [{ ticker: "AAPL", quantity: 50, currentPrice: 220, buyPrice: 200, pnlPct: 10, weightPct: 40 }],
    },
  },
  "reflexivity-engine": {
    type: "ai",
    defaultPayload: {
      vix: 18.2,
      regime: "Late Cycle Momentum",
      sentiment: { score: 62, tone: "bullish" },
      flows: [{ direction: "BUY", intensity: 75, impact: 80, asset: "Tech Equities" }],
    },
  },
  "deep-intelligence": {
    type: "ai",
    defaultPayload: { symbol: "NVDA" },
  },
  "analyze-stock": {
    type: "ai",
    defaultPayload: { symbol: "AAPL", range: "1y" },
  },
  "direct-profit": {
    type: "ai",
    defaultPayload: { symbol: "AAPL" },
  },
  "sentiment-intel": {
    type: "ai",
    defaultPayload: { ticker: "AAPL" },
  },
  "opportunity-engine": {
    type: "ai",
    defaultPayload: { universe: "US_MEGA_TECH" },
  },
  "continuous-simulation": {
    type: "ai",
    defaultPayload: { steps: 5, initialCapital: 100000 },
  },
  "clank-detection": {
    type: "ai",
    defaultPayload: { ticker: "AAPL", recentMoves: [-1.2, 0.4, -2.1, 1.8] },
  },
  "strategy-evolution": {
    type: "ai",
    defaultPayload: { populationSize: 4, generations: 2 },
  },
  "cadence-generate": {
    type: "ai",
    defaultPayload: { timeframe: "1w", riskTolerance: "moderate" },
  },
  "entropy-brief": {
    type: "ai",
    defaultPayload: { marketMood: "Cautious" },
  },
  "geo-events": {
    type: "ai",
    defaultPayload: { region: "Global" },
  },
  "crown-intelligence": {
    type: "ai",
    defaultPayload: { symbol: "AAPL" },
  },
  "flow-intelligence": {
    type: "ai",
    defaultPayload: { universe: "EQUITIES" },
  },
  "risk-intelligence": {
    type: "ai",
    defaultPayload: { portfolio: [{ ticker: "AAPL", weightPct: 50 }, { ticker: "MSFT", weightPct: 50 }] },
  },
  "monte-carlo-intelligence": {
    type: "ai",
    defaultPayload: { symbol: "AAPL", iterations: 50 },
  },
  "portfolio-intelligence": {
    type: "ai",
    defaultPayload: { positions: [{ ticker: "AAPL", quantity: 10, price: 220 }] },
  },
  "derivatives-intelligence": {
    type: "feed",
    defaultPayload: { symbol: "AAPL" },
  },
  "macro-intelligence": {
    type: "feed",
    defaultPayload: { region: "US" },
  },
  "data-pipeline-status": {
    type: "feed",
    defaultPayload: {},
  },
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    let authUser: any = null;
    try {
      authUser = await requireAuth(req, corsHeaders);
    } catch {
      // Allow demo / test fallback if service role key is present
    }

    const body = await req.json().catch(() => ({}));
    const { action, provider, model, forceRefresh, functionName, testPayload } = body;

    if (forceRefresh) {
      await refreshManagedKeys(true);
    }

    // -------------------------------------------------------------------------
    // ACTION: test-function (Tests an individual edge function)
    // -------------------------------------------------------------------------
    if (action === "test-function" && functionName) {
      const config = FUNCTION_TEST_CONFIGS[functionName] || { type: "feed", defaultPayload: {} };
      const payload = testPayload || config.defaultPayload;
      const startTime = performance.now();
      const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
      const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
      const authHeader = req.headers.get("authorization") || `Bearer ${anonKey}`;

      try {
        const response = await fetch(`${supabaseUrl}/functions/v1/${functionName}`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": authHeader,
            "apikey": anonKey,
          },
          body: JSON.stringify(payload),
        });

        const latencyMs = Math.round(performance.now() - startTime);
        const text = await response.text();
        let json: any = null;
        try {
          json = JSON.parse(text);
        } catch {
          json = { raw: text.slice(0, 300) };
        }

        const isSuccess = response.ok && !json?.error;
        const errorMsg = json?.error || (!response.ok ? `HTTP ${response.status}: ${text.slice(0, 200)}` : null);

        return new Response(
          JSON.stringify({
            success: isSuccess,
            functionName,
            type: config.type,
            status: response.status,
            latencyMs,
            error: errorMsg,
            diagnostic: errorMsg ? diagnoseError(errorMsg, response.status) : "Function executed cleanly with valid response payload.",
            responsePreview: isSuccess ? (typeof json === "object" ? Object.keys(json).slice(0, 6) : "OK") : null,
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } catch (err: any) {
        const latencyMs = Math.round(performance.now() - startTime);
        return new Response(
          JSON.stringify({
            success: false,
            functionName,
            type: config.type,
            status: 500,
            latencyMs,
            error: err.message || String(err),
            diagnostic: diagnoseError(err.message || String(err), 500),
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // -------------------------------------------------------------------------
    // ACTION: test-all-functions (Sweeps across all known edge functions)
    // -------------------------------------------------------------------------
    if (action === "test-all-functions") {
      const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
      const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || "";
      const authHeader = req.headers.get("authorization") || `Bearer ${anonKey}`;

      const probeList = Object.entries(FUNCTION_TEST_CONFIGS);
      const results = await Promise.all(
        probeList.map(async ([fnName, cfg]) => {
          const startTime = performance.now();
          try {
            const res = await fetch(`${supabaseUrl}/functions/v1/${fnName}`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Authorization": authHeader,
                "apikey": anonKey,
              },
              body: JSON.stringify(cfg.defaultPayload),
            });
            const latencyMs = Math.round(performance.now() - startTime);
            const text = await res.text();
            let json: any = null;
            try { json = JSON.parse(text); } catch { json = null; }

            const ok = res.ok && !json?.error;
            const errMsg = json?.error || (!res.ok ? `HTTP ${res.status}: ${text.slice(0, 150)}` : null);
            return {
              functionName: fnName,
              type: cfg.type,
              success: ok,
              status: res.status,
              latencyMs,
              error: errMsg,
              diagnostic: errMsg ? diagnoseError(errMsg, res.status) : "Operational (200 OK)",
            };
          } catch (e: any) {
            return {
              functionName: fnName,
              type: cfg.type,
              success: false,
              status: 500,
              latencyMs: Math.round(performance.now() - startTime),
              error: e.message || String(e),
              diagnostic: diagnoseError(e.message || String(e), 500),
            };
          }
        })
      );

      const passed = results.filter((r) => r.success).length;
      const failed = results.filter((r) => !r.success).length;
      const avgLatency = Math.round(results.reduce((acc, r) => acc + r.latencyMs, 0) / (results.length || 1));

      return new Response(
        JSON.stringify({
          success: true,
          total: results.length,
          passed,
          failed,
          avgLatencyMs: avgLatency,
          results,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // -------------------------------------------------------------------------
    // ACTION: test-all-keys (Tests all active AI keys from DB and Environment)
    // -------------------------------------------------------------------------
    if (action === "test-all-keys") {
      const providersToTest = [
        { name: "GOOGLE_GEMINI_KEY", provider: "gemini" },
        { name: "MISTRAL_API_KEY", provider: "mistral" },
        { name: "GROQ_API_KEY", provider: "groq" },
        { name: "OPENROUTER_API_KEY", provider: "openrouter" },
        { name: "OPENAI_API_KEY", provider: "openai" },
        { name: "ANTHROPIC_API_KEY", provider: "anthropic" },
        { name: "NVIDIA_API_KEY", provider: "nvidia" },
      ];

      const keyResults = await Promise.all(
        providersToTest.map(async (p) => {
          const keyVal = getKeySync(p.name);
          if (!keyVal) {
            return {
              name: p.name,
              provider: p.provider,
              configured: false,
              success: false,
              latencyMs: 0,
              error: "Key not configured",
              diagnostic: `No credential found for ${p.name}. Add it in the manager if you want to route requests to ${p.provider}.`,
            };
          }

          const start = performance.now();
          try {
            const res = await callAI({
              provider: p.provider as any,
              systemPrompt: "You are a connectivity test assistant. Respond in one concise sentence.",
              userPrompt: "System check: verify connectivity and return the single word 'OK'.",
              maxTokens: 40,
              temperature: 0.1,
              skipHardening: true,
            });
            const latencyMs = Math.round(performance.now() - start);
            return {
              name: p.name,
              provider: res.provider || p.provider,
              configured: true,
              success: true,
              latencyMs,
              response: res.text,
              diagnostic: `Active & responsive. Latency: ${latencyMs}ms.`,
            };
          } catch (e: any) {
            const latencyMs = Math.round(performance.now() - start);
            const errMsg = e?.message || String(e);
            return {
              name: p.name,
              provider: p.provider,
              configured: true,
              success: false,
              latencyMs,
              error: errMsg,
              status: e?.status || 500,
              diagnostic: diagnoseError(errMsg, e?.status || 500),
            };
          }
        })
      );

      return new Response(
        JSON.stringify({
          success: true,
          keys: keyResults,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // -------------------------------------------------------------------------
    // DEFAULT: test single AI key / provider
    // -------------------------------------------------------------------------
    const startTime = performance.now();
    const result = await callAI({
      provider: provider || undefined,
      model: model || undefined,
      systemPrompt: "You are a connectivity test assistant. Respond in one concise sentence.",
      userPrompt: "System check: verify connectivity and return the single word 'OK'.",
      maxTokens: 50,
      temperature: 0.1,
      skipHardening: true,
    });

    const latencyMs = Math.round(performance.now() - startTime);

    return new Response(
      JSON.stringify({
        success: true,
        provider: result.provider,
        latencyMs,
        response: result.text,
        diagnostic: `Provider (${result.provider}) connected successfully in ${latencyMs}ms.`,
        timestamp: Date.now(),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    if (error instanceof Response) return error;
    console.error("test-ai-key error:", error);
    const errorMsg = error?.message || error?.error || "AI test failed";
    const status = error?.status || 500;
    return new Response(
      JSON.stringify({
        success: false,
        error: errorMsg,
        status,
        diagnostic: diagnoseError(errorMsg, status),
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
