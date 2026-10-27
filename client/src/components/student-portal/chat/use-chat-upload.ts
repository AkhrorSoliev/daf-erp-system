"use client";

import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";
import api from "@/lib/api";
import { getErrorMessage } from "@/lib/get-error-message";
import { useT } from "@/i18n/context";
import { CHAT_KEYS } from "./chat-queries";

export interface ChatUpload {
  file: File;
  /** Whole seconds, voice only. */
  durationSec?: number;
  /** The message this one answers. */
  replyToId?: string;
}

/**
 * POST /chat/conversations/:id/files. `durationSec` goes BEFORE `file`: the
 * server's multipart parser reads text parts in order. `progress` is 0..1.
 * A second call while one runs is ignored (never a double submit).
 */
export function useUploadChatFile(conversationId: string) {
  const qc = useQueryClient();
  const t = useT();
  const [progress, setProgress] = useState(0);

  const m = useMutation<unknown, unknown, ChatUpload>({
    mutationFn: ({ file, durationSec, replyToId }) => {
      const body = new FormData();
      if (durationSec !== undefined) body.append("durationSec", String(durationSec));
      if (replyToId) body.append("replyToId", replyToId);
      body.append("file", file, file.name);
      setProgress(0);
      return api.post(`/chat/conversations/${conversationId}/files`, body, {
        onUploadProgress: (e) => {
          if (e.total) setProgress(e.loaded / e.total);
        },
      });
    },
    onSuccess: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: CHAT_KEYS.messages(conversationId) }),
        qc.invalidateQueries({ queryKey: CHAT_KEYS.list }),
      ]),
    onError: (err) =>
      toast.error(getErrorMessage(err, t("Faylni yuborib bo'lmadi"))),
  });

  const upload = async (u: ChatUpload): Promise<boolean> => {
    if (m.isPending) return false;
    try {
      await m.mutateAsync(u);
      return true;
    } catch {
      return false; // toasted in onError
    }
  };

  return { upload, uploading: m.isPending, progress };
}
