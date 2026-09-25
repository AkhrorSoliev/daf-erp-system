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

export interface LaunchFlags {
  seen: boolean;
  celebrated: boolean;
  collapsed: boolean;
  launched: boolean;
}

/** Nothing remembered yet. Also the server render's answer: it has no storage. */
export const NO_LAUNCH_FLAGS: LaunchFlags = Object.freeze({
  seen: false,
  celebrated: false,
  collapsed: false,
  launched: false,
});

const ALL_FLAGS: readonly LaunchFlag[] = ["seen", "celebrated", "collapsed", "launched"];

/**
 * The flags as an external store for `useSyncExternalStore`. The card reads
 * them from here and writes through `write`, and every write re-renders the
 * subscribed card, so the card keeps no copy of its own that an effect would
 * have to keep in step with storage.
 *
 * `session` holds what this page wrote: where storage is blocked the card
 * still collapses and closes for the rest of the visit, and only forgets on
 * the next load. `snapshot` returns the SAME object while nothing changed,
 * because `useSyncExternalStore` compares snapshots by identity and would
 * re-render forever on a fresh object per call.
 */
export function createLaunchFlagStore(storage: () => StorageLike | null) {
  const listeners = new Set<() => void>();
  const session = new Map<string, boolean>();
  const snapshots = new Map<string, LaunchFlags>();

  const read = (userId: number, branchId: number, flag: LaunchFlag): boolean =>
    session.get(launchStorageKey(userId, branchId, flag)) ??
    readLaunchFlag(userId, branchId, flag, storage());

  return {
    subscribe(listener: () => void): () => void {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    snapshot(userId: number, branchId: number): LaunchFlags {
      const next: LaunchFlags = {
        seen: read(userId, branchId, "seen"),
        celebrated: read(userId, branchId, "celebrated"),
        collapsed: read(userId, branchId, "collapsed"),
        launched: read(userId, branchId, "launched"),
      };
      const id = `${userId}.${branchId}`;
      const previous = snapshots.get(id);
      if (previous && ALL_FLAGS.every((f) => previous[f] === next[f])) return previous;
      snapshots.set(id, next);
      return next;
    },

    write(userId: number, branchId: number, flag: LaunchFlag, value: boolean): void {
      session.set(launchStorageKey(userId, branchId, flag), value);
      writeLaunchFlag(userId, branchId, flag, value, storage());
      for (const listener of listeners) listener();
    },
  };
}

/** The page's one store, shared by every mounted card. */
export const launchFlags = createLaunchFlagStore(browserStorage);
