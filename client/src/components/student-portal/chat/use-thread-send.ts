"use client";

import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { CHAT_KEYS, useSendMessage } from "./chat-queries";
import type { ReplyView } from "./chat-types";
import { hasMessage, pendingStep, type MessagesCache } from "./chat-stream-model";
import {
  addPending,
  confirmPending,
  removePending,
  setPendingStatus,
  type PendingMessage,
} from "./chat-thread-model";

/**
 * Optimistic sending: the text shows at once as a pending bubble. On success
 * the server's message is put in the thread cache and the bubble yields to it;
 * on failure it stays, red, with its text, and `retry` sends it again.
 */
export function useThreadSend(conversationId: string) {
  const send = useSendMessage(conversationId);
  const qc = useQueryClient();
  const [pending, setPending] = useState<PendingMessage[]>([]);
  const seq = useRef(0);

  // The bubble leaves only once the server's message is in the cached thread.
  // If a stale poll overwrote the cache, the thread is refetched; after the
  // give-up time the bubble is dropped with one last refetch.
  const settle = async (key: string, serverId: string) => {
    const threadKey = CHAT_KEYS.messages(conversationId);
    const started = Date.now();
    let refetched = false;
    for (;;) {
      const present = hasMessage(qc.getQueryData<MessagesCache>(threadKey), serverId);
      const step = pendingStep(present, Date.now() - started, refetched);
      if (step === "remove" || step === "giveUp") {
        if (step === "giveUp") void qc.invalidateQueries({ queryKey: threadKey });
        setPending((p) => removePending(p, key));
        return;
      }
      if (step === "refetch") {
        refetched = true;
        await qc.invalidateQueries({ queryKey: threadKey });
        continue;
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
  };

  const run = async (key: string, text: string, replyToId?: string) => {
    try {
      const sent = await send.mutateAsync({ text, replyToId });
      // The message is already in the cache (useSendMessage), and the bubble
      // hides itself once it sees that id: no frame with both or with none.
      setPending((p) => confirmPending(p, key, sent.id));
      void settle(key, sent.id);
    } catch {
      // The toast with the server's reason comes from useSendMessage.
      setPending((p) => setPendingStatus(p, key, "failed"));
    }
  };

  const submit = (text: string, replyTo?: ReplyView | null) => {
    seq.current += 1;
    const key = `${Date.now()}-${seq.current}`;
    setPending((p) => addPending(p, key, text, new Date(), replyTo));
    void run(key, text, replyTo?.id);
  };

  const retry = (key: string) => {
    const item = pending.find((p) => p.key === key);
    if (!item) return;
    setPending((p) => setPendingStatus(p, key, "sending"));
    void run(key, item.text, item.replyTo?.id);
  };

  return {
    pending,
    submit,
    retry,
    busy: pending.some((p) => p.status === "sending" && !p.serverId),
  };
}
