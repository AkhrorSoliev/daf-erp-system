"use client";

import { useCallback, useState } from "react";
import toast from "react-hot-toast";
import api from "@/lib/api";
import { useAuth } from "@/hooks/use-auth";
import { freshSessionFrom } from "@/lib/fresh-session";
import { getErrorMessage } from "@/lib/get-error-message";

/**
 * "Log out other devices" (ADR-0030). The server ends every session of the
 * account — this device's too — and hands back a fresh pair, stored here so
 * only the OTHER devices are signed out. Resolves `true` on success.
 */
export function useLogoutOthers() {
  // Selector, not the whole store: this hook only calls setAuth, it never
  // renders auth state.
  const setAuth = useAuth((s) => s.setAuth);
  const [pending, setPending] = useState(false);

  const logoutOthers = useCallback(async () => {
    setPending(true);
    try {
      const { data } = await api.post("/users/logout-others");
      const session = freshSessionFrom(data);
      if (session) {
        setAuth(session.user, session.accessToken, session.refreshToken);
      }
      toast.success("Boshqa qurilmalardagi kirishlar tugatildi");
      return true;
    } catch (error) {
      toast.error(
        getErrorMessage(error, "Boshqa qurilmalardan chiqib bo'lmadi"),
      );
      return false;
    } finally {
      setPending(false);
    }
  }, [setAuth]);

  return { logoutOthers, pending };
}
