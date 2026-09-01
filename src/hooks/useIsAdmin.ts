import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Server-validated admin check. Reads the caller's own role rows; the role
 * table is protected by row level security, so this cannot be spoofed
 * client-side.
 */
export function useIsAdmin() {
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      const { data: userRes } = await supabase.auth.getUser();
      const uid = userRes?.user?.id;
      if (!uid) {
        if (alive) { setIsAdmin(false); setLoading(false); }
        return;
      }
      const { data } = await (supabase as any)
        .from("user_roles")
        .select("role")
        .eq("user_id", uid)
        .eq("role", "admin")
        .maybeSingle();
      if (alive) { setIsAdmin(!!data); setLoading(false); }
    })();
    return () => { alive = false; };
  }, []);

  return { isAdmin, loading };
}
