/**
 * ADR-0031: your own phone and password change only in Profil, where the
 * current password is asked, and nobody changes their own login. The employee
 * form therefore locks all three on your own record and never sends them. The
 * backend refuses such a change with 403 regardless — this keeps the form from
 * offering it.
 */
export const OWN_SIGN_IN_KEY_FIELDS = ["phone", "login", "password"] as const;

export function isOwnAccount(
  employeeId: number | undefined,
  currentUserId: number | undefined,
): boolean {
  return employeeId !== undefined && currentUserId !== undefined && employeeId === currentUserId;
}

export function withoutOwnSignInKeys(
  payload: Record<string, unknown>,
  ownAccount: boolean,
): Record<string, unknown> {
  if (!ownAccount) return payload;
  const rest = { ...payload };
  for (const key of OWN_SIGN_IN_KEY_FIELDS) delete rest[key];
  return rest;
}
