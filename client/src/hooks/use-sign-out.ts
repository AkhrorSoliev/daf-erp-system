"use client";

import { useCallback } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/hooks/use-auth";
import { useIsMiniApp } from "@/hooks/use-is-mini-app";
import {
  MINI_APP_ENTRY_PATH,
  markMiniAppSignedOut,
} from "@/lib/telegram-mini-app";

/**
 * «Chiqish», on every portal. Inside the Telegram Mini App there is no
 * password form (ADR-0040): the tab is marked signed out and goes back to
 * `/tg`, which waits for «Qayta kirish» instead of signing straight back in.
 * A plain `logout()` there would land on `/login`, which the Mini App guard
 * sends to `/tg` — and `/tg` would sign the user in again at once. The staff
 * cabinet (ADR-0045) shares this, so the rule lives in one place.
 */
export function useSignOut(): () => void {
  const logout = useAuth((s) => s.logout);
  const clearSession = useAuth((s) => s.clearSession);
  const queryClient = useQueryClient();
  const router = useRouter();
  const inMiniApp = useIsMiniApp();

  return useCallback(() => {
    queryClient.clear();
    if (inMiniApp) {
      markMiniAppSignedOut(true);
      clearSession();
      router.replace(MINI_APP_ENTRY_PATH);
      return;
    }
    logout(); // clears cookies + redirects to /login
  }, [queryClient, inMiniApp, clearSession, router, logout]);
}
