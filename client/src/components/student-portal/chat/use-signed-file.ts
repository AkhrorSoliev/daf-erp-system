"use client";

import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { loadState } from "../lib/load-state";
import { SIGNED_URL_STALE_MS } from "./chat-media";

interface SignedFile {
  url: string;
  expiresInSec: number;
}

/**
 * Signed link of a message's file (valid 10 minutes, renewed after 8 when it
 * is read again). The URL goes only into <img>/<audio>/<a>: the bucket has no
 * CORS rule, so it is NEVER fetched from JS.
 */
export function useSignedFile(messageId: string, enabled: boolean) {
  const q = useQuery<SignedFile>({
    queryKey: ["student-portal", "chat", "file", messageId],
    queryFn: () =>
      api.get(`/chat/messages/${messageId}/file`).then((r) => r.data),
    enabled,
    staleTime: SIGNED_URL_STALE_MS,
    gcTime: SIGNED_URL_STALE_MS,
    refetchOnMount: true,
    retry: 1,
  });
  return {
    url: q.data?.url ?? null,
    loadState: loadState(q),
    updatedAt: q.dataUpdatedAt,
    /** Re-reads the link; resolves with the new URL (or null). */
    refresh: () => q.refetch().then((r) => r.data?.url ?? null),
  };
}
