"use client";

import { TriangleAlert } from "lucide-react";
import { useT } from "@/i18n/context";

/**
 * Bitta bo'lim yiqilganda uning O'RNIGA chiziladi. Butun sahifa emas —
 * moliya yiqilgani davomat ma'lumotini yashirishga sabab emas.
 * `label` — bo'lim nomi, chaqiruvchi uni allaqachon tarjima qilib beradi.
 */
export function HomeErrorNote({ label }: { label: string }) {
  const t = useT();
  return (
    <div className="flex items-center gap-2 rounded-xl border border-dashed px-4 py-6 text-sm text-muted-foreground">
      <TriangleAlert className="size-4 shrink-0 text-orange-600 dark:text-orange-400" />
      {t("{label} ma'lumotini olishda xatolik. Sahifani yangilab ko'ring.", {
        label,
      })}
    </div>
  );
}
