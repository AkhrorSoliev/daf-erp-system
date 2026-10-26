"use client";

import { useEffect } from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import Cookies from "js-cookie";
import { CHAT_KEYS, useChatEnabled } from "./chat-queries";
import {
  backoffDelay,
  insertMessage,
  parseChatEvent,
  shouldResetBackoff,
  splitSse,
  streamIdle,
  type ChatEvent,
  type MessagesCache,
} from "./chat-stream-model";
import { useChatStream } from "./chat-stream-store";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000/api";
const MESSAGES_PREFIX = [...CHAT_KEYS.all, "messages"] as const;
const WATCHDOG_EVERY_MS = 15000;

/** Only the newest stream may touch the shared `connected` flag. */
let activeToken = 0;

function apply(qc: QueryClient, ev: ChatEvent) {
  const store = useChatStream.getState();
  switch (ev.kind) {
    case "message": {
      store.clearTyping(ev.conversationId);
      const key = CHAT_KEYS.messages(ev.conversationId);
      const message = ev.message;
      // Cancel a fetch already in flight: it may predate this message and
      // would overwrite the cache with a page that lacks it.
      void qc.cancelQueries({ queryKey: key }).then(() => {
        const next = message
          ? insertMessage(qc.getQueryData<MessagesCache>(key), message)
          : undefined;
        if (next) qc.setQueryData(key, next);
        else void qc.invalidateQueries({ queryKey: key });
      });
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
  const token = ++activeToken;
  const setConnected = (v: boolean) => {
    if (token === activeToken) useChatStream.getState().setConnected(v);
  };
  let stopped = false;
  let controller: AbortController | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let retry = 0;

  async function connect() {
    const jwt = Cookies.get("token");
    if (!jwt || stopped) return;
    const ctl = new AbortController();
    controller = ctl;
    let openedAt = 0;
    let gotPayload = false;
    let watchdog: ReturnType<typeof setInterval> | null = null;
    try {
      const res = await fetch(`${API_URL}/notifications/stream`, {
        headers: { Authorization: `Bearer ${jwt}` },
        signal: ctl.signal,
      });
      if (res.ok && res.body) {
        openedAt = Date.now();
        let lastRead = openedAt;
        // A dead connection stays silent; no data and no heartbeat means reconnect.
        watchdog = setInterval(() => {
          if (streamIdle(lastRead, Date.now())) ctl.abort();
        }, WATCHDOG_EVERY_MS);
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
          lastRead = Date.now();
          const out = splitSse(buffer + decoder.decode(value, { stream: true }));
          buffer = out.rest;
          if (out.payloads.length > 0) {
            gotPayload = true;
            retry = 0;
          }
          for (const p of out.payloads) {
            const ev = parseChatEvent(p);
            if (ev) apply(qc, ev);
          }
        }
      }
    } catch {
      // aborted or network error: fall through to the backoff
    }
    if (watchdog) clearInterval(watchdog);
    setConnected(false);
    if (stopped) return;
    // A server that closes at once must not cause a 1 s reconnect loop.
    if (openedAt && shouldResetBackoff(Date.now() - openedAt, gotPayload)) {
      retry = 0;
    }
    timer = setTimeout(connect, backoffDelay(retry++));
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
