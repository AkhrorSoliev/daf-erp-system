"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import api from "@/lib/api";
import { getErrorMessage } from "@/lib/get-error-message";
import { useT } from "@/i18n/context";
import type { ChatAdminSettings, ChatAdminSettingsPatch } from "./chat-admin-types";

export const CHAT_ADMIN_KEYS = {
  settings: ["chat-admin", "settings"] as const,
  // Task 5 / Task 6 add `reports` and `banned` here.
};

export function useChatAdminSettings() {
  return useQuery({
    queryKey: CHAT_ADMIN_KEYS.settings,
    queryFn: () => api.get<ChatAdminSettings>("/chat/admin/settings").then((r) => r.data),
  });
}

export function useSaveChatAdminSettings(onSaved?: () => void) {
  const t = useT();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (patch: ChatAdminSettingsPatch) =>
      (await api.patch<ChatAdminSettings>("/chat/admin/settings", patch)).data,
    onSuccess: (saved) => {
      queryClient.setQueryData(CHAT_ADMIN_KEYS.settings, saved);
      onSaved?.();
      toast.success(t("Saqlandi"));
    },
    onError: (err) => toast.error(getErrorMessage(err, t("Saqlashda xatolik"))),
  });
}
