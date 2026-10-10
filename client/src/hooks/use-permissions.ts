import { create } from "zustand";
import api from "@/lib/api";
import {
  knownKeys,
  makeCan,
  parseStoredPermissions,
  type Can,
} from "@/lib/permission-check";
import type { PermissionKey } from "@/lib/permission-keys";

const STORAGE_KEY = "daf.permissions";

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
    try {
      const { data } = await api.get<{ keys: string[] }>("/permissions/me");
      if (get().userId !== userId) return; // signed out or switched meanwhile
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

  clear: () =>
    set({ userId: null, keys: null, can: makeCan(null), loadedAt: 0 }),
}));

/** Does the signed-in user hold ANY of these capabilities? */
export function useCan(wanted: PermissionKey | readonly PermissionKey[]): boolean {
  return usePermissions((s) => s.can(wanted));
}

/** True once a list is known; a page guard waits for it before redirecting. */
export function usePermissionsReady(): boolean {
  return usePermissions((s) => s.keys !== null);
}
