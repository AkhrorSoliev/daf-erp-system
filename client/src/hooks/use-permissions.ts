import { create } from "zustand";
import api from "@/lib/api";
import {
  PERMISSIONS_ME_PATH,
  knownKeys,
  makeCan,
  parseStoredPermissions,
  type Can,
} from "@/lib/permission-check";
import type { PermissionKey } from "@/lib/permission-keys";

const STORAGE_KEY = "daf.permissions";

// Every start, clear and read takes the next number; an answer is used only
// while its number is still the latest, so a slow older read (another user's,
// or one sent before a newer one) can never overwrite a newer list.
let seq = 0;

// A first read that fails leaves the app stripped down with nothing to show for
// it, so it is tried again a few times. Only while no list is known: once there
// is one, a failed read keeps it. One budget per start; start, clear and a
// successful read reset it, and cancel the timer.
const RETRY_DELAYS_MS = [1000, 3000, 8000];
let retryTimer: ReturnType<typeof setTimeout> | null = null;
let retriesUsed = 0;

function resetRetries() {
  if (retryTimer) clearTimeout(retryTimer);
  retryTimer = null;
  retriesUsed = 0;
}

function scheduleRetry(userId: number) {
  if (retryTimer || retriesUsed >= RETRY_DELAYS_MS.length) return;
  retryTimer = setTimeout(() => {
    retryTimer = null;
    // The user may have changed or a list arrived since this was scheduled.
    const now = usePermissions.getState();
    if (now.userId === userId && now.keys === null) void now.refresh();
  }, RETRY_DELAYS_MS[retriesUsed++]);
}

interface PermissionsState {
  userId: number | null;
  /** `null` until a list is known, from this browser's storage or the server. */
  keys: ReadonlySet<PermissionKey> | null;
  can: Can;
  /** When the server last answered (ms); 0 = not yet. */
  loadedAt: number;
  /** Shows the list kept for `userId`, then asks the server. */
  start: (userId: number) => void;
  /** Asks the server again: on window focus, after a 403. */
  refresh: () => Promise<void>;
  /** Forgets the list in memory (signed out). Storage is keyed by user. */
  clear: () => void;
}

/**
 * The signed-in user's capabilities (spec §8). Hiding is a convenience: the
 * server refuses what the list does not contain whatever the screen shows.
 */
export const usePermissions = create<PermissionsState>((set, get) => ({
  userId: null,
  keys: null,
  can: makeCan(null),
  loadedAt: 0,

  start: (userId) => {
    if (get().userId === userId && get().keys) return;
    seq++;
    resetRetries();
    let stored: ReadonlySet<PermissionKey> | null = null;
    try {
      stored = parseStoredPermissions(localStorage.getItem(STORAGE_KEY), userId);
    } catch {
      stored = null;
    }
    set({ userId, keys: stored, can: makeCan(stored), loadedAt: 0 });
    void get().refresh();
  },

  refresh: async () => {
    const userId = get().userId;
    if (userId == null) return;
    const mine = ++seq;
    try {
      const { data } = await api.get<{ keys: string[] }>(PERMISSIONS_ME_PATH);
      // Signed out, switched, or a newer read was sent meanwhile.
      if (get().userId !== userId || mine !== seq) return;
      resetRetries();
      const keys = knownKeys(data.keys);
      set({ keys, can: makeCan(keys), loadedAt: Date.now() });
      try {
        localStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({ userId, keys: [...keys] }),
        );
      } catch {
        // Storage unavailable: the list stays in memory for this tab.
      }
    } catch {
      // Keep what we have; the server still refuses what it must. With
      // nothing yet, read again (only the latest read decides).
      if (get().userId === userId && mine === seq && get().keys === null) {
        scheduleRetry(userId);
      }
    }
  },

  clear: () => {
    seq++;
    resetRetries();
    set({ userId: null, keys: null, can: makeCan(null), loadedAt: 0 });
  },
}));

/** Does the signed-in user hold ANY of these capabilities? */
export function useCan(wanted: PermissionKey | readonly PermissionKey[]): boolean {
  return usePermissions((s) => s.can(wanted));
}

/** True once a list is known; a page guard waits for it before redirecting. */
export function usePermissionsReady(): boolean {
  return usePermissions((s) => s.keys !== null);
}
