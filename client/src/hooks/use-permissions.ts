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
      // Keep what we have; the server still refuses what it must.
    }
  },

  clear: () => {
    seq++;
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
