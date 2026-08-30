/**
 * Admin authorization utilities for server-side enforcement.
 *
 * The admin role is identified by a specific email address and enforced
 * server-side through authenticated user identity, not client-side checks.
 */

const ADMIN_EMAIL = "pardhan9013334137@gmail.com";

export interface AuthUser {
  id: string;
  email?: string;
}

/**
 * Check if the authenticated user is the designated admin.
 *
 * This function performs server-authoritative validation and cannot be
 * bypassed by client-side modifications.
 *
 * @param user - Authenticated user object from requireAuth()
 * @returns true if user is admin, false otherwise
 */
export function isAdmin(user: AuthUser | null | undefined): boolean {
  if (!user || !user.email) return false;
  return user.email.toLowerCase().trim() === ADMIN_EMAIL.toLowerCase().trim();
}

/**
 * Require admin privileges or throw a 403 response.
 *
 * @param user - Authenticated user object from requireAuth()
 * @param corsHeaders - CORS headers for error response
 * @throws Response with 403 status if user is not admin
 */
export function requireAdmin(
  user: AuthUser | null | undefined,
  corsHeaders: Record<string, string>
): asserts user is AuthUser {
  if (!isAdmin(user)) {
    throw new Response(
      JSON.stringify({ error: "Forbidden: Admin access required" }),
      {
        status: 403,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json"
        }
      }
    );
  }
}

/**
 * Get the admin email (for logging/audit purposes only, never expose to clients)
 */
export function getAdminEmail(): string {
  return ADMIN_EMAIL;
}
