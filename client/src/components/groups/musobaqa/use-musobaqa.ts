"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { isAxiosError } from "axios";
import api from "@/lib/api";
import type { MusobaqaJavob } from "./types";

/** `hafta === null` — joriy hafta (serverda standart). Hafta almashganda eski ma'lumot ko'rinib turadi. */
export function useMusobaqa(groupId: string, hafta: string | null) {
  return useQuery<MusobaqaJavob>({
    queryKey: ["group-musobaqa", groupId, hafta],
    queryFn: () =>
      api
        .get<MusobaqaJavob>(`/groups/${groupId}/musobaqa`, { params: hafta ? { hafta } : {} })
        .then((r) => r.data),
    staleTime: 60_000,
    placeholderData: keepPreviousData,
    // 403/404 qayta urinish bilan tuzalmaydi.
    retry: (n, e) => !(isAxiosError(e) && (e.response?.status === 403 || e.response?.status === 404)) && n < 3,
  });
}
