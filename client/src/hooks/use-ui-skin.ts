"use client";

import { useCallback } from "react";
import toast from "react-hot-toast";
import api from "@/lib/api";
import { changeUiSkin } from "@/lib/change-ui-skin";
import { getErrorMessage } from "@/lib/get-error-message";
import { skinOrDefault, type UiSkinId } from "@/lib/ui-skins";
import { useAuth } from "@/hooks/use-auth";

/**
 * The signed-in user's design skin and the way to change it (ADR-0097). The
 * change shows at once (the store feeds `SkinSync`) and is saved on the
 * account; a failed save puts the old skin back with a toast.
 */
export function useUiSkin() {
  const skin = useAuth((s) => skinOrDefault(s.user?.uiSkin));

  const setSkin = useCallback(
    (next: UiSkinId) =>
      changeUiSkin(next, {
        current: () => useAuth.getState().user?.uiSkin,
        apply: (value) => useAuth.getState().patchUser({ uiSkin: value }),
        save: async (value) => {
          await api.patch("/users/ui-skin", { skin: value });
        },
        fail: (error) => toast.error(getErrorMessage(error, "Dizayn uslubini saqlab bo'lmadi")),
      }),
    [],
  );

  return { skin, setSkin };
}
