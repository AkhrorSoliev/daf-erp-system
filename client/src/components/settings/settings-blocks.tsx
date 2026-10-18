"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { isCeoUser, useAuth } from "@/hooks/use-auth";
import { usePermissions } from "@/hooks/use-permissions";
import { findSettingsItem, getVisibleBlocks } from "@/lib/settings-nav";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

/**
 * Qismlari bir sahifaga yig'ilgan sozlamalar uchun umumiy yordamchilar
 * («O'quv qoidalari», «Lidlar va KPI», «Telegram»). Qaysi qism kimga
 * ko'rinishi `settings-nav.ts` dagi `blocks` da: shu yerda hech narsa
 * hal qilinmaydi, faqat chiziladi.
 */

/** Shu sahifaning ko'rinadigan qismlari (tartib bilan). */
export function useVisibleBlocks(url: string): string[] {
  const user = useAuth((s) => s.user);
  const can = usePermissions((s) => s.can);
  const item = findSettingsItem(url);
  return item ? getVisibleBlocks(item, can, isCeoUser(user)) : [];
}

/**
 * Qismlar ketma-ket, har biri o'z sarlavhasi bilan. `id` — eski manzillar
 * (masalan /settings/absence-pause) shu qismga #pauza bilan keladi.
 */
export function SettingsBlockStack({
  ids,
  parts,
}: {
  ids: string[];
  parts: Record<string, ReactNode>;
}) {
  // Eski manzildan (#kpi) kelgan odam o'sha qismga tushsin. Qismlar o'z
  // ma'lumotini keyin yuklaydi va sahifa uzayadi, shuning uchun ikki marta
  // urinamiz. ponytail: ikki urinish; yuklash juda sekin bo'lsa qism o'zi
  // topilmay qoladi — foydalanuvchi ko'rib turgan sahifadan o'zi pastga tushadi.
  useEffect(() => {
    const id = window.location.hash.slice(1);
    if (!id) return;
    const go = () => document.getElementById(id)?.scrollIntoView({ block: "start" });
    const timers = [setTimeout(go, 400), setTimeout(go, 1500)];
    return () => timers.forEach(clearTimeout);
  }, []);

  return (
    <div className="max-w-3xl [&>section+section]:mt-10 [&>section+section]:border-t [&>section+section]:pt-10">
      {ids.map((id) => (
        <section key={id} id={id} className="scroll-mt-20">
          {parts[id]}
        </section>
      ))}
    </div>
  );
}

/**
 * Qismlar varaqlarda. Varaq URL'da (`?tab=`), birinchisi — odatdagisi, URL'dan
 * tushib qoladi. Ko'rinadigan qism bitta bo'lsa, varaq qatori chizilmaydi.
 */
export function SettingsBlockTabs({
  ids,
  labels,
  parts,
}: {
  ids: string[];
  labels: Record<string, string>;
  parts: Record<string, ReactNode>;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  if (ids.length === 0) return null;
  if (ids.length === 1) return <>{parts[ids[0]]}</>;

  const requested = searchParams.get("tab");
  const active = requested && ids.includes(requested) ? requested : ids[0];

  const change = (tab: string) => {
    const params = new URLSearchParams(searchParams.toString());
    if (tab === ids[0]) params.delete("tab");
    else params.set("tab", tab);
    const qs = params.toString();
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  return (
    <Tabs value={active} onValueChange={change}>
      <TabsList className="mb-6">
        {ids.map((id) => (
          <TabsTrigger key={id} value={id}>
            {labels[id]}
          </TabsTrigger>
        ))}
      </TabsList>
      {ids.map((id) => (
        <TabsContent key={id} value={id}>
          {parts[id]}
        </TabsContent>
      ))}
    </Tabs>
  );
}
