"use client";

import { useRef, useState } from "react";
import { useSendMessage } from "./chat-queries";
import {
  addPending,
  removePending,
  setPendingStatus,
  type PendingMessage,
} from "./chat-thread-model";

/**
 * Optimistic sending: the text shows at once as a pending bubble. On success
 * the bubble goes once the thread has re-read (useSendMessage waits for it);
 * on failure it stays, red, with its text, and `retry` sends it again.
 */
export function useThreadSend(conversationId: string) {
  const send = useSendMessage(conversationId);
  const [pending, setPending] = useState<PendingMessage[]>([]);
  const seq = useRef(0);

  const run = async (key: string, text: string) => {
    try {
      await send.mutateAsync(text);
      setPending((p) => removePending(p, key));
    } catch {
      // The toast with the server's reason comes from useSendMessage.
      setPending((p) => setPendingStatus(p, key, "failed"));
    }
  };

  const submit = (text: string) => {
    seq.current += 1;
    const key = `${Date.now()}-${seq.current}`;
    setPending((p) => addPending(p, key, text, new Date()));
    void run(key, text);
  };

  const retry = (key: string) => {
    const item = pending.find((p) => p.key === key);
    if (!item) return;
    setPending((p) => setPendingStatus(p, key, "sending"));
    void run(key, item.text);
  };

  return {
    pending,
    submit,
    retry,
    busy: pending.some((p) => p.status === "sending"),
  };
}
