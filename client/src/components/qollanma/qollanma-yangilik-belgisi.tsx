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
  const oxirgi = useSyncExternalStore(
    yangiliklarObunasi,
    () => (user ? oxirgiKorilganniOqi(user.id) : undefined),
    () => undefined,
  );

  if (!user || oxirgi === undefined) return null;
  const son = oqilmaganSoni(
    yangiliklarRolUchun(yangiliklar, user.roles.map((r) => r.id)),
    oxirgi,
    tashkentNow().dateStr,
  );
  if (son === 0) return null;
  return (
    <>
      <SidebarMenuBadge aria-hidden>{son}</SidebarMenuBadge>
      {/* Yig'ilgan (faqat belgilar) menyuda raqam yashirin — o'rniga nuqta. */}
      <span
        aria-hidden
        className="pointer-events-none absolute right-1.5 top-1.5 hidden size-2 rounded-full bg-primary group-data-[collapsible=icon]:block"
      />
      <span className="sr-only">{son} ta yangi o&apos;zgarish</span>
    </>
  );
}
