import { PERMISSION_KEYS, type PermissionKey } from "./permission-keys";

/** Does the signed-in user hold ANY of these capabilities? */
export type Can = (wanted: PermissionKey | readonly PermissionKey[]) => boolean;

/** A `Can` over a known list. `null` — not known yet — holds nothing. */
export function makeCan(keys: ReadonlySet<PermissionKey> | null): Can {
  return (wanted) => {
    if (!keys) return false;
    const list: readonly PermissionKey[] =
      typeof wanted === "string" ? [wanted] : wanted;
    return list.some((key) => keys.has(key));
  };
}

const KNOWN: readonly string[] = PERMISSION_KEYS;

/** Keeps only the keys this client knows (an older client meets newer keys). */
export function knownKeys(keys: readonly string[]): Set<PermissionKey> {
  return new Set(keys.filter((k): k is PermissionKey => KNOWN.includes(k)));
}

/**
 * The list this browser kept for `userId` (`localStorage`), so a reload shows
 * the menus at once while the fresh list is on its way. Anything that is not
 * this user's list reads as nothing.
 */
export function parseStoredPermissions(
  raw: string | null,
  userId: number,
): ReadonlySet<PermissionKey> | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { userId?: unknown; keys?: unknown };
    if (parsed.userId !== userId || !Array.isArray(parsed.keys)) return null;
    return knownKeys(parsed.keys.filter((k): k is string => typeof k === "string"));
  } catch {
    return null;
  }
}
