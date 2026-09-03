import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/** Owner account, admin controls appear the moment this identity signs in. */
const ADMIN_EMAIL = "pardhan9013334137@gmail.com";

/**
 * Admin check. The owner identity is recognised directly by email, and any
 * other admin is resolved from the role table, which is protected by row
 * level security, so it cannot be spoofed client-side.
 */
export function useIsAdmin() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data: userRes } = await supabase.auth.getUser();
      const user = userRes?.user;
      if (!user?.id) {
        if (alive) { setIsAdmin(false); setLoading(false); }
        return;
      }
      if ((user.email || "").toLowerCase() === ADMIN_EMAIL) {
        if (alive) { setIsAdmin(true); setLoading(false); }
        return;
      }
      const { data } = await (supabase as any)
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .eq("role", "admin")
        .maybeSingle();
      if (alive) { setIsAdmin(!!data); setLoading(false); }
    })();
    return () => { alive = false; };
  }, []);

  return { isAdmin, loading };
}
