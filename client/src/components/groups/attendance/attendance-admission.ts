import { formatPrice } from "@/lib/format-utils";
import type { LessonAdmission } from "./attendance-form-utils";

const ddmm = (day: string) => `${day.slice(8, 10)}.${day.slice(5, 7)}`;

/** What a roster row says about contract 3.2 admission (ADR-0045). */
export function admissionCopy(
  admission: LessonAdmission | undefined,
  isAdmin: boolean,
): { blocked: boolean; label: string | null; warning: string | null } {
  if (!admission) return { blocked: false, label: null, warning: null };
  if (!admission.admitted) {
    return {
      blocked: true,
      label: "To'lov qilinmagan · darsga qo'yilmaydi",
      warning: isAdmin
        ? `Bugungi darsga kirishi uchun kamida ${formatPrice(admission.shortfall)} so'm kerak. Oyni to'liq qoplamasa, qolgan qismi uchun to'lov va'dasi yoziladi.`
        : "Bu o'quvchi oylik to'lovni qilmagan. Shartnomaga ko'ra 2-darsdan boshlab to'lov qilinmaguncha darsga qo'yilmaydi. Agar u darsda o'tirsa va keyinroq to'lov qilsa ham, bu dars uchun sizga ish haqi yozilmaydi.",
    };
  }
  if (admission.paidThrough) {
    return {
      blocked: false,
      label: `Qisman to'lagan · ${ddmm(admission.paidThrough)} gacha qatnasha oladi`,
      warning: null,
    };
  }
  return { blocked: false, label: null, warning: null };
}
