"use client";

import { useSyncExternalStore } from "react";
import { SidebarMenuBadge } from "@/components/ui/sidebar";
import { useAuth } from "@/hooks/use-auth";
import { tashkentNow } from "@/lib/tashkent-time";
import { yangiliklar } from "@/qollanma/yangiliklar";
import { oqilmaganSoni, yangiliklarRolUchun } from "@/qollanma/yangiliklar-holati";
import { oxirgiKorilganniOqi, yangiliklarObunasi } from "@/qollanma/yangiliklar-xotira";

export function QollanmaYangilikBelgisi() {
  const user = useAuth((s) => s.user);
  const oxirgi = useSyncExternalStore(yangiliklarObunasi, oxirgiKorilganniOqi, () => undefined);

  if (!user || oxirgi === undefined) return null;
  const son = oqilmaganSoni(
    yangiliklarRolUchun(yangiliklar, user.roles.map((r) => r.id)),
    oxirgi,
    tashkentNow().dateStr,
  );
  if (son === 0) return null;
  return <SidebarMenuBadge aria-label={`${son} ta yangilik`}>{son}</SidebarMenuBadge>;
}
