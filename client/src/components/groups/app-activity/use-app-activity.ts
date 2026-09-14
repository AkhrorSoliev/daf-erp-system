"use client";

import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import type { Davr, GuruhFaolligi, OquvchiFaolligi } from "./types";

export function davrniUrldanOqi(qiymat: string | null): Davr {
  return qiymat === "30" ? 30 : 7;
}

export function useGuruhFaolligi(groupId: string, davr: Davr) {
  return useQuery<GuruhFaolligi>({
    queryKey: ["group-app-activity", groupId, davr],
    queryFn: () =>
      api
        .get<GuruhFaolligi>(`/groups/${groupId}/app-activity`, { params: { period: davr } })
        .then((r) => r.data),
    staleTime: 60_000,
  });
}

/** `url` — `/groups/:id/app-activity/students/:sid` yoki `/students/:id/app-activity`. */
export function useOquvchiFaolligi(url: string | null, davr: Davr) {
  return useQuery<OquvchiFaolligi>({
    queryKey: ["student-app-activity", url, davr],
    queryFn: () => api.get<OquvchiFaolligi>(url!, { params: { period: davr } }).then((r) => r.data),
    enabled: url !== null,
    staleTime: 60_000,
  });
}
