import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { DEMO_SUBJECT, isDemoToken, verifyDemoToken } from "./demoAuth.ts";

export interface AuthResult {
  user: { id: string; email?: string };
  /** True for read-only demo sessions. Never write real user rows for these. */
  demo?: boolean;
}

/**
 * Validates the JWT from the Authorization header.
 * Returns the authenticated user or throws a Response.
 */
export async function requireAuth(
  req: Request,
  corsHeaders: Record<string, string>
): Promise<AuthResult> {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) {
    throw new Response(
      JSON.stringify({ error: "Unauthorized" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const bearer = authHeader.slice(7).trim();

  // Read-only demo session: signed short-lived token, synthetic subject.
  if (isDemoToken(bearer)) {
    const demo = await verifyDemoToken(bearer);
    if (!demo) {
      throw new Response(
        JSON.stringify({ error: "Demo session expired" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    return { user: { id: DEMO_SUBJECT }, demo: true };
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } }
  );

  const { data, error } = await supabase.auth.getUser();

  if (error || !data?.user) {
    throw new Response(
      JSON.stringify({ error: "Invalid or expired token" }),
      { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  return {
    user: {
      id: data.user.id,
      email: data.user.email,
    },
  };
}
