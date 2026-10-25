"use client";

import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import toast from "react-hot-toast";
import api from "@/lib/api";
import { getErrorMessage } from "@/lib/get-error-message";
import { useT } from "@/i18n/context";
import type {
  ChatAccess,
  ConversationView,
  MessageView,
  MessagesPage,
  OpenConversationBody,
} from "./chat-types";

export const CHAT_KEYS = {
  all: ["student-portal", "chat"] as const,
  access: ["student-portal", "chat", "access"] as const,
  list: ["student-portal", "chat", "list"] as const,
  messages: (id: string) =>
    ["student-portal", "chat", "messages", id] as const,
};

export const THREAD_POLL_MS = 5000;
export const LIST_POLL_MS = 20000;

export function useChatAccess() {
  return useQuery<ChatAccess>({
    queryKey: CHAT_KEYS.access,
    queryFn: () => api.get("/chat/access").then((r) => r.data),
  });
}

/** The company switch, as the nav sees it: hidden until the answer is known. */
export function useChatEnabled(): boolean {
  return useChatAccess().data?.enabled === true;
}

export function useConversations(enabled = true) {
  return useQuery<ConversationView[]>({
    queryKey: CHAT_KEYS.list,
    queryFn: () => api.get("/chat/conversations").then((r) => r.data),
    enabled,
    refetchInterval: LIST_POLL_MS,
    refetchIntervalInBackground: false,
  });
}

/** Pages come newest first; `nextCursor` is the id to continue from. */
export function useMessages(id: string) {
  return useInfiniteQuery<MessagesPage, Error, { pages: MessagesPage[] }, readonly string[], string | undefined>({
    queryKey: CHAT_KEYS.messages(id),
    initialPageParam: undefined,
    queryFn: ({ pageParam }) =>
      api
        .get(`/chat/conversations/${id}/messages`, {
          params: pageParam ? { cursor: pageParam } : undefined,
        })
        .then((r) => r.data),
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    refetchInterval: THREAD_POLL_MS,
    refetchIntervalInBackground: false,
  });
}

export function useSendMessage(id: string) {
  const qc = useQueryClient();
  const t = useT();
  return useMutation<MessageView, unknown, string>({
    mutationFn: (text) =>
      api
        .post(`/chat/conversations/${id}/messages`, { text })
        .then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: CHAT_KEYS.messages(id) });
      qc.invalidateQueries({ queryKey: CHAT_KEYS.list });
    },
    onError: (err) =>
      toast.error(getErrorMessage(err, t("Xabar yuborilmadi"))),
  });
}

export function useMarkRead(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.patch(`/chat/conversations/${id}/read`),
    onSuccess: () => qc.invalidateQueries({ queryKey: CHAT_KEYS.list }),
  });
}

/** Opens (or finds) the conversation; the answer carries its `id`. */
export function useOpenConversation() {
  const qc = useQueryClient();
  const t = useT();
  return useMutation<{ id: string }, unknown, OpenConversationBody>({
    mutationFn: (body) =>
      api.post("/chat/conversations", body).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: CHAT_KEYS.list }),
    onError: (err) =>
      toast.error(getErrorMessage(err, t("Suhbatni ochib bo'lmadi"))),
  });
}
