/**
 * Card flags in the browser — separate per user and per branch.
 *
 * `userId` is REQUIRED in the key: logout only clears `companyId` and
 * `branchId` (`hooks/use-auth.ts`), so a keyless flag would carry over to the
 * next employee on this same computer. Every read/write is inside
 * `try/catch` — the card still works in a browser where storage is blocked,
 * it just does not remember anything.
 */
export type LaunchFlag = "collapsed" | "seen" | "celebrated" | "launched";

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export function launchStorageKey(userId: number, branchId: number, flag: LaunchFlag): string {
  return `daf.launch.${userId}.${branchId}.${flag}`;
}

function browserStorage(): StorageLike | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function readLaunchFlag(
  userId: number,
  branchId: number,
  flag: LaunchFlag,
  store: StorageLike | null = browserStorage(),
): boolean {
  try {
    return store?.getItem(launchStorageKey(userId, branchId, flag)) === "1";
  } catch {
    return false;
  }
}

export function writeLaunchFlag(
  userId: number,
  branchId: number,
  flag: LaunchFlag,
  value: boolean,
  store: StorageLike | null = browserStorage(),
): void {
  try {
    const key = launchStorageKey(userId, branchId, flag);
    if (value) store?.setItem(key, "1");
    else store?.removeItem(key);
  } catch {
    // No storage — we don't remember it, the card still works.
  }
}
