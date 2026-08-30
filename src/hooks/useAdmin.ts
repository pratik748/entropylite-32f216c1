import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useDemo } from "@/demo/DemoProvider";
import type { User } from "@supabase/supabase-js";

const ADMIN_EMAIL = "pardhan9013334137@gmail.com";

interface UseAdminResult {
  isAdmin: boolean;
  loading: boolean;
  user: User | null;
}

/**
 * Hook to detect if the current authenticated user is the designated admin.
 *
 * This hook checks the authenticated user's email against the admin email.
 * While this is a client-side check for UI rendering purposes, all actual
 * admin operations are enforced server-side and cannot be bypassed.
 *
 * IMPORTANT: Demo mode users NEVER see admin controls, even if the demo
 * portfolio email matches the admin email.
 *
 * @returns {UseAdminResult} Object containing isAdmin flag, loading state, and user
 */
export function useAdmin(): UseAdminResult {
  const { isDemo } = useDemo();
  const [isAdmin, setIsAdmin] = useState(false);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    let mounted = true;

    async function checkAdmin() {
      try {
        // Demo users are NEVER admin, regardless of email
        if (isDemo) {
          if (mounted) {
            setIsAdmin(false);
            setUser(null);
            setLoading(false);
          }
          return;
        }

        const { data: { user }, error } = await supabase.auth.getUser();

        if (!mounted) return;

        if (error || !user) {
          setIsAdmin(false);
          setUser(null);
          setLoading(false);
          return;
        }

        setUser(user);
        const adminStatus = user.email?.toLowerCase().trim() === ADMIN_EMAIL.toLowerCase().trim();
        setIsAdmin(adminStatus);
        setLoading(false);
      } catch (error) {
        console.error("Error checking admin status:", error);
        if (mounted) {
          setIsAdmin(false);
          setUser(null);
          setLoading(false);
        }
      }
    }

    checkAdmin();

    // Subscribe to auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!mounted) return;

        // Demo users are NEVER admin
        if (isDemo) {
          setIsAdmin(false);
          setUser(null);
          setLoading(false);
          return;
        }

        if (session?.user) {
          setUser(session.user);
          const adminStatus = session.user.email?.toLowerCase().trim() === ADMIN_EMAIL.toLowerCase().trim();
          setIsAdmin(adminStatus);
        } else {
          setUser(null);
          setIsAdmin(false);
        }
        setLoading(false);
      }
    );

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [isDemo]);

  return { isAdmin, loading, user };
}
