"use client";

import { useEffect } from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import Cookies from "js-cookie";
import { CHAT_KEYS, useChatEnabled } from "./chat-queries";
import {
  insertMessage,
  parseChatEvent,
  splitSse,
  type ChatEvent,
  type MessagesCache,
} from "./chat-stream-model";
import { useChatStream } from "./chat-stream-store";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";
const MESSAGES_PREFIX = [...CHAT_KEYS.all, "messages"] as const;

function apply(qc: QueryClient, ev: ChatEvent) {
  const store = useChatStream.getState();
  switch (ev.kind) {
    case "message": {
      store.clearTyping(ev.conversationId);
      const key = CHAT_KEYS.messages(ev.conversationId);
      const next = ev.message
        ? insertMessage(qc.getQueryData<MessagesCache>(key), ev.message)
        : undefined;
      if (next) qc.setQueryData(key, next);
      else void qc.invalidateQueries({ queryKey: key });
      void qc.invalidateQueries({ queryKey: CHAT_KEYS.list });
      return;
    }
    case "read":
      void qc.invalidateQueries({
        queryKey: CHAT_KEYS.messages(ev.conversationId),
      });
      void qc.invalidateQueries({ queryKey: CHAT_KEYS.list });
      return;
    case "access":
      void qc.invalidateQueries({ queryKey: CHAT_KEYS.access });
      return;
    case "typing":
      store.markTyping(ev.conversationId);
  }
}

/** Opens the notifications stream; returns the cleanup. The token is never logged. */
function startStream(qc: QueryClient): () => void {
  let stopped = false;
  let controller: AbortController | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let retry = 0;
  const { setConnected } = useChatStream.getState();

  async function connect() {
    const token = Cookies.get("token");
    if (!token || stopped) return;
    controller = new AbortController();
    try {
      const res = await fetch(`${API_URL}/notifications/stream`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: controller.signal,
      });
      if (res.ok && res.body) {
        retry = 0;
        setConnected(true);
        // Catch up on whatever came while the stream was down.
        void qc.invalidateQueries({ queryKey: CHAT_KEYS.list });
        void qc.invalidateQueries({ queryKey: MESSAGES_PREFIX });
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        while (!stopped) {
          const { done, value } = await reader.read();
          if (done) break;
          const out = splitSse(buffer + decoder.decode(value, { stream: true }));
          buffer = out.rest;
          for (const p of out.payloads) {
            const ev = parseChatEvent(p);
            if (ev) apply(qc, ev);
          }
        }
      }
    } catch {
      // aborted or network error: fall through to the backoff
    }
    setConnected(false);
    if (stopped) return;
    timer = setTimeout(connect, Math.min(1000 * 2 ** retry++, 30_000));
  }

  void connect();
  return () => {
    stopped = true;
    controller?.abort();
    if (timer) clearTimeout(timer);
    setConnected(false);
  };
}

/** Mounted once in the portal shell; connects only while the chat is switched on. */
export function ChatStreamHost() {
  const qc = useQueryClient();
  const enabled = useChatEnabled();
  useEffect(() => {
    if (!enabled) return;
    return startStream(qc);
  }, [enabled, qc]);
  return null;
}
