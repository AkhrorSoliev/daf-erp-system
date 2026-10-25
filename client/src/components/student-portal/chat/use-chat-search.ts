"use client";

import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import type { PeerSummary } from "./chat-types";

/** GET /chat/search?q= (2–40 characters); idle unless `q` is a name search. */
export function useChatSearch(q: string | null) {
  return useQuery<PeerSummary[]>({
    queryKey: ["student-portal", "chat", "search", q],
    queryFn: () =>
      api.get("/chat/search", { params: { q } }).then((r) => r.data),
    enabled: q !== null,
    staleTime: 15000,
  });
}
