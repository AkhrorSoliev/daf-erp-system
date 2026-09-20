import { cn } from "@/lib/utils";
import type { Holat } from "./types";

export const HOLAT_MATNI: Record<Holat, string> = {
  AKKAUNT_YOQ: "Akkaunt yo'q",
  HECH_KIRMAGAN: "Hech kirmagan",
  QIZIL: "Norma bajarilmayapti",
  SARIQ: "Qisman",
  YASHIL: "Normada",
};

/** `amber-*` YO'Q — admin mavzusida rangsiz (`activity-format.ts` izohi). */
const NUQTA: Record<Holat, string> = {
  AKKAUNT_YOQ: "bg-muted-foreground/40",
  HECH_KIRMAGAN: "bg-foreground/70",
  QIZIL: "bg-red-500",
  SARIQ: "bg-yellow-400",
  YASHIL: "bg-green-500",
};

const MATN: Record<Holat, string> = {
  AKKAUNT_YOQ: "text-muted-foreground",
  HECH_KIRMAGAN: "text-foreground",
  QIZIL: "text-red-600 dark:text-red-400",
  SARIQ: "text-yellow-600 dark:text-yellow-400",
  YASHIL: "text-green-600 dark:text-green-400",
};

/**
 * I7: badge matni ma'no bilan nomlangan («Qisman»), tushuntiruvchi joylar esa
 * rang bilan gapiradi («yashil uchun N kun kerak») — CEO ikkovini bog'lay
 * olmasdi. Badge matnini o'zi uzaytirish jadvalni buzadi (`min-w-40`,
 * `whitespace-nowrap`), shuning uchun rang bog'lanishi shu yerda — faqat
 * me'yor asosidagi uch holat uchun — `title` orqali beriladi.
 */
const HOLAT_RANGI: Partial<Record<Holat, string>> = {
  QIZIL: "qizil",
  SARIQ: "sariq",
  YASHIL: "yashil",
};

export function HolatBadge({ holat, className }: { holat: Holat; className?: string }) {
  const rang = HOLAT_RANGI[holat];
  return (
    <span
      title={rang ? `${HOLAT_MATNI[holat]} (${rang})` : undefined}
      className={cn("inline-flex items-center gap-1.5 whitespace-nowrap text-xs font-medium", MATN[holat], className)}
    >
      <span aria-hidden className={cn("size-2 shrink-0 rounded-full", NUQTA[holat])} />
      {HOLAT_MATNI[holat]}
    </span>
  );
}
