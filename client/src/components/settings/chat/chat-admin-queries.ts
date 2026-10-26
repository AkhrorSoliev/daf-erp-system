"use client";

import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import api from "@/lib/api";
import { getErrorMessage } from "@/lib/get-error-message";
import { useT } from "@/i18n/context";
import { useNotifications } from "@/hooks/use-notifications";
import type {
  ChatAdminSettings,
  ChatAdminSettingsPatch,
  ChatBannedList,
  ChatReportDetail,
  ChatReportsPage,
  ChatReportStatus,
  ResolveReportBody,
} from "./chat-admin-types";

export const CHAT_ADMIN_KEYS = {
  settings: ["chat-admin", "settings"] as const,
  reports: ["chat-admin", "reports"] as const,
  reportList: (status: ChatReportStatus | undefined) => ["chat-admin", "reports", "list", status ?? "all"] as const,
  report: (id: string) => ["chat-admin", "reports", "one", id] as const,
  banned: ["chat-admin", "banned"] as const,
};

export function useChatBanned() {
  return useQuery({
    queryKey: CHAT_ADMIN_KEYS.banned,
    queryFn: () => api.get<ChatBannedList>("/chat/admin/banned").then((r) => r.data.data),
  });
}

const REPORTS_PAGE_SIZE = 50;

export function useChatReports(status: ChatReportStatus | undefined) {
  return useInfiniteQuery({
    queryKey: CHAT_ADMIN_KEYS.reportList(status),
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam }) =>
      (
        await api.get<ChatReportsPage>("/chat/admin/reports", {
          params: { status, cursor: pageParam ?? undefined, limit: REPORTS_PAGE_SIZE },
        })
      ).data,
    getNextPageParam: (last) => last.nextCursor,
  });
}

export function useChatReport(id: string | null) {
  return useQuery({
    queryKey: CHAT_ADMIN_KEYS.report(id ?? ""),
    queryFn: () => api.get<ChatReportDetail>(`/chat/admin/reports/${id}`).then((r) => r.data),
    enabled: !!id,
    retry: false,
  });
}

function useAfterReportChange() {
  const queryClient = useQueryClient();
  return (reportId?: string) => {
    void queryClient.invalidateQueries({ queryKey: CHAT_ADMIN_KEYS.reports });
    if (reportId) void queryClient.invalidateQueries({ queryKey: CHAT_ADMIN_KEYS.report(reportId) });
    void queryClient.invalidateQueries({ queryKey: CHAT_ADMIN_KEYS.banned });
  };
}

export function useResolveChatReport(id: string) {
  const t = useT();
  const queryClient = useQueryClient();
  const after = useAfterReportChange();
  return useMutation({
    mutationFn: async (body: ResolveReportBody) =>
      (await api.patch<ChatReportDetail>(`/chat/admin/reports/${id}`, body)).data,
    onSuccess: (report) => {
      queryClient.setQueryData(CHAT_ADMIN_KEYS.report(id), report);
      after(id);
      // The bell notice of this report closes.
      void queryClient.invalidateQueries({ queryKey: ["notifications"] });
      void useNotifications.getState().fetchBadge();
      toast.success(t("Shikoyat ko'rib chiqildi"));
    },
    onError: (err) => {
      toast.error(getErrorMessage(err, t("Shikoyatni saqlashda xatolik")));
      after(id); // a 409 means somebody closed it first: show the real state
    },
  });
}

/** Also reused by the «Chatdan chiqarilganlar» tab. `reportId` refreshes an open drawer. */
export function useBanStudent(reportId?: string) {
  const t = useT();
  const after = useAfterReportChange();
  return useMutation({
    mutationFn: async (studentId: number) => (await api.post(`/chat/admin/students/${studentId}/ban`)).data,
    onSuccess: () => {
      after(reportId);
      toast.success(t("O'quvchi chatdan chiqarildi"));
    },
    onError: (err) => toast.error(getErrorMessage(err, t("Amalni bajarib bo'lmadi"))),
  });
}

export function useUnbanStudent(reportId?: string) {
  const t = useT();
  const after = useAfterReportChange();
  return useMutation({
    mutationFn: async (studentId: number) => (await api.post(`/chat/admin/students/${studentId}/unban`)).data,
    onSuccess: () => {
      after(reportId);
      toast.success(t("O'quvchi chatga qaytarildi"));
    },
    onError: (err) => toast.error(getErrorMessage(err, t("Amalni bajarib bo'lmadi"))),
  });
}

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
