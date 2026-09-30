import type { ReactNode } from "react";
import { Info, TriangleAlert } from "lucide-react";
import { cn } from "@/lib/utils";

// amber-* va sky-* admin panelda rangsiz chiqadi (client/CLAUDE.md) — yellow va blue.
const USLUB = {
  malumot: {
    icon: Info,
    klass: "border-blue-200 bg-blue-50 text-blue-950 dark:border-blue-900/60 dark:bg-blue-950/30 dark:text-blue-100",
  },
  diqqat: {
    icon: TriangleAlert,
    klass: "border-yellow-300 bg-yellow-50 text-yellow-950 dark:border-yellow-900/60 dark:bg-yellow-950/30 dark:text-yellow-100",
  },
} as const;

export function Eslatma({ tur = "malumot", children }: { tur?: keyof typeof USLUB; children: ReactNode }) {
  const { icon: Icon, klass } = USLUB[tur];
  return (
    <div role="note" className={cn("my-5 flex gap-3 rounded-lg border p-4 text-sm leading-6", klass)}>
      <Icon className="mt-1 size-4 shrink-0" aria-hidden />
      {/* sr-only yorliq birinchi bola, shuning uchun yuqori chekkani nolga tushirish undan keyingi elementga tegadi. */}
      <div className="min-w-0 [&>.sr-only+*]:mt-0! [&>*:last-child]:mb-0 [&_p]:leading-6">
        <span className="sr-only">{tur === "diqqat" ? "Diqqat: " : "Ma'lumot: "}</span>
        {children}
      </div>
    </div>
  );
}
