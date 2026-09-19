"use client";

import { Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { monthLabel } from "./salary-utils";

/**
 * Ikkala avans ro'yxati — «Avanslar» tabidagi kun paneli va «Avans» katagining
 * drawer'i — qatorlarini shu shaklga keltiradi. Ikkalasi serverdan turli
 * shaklda keladi (kalendar `date` ni "YYYY-MM-DD", drawer esa ISO qilib
 * qaytaradi), shuning uchun normalizatsiya chaqiruvchi tomonda bo'ladi va bu
 * tur bitta aniq shartnoma bo'lib qoladi.
 */
export interface EditableAdvance {
  id: string;
  /** "YYYY-MM-DD" */
  date: string;
  amount: number;
  paymentMethod: "CASH" | "CARD";
  description: string;
  /** Oynada va o'chirish tasdig'ida ko'rsatiladi; hech qachon o'zgarmaydi. */
  employeeName: string;
  settled: boolean;
  /** ISO. Hisoblanmagan avansda `null`. */
  settledPeriodStart: string | null;
  settledPeriodEnd: string | null;
}

/** "2026-09-01T00:00:00.000Z" yoki "2026-09-01" → "01.09.2026". */
function isoDay(iso: string): string {
  const [y, m, d] = iso.slice(0, 10).split("-");
  return `${d}.${m}.${y}`;
}

/**
 * Qator ostidagi qisqa sabab. Oylik davri `cycleStartDay` ga qarab kalendar
 * oyga to'g'ri kelmasligi mumkin, shuning uchun davr OXIRI qaysi oyga
 * tushsa — o'sha oy nomi olinadi.
 */
export function settledLabel(a: EditableAdvance): string | null {
  if (!a.settled) return null;
  if (!a.settledPeriodEnd) return "Oylikka hisoblangan";
  return `${monthLabel(a.settledPeriodEnd.slice(0, 7))} oyligiga hisoblangan`;
}

/** Tugma ustidagi to'liq sabab — oy nomi emas, aniq davr. */
function settledTitle(a: EditableAdvance): string {
  if (a.settledPeriodStart && a.settledPeriodEnd) {
    return `Bu avans ${isoDay(a.settledPeriodStart)}–${isoDay(
      a.settledPeriodEnd,
    )} oyligiga hisoblangan — o'zgartirib bo'lmaydi`;
  }
  return "Bu avans oylikka hisoblangan — o'zgartirib bo'lmaydi";
}

/**
 * Bitta avans qatorining amallari. Hisoblangan avansda ikkala tugma ham
 * o'chiq: uni o'zgartirish allaqachon yozilgan oylik to'lovini eski raqam
 * bo'yicha qoldirib ketardi. O'chiq tugma yonida sabab MATN bilan ham
 * ko'rsatiladi (`settledLabel`) — `title` o'chiq tugmada ko'rinmasligi
 * mumkin, sabab esa yo'qolmasligi kerak.
 */
export function AdvanceRowActions({
  advance,
  onEdit,
  onDelete,
}: {
  advance: EditableAdvance;
  onEdit: (a: EditableAdvance) => void;
  onDelete: (a: EditableAdvance) => void;
}) {
  const disabled = advance.settled;
  const reason = disabled ? settledTitle(advance) : undefined;

  return (
    <div className="flex shrink-0 items-center gap-0.5">
      <Button
        variant="ghost"
        size="icon-sm"
        disabled={disabled}
        title={reason ?? "Tahrirlash"}
        aria-label="Avansni tahrirlash"
        onClick={() => onEdit(advance)}
      >
        <Pencil className="size-4" />
      </Button>
      <Button
        variant="ghost"
        size="icon-sm"
        className="text-destructive hover:text-destructive"
        disabled={disabled}
        title={reason ?? "O'chirish"}
        aria-label="Avansni o'chirish"
        onClick={() => onDelete(advance)}
      >
        <Trash2 className="size-4" />
      </Button>
    </div>
  );
}
