"use client";

import { useEffect } from "react";
import { useBreadcrumbName } from "@/hooks/use-breadcrumb-name";

/** Qo'llanma segmentlari (bo'lim, sahifa) breadcrumb'da nomi bilan chiqadi. */
export function QollanmaBreadcrumbNomi({ nomlar }: { nomlar: Record<string, string> }) {
  const setName = useBreadcrumbName((s) => s.setName);
  const kalit = JSON.stringify(nomlar);
  useEffect(() => {
    for (const [segment, nom] of Object.entries(JSON.parse(kalit) as Record<string, string>)) {
      setName(segment, nom);
    }
  }, [kalit, setName]);
  return null;
}
