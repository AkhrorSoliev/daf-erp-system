"use client";

import {
  skipToken,
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import toast from "react-hot-toast";
import api from "@/lib/api";
import { getErrorMessage } from "@/lib/get-error-message";
import { useT } from "@/i18n/context";
import { msg } from "@/i18n/msg";
import { unreadTotal } from "./chat-format";
import { insertMessage, listAfterSend, type MessagesCache } from "./chat-stream-model";
import { useChatStreamConnected } from "./chat-stream-store";
import type {
  ChatAccess,
  ChatMe,
  ConversationView,
  MessageView,
  MessagesPage,
  OpenConversationBody,
  PeerSummary,
} from "./chat-types";

export const CHAT_KEYS = {
  all: ["student-portal", "chat"] as const,
  access: ["student-portal", "chat", "access"] as const,
  list: ["student-portal", "chat", "list"] as const,
  me: ["student-portal", "chat", "me"] as const,
  messages: (id: string) =>
    ["student-portal", "chat", "messages", id] as const,
  /** The peer card returned by `open`, for a thread the list does not hold yet. */
  peer: (id: string) => ["student-portal", "chat", "peer", id] as const,
};

export const THREAD_POLL_MS = 5000;
export const LIST_POLL_MS = 20000;
// While the live stream is open, polling is only a safety net.
export const THREAD_POLL_LIVE_MS = 30000;
export const LIST_POLL_LIVE_MS = 60000;

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
  const live = useChatStreamConnected();
  return useQuery<ConversationView[]>({
    queryKey: CHAT_KEYS.list,
    queryFn: () => api.get("/chat/conversations").then((r) => r.data),
    enabled,
    refetchInterval: live ? LIST_POLL_LIVE_MS : LIST_POLL_MS,
    refetchIntervalInBackground: false,
  });
}

/**
 * Unread messages over all conversations, for the nav dot. The list is asked
 * only while the company switch is on, so a portal with chat off makes no
 * request (and shows no dot even if the cache holds an old list).
 */
export function useUnreadChatTotal(): number {
  const enabled = useChatEnabled();
  const { data } = useConversations(enabled);
  return enabled ? unreadTotal(data ?? []) : 0;
}

/** Pages come newest first; `nextCursor` is the id to continue from. */
export function useMessages(id: string) {
  const live = useChatStreamConnected();
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
    refetchInterval: live ? THREAD_POLL_LIVE_MS : THREAD_POLL_MS,
    refetchIntervalInBackground: false,
  });
}

/** The peer of a thread: the list first, then the card `open` returned, else undefined. */
export function usePeer(id: string): PeerSummary | undefined {
  const fromList = useConversations().data?.find((c) => c.id === id)?.peer;
  const fromOpen = useQuery<PeerSummary>({
    queryKey: CHAT_KEYS.peer(id),
    queryFn: skipToken,
  }).data;
  return fromList ?? fromOpen;
}

export function useSendMessage(id: string) {
  const qc = useQueryClient();
  const t = useT();
  return useMutation<MessageView, unknown, string>({
    mutationFn: (text) =>
      api
        .post(`/chat/conversations/${id}/messages`, { text })
        .then((r) => r.data),
    // The server's committed message goes straight into the cache (deduped by
    // id against the stream), so the pending bubble can be swapped for it
    // with no refetch in between.
    onSuccess: (message) => {
      const key = CHAT_KEYS.messages(id);
      const next = insertMessage(qc.getQueryData<MessagesCache>(key), message);
      if (next) qc.setQueryData(key, next);
      qc.setQueryData<ConversationView[] | undefined>(CHAT_KEYS.list, (old) =>
        listAfterSend(old, id, qc.getQueryData<PeerSummary>(CHAT_KEYS.peer(id)), message),
      );
      void qc.invalidateQueries({ queryKey: CHAT_KEYS.list });
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

/** Removes one of my own messages; `id` is the conversation it sits in. */
export function useRemoveMessage(id: string) {
  const qc = useQueryClient();
  const t = useT();
  return useMutation<unknown, unknown, string>({
    mutationFn: (messageId) => api.delete(`/chat/messages/${messageId}`),
    onSuccess: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: CHAT_KEYS.messages(id) }),
        qc.invalidateQueries({ queryKey: CHAT_KEYS.list }),
      ]),
    onError: (err) =>
      toast.error(getErrorMessage(err, t("Xabarni o'chirib bo'lmadi"))),
  });
}

/** Opens (or finds) the conversation; the answer carries its `id`. */
export function useOpenConversation() {
  const qc = useQueryClient();
  const t = useT();
  return useMutation<
    { id: string; peer: PeerSummary },
    unknown,
    OpenConversationBody
  >({
    mutationFn: (body) =>
      api.post("/chat/conversations", body).then((r) => r.data),
    onSuccess: (c) => {
      qc.setQueryData(CHAT_KEYS.peer(c.id), c.peer);
      return qc.invalidateQueries({ queryKey: CHAT_KEYS.list });
    },
    onError: (err) =>
      toast.error(getErrorMessage(err, t("Suhbatni ochib bo'lmadi"))),
  });
}

/** GET /chat/me: my @username (null until set) and my three privacy choices. */
export function useChatMe() {
  return useQuery<ChatMe>({
    queryKey: CHAT_KEYS.me,
    queryFn: () => api.get("/chat/me").then((r) => r.data),
  });
}

/** Students I blocked, from GET /chat/me. */
export function useBlockedIds(): number[] {
  return useChatMe().data?.blockedIds ?? [];
}

function useBlockMutation(
  path: "block" | "unblock",
  failText: string,
) {
  const qc = useQueryClient();
  const t = useT();
  return useMutation<unknown, unknown, number>({
    mutationFn: (studentId) => api.post(`/chat/${path}`, { studentId }),
    onSuccess: (_d, studentId) => {
      qc.setQueryData<ChatMe>(
        CHAT_KEYS.me,
        (old) =>
          old && {
            ...old,
            blockedIds:
              path === "block"
                ? [...old.blockedIds.filter((i) => i !== studentId), studentId]
                : old.blockedIds.filter((i) => i !== studentId),
          },
      );
      return Promise.all([
        qc.invalidateQueries({ queryKey: CHAT_KEYS.list }),
        qc.invalidateQueries({ queryKey: CHAT_KEYS.me }),
      ]);
    },
    onError: (err) => toast.error(getErrorMessage(err, t(failText))),
  });
}

export const useBlock = () =>
  useBlockMutation("block", msg("Bloklab bo'lmadi"));
export const useUnblock = () =>
  useBlockMutation("unblock", msg("Blokdan chiqarib bo'lmadi"));

/** POST /chat/report; the refusal stays with the caller (shown in the dialog). */
export function useReportConversation() {
  return useMutation<unknown, unknown, { conversationId: string; reason: string }>({
    mutationFn: (body) => api.post("/chat/report", body),
  });
}
