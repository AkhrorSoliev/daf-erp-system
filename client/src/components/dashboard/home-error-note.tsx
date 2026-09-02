import { TriangleAlert } from "lucide-react";

/**
 * Bitta bo'lim yiqilganda uning O'RNIGA chiziladi. Butun sahifa emas —
 * moliya yiqilgani davomat ma'lumotini yashirishga sabab emas.
 */
export function HomeErrorNote({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 rounded-xl border border-dashed px-4 py-6 text-sm text-muted-foreground">
      <TriangleAlert className="size-4 shrink-0 text-orange-600 dark:text-orange-400" />
      {label} ma&apos;lumotini olishda xatolik. Sahifani yangilab ko&apos;ring.
    </div>
  );
}
