import type { AuthUser } from "@/hooks/use-auth";

export interface FreshSession {
  user: AuthUser;
  accessToken: string;
  refreshToken: string;
}

/**
 * The fresh token pair the API returns after a password change or "log out
 * other devices". Both actions end every session of the account — this
 * device's too — so the pair must be stored or the very next request signs the
 * user out (ADR-0030). `null` when the response carries no session.
 */
export function freshSessionFrom(data: unknown): FreshSession | null {
  if (!data || typeof data !== "object") return null;
  const { user, accessToken, refreshToken } = data as Record<string, unknown>;
  if (
    typeof accessToken !== "string" ||
    typeof refreshToken !== "string" ||
    !user ||
    typeof user !== "object"
  ) {
    return null;
  }
  return { user: user as AuthUser, accessToken, refreshToken };
}
