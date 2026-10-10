"use client";

import { useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { usePermissions } from "@/hooks/use-permissions";

const REFRESH_AFTER_MS = 30_000;

/** Loads the capability list for whoever is signed in, and again on focus. */
export function PermissionsSync() {
  const userId = useAuth((s) => s.user?.id ?? null);

  useEffect(() => {
    const store = usePermissions.getState();
    if (userId == null) {
      store.clear();
      return;
    }
    store.start(userId);
    const onFocus = () => {
      const { loadedAt, refresh } = usePermissions.getState();
      if (Date.now() - loadedAt > REFRESH_AFTER_MS) void refresh();
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, [userId]);

  return null;
}
