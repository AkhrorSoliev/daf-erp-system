"use client";

import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { sorovParametrlari, type OquvchilarFiltri } from "./oquvchilar-filtr";
import type { Davr, MarkazOquvchilar, MarkazTelefonlar, MarkazUmumiy } from "./types";

// Kalit prefiksi "daf-center" — norma saqlanganda sozlamalar sahifasi shu
// prefiks bilan invalidatsiya qiladi. Filial almashsa `BranchQuerySync`
// butun keshni tozalaydi, shuning uchun filial kalitda yo'q.
export function useMarkazUmumiy(davr: Davr) {
  return useQuery<MarkazUmumiy>({
    queryKey: ["daf-center", "summary", davr],
    queryFn: () =>
      api
        .get<MarkazUmumiy>("/app-activity/center/summary", { params: { period: davr } })
        .then((r) => r.data),
    staleTime: 60_000,
  });
}

export function useMarkazOquvchilar(filtr: OquvchilarFiltri) {
  const params = sorovParametrlari(filtr);
  return useQuery<MarkazOquvchilar>({
    queryKey: ["daf-center", "students", params],
    queryFn: () =>
      api.get<MarkazOquvchilar>("/app-activity/center/students", { params }).then((r) => r.data),
    staleTime: 60_000,
    // Sahifa yoki filtr o'zgarganda jadval bo'shab qolmasin — eski qatorlar
    // yangisi kelguncha turadi.
    placeholderData: (oldingi) => oldingi,
  });
}

/** «Ro'yxatni nusxalash» — bir martalik, kesh kerak emas. */
export async function markazTelefonlarniOl(filtr: OquvchilarFiltri): Promise<MarkazTelefonlar> {
  // Sahifalash parametrlari ketmaydi — butun filtr natijasi kerak (dizayn 6.4).
  const params = { ...sorovParametrlari(filtr) };
  delete params.page;
  delete params.pageSize;
  const r = await api.get<MarkazTelefonlar>("/app-activity/center/students/phones", { params });
  return r.data;
}
